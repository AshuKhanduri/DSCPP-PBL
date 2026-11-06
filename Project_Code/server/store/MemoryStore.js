// MemoryStore - leaderboard + feedback kept in this server process only.
// Used by the tests, and by `npm run dev` when no MONGODB_URI is configured.
// NOT persistent: everything is lost when the server stops (persistent: false,
// and the game says so on screen).
import { compareRuns } from '../../src/data/scoring.js';

export class MemoryStore {
    constructor() {
        this.kind = 'memory';
        this.persistent = false;
        this.runs = [];
        this.feedback = [];
        this.nextId = 1;
    }

    async connect() { return this; }
    async close() {}

    // One entry per player: their best run.
    #bests() {
        const best = new Map();
        for (const r of [...this.runs].sort(compareRuns)) if (!best.has(r.nameKey)) best.set(r.nameKey, r);
        return [...best.values()].sort(compareRuns);
    }

    async addRun(run) {
        const previous = this.#bests().find(r => r.nameKey === run.nameKey) ?? null;
        const entry = { ...run, id: String(this.nextId++) };
        this.runs.push(entry);
        const bests = this.#bests();
        const rank = bests.findIndex(r => r.nameKey === run.nameKey) + 1;
        return { entry, rank, players: bests.length, personalBest: bests[rank - 1].id === entry.id, previousBest: previous };
    }

    async top(limit) {
        return this.#bests().slice(0, limit);
    }

    async addFeedback(fb) {
        const entry = { ...fb, id: String(this.nextId++) };
        this.feedback.push(entry);
        return entry;
    }

    async recentFeedback(limit) {
        return [...this.feedback].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    }
}
