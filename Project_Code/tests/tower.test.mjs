// Tower of Trials structures in the C engine: bounded stack, linear queue,
// circular queue. Overflow / underflow must refuse the operation, leave the
// structure unchanged and still report its state.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { createApp } from '../server/app.js';

let engines, dsa;
before(() => { engines = createEngines(); dsa = new DsaService(engines.dsa); });
after(() => { engines.dsa.stop(); engines.oop.stop(); });

const vals = r => r.items.map(i => i.value);

describe('C bounded stack', () => {
    test('LIFO, PEEK does not remove, overflow and underflow keep the state', async () => {
        let r = await dsa.stackCreate('ts', 5);
        assert.equal(r.capacity, 5);
        assert.equal(r.empty, true);
        for (const v of [10, 20, 30, 40, 50]) r = await dsa.stackPush('ts', String(v), v);
        assert.equal(r.full, true);
        assert.deepEqual(vals(r), [50, 40, 30, 20, 10], 'items are listed top first');
        const over = await dsa.stackPush('ts', '60', 60);
        assert.equal(over.ok, false);
        assert.equal(over.error, 'STACK_FULL');
        assert.equal(over.condition, 'OVERFLOW');
        assert.deepEqual(vals(over), [50, 40, 30, 20, 10], 'overflow changes nothing');
        const peek = await dsa.stackPeek('ts');
        assert.equal(peek.peeked.value, 50);
        assert.equal(peek.size, 5);
        for (const v of [50, 40, 30, 20, 10]) assert.equal((await dsa.stackPop('ts')).popped.value, v);
        for (const op of [() => dsa.stackPop('ts'), () => dsa.stackPeek('ts')]) {
            const under = await op();
            assert.equal(under.error, 'STACK_EMPTY');
            assert.equal(under.condition, 'UNDERFLOW');
            assert.equal(under.empty, true);
        }
        await dsa.stackPush('ts', '1', 1);
        r = await dsa.stackCreate('ts', 5);          // reset
        assert.equal(r.size, 0);
    });
});

describe('C linear queue', () => {
    test('FIFO with FRONT / REAR indices; freed slots are never reused', async () => {
        let r = await dsa.lqueueCreate('tl', 5);
        assert.deepEqual([r.frontIndex, r.rearIndex, r.empty], [0, -1, true]);
        for (const v of [10, 20, 30, 40, 50]) r = await dsa.lqueueEnqueue('tl', String(v), v);
        assert.deepEqual([r.frontIndex, r.rearIndex, r.full], [0, 4, true]);
        let d = await dsa.lqueueDequeue('tl');
        assert.equal(d.dequeued.value, 10);
        d = await dsa.lqueueDequeue('tl');
        assert.equal(d.dequeued.value, 20);
        assert.deepEqual(d.slots.slice(0, 2), ['spent', 'spent']);
        const over = await dsa.lqueueEnqueue('tl', '60', 60);
        assert.equal(over.error, 'QUEUE_FULL', 'REAR at the end: overflow although two slots were freed');
        assert.equal(over.size, 3);
        assert.equal((await dsa.lqueuePeek('tl')).peeked.value, 30);
        for (const v of [30, 40, 50]) assert.equal((await dsa.lqueueDequeue('tl')).dequeued.value, v);
        const under = await dsa.lqueueDequeue('tl');
        assert.equal(under.error, 'QUEUE_EMPTY');
        assert.equal(under.condition, 'UNDERFLOW');
        r = await dsa.lqueueCreate('tl', 5);         // reset
        assert.deepEqual([r.frontIndex, r.rearIndex, r.size], [0, -1, 0]);
    });
});

describe('C circular queue', () => {
    test('the lesson sequence: REAR wraps from 4 to 0 and reuses freed slots', async () => {
        let r = await dsa.queueCreate('tc', 5);
        for (const v of [10, 20, 30, 40, 50]) r = await dsa.queueEnqueue('tc', String(v), v);
        assert.equal(r.full, true);
        assert.equal((await dsa.queueEnqueue('tc', '99', 99)).condition, 'OVERFLOW');
        await dsa.queueDequeue('tc');
        r = await dsa.queueDequeue('tc');
        assert.deepEqual([r.frontIndex, r.rearIndex], [2, 4]);
        r = await dsa.queueEnqueue('tc', '60', 60);
        assert.equal(r.index, 0, '(4 + 1) % 5 = 0');
        assert.equal(r.rearIndex, 0);
        assert.equal(r.slots[0].value, 60);
        assert.deepEqual(vals(r), [30, 40, 50, 60]);
    });

    test('FRONT / REAR stay correct over many wrap-arounds (independent model)', async () => {
        const cap = 4;
        await dsa.queueCreate('tc', cap);
        let front = 0, rear = -1, size = 0, next = 1;
        const model = [];
        let seed = 7;
        const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        for (let k = 0; k < 120; k++) {
            if (rand() < 0.55) {
                const r = await dsa.queueEnqueue('tc', String(next), next);
                if (size === cap) assert.equal(r.condition, 'OVERFLOW');
                else { rear = (rear + 1) % cap; size++; model.push(next); assert.equal(r.index, rear); }
                next++;
            } else {
                const r = await dsa.queueDequeue('tc');
                if (size === 0) assert.equal(r.condition, 'UNDERFLOW');
                else { assert.equal(r.dequeued.value, model.shift()); assert.equal(r.index, front); front = (front + 1) % cap; size--; }
            }
            const s = await dsa.queueList('tc');
            assert.deepEqual([s.frontIndex, s.rearIndex, s.size, s.empty, s.full], [front, rear, size, size === 0, size === cap]);
            assert.deepEqual(vals(s), model);
        }
        assert.ok(next > 2 * cap, 'the run wrapped several times');
    });
});

test('HTTP: overflow is a 409 that still carries the structure', async () => {
    const app = createApp();
    const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
    const base = `http://localhost:${server.address().port}/api/dsa`;
    const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(async r => ({ status: r.status, body: await r.json() }));
    try {
        await post('/stack/create', { stack: 'h', capacity: 1 });
        await post('/stack/push', { stack: 'h', value: '1', numericValue: 1 });
        const over = await post('/stack/push', { stack: 'h', value: '2', numericValue: 2 });
        assert.equal(over.status, 409);
        assert.equal(over.body.condition, 'OVERFLOW');
        assert.equal(over.body.items.length, 1);
        await post('/lqueue/create', { queue: 'h', capacity: 2 });
        assert.equal((await post('/lqueue/enqueue', { queue: 'h', value: 'a' })).body.index, 0);
        assert.equal((await post('/queue/peek', { queue: 'nothing-here' })).body.condition, 'UNDERFLOW');
    } finally {
        app.locals.shutdown();
        server.close();
    }
});
