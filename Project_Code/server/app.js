// Express application factory (kept separate from server.js so tests can
// start it on a random port).
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEngines } from './native/engines.js';
import { DsaService } from './services/DsaService.js';
import { OopService } from './services/OopService.js';
import { dsaRouter } from './routes/dsa.js';
import { oopRouter } from './routes/oop.js';
import { handle } from './routes/respond.js';

export function createApp({ engines = createEngines() } = {}) {
    const dsa = new DsaService(engines.dsa);
    const oop = new OopService(engines.oop);
    const app = express();

    app.use(express.json({ limit: '256kb' }));

    app.get('/api/health', async (_req, res) => {
        const check = async svc => {
            try { return (await svc.ping()).ok === true; } catch { return false; }
        };
        const [dsaOk, oopOk] = await Promise.all([check(dsa), check(oop)]);
        res.status(dsaOk && oopOk ? 200 : 503).json({
            ok: dsaOk && oopOk,
            native: { dsa: dsaOk, oop: oopOk },
            hint: dsaOk && oopOk ? undefined : 'Run "npm run build:native" to compile the C/C++ engines.',
        });
    });

    // New game: wipe both engines and build the quest chain.
    app.post('/api/game/reset', handle(async req => {
        await dsa.reset();
        await oop.reset();
        const quests = await dsa.questInit(req.body.questIds);
        if (!quests.ok) return quests;
        await dsa.queueCreate('events', 64);
        return { ok: true, quests };
    }));

    app.use('/api/dsa', dsaRouter(dsa));
    app.use('/api/oop', oopRouter(oop));
    app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Unknown API route' }));

    // Serve the built frontend (npm run build) when it exists.
    const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    if (existsSync(dist)) app.use(express.static(dist));

    app.locals.shutdown = () => {
        engines.dsa.stop();
        engines.oop.stop();
    };
    return app;
}
