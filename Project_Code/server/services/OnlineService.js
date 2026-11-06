// OnlineService - leaderboard scores and player feedback.
// Validates everything the browser sends, recomputes the score from its parts
// (src/data/scoring.js) and hands clean documents to the store.
// Store failures (e.g. Atlas unreachable) become STORE_UNAVAILABLE (503); the
// game keeps working without them.
import { ValidationError, int } from '../validation.js';
import { LIMITS, cleanPlayerName, computeScore, nameKey, playerNameProblem } from '../../src/data/scoring.js';

const LOOKS = ['male', 'female'];
const CONTEXTS = ['title', 'end'];

export class StoreUnavailableError extends Error {
    constructor(cause) {
        super('The leaderboard database is not reachable right now. Your game is not affected - try again later.');
        this.code = 'STORE_UNAVAILABLE';
        this.cause = cause;
    }
}

export function playerNameField(value, { optional = false } = {}) {
    const s = cleanPlayerName(value);
    if (!s && optional) return null;
    if (playerNameProblem(s)) {     // the same rule as the title screen's name prompt
        throw new ValidationError(`name must be 1-${LIMITS.nameMax} letters, digits, spaces or ' _ - .`);
    }
    return s;
}

export function messageField(value) {
    // drop control characters except newlines/tabs; the browser shows text, never HTML
    const s = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (s.length < LIMITS.messageMin || s.length > LIMITS.messageMax) {
        throw new ValidationError(`message must be ${LIMITS.messageMin}-${LIMITS.messageMax} characters`);
    }
    return s;
}

// The public shape of a leaderboard row.
function publicRun(r, rank) {
    return {
        rank, name: r.name, score: r.score, questsCompleted: r.questsCompleted, questsTotal: r.questsTotal,
        firstTryCorrect: r.firstTryCorrect, questionsAsked: r.questionsAsked, bonusCoins: r.bonusCoins,
        timeMs: r.timeMs, look: r.look, createdAt: new Date(r.createdAt).toISOString(),
    };
}

export class OnlineService {
    constructor(store, { now = () => new Date() } = {}) {
        this.store = store;
        this.now = now;
    }

    get info() {
        return { store: this.store.kind, persistent: this.store.persistent };
    }

    async #use(fn) {
        try {
            return await fn();
        } catch (err) {
            if (err instanceof ValidationError) throw err;
            console.error(`[online] ${this.store.kind} store error: ${err.message}`);
            throw new StoreUnavailableError(err);
        }
    }

    validateRun(body = {}) {
        const questsTotal = int(body.questsTotal, 'questsTotal', { min: 1, max: LIMITS.questsMax });
        const questsCompleted = int(body.questsCompleted, 'questsCompleted', { min: 0, max: questsTotal });
        const questionsAsked = int(body.questionsAsked, 'questionsAsked', { min: 0, max: LIMITS.questionsMax });
        const firstTryCorrect = int(body.firstTryCorrect, 'firstTryCorrect', { min: 0, max: questionsAsked });
        const bonusCoins = int(body.bonusCoins, 'bonusCoins', { min: 0, max: LIMITS.bonusCoinsMax });
        const timeMs = int(body.timeMs, 'timeMs', { min: LIMITS.timeMsMin, max: LIMITS.timeMsMax });
        const look = LOOKS.includes(body.look) ? body.look : 'male';
        const name = playerNameField(body.name);
        if (questsCompleted !== questsTotal) throw new ValidationError('only a finished journey (every main quest) can be submitted');
        const score = computeScore({ questsCompleted, firstTryCorrect, questionsAsked, bonusCoins }).total;
        return { name, nameKey: nameKey(name), score, questsCompleted, questsTotal, firstTryCorrect, questionsAsked, bonusCoins, timeMs, look };
    }

    async submitRun(body) {
        const run = { ...this.validateRun(body), createdAt: this.now() };
        const r = await this.#use(() => this.store.addRun(run));
        return {
            ok: true, ...this.info,
            entry: publicRun(r.entry, r.rank),
            rank: r.rank, players: r.players, personalBest: r.personalBest,
            previousBest: r.previousBest ? publicRun(r.previousBest, null) : null,
        };
    }

    async leaderboard(limitValue) {
        const limit = limitValue == null || limitValue === '' ? 10 : int(limitValue, 'limit', { min: 1, max: 50 });
        const rows = await this.#use(() => this.store.top(limit));
        return { ok: true, ...this.info, entries: rows.map((r, i) => publicRun(r, i + 1)) };
    }

    async submitFeedback(body = {}) {
        const rating = int(body.rating, 'rating', { min: 1, max: 5 });
        const fb = {
            name: playerNameField(body.name, { optional: true }),
            rating,
            message: messageField(body.message),
            context: CONTEXTS.includes(body.context) ? body.context : 'title',
            createdAt: this.now(),
        };
        await this.#use(() => this.store.addFeedback(fb));
        return { ok: true, ...this.info };
    }

    async recentFeedback(limit = 20) {
        return this.#use(() => this.store.recentFeedback(limit));
    }
}
