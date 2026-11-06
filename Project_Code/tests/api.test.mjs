// End-to-end HTTP tests: browser-shaped JSON -> Express -> C/C++ -> JSON.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store/MemoryStore.js';
import { QUESTS } from '../src/data/quests.js';

let server, base, app;
before(async () => {
    app = createApp({ store: new MemoryStore() });   // never a real database from the environment
    await new Promise(res => { server = app.listen(0, res); });
    base = `http://localhost:${server.address().port}/api`;
});
after(() => { app.locals.shutdown(); server.close(); });

const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
};
const get = async path => {
    const r = await fetch(base + path);
    return { status: r.status, body: await r.json() };
};

test('health reports both native engines', async () => {
    const r = await get('/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.native, { dsa: true, oop: true });
});

test('new game builds the quest linked list from the quest data', async () => {
    const r = await post('/game/reset', { questIds: QUESTS.map(q => q.id) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.quests.chain.map(n => n.id), QUESTS.map(q => q.id));
    assert.equal(r.body.quests.chain[0].status, 'AVAILABLE');
});

test('quest progression rules are enforced over HTTP', async () => {
    assert.equal((await post('/dsa/quest/start', { questId: 'royal_registry' })).status, 409);
    assert.equal((await post('/dsa/quest/start', { questId: 'lost_path' })).status, 200);
    const done = await post('/dsa/quest/complete', { questId: 'lost_path' });
    assert.equal(done.body.unlocked, 'royal_registry');
    const state = await get('/dsa/quest/state');
    assert.equal(state.body.current, 'royal_registry');
});

test('events queue and history stack round-trip', async () => {
    await post('/dsa/queue/enqueue', { queue: 'events', value: 'QUEST_STARTED:x' });
    await post('/dsa/queue/enqueue', { queue: 'events', value: 'REWARD:y' });
    assert.equal((await post('/dsa/queue/dequeue', { queue: 'events' })).body.dequeued.text, 'QUEST_STARTED:x');
    await post('/dsa/stack/push', { value: 'TALK:guide' });
    const st = await get('/dsa/state');
    assert.equal(st.body.history.top, 'TALK:guide');
    assert.equal(st.body.events.front, 'REWARD:y');
});

test('path endpoint maps string ids and validates input', async () => {
    const graph = { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 40, y: 0 }, { id: 'C', x: 80, y: 0 }],
        edges: [{ from: 'A', to: 'B', weight: 2 }, { from: 'B', to: 'C', weight: 2 }, { from: 'A', to: 'C', weight: 9 }] };
    const r = await post('/dsa/path/compare', { graph, start: 'A', goal: 'C', heuristicScale: 40, algorithms: ['BFS', 'DIJKSTRA'] });
    assert.deepEqual(r.body.results.BFS.path, ['A', 'C']);
    assert.deepEqual(r.body.results.DIJKSTRA.path, ['A', 'B', 'C']);
    assert.equal((await post('/dsa/path', { algorithm: 'BFS', graph, start: 'A', goal: 'Z' })).status, 400);
    assert.equal((await post('/dsa/path', { algorithm: 'MAGIC', graph, start: 'A', goal: 'C' })).status, 400);
});

test('injection-shaped input is rejected before reaching the engine', async () => {
    const r = await post('/dsa/stack/push', { value: 'A\nRESET' });
    assert.equal(r.status, 400);
    const r2 = await post('/oop/entity/create', { type: 'Guide', id: 'x y', name: 'n' });
    assert.equal(r2.status, 400);
});

test('OOP entity create / interact / list', async () => {
    const c = await post('/oop/entity/create', { type: 'GardenKeeper', id: 'lib', x: 1, y: 2, name: 'Elarion' });
    assert.equal(c.status, 200);
    const i = await post('/oop/entity/interact', { id: 'lib' });
    assert.equal(i.body.result.action, 'TALK');
    assert.match(i.body.result.message, /Garden of Balance/);
    const list = await get('/oop/entities');
    assert.ok(list.body.entities.some(e => e.id === 'lib' && e.type === 'GardenKeeper' && e.category === 'Character'));
    assert.equal((await post('/oop/entity/interact', { id: 'missing' })).status, 404);
});

test('trace and BST endpoints reach the C engine', async () => {
    const graph = { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 0 }, { id: 'C', x: 2, y: 0 }],
        edges: [{ from: 'A', to: 'B', weight: 1 }, { from: 'B', to: 'C', weight: 1 }] };
    const t = await post('/dsa/path/trace', { algorithm: 'BFS', graph, start: 'A', goal: 'C' });
    assert.equal(t.status, 200);
    assert.deepEqual(t.body.trace[0], { op: 'START', node: 'A', other: null, flag: 0, queue: ['A'] });
    assert.equal((await post('/dsa/path/trace', { algorithm: 'ASTAR', graph, start: 'A', goal: 'C' })).status, 400);

    await post('/dsa/bst/clear', { tree: 'apitest' });
    await post('/dsa/bst/insert', { tree: 'apitest', key: 50 });
    const ins = await post('/dsa/bst/insert', { tree: 'apitest', key: 30 });
    assert.equal(ins.body.side, 'LEFT');
    assert.equal((await post('/dsa/bst/search', { tree: 'apitest', key: 30 })).body.found, true);
    assert.deepEqual((await get('/dsa/bst/apitest/inorder')).body.keys, [30, 50]);
    assert.equal((await post('/dsa/bst/insert', { tree: 'apitest', key: 'x' })).status, 400);
});
