// The end of the adventure: when the farewell is due, and the statistics the
// end screen shows - checked against the real village map and C++ chests.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Adventure, allMainQuestsComplete, bonusLocationIds, DEFAULT_PLAYER_NAME, journeyStats, mainQuests, playerName } from '../src/systems/Adventure.js';
import { ENDING } from '../src/data/ending.js';
import { NPCS, OBJECTS } from '../src/data/npcs.js';
import { QUESTS } from '../src/data/quests.js';
import { parseTiledObjects } from '../src/systems/MapManager.js';
import { createEngines } from '../server/native/engines.js';
import { OopService } from '../server/services/OopService.js';
import { loadMap } from './mapGraphs.mjs';

const villageEntities = parseTiledObjects(loadMap('village.json')).entities;
const quests = status => QUESTS.map(q => ({ ...q, status: typeof status === 'function' ? status(q) : status }));

describe('ending logic', () => {
    test('player name: one fallback, replaced by a profile name when there is one', () => {
        assert.equal(playerName(undefined), DEFAULT_PLAYER_NAME);
        assert.equal(playerName({ name: null }), 'Explorer');
        assert.equal(playerName({ name: '   ' }), 'Explorer');
        assert.equal(playerName({ name: ' Asha ' }), 'Asha');
    });

    test('main quests are counted from the quest data, not a fixed number', () => {
        assert.equal(mainQuests(quests('LOCKED')).length, QUESTS.length);
        const withOptional = [...quests('COMPLETED'), { id: 'side', main: false, status: 'LOCKED' }];
        assert.equal(mainQuests(withOptional).length, QUESTS.length, 'main: false is not counted');
        assert.equal(allMainQuestsComplete(withOptional), true, 'an unfinished optional quest does not block the ending');
        assert.equal(allMainQuestsComplete(quests(q => (q.id === 'tower_of_trials' ? 'ACTIVE' : 'COMPLETED'))), false);
    });

    test('the farewell is due only after every main quest, and only once', () => {
        const a = new Adventure();
        assert.equal(a.isEndingDue(quests(q => (q.id === 'tower_of_trials' ? 'AVAILABLE' : 'COMPLETED'))), false);
        assert.equal(a.isEndingDue(quests('COMPLETED')), true);
        a.markFarewell();
        assert.equal(a.isEndingDue(quests('COMPLETED')), false, 'not again after the farewell');
        assert.equal(a.complete, true);
        a.reset();
        assert.equal(a.complete, false, 'a new game starts fresh');
    });

    test('bonus coin locations come from the village map and object data', () => {
        const ids = bonusLocationIds(villageEntities, OBJECTS);
        const expected = Object.values(OBJECTS).filter(o => o.bonus).map(o => o.id);
        assert.deepEqual([...ids].sort(), [...expected].sort());
        assert.ok(ids.length >= 1);
        for (const id of ids) assert.equal(OBJECTS[id].cppType, 'Chest', `${id} pays out once, as a C++ Chest`);
        assert.ok(!ids.includes('garden_gate') && !ids.includes('tower_door'));
    });

    test('ending data: the giver exists and is placed in the village', () => {
        assert.ok(NPCS[ENDING.giver]);
        assert.ok(villageEntities.some(e => e.ref === ENDING.giver));
        assert.ok(ENDING.farewell.length >= 3);
    });
});

describe('end-screen statistics from the C++ objects', () => {
    let engines, oop;
    before(() => { engines = createEngines(); oop = new OopService(engines.oop); });
    after(() => { engines.dsa.stop(); engines.oop.stop(); });

    const ids = bonusLocationIds(villageEntities, OBJECTS);
    async function freshWorld() {
        await oop.reset();
        for (const id of ids) await oop.create({ type: 'Chest', id, param: OBJECTS[id].param, name: OBJECTS[id].name });
    }
    const stats = async () => journeyStats({
        profile: { name: null }, quests: quests('COMPLETED'), bonusIds: ids,
        cppEntities: (await oop.list()).entities, player: (await oop.player()).player,
    });
    const goldOf = id => Number(OBJECTS[id].param.split(':')[2]);

    test('no bonus location visited: zero found, zero coins', async () => {
        await freshWorld();
        const s = await stats();
        assert.deepEqual([s.locationsFound, s.locationsTotal, s.bonusCoins], [0, ids.length, 0]);
        assert.equal(s.name, 'Explorer');
        assert.deepEqual([s.questsCompleted, s.questsTotal], [QUESTS.length, QUESTS.length]);
    });

    test('opening locations counts each once; opening again pays nothing more', async () => {
        await freshWorld();
        const goldBefore = (await oop.player()).player.gold;
        const first = ids[0];
        assert.equal((await oop.interact(first)).result.goldGained, goldOf(first));
        assert.equal((await oop.interact(first)).result.action, 'CHEST_EMPTY', 'the same location cannot pay twice');
        let s = await stats();
        assert.deepEqual([s.locationsFound, s.bonusCoins], [1, goldOf(first)]);
        for (const id of ids.slice(1)) await oop.interact(id);
        s = await stats();
        const all = ids.reduce((n, id) => n + goldOf(id), 0);
        assert.deepEqual([s.locationsFound, s.bonusCoins], [ids.length, all]);
        assert.equal(s.totalCoins - goldBefore, all, 'bonus coins match the gold the C++ Player received');
    });
});
