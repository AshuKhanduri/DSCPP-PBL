// One game per player: every session gets its own C + C++ engine pair.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SessionManager } from '../server/sessions.js';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store/MemoryStore.js';
import { QUESTS } from '../src/data/quests.js';

function fakeManager(opts = {}) {
    let clock = 0;
    const stopped = [];
    const m = new SessionManager({
        createSession: id => ({ engines: { dsa: { stop: () => stopped.push(`${id}:dsa`) }, oop: { stop: () => stopped.push(`${id}:oop`) } } }),
        now: () => clock, log: () => {}, ...opts,
    });
    return { m, stopped, advance: ms => { clock += ms; } };
}

describe('SessionManager', () => {
    test('a session starts only from the title screen routes; unknown ids are expired', () => {
        const { m } = fakeManager();
        assert.throws(() => m.get('abcdefgh1', { canCreate: false }), { code: 'SESSION_EXPIRED' });
        const s = m.get('abcdefgh1', { canCreate: true });
        assert.equal(m.get('abcdefgh1', { canCreate: false }), s, 'the same session afterwards');
        assert.equal(m.get('default', { canCreate: false }).id, 'default', 'no header: never "expired"');
        assert.throws(() => m.get('bad id!', { canCreate: true }), { code: 'VALIDATION_ERROR' });
        assert.throws(() => m.get('short', { canCreate: true }), { code: 'VALIDATION_ERROR' });
    });

    test('idle sessions are stopped together with both engine processes', () => {
        const { m, stopped, advance } = fakeManager({ idleMs: 1000 });
        m.get('player-aaa', { canCreate: true });
        advance(600);
        m.get('player-bbb', { canCreate: true });
        advance(500);
        m.sweep();
        assert.deepEqual(stopped, ['player-aaa:dsa', 'player-aaa:oop']);
        assert.equal(m.size, 1);
        assert.throws(() => m.get('player-aaa', { canCreate: false }), { code: 'SESSION_EXPIRED' });
    });

    test('when full: the longest-idle session makes room, or the newcomer is told the server is full', () => {
        const { m, stopped, advance } = fakeManager({ maxSessions: 2, evictAfterMs: 1000, idleMs: 99999 });
        m.get('player-aaa', { canCreate: true });
        m.get('player-bbb', { canCreate: true });
        assert.throws(() => m.get('player-ccc', { canCreate: true }), { code: 'SERVER_FULL' });
        advance(1500);
        m.get('player-bbb', { canCreate: false });          // bbb is active again; aaa idles
        m.get('player-ccc', { canCreate: true });
        assert.deepEqual(stopped, ['player-aaa:dsa', 'player-aaa:oop']);
        m.stopAll();
        assert.equal(m.size, 0);
    });
});

describe('HTTP: two players, two games', () => {
    let server, base, app;
    before(async () => {
        app = createApp({ store: new MemoryStore() });
        await new Promise(res => { server = app.listen(0, res); });
        base = `http://localhost:${server.address().port}/api`;
    });
    after(() => { app.locals.shutdown(); server.close(); });

    const call = async (session, method, path, body) => {
        const r = await fetch(base + path, {
            method,
            headers: { 'X-QuestForge-Session': session, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, body: await r.json() };
    };
    const status = async (session, id) => (await call(session, 'GET', '/dsa/quest/state')).body.chain.find(n => n.id === id).status;

    test('each session has its own engines and quest chain', async () => {
        const [A, B] = ['player-alice-1', 'player-bob-22'];
        assert.equal((await call(A, 'POST', '/game/reset', { questIds: QUESTS.map(q => q.id) })).status, 200);
        assert.equal((await call(B, 'POST', '/game/reset', { questIds: QUESTS.map(q => q.id) })).status, 200);
        assert.equal(app.locals.sessions.size, 2);

        assert.equal((await call(A, 'POST', '/dsa/quest/start', { questId: 'lost_path' })).status, 200);
        assert.equal(await status(A, 'lost_path'), 'ACTIVE');
        assert.equal(await status(B, 'lost_path'), 'AVAILABLE', "Alice's progress is not in Bob's game");

        const pidA = app.locals.sessions.sessions.get(A).engines.dsa.child.pid;
        const pidB = app.locals.sessions.sessions.get(B).engines.dsa.child.pid;
        assert.notEqual(pidA, pidB, 'separate C engine processes');

        // a new game for Bob does not touch Alice
        await call(B, 'POST', '/game/reset', { questIds: QUESTS.map(q => q.id) });
        assert.equal(await status(A, 'lost_path'), 'ACTIVE');
    });

    test('an unknown session is told it expired; health starts one', async () => {
        const r = await call('never-seen-123', 'GET', '/dsa/quest/state');
        assert.equal(r.status, 410);
        assert.equal(r.body.error, 'SESSION_EXPIRED');
        assert.equal((await call('never-seen-123', 'GET', '/health')).status, 200);
        assert.equal((await call('bad', 'GET', '/health')).status, 400);
    });

    test('leaderboard routes are shared and need no session', async () => {
        assert.equal((await fetch(`${base}/online/status`)).status, 200);
    });

    test('a stopped session ends its engine processes', async () => {
        const s = app.locals.sessions.sessions.get('player-alice-1');
        const child = s.engines.dsa.child;
        app.locals.sessions.stop('player-alice-1', 'test');
        await new Promise(r => (child.exitCode !== null ? r() : child.once('exit', r)));
        assert.notEqual(child.exitCode ?? child.signalCode, null);
        assert.equal((await call('player-alice-1', 'GET', '/dsa/quest/state')).status, 410);
    });
});
