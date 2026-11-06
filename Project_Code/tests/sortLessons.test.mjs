// Order of the Forge: the lesson steps and the trial decisions come from the
// C engine one operation at a time. These tests drive the real engine through
// LiveWalkthrough exactly as the game does.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createEngines } from '../server/native/engines.js';
import { DsaService } from '../server/services/DsaService.js';
import { QUESTS } from '../src/data/quests.js';
import { LIVE_MAX_SKIP, LiveWalkthrough } from '../src/systems/LiveWalkthrough.js';
import { DESCRIBERS, summarizeSort, trialQuestion } from '../src/challenges/lessons/sortLessons.js';

let engines, dsa;
before(() => { engines = createEngines(); dsa = new DsaService(engines.dsa); });
after(() => { engines.dsa.stop(); engines.oop.stop(); });

const forge = QUESTS.find(q => q.id === 'blacksmith_challenge');
const items = ['A', 'B', 'C', 'D', 'E', 'F'];

function lesson(algorithm, values) {
    return new LiveWalkthrough({ start: () => dsa.sortStart('lt', algorithm, values), step: () => dsa.sortStep('lt') },
        { makeDescribe: () => DESCRIBERS[algorithm](items), summarize: summarizeSort, canFold: steps => steps.some(s => s.endsGroup) });
}

async function play(lw, { skip }) {
    await lw.restart();
    let questions = 0, folds = 0;
    for (let guard = 0; guard < 500 && !lw.atEnd; guard++) {
        if (lw.needsAnswer) {
            const q = lw.step.question;
            assert.equal(q.choices.filter(c => c.correct).length, 1, `one right answer: ${q.prompt}`);
            assert.equal(await lw.next(), false, 'next() waits for the answer');
            const wrong = q.choices.findIndex(c => !c.correct);
            assert.equal(lw.answer(wrong).correct, false);
            assert.ok(lw.needsAnswer, 'a wrong answer allows another attempt');
            lw.answer(q.choices.findIndex(c => c.correct));
            questions++;
        } else if (skip && lw.canSkip()) {
            const before = lw.steps.length;
            await lw.skip();
            const folded = lw.steps.slice(before);
            assert.ok(folded.length <= LIVE_MAX_SKIP);
            if (lw.view.kind === 'summary') {
                folds++;
                for (const s of folded.filter(f => f.brief)) assert.ok(lw.view.text.includes(s.brief), 'summary lists every operation');
            }
        } else await lw.next();
    }
    assert.ok(lw.atEnd);
    return { questions, folds };
}

describe('sorting walkthroughs follow the C engine', () => {
    for (const st of forge.config.stages) {
        test(`${st.algorithm}: every step, with predictions`, async () => {
            const lw = lesson(st.algorithm, st.values);
            const { questions } = await play(lw, { skip: false });
            assert.ok(questions >= 3, 'the lesson asks predictions');
            assert.deepEqual(lw.state.values, [...st.values].sort((a, b) => a - b));
            // each displayed step is the C state after that operation, in order
            lw.raws.forEach((raw, k) => assert.equal(raw.step, k));
        });
        test(`${st.algorithm}: skipping folds passes, restart starts C again`, async () => {
            const lw = lesson(st.algorithm, st.values);
            const { folds } = await play(lw, { skip: true });
            assert.ok(folds >= 1);
            await lw.restart();
            assert.equal(lw.state.step, 0);
            assert.deepEqual(lw.state.values, st.values);
        });
    }

    test('edge inputs produce valid lessons', async () => {
        for (const algorithm of Object.keys(DESCRIBERS)) {
            for (const values of [[], [4], [1, 2, 3], [3, 2, 1], [2, 2, 1, 2]]) {
                const lw = lesson(algorithm, values);
                await play(lw, { skip: true });
                assert.deepEqual(lw.state.values, [...values].sort((a, b) => a - b), `${algorithm} ${values}`);
                for (const s of lw.steps) assert.ok(s.title && s.text, `${algorithm} ${values}: step without text`);
            }
        }
    });
});

describe('final trial decisions', () => {
    for (const algorithm of Object.keys(DESCRIBERS)) {
        test(`${algorithm}: every decision is checked against C`, async () => {
            const { values } = forge.config.trial;
            let current = await dsa.sortStart('lt', algorithm, values);
            let decisions = 0;
            while (!current.done) {
                const raw = await dsa.sortStep('lt');
                const q = trialQuestion(algorithm, raw, current, items);
                if (q) {
                    decisions++;
                    const right = q.choices.filter(c => c.correct);
                    assert.equal(right.length, 1);
                    if (raw.op === 'COMPARE') {
                        assert.equal(right[0].label, raw.result ? 'Yes' : 'No');
                        // a wrong Yes/No gets the explanation of the TRUE answer
                        for (const c of q.choices) assert.equal(c.why, right[0].why);
                    }
                    for (const c of q.choices.filter(x => !x.correct)) assert.ok(c.why.length > 20, 'wrong answers are explained');
                }
                current = raw;
            }
            assert.deepEqual(current.values, [...values].sort((a, b) => a - b));
            assert.ok(decisions >= values.length - 1);
        });
    }
});
