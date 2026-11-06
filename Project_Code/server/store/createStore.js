// Picks where leaderboard scores and feedback are kept.
//   MONGODB_URI set  -> MongoDB (Atlas or local), persistent
//   otherwise        -> in-memory, NOT persistent (lost when the server stops)
import { MemoryStore } from './MemoryStore.js';
import { MongoStore } from './MongoStore.js';

export function createStore(env = process.env) {
    const uri = env.MONGODB_URI?.trim();
    if (uri) return new MongoStore(uri, { dbName: env.MONGODB_DB?.trim() || 'questforge' });
    return new MemoryStore();
}
