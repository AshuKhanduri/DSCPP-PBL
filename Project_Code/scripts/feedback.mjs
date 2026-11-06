// npm run feedback [count]  - print the most recent player feedback.
// Reads MONGODB_URI / MONGODB_DB from the environment or .env. Feedback is
// never exposed through the public API, so this is how the team reads it.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set (see .env.example). Feedback is only kept in MongoDB.');
    process.exit(1);
}
const { createStore } = await import('../server/store/createStore.js');
const store = createStore();
const count = Math.min(Math.max(Number(process.argv[2]) || 20, 1), 200);
try {
    const rows = await store.recentFeedback(count);
    if (!rows.length) console.log('No feedback yet.');
    for (const f of rows) {
        const when = new Date(f.createdAt).toISOString().replace('T', ' ').slice(0, 16);
        console.log(`\n${'*'.repeat(f.rating)}${'.'.repeat(5 - f.rating)}  ${when}  ${f.name ?? '(anonymous)'}  [${f.context}]`);
        console.log(`  ${f.message.replace(/\n/g, '\n  ')}`);
    }
} catch (err) {
    console.error(`Could not read feedback: ${err.message}`);
    process.exitCode = 1;
} finally {
    await store.close();
}
