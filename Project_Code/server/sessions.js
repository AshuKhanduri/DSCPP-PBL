// SessionManager - one game per player.
//
// Each browser tab sends a random session id (header X-QuestForge-Session).
// Every session owns its OWN pair of native engines (C dsa_engine + C++
// oop_engine), so players never share a quest chain, inventory or world.
//
//   - created by GET /api/health or POST /api/game/reset (the title screen)
//   - any other request for an unknown id -> 410 SESSION_EXPIRED (the browser
//     reloads to the title screen)
//   - stopped after `idleMs` without requests (both engine processes exit)
//   - at most `maxSessions` at once; when full, the longest-idle session that
//     has been idle for `evictAfterMs` is stopped to make room, otherwise the
//     new player gets 503 SERVER_FULL
//
// Requests without the header use the session "default" (curl, the tests,
// older clients): created on demand and never reported as expired.

export const SESSION_HEADER = 'X-QuestForge-Session';
export const DEFAULT_SESSION = 'default';
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export class SessionError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

export class SessionManager {
    // createSession(id) -> { engines, ...anything }; engines.dsa/oop have stop()
    constructor({ createSession, maxSessions = 20, idleMs = 30 * 60_000, evictAfterMs = 5 * 60_000, now = Date.now, log = console.log } = {}) {
        this.createSession = createSession;
        this.maxSessions = maxSessions;
        this.idleMs = idleMs;
        this.evictAfterMs = evictAfterMs;
        this.now = now;
        this.log = log;
        this.sessions = new Map();
        this.timer = null;
    }

    get size() {
        return this.sessions.size;
    }

    static validId(id) {
        return id === DEFAULT_SESSION || SESSION_ID.test(id);
    }

    // canCreate: false -> an unknown id is an expired session.
    get(id, { canCreate }) {
        if (!SessionManager.validId(id)) throw new SessionError('VALIDATION_ERROR', `${SESSION_HEADER} must be 8-64 characters of A-Z a-z 0-9 _ -`);
        let s = this.sessions.get(id);
        if (!s) {
            if (!canCreate && id !== DEFAULT_SESSION) {
                throw new SessionError('SESSION_EXPIRED', 'Your game session ended (idle too long, or the server restarted). Returning to the title screen.');
            }
            this.#makeRoom();
            s = { id, ...this.createSession(id), createdAt: this.now() };
            this.sessions.set(id, s);
            this.log(`[sessions] + ${id.slice(0, 8)}… (${this.sessions.size}/${this.maxSessions})`);
        }
        s.lastSeen = this.now();
        return s;
    }

    #makeRoom() {
        if (this.sessions.size < this.maxSessions) return;
        let oldest = null;
        for (const s of this.sessions.values()) if (!oldest || s.lastSeen < oldest.lastSeen) oldest = s;
        if (oldest && this.now() - oldest.lastSeen >= this.evictAfterMs) {
            this.stop(oldest.id, 'evicted to make room');
            return;
        }
        throw new SessionError('SERVER_FULL', `The server is full (${this.maxSessions} players). Please try again in a few minutes.`);
    }

    stop(id, reason = 'stopped') {
        const s = this.sessions.get(id);
        if (!s) return;
        this.sessions.delete(id);
        s.engines.dsa.stop();
        s.engines.oop.stop();
        this.log(`[sessions] - ${id.slice(0, 8)}… ${reason} (${this.sessions.size}/${this.maxSessions})`);
    }

    // Stop sessions idle for longer than idleMs.
    sweep() {
        const t = this.now();
        for (const s of [...this.sessions.values()]) if (t - s.lastSeen >= this.idleMs) this.stop(s.id, 'idle');
    }

    startSweeping(everyMs = 60_000) {
        this.timer = setInterval(() => this.sweep(), everyMs);
        this.timer.unref?.();
    }

    stopAll() {
        clearInterval(this.timer);
        for (const id of [...this.sessions.keys()]) this.stop(id, 'server shutdown');
    }
}
