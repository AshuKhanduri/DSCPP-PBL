// Garden of Balance lessons through LiveWalkthrough against the real C engine.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { LiveWalkthrough } from '../src/systems/LiveWalkthrough.js';
import { CASES, makeAvlDescriber, makeAvlSource, STAGES, summarizeAvl } from '../src/challenges/lessons/avlLessons.js';
import { QUESTS } from '../src/data/quests.js';

let engines, api;
before(() => {
    engines = createEngines();
    const dsa = new DsaService(engines.dsa);
    const methods = Object.getOwnPropertyNames(DsaService.prototype).filter(k => k !== 'constructor');
    api = { dsa: Object.fromEntries(methods.map(k => [k, dsa[k].bind(dsa)])) };
});
after(() => { engines.dsa.stop(); engines.oop.stop(); });

async function play(stage, { skip = false } = {}) {
    const src = makeAvlSource(api, { avl: 'lt_avl', bst: 'lt_bst' }, stage.script);
    const lw = new LiveWalkthrough(src, { makeDescribe: () => makeAvlDescriber(stage), summarize: summarizeAvl, canFold: () => Boolean(src.next?.fold) });
    await lw.restart();
    let questions = 0;
    const answerAll = () => {
        const q = lw.step.question;
        assert.equal(q.choices.filter(c => c.correct).length, 1, q.prompt);
        const wrong = q.choices.find(c => !c.correct);
        assert.ok(lw.answer(q.choices.indexOf(wrong)).why.length > 15, 'wrong answers are explained');
        assert.ok(lw.needsAnswer, 'and can be retried');
        lw.answer(q.choices.findIndex(c => c.correct));
        questions++;
    };
    for (let guard = 0; guard < 300 && !lw.atEnd; guard++) {
        if (lw.needsAnswer) { answerAll(); continue; }
        if (skip && lw.canSkip()) await lw.skip(); else await lw.next();
    }
    if (lw.needsAnswer) answerAll();   // a question on the final step
    return { lw, questions };
}

describe('Garden of Balance stages follow the C engine', () => {
    for (const stage of STAGES) {
        test(stage.title, async () => {
            const { lw, questions } = await play(stage);
            assert.ok(questions >= 1);
            for (const s of lw.steps) assert.ok(s.title && s.text != null, 'every step is explained');
        });
    }

    test('stage 1 really builds a crooked BST in C: 5 levels, 5 comparisons', async () => {
        const { lw } = await play(STAGES[0], { skip: true });
        const search = lw.raws.find(r => r.kind === 'search');
        assert.equal(search.res.comparisons, 5);
        assert.equal(search.res.tree.height, 5);
    });

    test('stage 3 shows each case with C\'s rotations in order', async () => {
        const { lw } = await play(STAGES[2]);
        const rotations = lw.raws.filter(r => r.kind === 'avl' && r.event.event === 'ROTATE');
        assert.deepEqual(rotations.map(r => `${r.event.dir}@${r.event.pivot}`),
            ['RIGHT@30', 'LEFT@10', 'LEFT@10', 'RIGHT@30', 'RIGHT@30', 'LEFT@10']);
        const cases = lw.raws.filter(r => r.kind === 'avl' && r.event.event === 'UNBALANCED').map(r => r.event.case);
        assert.deepEqual(cases, CASES.map(c => c.name));
        for (const r of lw.raws.filter(x => x.kind === 'settled')) assert.equal(r.res.valid, true);
    });

    test('the final restoration covers all four cases and ends with a valid AVL tree', async () => {
        const { lw, questions } = await play(STAGES[4]);
        const cases = new Set(lw.raws.filter(r => r.kind === 'avl' && r.event.event === 'UNBALANCED').map(r => r.event.case));
        assert.deepEqual([...cases].sort(), ['LL', 'LR', 'RL', 'RR']);
        const last = lw.raws.filter(r => r.res).at(-1).res;
        assert.equal(last.valid, true);
        assert.ok(questions >= 15);
        for (const s of lw.steps) if (s.question) assert.equal(s.question.graded, true);
    });
});

test('quest data: the Garden quest replaces the Library quest in the same chain slot', () => {
    const ids = QUESTS.map(q => q.id);
    assert.ok(!ids.includes('forgotten_archive'));
    assert.equal(ids.indexOf('unbalanced_garden'), 3);
    const q = QUESTS.find(x => x.id === 'unbalanced_garden');
    assert.deepEqual([q.giver, q.challenge, q.entry, q.objectiveTarget], ['keeper', 'garden', 'garden_gate', STAGES.length]);
});
