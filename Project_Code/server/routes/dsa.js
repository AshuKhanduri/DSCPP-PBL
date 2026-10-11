// /api/dsa/* - Data Structures & Algorithms, backed by the C engine.
import { Router } from 'express';
import { ALGORITHMS } from '../services/DsaService.js';
import { handle } from './respond.js';

export function dsaRouter(dsa) {
    const r = Router();

    // Snapshot used by the in-game DSA inspector.
    r.get('/state', handle(() => dsa.state()));

    // ---- Graph search -------------------------------------------------------
    // body: { algorithm, graph: { nodes, edges, directed }, start, goal, heuristicScale }
    r.post('/path', handle(req => dsa.path(req.body)));
    // Same graph through several algorithms - used for result comparisons.
    r.post('/path/compare', handle(async req => {
        const algorithms = req.body.algorithms ?? ALGORITHMS;
        const results = {};
        for (const algorithm of algorithms) {
            results[algorithm] = await dsa.path({ ...req.body, algorithm });
            if (!results[algorithm].ok) return results[algorithm];
        }
        return { ok: true, results };
    }));

    // ---- Stack --------------------------------------------------------------
    r.post('/stack/push', handle(req => dsa.stackPush(req.body.stack ?? 'history', req.body.value, req.body.numericValue ?? 0)));
    r.post('/stack/pop', handle(req => dsa.stackPop(req.body.stack ?? 'history')));
    r.post('/stack/clear', handle(req => dsa.stackClear(req.body.stack ?? 'history')));
    r.get('/stack/:name', handle(req => dsa.stackList(req.params.name, req.query.limit ?? 32)));

    // ---- Queue --------------------------------------------------------------
    r.post('/queue/create', handle(req => dsa.queueCreate(req.body.queue, req.body.capacity)));
    r.post('/queue/enqueue', handle(req => dsa.queueEnqueue(req.body.queue ?? 'events', req.body.value, req.body.numericValue ?? 0)));
    r.post('/queue/dequeue', handle(req => dsa.queueDequeue(req.body.queue ?? 'events')));
    r.post('/queue/clear', handle(req => dsa.queueClear(req.body.queue ?? 'events')));
    r.get('/queue/:name', handle(req => dsa.queueList(req.params.name)));

    // ---- Linked list --------------------------------------------------------
    r.post('/list/insert', handle(req => dsa.listInsert(req.body.list, req.body.value, req.body.position ?? 'TAIL', req.body.after)));
    r.post('/list/remove', handle(req => dsa.listRemove(req.body.list, req.body.value)));
    r.post('/list/clear', handle(req => dsa.listClear(req.body.list)));
    r.get('/list/:name', handle(req => dsa.listShow(req.params.name)));

    // ---- Quest progression (linked list) -------------------------------------
    r.post('/quest/init', handle(req => dsa.questInit(req.body.questIds)));
    r.get('/quest/state', handle(() => dsa.questState()));
    r.post('/quest/start', handle(req => dsa.questStart(req.body.questId)));
    r.post('/quest/complete', handle(req => dsa.questComplete(req.body.questId)));

    return r;
}
