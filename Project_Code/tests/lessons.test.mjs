// Lesson steps are built only from what the C engine reports. These tests run
// the real engine and check that every step agrees with it, and that the
// Walkthrough never hides an operation when steps are skipped.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { toApiGraph } from '../src/data/graphs.js';
import { QUESTS } from '../src/data/quests.js';
import { MAX_SKIP, Walkthrough } from '../src/systems/Walkthrough.js';
import { buildBfsSteps, buildDfsSteps, summarizeBfs, summarizeDfs } from '../src/challenges/lessons/graphLessons.js';
import { buildInsertSteps, buildSearchSteps, summarizeBst } from '../src/challenges/lessons/bstLessons.js';
import { whisperingWoods as woods } from './mapGraphs.mjs';

let engines, dsa;
before(() => { engines = createEngines(); dsa = new DsaService(engines.dsa); });
after(() => { engines.dsa.stop(); engines.oop.stop(); });

const letters = new Map(woods.nodes.map((n, i) => [n.id, String.fromCharCode(65 + i)]));
const ctx = { L: id => letters.get(id), N: id => id, start: woods.start, goal: woods.goal, shrine: woods.goal };

// Walk a lesson like a player: answer every question, skip whenever offered.
function play(steps, summarize) {
    const wt = new Walkthrough(steps, { summarize });
    const folded = [];
    for (let guard = 0; guard < 500 && !wt.atEnd; guard++) {
        if (wt.needsAnswer) {
            assert.equal(wt.next(), false, 'next() must wait for the answer');
            assert.ok(wt.answer(wt.step.question.choices.findIndex(c => c.correct)).correct);
        } else if (wt.canSkip()) {
            const run = wt.upcomingRun();
            assert.ok(run.length <= MAX_SKIP && run.every(s => s.skippable));
            folded.push(...run);
            wt.skip();
            for (const s of run.filter(r => r.brief)) assert.ok(wt.view.text.includes(s.brief), `summary hides "${s.brief}"`);
        } else wt.next();
    }
    return { wt, folded };
}

describe('Lost Path lessons follow the C trace', () => {
    test('BFS: one dequeue step per C dequeue, queue = C snapshot, route = C path', async () => {
        const res = await dsa.trace({ algorithm: 'BFS', graph: toApiGraph(woods), start: woods.start, goal: woods.goal });
        const steps = buildBfsSteps(res.trace, res, ctx);
        const deq = res.trace.filter(e => e.op === 'DEQUEUE');
        const deqSteps = steps.filter(s => s.kind === 'dequeue');
        assert.deepEqual(deqSteps.map(s => s.state.current), deq.map(e => e.node));
        deqSteps.forEach((s, i) => assert.deepEqual(s.state.queue, deq[i].queue));
        assert.deepEqual(steps.at(-1).state.path, res.path);
        assert.equal(steps[0].kind, 'init');
        assert.equal(steps.at(-1).skippable, false);
        const { wt, folded } = play(steps, run => summarizeBfs(run, ctx));
        assert.ok(folded.length > 0, 'skip should be offered on this graph');
        assert.ok(!folded.some(s => ['init', 'goal'].includes(s.kind)));
        assert.deepEqual(wt.state.order, res.visitOrder);
    });

    test('DFS: visits, dead ends and stale pops match the C trace', async () => {
        const res = await dsa.trace({ algorithm: 'DFS', graph: toApiGraph(woods), start: woods.start, goal: null });
        assert.equal(res.found, false);
        assert.equal(res.visitOrder.length, woods.nodes.length, 'full traversal visits every clearing');
        const steps = buildDfsSteps(res.trace, ctx);
        const visits = steps.filter(s => ['visit', 'backtrack', 'shrine'].includes(s.kind)).map(s => s.state.current);
        assert.deepEqual(visits, res.trace.filter(e => e.op === 'VISIT').map(e => e.node));
        assert.equal(steps.filter(s => s.kind === 'stale').length, res.trace.filter(e => e.op === 'SKIP').length);
        assert.equal(steps.filter(s => s.kind === 'deadend').length, res.trace.filter(e => e.op === 'DONE' && e.flag === 0).length);
        assert.ok(steps.some(s => s.kind === 'backtrack'), 'this forest must show a backtrack');
        assert.ok(steps.find(s => s.kind === 'deadend').question, 'first dead end asks a prediction');
        for (const s of steps) if (s.kind === 'stale' || s.kind === 'deadend' || s.kind === 'backtrack') assert.ok(s.text.length > 0);
        const { folded } = play(steps, run => summarizeDfs(run, ctx));
        assert.ok(!folded.some(s => s.kind === 'shrine' || s.kind === 'done'));
    });
});

describe('Royal Registry lessons follow the C tree', () => {
    test('insert and search steps replay C comparisons and trees', async () => {
        const { records } = QUESTS.find(q => q.id === 'royal_registry').config;
        await dsa.bstClear('lessontest');
        const inserts = [];
        for (const key of records) inserts.push({ key, res: await dsa.bstInsert('lessontest', key) });
        const steps = buildInsertSteps(inserts);
        assert.equal(steps.filter(s => s.kind === 'compare').length, inserts.reduce((n, i) => n + i.res.path.length, 0));
        const placed = steps.filter(s => s.kind === 'place' || s.kind === 'root');
        assert.deepEqual(placed.map(s => s.state.tree), inserts.map(i => i.res.tree));
        const searches = [];
        for (const key of [60, 65]) searches.push({ key, res: await dsa.bstSearch('lessontest', key) });
        const sSteps = buildSearchSteps(searches);
        assert.equal(sSteps.filter(s => s.kind === 'found').length, 1);
        assert.equal(sSteps.filter(s => s.kind === 'missing').length, 1);
        play(steps, summarizeBst);
        await dsa.bstClear('lessontest');
    });
});
