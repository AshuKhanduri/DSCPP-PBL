// MongoStore - leaderboard + feedback in MongoDB (e.g. a free Atlas cluster).
//
// The connection string comes ONLY from the environment (MONGODB_URI, see
// .env.example) - never from code, the browser, or a committed file.
//
// Collections (database MONGODB_DB, default "questforge"):
//   runs      one document per finished journey; the leaderboard shows each
//             player's best run (grouped by nameKey)
//   feedback  { name, rating, message, context, createdAt } - no IP addresses
import { MongoClient } from 'mongodb';

// Leaderboard order, as in src/data/scoring.js compareRuns.
const ORDER = { score: -1, timeMs: 1, createdAt: 1 };
const PUBLIC = { _id: 0, id: { $toString: '$_id' }, name: 1, nameKey: 1, score: 1, questsCompleted: 1, questsTotal: 1,
    firstTryCorrect: 1, questionsAsked: 1, bonusCoins: 1, timeMs: 1, look: 1, createdAt: 1 };

export class MongoStore {
    constructor(uri, { dbName = 'questforge', timeoutMs = 5000 } = {}) {
        this.kind = 'mongodb';
        this.persistent = true;
        this.client = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs, appName: 'questforge' });
        this.dbName = dbName;
        this.ready = null;
    }

    // Connect once (lazily); a failed attempt is retried on the next request.
    connect() {
        if (!this.ready) {
            this.ready = (async () => {
                await this.client.connect();
                const db = this.client.db(this.dbName);
                this.runs = db.collection('runs');
                this.feedbackCol = db.collection('feedback');
                await this.runs.createIndexes([
                    { key: ORDER, name: 'leaderboard' },
                    { key: { nameKey: 1, ...ORDER }, name: 'player_best' },
                ]);
                await this.feedbackCol.createIndex({ createdAt: -1 }, { name: 'recent' });
                return this;
            })().catch(err => { this.ready = null; throw err; });
        }
        return this.ready;
    }

    async close() {
        await this.client.close();
    }

    // Each player's best run, in leaderboard order.
    #bestsPipeline() {
        return [
            { $sort: { nameKey: 1, ...ORDER } },
            { $group: { _id: '$nameKey', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
            { $sort: ORDER },
        ];
    }

    async #bestOf(nameKey) {
        await this.connect();
        return this.runs.find({ nameKey }, { projection: PUBLIC }).sort(ORDER).limit(1).next();
    }

    // How many players' bests rank above this run.
    async #playersAbove(run) {
        const [row] = await this.runs.aggregate([
            ...this.#bestsPipeline().slice(0, 3),
            { $match: { $or: [
                { score: { $gt: run.score } },
                { score: run.score, timeMs: { $lt: run.timeMs } },
                { score: run.score, timeMs: run.timeMs, createdAt: { $lt: run.createdAt } },
            ] } },
            { $count: 'n' },
        ]).toArray();
        return row?.n ?? 0;
    }

    async addRun(run) {
        await this.connect();
        const previous = await this.#bestOf(run.nameKey);
        const { insertedId } = await this.runs.insertOne({ ...run });
        const best = await this.#bestOf(run.nameKey);
        const [rank, players] = await Promise.all([
            this.#playersAbove(best).then(n => n + 1),
            this.runs.distinct('nameKey').then(k => k.length),
        ]);
        return { entry: { ...run, id: String(insertedId) }, rank, players, personalBest: best.id === String(insertedId), previousBest: previous };
    }

    async top(limit) {
        await this.connect();
        return this.runs.aggregate([...this.#bestsPipeline(), { $limit: limit }, { $project: PUBLIC }]).toArray();
    }

    async addFeedback(fb) {
        await this.connect();
        const { insertedId } = await this.feedbackCol.insertOne({ ...fb });
        return { ...fb, id: String(insertedId) };
    }

    async recentFeedback(limit) {
        await this.connect();
        return this.feedbackCol.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
    }
}
