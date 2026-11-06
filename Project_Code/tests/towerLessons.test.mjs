// Tower of Trials lessons and trial, driven through LiveWalkthrough against
// the real C engine exactly as the game does.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { LiveWalkthrough } from '../src/systems/LiveWalkthrough.js';
import { makeTowerDescriber, makeTowerSource, SCRIPTS, summarizeTower, TRIALS } from '../src/challenges/lessons/towerLessons.js';

let engines, dsa, api;
before(() => {
    engines = createEngines();
    dsa = new DsaService(engines.dsa);
    // the browser's NativeApi.dsa shape, backed directly by the service
    const methods = Object.getOwnPropertyNames(DsaService.prototype).filter(k => k !== 'constructor');
    api = { dsa: { ...Object.fromEntries(methods.map(k => [k, dsa[k].bind(dsa)])), enqueue: dsa.queueEnqueue.bind(dsa), dequeue: dsa.queueDequeue.bind(dsa) } };
});
after(() => { engines.dsa.stop(); engines.oop.stop(); });

const names = { stack: 'lt_stack', queue: 'lt_queue' };

async function play(structure, script, capacity, { skip, trial = false }) {
    const src = makeTowerSource(api, structure, names, capacity, script);
    const lw = new LiveWalkthrough(src, { makeDescribe: () => makeTowerDescriber(structure, { trial }), summarize: summarizeTower, canFold: () => Boolean(src.next?.fold) });
    await lw.restart();
    let questions = 0;
    for (let guard = 0; guard < 200 && !lw.atEnd; guard++) {
        if (lw.needsAnswer) {
            const q = lw.step.question;
            const right = q.choices.findIndex(c => c.correct);
            assert.equal(q.choices.filter(c => c.correct).length, 1, q.prompt);
            assert.equal(await lw.next(), false, 'next() waits for the answer');
            const wrong = q.choices.findIndex(c => !c.correct);
            assert.ok(lw.answer(wrong).why.length > 15, 'wrong answers are explained');
            assert.ok(lw.needsAnswer, 'and can be retried');
            lw.answer(right);
            questions++;
        } else if (skip && lw.canSkip()) {
            const before = lw.steps.length;
            await lw.skip();
            for (const s of lw.steps.slice(before).filter(s => s.brief)) if (lw.view.kind === 'summary') assert.ok(lw.view.text.includes(s.brief));
        } else await lw.next();
    }
    assert.ok(lw.atEnd, `${structure} reached its end`);
    return { lw, questions, steps: lw.steps };
}

describe('tower lessons follow the C engine', () => {
    for (const structure of ['stack', 'linear', 'circular', 'compare']) {
        for (const skip of [false, true]) {
            test(`${structure}${skip ? ' (skipping repeats)' : ''}`, async () => {
                const { questions, steps } = await play(structure, SCRIPTS[structure], 5, { skip });
                assert.ok(questions >= 2);
                for (const s of steps) assert.ok(s.title && s.text, 'every step is explained');
            });
        }
    }

    test('overflow and underflow steps come from C refusing the operation', async () => {
        const { steps } = await play('stack', SCRIPTS.stack, 5, { skip: false });
        const over = steps.find(s => s.title.includes('OVERFLOW'));
        const under = steps.find(s => s.title.includes('UNDERFLOW'));
        assert.equal(over.state.bodies.stack.condition, 'OVERFLOW');
        assert.equal(over.state.bodies.stack.size, 5, 'nothing changed');
        assert.equal(under.state.bodies.stack.condition, 'UNDERFLOW');
    });

    test('linear queue overflows with free slots; circular queue reuses them', async () => {
        const linear = (await play('linear', SCRIPTS.linear, 5, { skip: false })).steps;
        const lo = linear.find(s => s.title.includes('OVERFLOW')).state.bodies.linear;
        assert.equal(lo.size, 3);
        assert.deepEqual(lo.slots.slice(0, 2), ['spent', 'spent']);
        const circ = (await play('circular', SCRIPTS.circular, 5, { skip: false })).steps;
        const wrap = circ.find(s => s.state.item?.op === 'ENQ' && s.state.item.value === 60).state.bodies.circular;
        assert.equal(wrap.index, 0, '(4 + 1) % 5 = 0');
        assert.ok(circ.some(s => s.text.includes('remainder')), 'modulo explained in words');
    });

    test('comparison: same input, stack returns 40 then 30, queue 10 then 20', async () => {
        const { steps } = await play('compare', SCRIPTS.compare, 5, { skip: false });
        const removes = steps.filter(s => s.state.item?.op === 'REMOVE');
        assert.deepEqual(removes.map(s => s.state.bodies.stack.popped.value), [40, 30]);
        assert.deepEqual(removes.map(s => s.state.bodies.linear.dequeued.value), [10, 20]);
    });
});

describe("the Guardian's trial", () => {
    for (const seal of TRIALS) {
        test(seal.title, async () => {
            const { questions, steps } = await play(seal.structure, seal.script, seal.capacity, { skip: false, trial: true });
            assert.equal(questions, seal.script.filter(i => i.ask).length);
            for (const s of steps) if (s.question) assert.equal(s.question.graded, true);
        });
    }
});
