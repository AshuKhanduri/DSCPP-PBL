// Leaderboard + feedback: scoring rules, first-try counting, validation, the
// HTTP API, and the store contract.
//
// The store contract runs against the in-memory store always, and against a
// real MongoDB too when MONGODB_TEST_URI is set (it uses a throw-away database
// "questforge_test_<random>" and drops only that database afterwards).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, SCORING, accuracyPoints, cleanPlayerName, compareRuns, computeScore, formatDuration, nameKey, playerNameProblem } from '../src/data/scoring.js';
import { ScoreKeeper, scoreKeeper } from '../src/systems/ScoreKeeper.js';
import { Walkthrough } from '../src/systems/Walkthrough.js';
import { OnlineService } from '../server/services/OnlineService.js';
import { MemoryStore } from '../server/store/MemoryStore.js';
import { MongoStore } from '../server/store/MongoStore.js';
import { createStore } from '../server/store/createStore.js';
import { createApp } from '../server/app.js';
import { QUESTS } from '../src/data/quests.js';

const Q = QUESTS.length;
const run = (over = {}) => ({
    name: 'Asha', questsCompleted: Q, questsTotal: Q, firstTryCorrect: 30, questionsAsked: 40,
    bonusCoins: 30, timeMs: 40 * 60 * 1000, look: 'female', ...over,
});

describe('scoring rules', () => {
    test('score = quests + first-try accuracy + bonus coins', () => {
        assert.deepEqual(computeScore({ questsCompleted: 6, firstTryCorrect: 30, questionsAsked: 40, bonusCoins: 30 }),
            { total: 600 + 300 + 60, quests: 600, accuracy: 300, bonus: 60 });
        assert.equal(accuracyPoints(0, 0), 0, 'no questions asked: no accuracy points (not NaN)');
        assert.equal(accuracyPoints(40, 40), SCORING.accuracyMax);
        assert.equal(accuracyPoints(1, 3), 133, 'rounded');
    });

    test('ranking: higher score, then faster, then earlier', () => {
        const a = { score: 900, timeMs: 5000, createdAt: new Date(2) };
        const rows = [{ score: 800, timeMs: 1, createdAt: new Date(1) }, { ...a, timeMs: 9000 }, a, { ...a, createdAt: new Date(3) }];
        assert.deepEqual(rows.sort(compareRuns).map(r => [r.score, r.timeMs, +r.createdAt]),
            [[900, 5000, 2], [900, 5000, 3], [900, 9000, 2], [800, 1, 1]]);
    });

    test('player names: one rule for the title screen and the server', () => {
        assert.equal(playerNameProblem('FerrariDuck'), null);
        assert.equal(playerNameProblem("  Zoë   O'Neil-2 "), null);
        assert.equal(cleanPlayerName("  Zoë   O'Neil-2 "), "Zoë O'Neil-2");
        assert.match(playerNameProblem('   '), /enter a name/);
        assert.match(playerNameProblem('x'.repeat(LIMITS.nameMax + 1)), /at most/);
        assert.match(playerNameProblem('<b>hi</b>'), /letters, digits/);
    });

    test('helpers', () => {
        assert.equal(nameKey('  Asha   Rao '), 'asha rao');
        assert.equal(formatDuration(65_000), '1:05');
        assert.equal(formatDuration(3_725_000), '1:02:05');
    });
});

describe('first-try answers', () => {
    test('a question counts once, on its first attempt', () => {
        const k = new ScoreKeeper();
        assert.equal(k.record('q1', false), true);
        assert.equal(k.record('q1', true), false, 'the retry after a wrong pick is not counted');
        k.record('q2', true);
        assert.deepEqual(k.stats, { questionsAsked: 2, firstTryCorrect: 1 });
    });

    test('Walkthrough answers are reported, and Restart cannot farm accuracy', () => {
        const question = { prompt: 'Which node is visited next?', choices: [{ label: 'A', correct: false, why: '' }, { label: 'B', correct: true, why: '' }] };
        const steps = [{ title: 's0', text: '' }, { title: 's1', text: '', question }, { title: 's2', text: '' }];
        scoreKeeper.reset();
        const wt = new Walkthrough(steps, { summarize: () => ({}) });
        wt.next();
        wt.answer(0);            // wrong
        wt.answer(1);            // right, but not first try
        assert.deepEqual(scoreKeeper.stats, { questionsAsked: 1, firstTryCorrect: 0 });
        wt.restart();
        wt.next();
        wt.answer(1);            // same question again after Restart
        assert.deepEqual(scoreKeeper.stats, { questionsAsked: 1, firstTryCorrect: 0 });
        scoreKeeper.reset();
    });
});

describe('validation (OnlineService)', () => {
    const online = new OnlineService(new MemoryStore());

    test('the server recomputes the score and ignores a sent total', () => {
        const r = online.validateRun({ ...run(), score: 999999 });
        assert.equal(r.score, computeScore(run()).total);
        assert.equal(r.nameKey, 'asha');
    });

    test('impossible or unfinished journeys are rejected', () => {
        const bad = [
            run({ firstTryCorrect: 41 }),                       // more first-try than asked
            run({ questsCompleted: Q - 1 }),                    // not finished
            run({ questsCompleted: Q + 1 }),
            run({ bonusCoins: -5 }),
            run({ timeMs: 10 }),
            run({ questionsAsked: 1.5 }),
            run({ name: '' }), run({ name: 'x'.repeat(LIMITS.nameMax + 1) }), run({ name: '<script>' }),
        ];
        for (const b of bad) assert.throws(() => online.validateRun(b), { code: 'VALIDATION_ERROR' }, JSON.stringify(b));
        assert.equal(online.validateRun(run({ name: 'Zoë  O\'Neil' })).name, 'Zoë O\'Neil', 'unicode letters allowed, spaces collapsed');
    });

    test('feedback: rating 1-5 and a 3-500 character message; name optional', async () => {
        await assert.rejects(online.submitFeedback({ rating: 0, message: 'hello' }), { code: 'VALIDATION_ERROR' });
        await assert.rejects(online.submitFeedback({ rating: 6, message: 'hello' }), { code: 'VALIDATION_ERROR' });
        await assert.rejects(online.submitFeedback({ rating: 4, message: '  a ' }), { code: 'VALIDATION_ERROR' });
        await assert.rejects(online.submitFeedback({ rating: 4, message: 'x'.repeat(501) }), { code: 'VALIDATION_ERROR' });
        assert.equal((await online.submitFeedback({ rating: 4, message: 'Loved the AVL garden\u0007!' })).ok, true);
        const [fb] = await online.recentFeedback(1);
        assert.equal(fb.message, 'Loved the AVL garden!', 'control characters removed');
        assert.equal(fb.name, null);
        assert.equal(fb.context, 'title');
    });

    test('a failing database becomes STORE_UNAVAILABLE, not a crash', async () => {
        const broken = new OnlineService({ kind: 'mongodb', persistent: true, top: async () => { throw new Error('ECONNREFUSED'); } });
        const origError = console.error;
        console.error = () => {};
        try { await assert.rejects(broken.leaderboard(), { code: 'STORE_UNAVAILABLE' }); }
        finally { console.error = origError; }
    });

    test('the store is chosen from MONGODB_URI', () => {
        assert.equal(createStore({}).kind, 'memory');
        assert.equal(createStore({ MONGODB_URI: '  ' }).kind, 'memory');
        const m = createStore({ MONGODB_URI: 'mongodb://127.0.0.1:1/x' });
        assert.equal(m.kind, 'mongodb');
        assert.equal(m.persistent, true);
    });
});

// ---- the store contract: MemoryStore always, MongoStore when MONGODB_TEST_URI is set ----

function storeContract(label, makeStore, cleanup = async () => {}) {
    describe(`store contract: ${label}`, () => {
        let store, online, clock;
        before(async () => {
            store = await makeStore();
            clock = Date.UTC(2026, 0, 1);
            online = new OnlineService(store, { now: () => new Date(clock += 1000) });
        });
        after(async () => { await cleanup(store); await store.close(); });

        test('each player appears once, with their best run; ranks and personal bests', async () => {
            let r = await online.submitRun(run({ name: 'Asha', firstTryCorrect: 20 }));          // 600+200+60
            assert.deepEqual([r.rank, r.players, r.personalBest, r.previousBest], [1, 1, true, null]);
            r = await online.submitRun(run({ name: 'Ben', firstTryCorrect: 40 }));               // 600+400+60
            assert.deepEqual([r.rank, r.players, r.personalBest], [1, 2, true]);
            r = await online.submitRun(run({ name: 'asha', firstTryCorrect: 10 }));              // worse: same player
            assert.deepEqual([r.rank, r.players, r.personalBest, r.previousBest.score], [2, 2, false, 860]);
            r = await online.submitRun(run({ name: 'ASHA', firstTryCorrect: 40, timeMs: 1000 * 60 * 30 })); // ties Ben, faster
            assert.deepEqual([r.rank, r.personalBest], [1, true]);

            const board = await online.leaderboard(10);
            assert.deepEqual(board.entries.map(e => [e.rank, e.name, e.score]), [[1, 'ASHA', 1060], [2, 'Ben', 1060]]);
            assert.equal(typeof board.entries[0].createdAt, 'string');
            assert.ok(!('nameKey' in board.entries[0]) && !('_id' in board.entries[0]), 'only public fields');
            assert.equal((await online.leaderboard(1)).entries.length, 1);
            await assert.rejects(online.leaderboard(0), { code: 'VALIDATION_ERROR' });
        });

        test('feedback is stored newest first', async () => {
            await online.submitFeedback({ rating: 5, message: 'first message', name: 'Asha', context: 'end' });
            await online.submitFeedback({ rating: 2, message: 'second message' });
            const rows = await online.recentFeedback(2);
            assert.deepEqual(rows.map(f => [f.rating, f.message, f.name, f.context]),
                [[2, 'second message', null, 'title'], [5, 'first message', 'Asha', 'end']]);
        });
    });
}

storeContract('memory', () => new MemoryStore());

if (process.env.MONGODB_TEST_URI) {
    const dbName = `questforge_test_${Math.random().toString(36).slice(2, 10)}`;
    storeContract(`mongodb (${dbName})`, async () => new MongoStore(process.env.MONGODB_TEST_URI, { dbName }).connect(),
        async store => { await store.client.db(dbName).dropDatabase(); });
} else {
    test('store contract: mongodb', { skip: 'set MONGODB_TEST_URI to run the contract against a real MongoDB' }, () => {});
}

// ---- HTTP ----

describe('HTTP /api/online', () => {
    let server, base, app;
    const engines = { dsa: { stop() {} }, oop: { stop() {} } };       // the online routes never touch the engines
    before(async () => {
        app = createApp({ engines, store: new MemoryStore(), onlineLimits: { feedback: { max: 2 } } });
        await new Promise(res => { server = app.listen(0, res); });
        base = `http://localhost:${server.address().port}/api/online`;
    });
    after(() => { app.locals.shutdown(); server.close(); });
    const post = async (path, body) => {
        const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    };
    const get = async path => { const r = await fetch(base + path); return { status: r.status, body: await r.json() }; };

    test('status says where scores go', async () => {
        assert.deepEqual((await get('/status')).body, { ok: true, store: 'memory', persistent: false });
    });

    test('submit, then read the leaderboard', async () => {
        const r = await post('/scores', run({ name: 'Cara' }));
        assert.equal(r.status, 200);
        assert.equal(r.body.entry.score, computeScore(run()).total);
        assert.equal(r.body.persistent, false);
        const board = await get('/leaderboard?limit=5');
        assert.deepEqual(board.body.entries.map(e => e.name), ['Cara']);
        assert.equal((await post('/scores', run({ firstTryCorrect: 99 }))).status, 400);
        assert.equal((await get('/leaderboard?limit=abc')).status, 400);
    });

    test('feedback is accepted, rate limited, and never listed publicly', async () => {
        assert.equal((await post('/feedback', { rating: 5, message: 'great game' })).status, 200);
        assert.equal((await post('/feedback', { rating: 0, message: 'great game' })).status, 400);
        const limited = await post('/feedback', { rating: 5, message: 'third try' });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.error, 'RATE_LIMITED');
        assert.equal((await get('/feedback')).status, 404);
    });
});
