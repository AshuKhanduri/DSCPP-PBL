// AVL tree in the C engine (native/c/avl.c): structure, heights, balance
// factors and the rotation steps reported for every insertion.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { createApp } from '../server/app.js';

let engines, dsa;
before(() => { engines = createEngines(); dsa = new DsaService(engines.dsa); });
after(() => { engines.dsa.stop(); engines.oop.stop(); });

// Shape as nested arrays [key, left, right] from a snapshot, for exact comparisons.
function shape(tree) {
    const by = new Map(tree.nodes.map(n => [n.key, n]));
    const walk = k => (k == null ? null : [k, walk(by.get(k).left), walk(by.get(k).right)]);
    return walk(tree.root);
}

// Independent check of a snapshot: BST order, heights and BF recomputed here.
function checkSnapshot(tree, { balanced = true } = {}) {
    const by = new Map(tree.nodes.map(n => [n.key, n]));
    const h = k => (k == null ? 0 : 1 + Math.max(h(by.get(k).left), h(by.get(k).right)));
    const order = (k, lo, hi) => k == null || (k > lo && k < hi && order(by.get(k).left, lo, k) && order(by.get(k).right, k, hi));
    assert.ok(order(tree.root, -Infinity, Infinity), 'BST order');
    for (const n of tree.nodes) {
        assert.equal(n.height, h(n.key), `height of ${n.key}`);
        assert.equal(n.bf, h(n.left) - h(n.right), `bf of ${n.key}`);
        if (balanced) assert.ok(Math.abs(n.bf) <= 1, `|bf| of ${n.key} <= 1`);
    }
    assert.equal(tree.height, h(tree.root));
}

async function build(name, keys) {
    await dsa.avlClear(name);
    let r;
    for (const k of keys) r = await dsa.avlInsert(name, k);
    return r;
}

describe('C AVL tree', () => {
    test('empty and single-node trees', async () => {
        const empty = await dsa.avlClear('a');
        assert.deepEqual([empty.tree.root, empty.tree.size, empty.tree.height, empty.valid], [null, 0, 0, true]);
        const one = await dsa.avlInsert('a', 42);
        assert.equal(one.inserted, true);
        assert.deepEqual(one.steps.map(s => s.event), ['PLACED']);
        assert.equal(one.steps[0].side, 'ROOT');
        assert.deepEqual(one.tree.nodes, [{ key: 42, left: null, right: null, height: 1, bf: 0 }]);
    });

    test('insertions that need no rotation', async () => {
        const r = await build('a', [20, 10, 30, 5, 25]);
        assert.equal(r.unbalanced, null);
        assert.deepEqual(shape(r.tree), [20, [10, [5, null, null], null], [30, [25, null, null], null]]);
        checkSnapshot(r.tree);
        assert.deepEqual(r.inorder, [5, 10, 20, 25, 30]);
    });

    const CASES = [
        { name: 'LL', keys: [30, 20, 10], unbalanced: 30, bf: 2, rotations: [['RIGHT', 30, 20]] },
        { name: 'RR', keys: [10, 20, 30], unbalanced: 10, bf: -2, rotations: [['LEFT', 10, 20]] },
        { name: 'LR', keys: [30, 10, 20], unbalanced: 30, bf: 2, rotations: [['LEFT', 10, 20], ['RIGHT', 30, 20]] },
        { name: 'RL', keys: [10, 30, 20], unbalanced: 10, bf: -2, rotations: [['RIGHT', 30, 20], ['LEFT', 10, 20]] },
    ];
    for (const c of CASES) {
        test(`${c.name} case: detection, rotation order and final structure`, async () => {
            const r = await build('a', c.keys);
            assert.equal(r.unbalanced.case, c.name);
            assert.equal(r.unbalanced.key, c.unbalanced);
            assert.equal(r.unbalanced.bf, c.bf);
            assert.deepEqual(r.steps.map(s => s.event), ['PLACED', 'UNBALANCED', ...c.rotations.map(() => 'ROTATE')]);
            assert.deepEqual(r.steps.filter(s => s.event === 'ROTATE').map(s => [s.dir, s.pivot, s.newTop]), c.rotations);
            // the imbalance is visible in C's snapshot before rotating...
            const before = r.steps.find(s => s.event === 'UNBALANCED').tree;
            checkSnapshot(before, { balanced: false });
            assert.equal(before.nodes.find(n => n.key === c.unbalanced).bf, c.bf);
            // ...and gone after it
            assert.deepEqual(shape(r.tree), [20, [10, null, null], [30, null, null]]);
            checkSnapshot(r.tree);
            assert.equal(r.valid, true);
            for (const s of r.steps) checkSnapshot(s.tree, { balanced: false });
        });
    }

    test('a rotation moves the middle subtree to the other node', async () => {
        const r = await build('a', [40, 20, 60, 10, 30, 5]);
        assert.equal(r.unbalanced.case, 'LL');
        assert.equal(r.unbalanced.key, 40);
        assert.equal(r.steps.at(-1).moved, 30, '30 moves from 20 to 40');
        assert.deepEqual(shape(r.tree), [20, [10, [5, null, null], null], [40, [30, null, null], [60, null, null]]]);
    });

    test('duplicates are ignored, invalid keys rejected, clear frees the tree', async () => {
        await build('a', [10, 20]);
        const dup = await dsa.avlInsert('a', 10);
        assert.deepEqual([dup.inserted, dup.duplicate, dup.tree.size], [false, true, 2]);
        assert.throws(() => dsa.avlInsert('a', -1), /key must be an integer/);
        assert.throws(() => dsa.avlInsert('a', 'ten'), /key must be an integer/);
        assert.equal((await dsa.engine.send('AVL_INSERT a -5')).error, 'BAD_ARGS');
        const cleared = await dsa.avlClear('a');
        assert.equal(cleared.tree.size, 0);
        assert.equal((await dsa.avlInsert('a', 7)).tree.size, 1, 'the tree is usable after a reset');
    });

    test('63 sorted and shuffled keys stay balanced after every insertion; the 64th is refused', async () => {
        for (const order of ['sorted', 'shuffled']) {
            const keys = Array.from({ length: 63 }, (_, i) => i * 3);
            if (order === 'shuffled') keys.sort((p, q) => ((p * 7919) % 101) - ((q * 7919) % 101));
            await dsa.avlClear('big');
            let r;
            for (const k of keys) {
                r = await dsa.avlInsert('big', k);
                assert.equal(r.valid, true, `${order}: valid after ${k}`);
            }
            checkSnapshot(r.tree);
            assert.deepEqual(r.inorder, [...keys].sort((p, q) => p - q));
            assert.ok(r.tree.height <= 1.44 * Math.log2(63 + 2), `${order}: height ${r.tree.height} is logarithmic`);
            assert.equal((await dsa.avlInsert('big', 9999)).error, 'TREE_FULL');
        }
    });
});

test('HTTP: AVL endpoints, validation and repeated operations in one session', async () => {
    const app = createApp();
    const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
    const base = `http://localhost:${server.address().port}/api/dsa`;
    const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(async r => ({ status: r.status, body: await r.json() }));
    try {
        assert.equal((await post('/avl/clear', { tree: 'http' })).status, 200);
        for (const key of [30, 20]) assert.equal((await post('/avl/insert', { tree: 'http', key })).status, 200);
        const r = await post('/avl/insert', { tree: 'http', key: 10 });
        assert.equal(r.body.unbalanced.case, 'LL');
        assert.equal((await post('/avl/insert', { tree: 'http', key: 'x' })).status, 400);
        assert.equal((await post('/avl/insert', { tree: 'bad name!', key: 1 })).status, 400);
        const shown = await fetch(`${base}/avl/http`).then(x => x.json());
        assert.deepEqual(shown.inorder, [10, 20, 30]);
    } finally {
        app.locals.shutdown();
        server.close();
    }
});
