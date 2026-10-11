// Tests the compiled C and C++ engines through the same bridge the server uses.
// Run: npm test   (requires `npm run build:native` first)
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { OopService } from '../server/services/OopService.js';
import { toApiGraph } from '../src/data/graphs.js';
import { whisperingWoods } from './mapGraphs.mjs';

let engines, dsa, oop;
before(async () => {
    engines = createEngines();
    dsa = new DsaService(engines.dsa);
    oop = new OopService(engines.oop);
    await dsa.reset();
    await oop.reset();
});
after(() => { engines.dsa.stop(); engines.oop.stop(); });

describe('C stack', () => {
    test('is LIFO and reports underflow', async () => {
        await dsa.stackClear('t');
        await dsa.stackPush('t', 'A');
        await dsa.stackPush('t', 'B');
        const pushed = await dsa.stackPush('t', 'C');
        assert.deepEqual(pushed.items.map(i => i.text), ['C', 'B', 'A']);
        assert.equal((await dsa.stackPop('t')).popped.text, 'C');
        assert.equal((await dsa.stackPop('t')).popped.text, 'B');
        assert.equal((await dsa.stackPop('t')).popped.text, 'A');
        const empty = await dsa.stackPop('t');
        assert.equal(empty.ok, false);
        assert.equal(empty.error, 'STACK_EMPTY');
    });
});

describe('C queue', () => {
    test('is FIFO, wraps around, and overflows at capacity', async () => {
        await dsa.queueCreate('q', 3);
        for (const v of ['A', 'B', 'C']) assert.equal((await dsa.queueEnqueue('q', v)).ok, true);
        assert.equal((await dsa.queueEnqueue('q', 'D')).error, 'QUEUE_FULL');
        assert.equal((await dsa.queueDequeue('q')).dequeued.text, 'A');
        await dsa.queueEnqueue('q', 'D');                       // uses the wrapped slot
        const list = await dsa.queueList('q');
        assert.deepEqual(list.items.map(i => i.text), ['B', 'C', 'D']);
        for (const v of ['B', 'C', 'D']) assert.equal((await dsa.queueDequeue('q')).dequeued.text, v);
        assert.equal((await dsa.queueDequeue('q')).error, 'QUEUE_EMPTY');
    });
});

describe('C linked list', () => {
    test('insert head / tail / after and remove keep order and head/tail pointers', async () => {
        await dsa.listClear('l');
        await dsa.listInsert('l', 'HALL', 'TAIL');
        await dsa.listInsert('l', 'KEY', 'HEAD');
        await dsa.listInsert('l', 'THRONE', 'TAIL');
        let r = await dsa.listInsert('l', 'GATE', 'AFTER', 'KEY');
        assert.deepEqual(r.items, ['KEY', 'GATE', 'HALL', 'THRONE']);
        r = await dsa.listRemove('l', 'THRONE');
        assert.equal(r.tail, 'HALL');
        r = await dsa.listRemove('l', 'KEY');
        assert.equal(r.head, 'GATE');
        assert.equal((await dsa.listInsert('l', 'X', 'AFTER', 'NOPE')).error, 'NOT_FOUND');
    });
});

describe('C quest chain', () => {
    test('enforces LOCKED -> AVAILABLE -> ACTIVE -> COMPLETED and unlocks next', async () => {
        let s = await dsa.questInit(['q1', 'q2', 'q3']);
        assert.deepEqual(s.chain.map(n => n.status), ['AVAILABLE', 'LOCKED', 'LOCKED']);
        assert.equal((await dsa.questStart('q2')).error, 'INVALID_QUEST_STATE');
        assert.equal((await dsa.questComplete('q1')).error, 'INVALID_QUEST_STATE');
        await dsa.questStart('q1');
        s = await dsa.questComplete('q1');
        assert.equal(s.unlocked, 'q2');
        assert.equal(s.current, 'q2');
        assert.deepEqual(s.chain.map(n => n.status), ['COMPLETED', 'AVAILABLE', 'LOCKED']);
    });
});

describe('C graph algorithms', () => {
    const woods = toApiGraph(whisperingWoods);
    const run = (algorithm, g, data, scale = 1) => dsa.path({ algorithm, graph: g, start: data.start, goal: data.goal, heuristicScale: scale });

    test('BFS finds the fewest-hop path; DFS finds a valid but longer one', async () => {
        const bfs = await run('BFS', woods, whisperingWoods);
        const dfs = await run('DFS', woods, whisperingWoods);
        assert.equal(bfs.found, true);
        assert.equal(bfs.hops, 5);
        assert.equal(bfs.path[0], 'edge');
        assert.equal(bfs.path.at(-1), 'shrine');
        assert.ok(dfs.hops >= bfs.hops);
        assert.equal(dfs.hops, 6);
    });

    test('BFS visits nodes in non-decreasing distance order', async () => {
        const bfs = await run('BFS', woods, whisperingWoods);
        // independent BFS distances computed in JS as a baseline
        const adj = new Map(woods.nodes.map(n => [n.id, []]));
        for (const e of woods.edges) { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); }
        const dist = new Map([['edge', 0]]);
        const q = ['edge'];
        while (q.length) { const u = q.shift(); for (const v of adj.get(u)) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); } }
        const ds = bfs.visitOrder.map(id => dist.get(id));
        for (let i = 1; i < ds.length; i++) assert.ok(ds[i] >= ds[i - 1], `visit order not level-by-level at ${i}`);
    });

    test('unreachable goal reports found=false', async () => {
        const g = { nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 2, y: 0 }], edges: [{ from: 'a', to: 'b', weight: 1 }] };
        for (const algorithm of ['BFS', 'DFS']) {
            const r = await dsa.path({ algorithm, graph: g, start: 'a', goal: 'c' });
            assert.equal(r.found, false, algorithm);
            assert.deepEqual(r.path, []);
        }
    });
});

describe('C++ entity hierarchy', () => {
    test('virtual interact() dispatches to each subclass', async () => {
        await oop.reset();
        await oop.create({ type: 'Guard', id: 'g', name: 'Guard' });
        await oop.create({ type: 'Door', id: 'd', param: 'Royal_Seal', name: 'Door' });
        await oop.create({ type: 'Chest', id: 'c', param: 'Gem:2:30', name: 'Chest' });
        await oop.create({ type: 'QuestObject', id: 'anvil', param: 'deliver:Ore:2:Sword', name: 'Anvil' });
        await oop.create({ type: 'QuestObject', id: 'ore', param: 'collect:Ore', name: 'Ore' });

        assert.equal((await oop.interact('g')).result.action, 'GUARD_BLOCKS');
        assert.equal((await oop.interact('d')).result.action, 'DOOR_LOCKED');
        const chest = await oop.interact('c');
        assert.equal(chest.result.action, 'CHEST_OPENED');
        assert.equal(chest.player.gold, 30);
        assert.equal((await oop.interact('c')).result.action, 'CHEST_EMPTY');
        assert.equal((await oop.interact('anvil')).result.action, 'MISSING_ITEMS');
        await oop.interact('ore');
        await oop.reward({ item: 'Ore', count: 1 });
        const delivered = await oop.interact('anvil');
        assert.equal(delivered.result.action, 'ITEM_DELIVERED');
        assert.deepEqual(delivered.player.inventory.map(i => i.item), ['Gem', 'Sword']);
        await oop.reward({ item: 'Royal_Seal' });
        assert.equal((await oop.interact('g')).result.action, 'GUARD_ALLOWS');
        assert.equal((await oop.interact('d')).result.action, 'DOOR_OPENED');
    });

    test('rejects unknown types and duplicate ids; player cannot be removed', async () => {
        assert.equal((await oop.create({ type: 'Guide', id: 'g', name: 'x' })).error, 'DUPLICATE_ID');
        assert.equal((await oop.remove('player')).error, 'NOT_FOUND');
        assert.throws(() => oop.create({ type: 'Dragon', id: 'z', name: 'x' }), /type must be one of/);
    });
});
