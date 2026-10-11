// /api/oop/* - entity hierarchy, backed by the C++ engine.
import { Router } from 'express';
import { handle } from './respond.js';

export function oopRouter(oop) {
    const r = Router();

    r.post('/entity/create', handle(req => oop.create(req.body)));
    // Create many at once (world setup). Stops at the first failure.
    r.post('/entities/batch', handle(async req => {
        const list = Array.isArray(req.body.entities) ? req.body.entities : [];
        const created = [];
        for (const spec of list) {
            const res = await oop.create(spec);
            if (!res.ok) return { ...res, created };
            created.push(res.entity);
        }
        return { ok: true, created };
    }));
    r.get('/entities', handle(() => oop.list()));
    r.get('/entity/:id', handle(req => oop.get(req.params.id)));
    r.delete('/entity/:id', handle(req => oop.remove(req.params.id)));
    r.post('/entity/interact', handle(req => oop.interact(req.body.id)));

    r.get('/player', handle(() => oop.player()));
    r.post('/player/reward', handle(req => oop.reward(req.body)));
    r.post('/player/take', handle(req => oop.take(req.body.item, req.body.count ?? 1)));

    return r;
}
