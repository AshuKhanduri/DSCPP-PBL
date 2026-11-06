// ApiClient - the browser's only route to the native engines (HTTP + JSON).
//
// Every request carries this tab's session id (X-QuestForge-Session): the
// server runs a private C + C++ engine pair per session, so friends playing at
// the same time never share a game. The id lives in sessionStorage (one game
// per tab, kept across reloads of that tab).

const SESSION_HEADER = 'X-QuestForge-Session';
const SESSION_KEY = 'questforge.session';

function randomId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);       // plain-http pages have no randomUUID
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function sessionId() {
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) { id = randomId(); sessionStorage.setItem(SESSION_KEY, id); }
        return id;
    } catch {
        return (sessionId.memo ??= randomId());     // storage blocked: one id for this page load
    }
}

export class ApiError extends Error {
    constructor(status, body) {
        super(body?.message || `HTTP ${status}`);
        this.status = status;
        this.code = body?.error || 'HTTP_ERROR';
        this.body = body;
    }
}

export class ApiClient {
    constructor(base = '/api') {
        this.base = base;
        this.online = null;            // null = unknown yet
        this.listeners = new Set();
        this.expiredListeners = new Set();
    }

    // The server no longer has this tab's game (idle timeout or restart).
    onSessionExpired(fn) {
        this.expiredListeners.add(fn);
        return () => this.expiredListeners.delete(fn);
    }

    onStatusChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    #setOnline(value) {
        if (this.online === value) return;
        this.online = value;
        for (const fn of this.listeners) fn(value);
    }

    async request(method, path, body) {
        let res;
        try {
            res = await fetch(this.base + path, {
                method,
                headers: { [SESSION_HEADER]: sessionId(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (err) {
            this.#setOnline(false);
            throw new ApiError(0, { error: 'NETWORK', message: 'Cannot reach the QuestForge server. Is "npm run dev" running?' });
        }
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON error page */ }
        if (json?.error === 'SESSION_EXPIRED') for (const fn of this.expiredListeners) fn(json);
        // SERVER_FULL is a 503 too, but the engines are fine - there is just no room
        if (json?.error !== 'SERVER_FULL') this.#setOnline(![502, 503, 504].includes(res.status));
        if (!res.ok || json?.ok === false) throw new ApiError(res.status, json);
        return json;
    }

    get(path) { return this.request('GET', path); }
    post(path, body = {}) { return this.request('POST', path, body); }
    delete(path) { return this.request('DELETE', path); }
}
