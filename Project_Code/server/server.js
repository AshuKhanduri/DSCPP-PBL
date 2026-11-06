// QuestForge API server.  npm run server   (default port 3001)
import { existsSync } from 'node:fs';

// Settings such as MONGODB_URI come from the environment, or from a local .env
// file (never committed - see .env.example). Must run before app.js reads them.
if (existsSync('.env')) process.loadEnvFile('.env');
const { createApp } = await import('./app.js');

// Own variable on purpose: tools often set PORT for the frontend dev server.
const PORT = Number(process.env.QUESTFORGE_API_PORT) || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
    console.log(`QuestForge API listening on http://localhost:${PORT}`);
    console.log('  Health check: GET /api/health');
    const db = process.env.MONGODB_URI ? `MongoDB (database "${process.env.MONGODB_DB || 'questforge'}")` : 'in memory - NOT saved (set MONGODB_URI in .env to use MongoDB)';
    console.log(`  Leaderboard + feedback: ${db}`);
});

const shutdown = () => {
    app.locals.shutdown();
    server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
