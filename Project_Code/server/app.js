// Express application factory (kept separate from server.js so tests can
// start it on a random port).
//
// Game routes (/api/health, /api/game/reset, /api/dsa/*, /api/oop/*) run on the
// caller's OWN engines: SessionManager gives every player (browser tab) a
// private C + C++ engine pair, chosen by the X-QuestForge-Session header.
// /api/online/* (leaderboard, feedback) is shared by everyone.
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
import { onlineRouter } from './routes/online.js';
import { OnlineService } from './services/OnlineService.js';
import { createStore } from './store/createStore.js';
import { DEFAULT_SESSION, SESSION_HEADER, SessionManager } from './sessions.js';

// The routes of ONE game, bound to one engine pair.
function gameRouter(engines) {
    const dsa = new DsaService(engines.dsa);
    const oop = new OopService(engines.oop);
    const r = express.Router();

    r.get('/health', async (_req, res) => {
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
    r.post('/game/reset', handle(async req => {
        await dsa.reset();
        await oop.reset();
        const quests = await dsa.questInit(req.body.questIds);
        if (!quests.ok) return quests;
        await dsa.queueCreate('events', 64);
        return { ok: true, quests };
    }));

    r.use('/dsa', dsaRouter(dsa));
    r.use('/oop', oopRouter(oop));
    return r;
}

const envInt = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

// engines: one fixed engine pair shared by every session (tests). Default: a
//          new pair per session.
// store:   where leaderboard scores and feedback go (default: MONGODB_URI, else in memory)
export function createApp({
    engines = null, store = createStore(), onlineLimits,
    maxSessions = envInt(process.env.QUESTFORGE_MAX_SESSIONS, 20),
    idleMinutes = envInt(process.env.QUESTFORGE_SESSION_IDLE_MIN, 30),
    trustProxy = process.env.QUESTFORGE_TRUST_PROXY,
} = {}) {
    const online = new OnlineService(store);
    const sessions = new SessionManager({
        createSession: () => {
            const e = engines ?? createEngines();
            return { engines: e, router: gameRouter(e) };
        },
        maxSessions,
        idleMs: idleMinutes * 60_000,
        // a shared test engine pair must not be stopped by one session ending
        log: engines ? () => {} : console.log,
    });
    if (engines) sessions.maxSessions = Infinity;
    else sessions.startSweeping();

    const app = express();
    // Behind a host's proxy (Render, Railway, Fly...) the client address comes
    // from X-Forwarded-For; the rate limits need it. QUESTFORGE_TRUST_PROXY=1.
    if (trustProxy) app.set('trust proxy', Number.isInteger(Number(trustProxy)) ? Number(trustProxy) : trustProxy);
    app.use(express.json({ limit: '256kb' }));

    app.use('/api/online', onlineRouter(online, { limits: onlineLimits }));

    // Everything else under /api is a game route: hand it to the caller's session.
    app.use('/api', (req, res, next) => {
        const id = req.get(SESSION_HEADER) || DEFAULT_SESSION;
        const starting = (req.method === 'GET' && req.path === '/health') || (req.method === 'POST' && req.path === '/game/reset');
        let session;
        try {
            session = sessions.get(id, { canCreate: starting });
        } catch (err) {
            const status = { VALIDATION_ERROR: 400, SESSION_EXPIRED: 410, SERVER_FULL: 503 }[err.code] ?? 500;
            res.status(status).json({ ok: false, error: err.code, message: err.message });
            return;
        }
        session.router(req, res, next);
    });
    app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Unknown API route' }));

    // Serve the built frontend (npm run build) when it exists.
    const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    if (existsSync(dist)) app.use(express.static(dist));

    app.locals.sessions = sessions;
    app.locals.shutdown = () => {
        if (engines) { clearInterval(sessions.timer); engines.dsa.stop(); engines.oop.stop(); }
        else sessions.stopAll();
        store.close().catch(() => {});
    };
    return app;
}
