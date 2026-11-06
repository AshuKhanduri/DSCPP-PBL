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

    // Step-by-step BFS / DFS: the result plus every operation the C code made.
    // body: { algorithm: 'BFS'|'DFS', graph, start, goal }
    r.post('/path/trace', handle(req => dsa.trace(req.body)));

    // ---- Binary search tree --------------------------------------------------
    r.post('/bst/insert', handle(req => dsa.bstInsert(req.body.tree ?? 'registry', req.body.key)));
    r.post('/bst/search', handle(req => dsa.bstSearch(req.body.tree ?? 'registry', req.body.key)));
    r.post('/bst/clear', handle(req => dsa.bstClear(req.body.tree ?? 'registry')));
    r.get('/bst/:name/inorder', handle(req => dsa.bstInorder(req.params.name)));
    r.get('/bst/:name', handle(req => dsa.bstShow(req.params.name)));

    // ---- AVL tree -------------------------------------------------------------
    r.post('/avl/insert', handle(req => dsa.avlInsert(req.body.tree ?? 'garden', req.body.key)));
    r.post('/avl/clear', handle(req => dsa.avlClear(req.body.tree ?? 'garden')));
    r.get('/avl/:name', handle(req => dsa.avlShow(req.params.name)));

    // ---- Step-by-step sorting -----------------------------------------------
    // start copies the values into C; every /step performs ONE operation there.
    r.post('/sort/start', handle(req => dsa.sortStart(req.body.sort ?? 'forge', req.body.algorithm, req.body.values)));
    r.post('/sort/step', handle(req => dsa.sortStep(req.body.sort ?? 'forge')));
    r.post('/sort/clear', handle(req => dsa.sortClear(req.body.sort ?? 'forge')));
    r.get('/sort/:name', handle(req => dsa.sortState(req.params.name)));

    // ---- Stack --------------------------------------------------------------
    r.post('/stack/create', handle(req => dsa.stackCreate(req.body.stack, req.body.capacity)));
    r.post('/stack/peek', handle(req => dsa.stackPeek(req.body.stack ?? 'history')));
    r.post('/stack/push', handle(req => dsa.stackPush(req.body.stack ?? 'history', req.body.value, req.body.numericValue ?? 0)));
    r.post('/stack/pop', handle(req => dsa.stackPop(req.body.stack ?? 'history')));
    r.post('/stack/clear', handle(req => dsa.stackClear(req.body.stack ?? 'history')));
    r.get('/stack/:name', handle(req => dsa.stackList(req.params.name, req.query.limit ?? 32)));

    // ---- Queue --------------------------------------------------------------
    r.post('/queue/create', handle(req => dsa.queueCreate(req.body.queue, req.body.capacity)));
    r.post('/queue/enqueue', handle(req => dsa.queueEnqueue(req.body.queue ?? 'events', req.body.value, req.body.numericValue ?? 0)));
    r.post('/queue/dequeue', handle(req => dsa.queueDequeue(req.body.queue ?? 'events')));
    r.post('/queue/peek', handle(req => dsa.queuePeek(req.body.queue ?? 'events')));
    r.post('/queue/clear', handle(req => dsa.queueClear(req.body.queue ?? 'events')));
    r.get('/queue/:name', handle(req => dsa.queueList(req.params.name)));

    // ---- Linear queue -------------------------------------------------------
    r.post('/lqueue/create', handle(req => dsa.lqueueCreate(req.body.queue, req.body.capacity)));
    r.post('/lqueue/enqueue', handle(req => dsa.lqueueEnqueue(req.body.queue, req.body.value, req.body.numericValue ?? 0)));
    r.post('/lqueue/dequeue', handle(req => dsa.lqueueDequeue(req.body.queue)));
    r.post('/lqueue/peek', handle(req => dsa.lqueuePeek(req.body.queue)));
    r.post('/lqueue/clear', handle(req => dsa.lqueueClear(req.body.queue)));
    r.get('/lqueue/:name', handle(req => dsa.lqueueList(req.params.name)));

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
