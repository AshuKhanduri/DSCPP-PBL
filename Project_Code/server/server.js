// QuestForge API server.  npm run server   (default port 3001)
import { createApp } from './app.js';

// Own variable on purpose: tools often set PORT for the frontend dev server.
const PORT = Number(process.env.QUESTFORGE_API_PORT) || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
    console.log(`QuestForge API listening on http://localhost:${PORT}`);
    console.log('  Health check: GET /api/health');
});

const shutdown = () => {
    app.locals.shutdown();
    server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
