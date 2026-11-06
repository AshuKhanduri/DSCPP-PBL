// The C sorting engine (native/c/sort.c), one operation per SORT_STEP.
// Every step is checked against what that operation must do to the array,
// computed independently here, for the inputs the quest uses and edge cases.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';

let engines, dsa;
before(() => { engines = createEngines(); dsa = new DsaService(engines.dsa); });
after(() => { engines.dsa.stop(); engines.oop.stop(); });

async function run(algorithm, input) {
    const steps = [await dsa.sortStart('t', algorithm, input)];
    for (let guard = 0; guard < 10000 && !steps.at(-1).done; guard++) steps.push(await dsa.sortStep('t'));
    assert.ok(steps.at(-1).done, 'sort must finish');
    return steps;
}

const sortedCopy = xs => [...xs].sort((p, q) => p - q);
const swapped = (xs, i, j) => { const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c; };

// Values and ids always travel together (except the insertion gap).
function checkIds(input, s) {
    s.values.forEach((v, k) => { if (k !== s.gap) assert.equal(input[s.ids[k]], v, `id/value mismatch at ${k}`); });
}

function checkFinal(input, steps, { stable }) {
    const last = steps.at(-1);
    assert.deepEqual(last.values, sortedCopy(input));
    assert.equal(last.sortedLo, 0);
    assert.equal(last.sortedHi, input.length);
    if (stable) for (let k = 1; k < input.length; k++) {
        if (last.values[k] === last.values[k - 1]) assert.ok(last.ids[k] > last.ids[k - 1], 'equal weights must keep their order');
    }
}

const INPUTS = {
    example: [7, 3, 5, 2, 8],
    duplicates: [4, 2, 4, 1, 2],
    sorted: [1, 2, 3, 4, 5],
    reverse: [5, 4, 3, 2, 1],
    single: [9],
    empty: [],
    allEqual: [3, 3, 3],
    random: Array.from({ length: 12 }, (_, i) => (i * 37 + 11) % 17),
};

describe('C bubble sort, step by step', () => {
    for (const [name, input] of Object.entries(INPUTS)) {
        test(name, async () => {
            const steps = await run('BUBBLE', input);
            for (let k = 1; k < steps.length; k++) {
                const s = steps[k], prev = steps[k - 1];
                checkIds(input, s);
                if (s.op === 'COMPARE') {
                    assert.equal(s.b, s.a + 1, 'bubble compares neighbours');
                    assert.deepEqual(s.values, prev.values);
                    assert.equal(s.result, s.values[s.a] > s.values[s.b] ? 1 : 0);
                } else if (s.op === 'SWAP') {
                    assert.equal(prev.op, 'COMPARE');
                    assert.equal(prev.result, 1);
                    assert.deepEqual(s.values, swapped(prev.values, s.a, s.b));
                } else if (s.op === 'PASS_END') {
                    assert.equal(s.values[s.a], Math.max(...s.values.slice(0, s.a + 1)), 'largest unsorted value reached the end');
                    assert.equal(s.sortedLo, s.a);
                }
            }
            checkFinal(input, steps, { stable: true });
            const last = steps.at(-1);
            const n = input.length;
            if (name === 'sorted' || name === 'allEqual') { assert.equal(last.swaps, 0); assert.equal(last.pass, 1); assert.equal(last.comparisons, n - 1); }
            if (name === 'reverse') assert.equal(last.swaps, n * (n - 1) / 2);
            if (n < 2) assert.equal(steps[1].op, 'DONE');
        });
    }
});

describe('C selection sort, step by step', () => {
    for (const [name, input] of Object.entries(INPUTS)) {
        test(name, async () => {
            const steps = await run('SELECTION', input);
            let start = -1;
            for (let k = 1; k < steps.length; k++) {
                const s = steps[k], prev = steps[k - 1];
                checkIds(input, s);
                if (s.op === 'PASS_START') { start = s.a; assert.equal(s.min, start); assert.equal(s.sortedHi, start); }
                if (s.op === 'COMPARE') {
                    assert.deepEqual(s.values, prev.values);
                    const window = s.values.slice(start, s.a + 1);
                    assert.equal(s.values[s.min], Math.min(...window), 'min tracks the smallest value seen');
                    assert.equal(s.result, s.min === s.a ? 1 : 0);
                }
                if (s.op === 'SWAP' || s.op === 'PLACE') {
                    assert.equal(s.a, start);
                    assert.equal(prev.values[s.b], Math.min(...prev.values.slice(start)));
                    assert.deepEqual(s.values, s.op === 'SWAP' ? swapped(prev.values, s.a, s.b) : prev.values);
                    assert.equal(s.sortedHi, start + 1);
                }
            }
            checkFinal(input, steps, { stable: false });
            const n = input.length;
            assert.equal(steps.at(-1).comparisons, n > 1 ? n * (n - 1) / 2 : 0);
            if (name === 'sorted') assert.equal(steps.at(-1).swaps, 0);
        });
    }
});

describe('C insertion sort, step by step', () => {
    for (const [name, input] of Object.entries(INPUTS)) {
        test(name, async () => {
            const steps = await run('INSERTION', input);
            let key = null;
            for (let k = 1; k < steps.length; k++) {
                const s = steps[k], prev = steps[k - 1];
                checkIds(input, s);
                if (s.op === 'TAKE_KEY') { key = s.key; assert.equal(s.gap, s.a); assert.equal(prev.values[s.a], key); }
                if (s.op === 'COMPARE') {
                    assert.equal(s.b, prev.gap);
                    assert.equal(s.result, s.values[s.a] > key ? 1 : 0);
                }
                if (s.op === 'SHIFT') {
                    assert.equal(prev.result, 1);
                    assert.equal(s.values[s.b], prev.values[s.a], 'the larger element moved one place right');
                    assert.equal(s.gap, s.a, 'the gap moved left');
                }
                if (s.op === 'INSERT') {
                    assert.equal(s.values[s.a], key);
                    assert.deepEqual(s.values.slice(0, s.sortedHi), sortedCopy(s.values.slice(0, s.sortedHi)));
                }
            }
            checkFinal(input, steps, { stable: true });
            const n = input.length, last = steps.at(-1);
            if (name === 'sorted') { assert.equal(last.shifts, 0); assert.equal(last.comparisons, n - 1); }
            if (name === 'reverse') assert.equal(last.shifts, n * (n - 1) / 2);
        });
    }
});

test('sort commands validate input and free runs', async () => {
    assert.throws(() => dsa.sortStart('t', 'QUICK', [1, 2]), /algorithm must be one of/);
    assert.throws(() => dsa.sortStart('t', 'BUBBLE', Array(65).fill(1)), /at most 64/);
    assert.throws(() => dsa.sortStart('t', 'BUBBLE', [1, 'x']), /values\[1\]/);
    assert.equal((await dsa.sortClear('t')).ok, true);
    assert.equal((await dsa.sortStep('t')).error, 'NOT_FOUND');
});
