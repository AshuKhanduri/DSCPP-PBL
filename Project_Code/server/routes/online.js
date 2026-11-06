// /api/online - leaderboard and feedback (MongoDB or the in-memory store).
//   GET  /api/online/status                where scores go (store, persistent)
//   GET  /api/online/leaderboard?limit=10  each player's best run, ranked
//   POST /api/online/scores                submit a finished journey
//   POST /api/online/feedback              { rating 1-5, message, name? }
// There is deliberately no public route that lists feedback: read it with
// `npm run feedback` (needs MONGODB_URI).
import { Router } from 'express';
import { handle } from './respond.js';

// Small fixed-window limiter per client address, kept in memory only
// (addresses are never stored in the database).
export function rateLimit({ windowMs, max }) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip ?? 'unknown';
        let h = hits.get(key);
        if (!h || now - h.start >= windowMs) {
            h = { start: now, count: 0 };
            hits.set(key, h);
            if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        }
        if (++h.count > max) {
            res.status(429).json({ ok: false, error: 'RATE_LIMITED', message: 'Too many requests - please wait a few minutes and try again.' });
            return;
        }
        next();
    };
}

export function onlineRouter(online, { limits = {} } = {}) {
    const r = Router();
    const minutes = 60 * 1000;
    const scoreLimit = rateLimit({ windowMs: 10 * minutes, max: 10, ...limits.scores });
    const feedbackLimit = rateLimit({ windowMs: 10 * minutes, max: 5, ...limits.feedback });

    r.get('/status', handle(async () => ({ ok: true, ...online.info })));
    r.get('/leaderboard', handle(req => online.leaderboard(req.query.limit)));
    r.post('/scores', scoreLimit, handle(req => online.submitRun(req.body)));
    r.post('/feedback', feedbackLimit, handle(req => online.submitFeedback(req.body)));
    return r;
}
