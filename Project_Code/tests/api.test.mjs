// End-to-end HTTP tests: browser-shaped JSON -> Express -> C/C++ -> JSON.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../server/app.js';
import { QUESTS } from '../src/data/quests.js';

let server, base, app;
before(async () => {
    app = createApp();
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
    // a two-quest chain so the unlock of the next node can be checked
    assert.equal((await post('/dsa/quest/init', { questIds: ['lost_path', 'next_quest'] })).status, 200);
    assert.equal((await post('/dsa/quest/start', { questId: 'next_quest' })).status, 409);
    assert.equal((await post('/dsa/quest/start', { questId: 'lost_path' })).status, 200);
    const done = await post('/dsa/quest/complete', { questId: 'lost_path' });
    assert.equal(done.body.unlocked, 'next_quest');
    const state = await get('/dsa/quest/state');
    assert.equal(state.body.current, 'next_quest');
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
    const r = await post('/dsa/path/compare', { graph, start: 'A', goal: 'C', heuristicScale: 40, algorithms: ['BFS', 'DFS'] });
    assert.deepEqual(r.body.results.BFS.path, ['A', 'C']);
    assert.equal(r.body.results.DFS.found, true);
    assert.equal(r.body.results.DFS.path.at(-1), 'C');
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
    const c = await post('/oop/entity/create', { type: 'Librarian', id: 'lib', x: 1, y: 2, name: 'Librarian' });
    assert.equal(c.status, 200);
    const i = await post('/oop/entity/interact', { id: 'lib' });
    assert.equal(i.body.result.action, 'TALK');
    assert.match(i.body.result.message, /Shh/);
    const list = await get('/oop/entities');
    assert.ok(list.body.entities.some(e => e.id === 'lib' && e.type === 'Librarian' && e.category === 'Character'));
    assert.equal((await post('/oop/entity/interact', { id: 'missing' })).status, 404);
});
