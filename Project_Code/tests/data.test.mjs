// Data integrity, Tiled map and map->graph tests (no native engines needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUESTS } from '../src/data/quests.js';
import { NPCS, OBJECTS } from '../src/data/npcs.js';
import { MAPS } from '../src/data/world.js';
import { ASSET_CATALOG } from '../src/data/assetCatalog.js';
import { parseTiledObjects } from '../src/systems/MapManager.js';
import { buildTileGrid, parseProps } from '../src/systems/MapData.js';
import { deriveGraph } from '../src/systems/MapGraph.js';
import { loadMap, whisperingWoods } from './mapGraphs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapFile = id => MAPS[id].file.replace('maps/', '');

test('every quest references a real giver, dialogue and map', () => {
    for (const q of QUESTS) {
        assert.ok(NPCS[q.giver], `${q.id}: unknown giver ${q.giver}`);
        assert.ok(q.dialogue.offer?.length && q.dialogue.accept?.length && q.dialogue.completed?.length, q.id);
        if (q.type === 'dialogue') assert.ok(q.dialogue.lesson?.length, `${q.id} needs lesson lines`);
        if (q.entry) assert.ok(OBJECTS[q.entry], `${q.id}: unknown entry object`);
        if (q.config?.map) assert.ok(MAPS[q.config.map], `${q.id}: unknown map ${q.config.map}`);
    }
    assert.equal(new Set(QUESTS.map(q => q.id)).size, QUESTS.length);
});

test('every map file exists and every image it uses was extracted', () => {
    const keys = new Set([
        ...Object.values(ASSET_CATALOG.props), ...Object.values(ASSET_CATALOG.objects),
    ].map(a => a.key));
    for (const def of Object.values(MAPS)) {
        assert.ok(existsSync(join(root, 'assets', def.file)), def.file);
        for (const p of parseProps(loadMap(mapFile(def.id)))) assert.ok(keys.has(p.key), `${def.id}: unknown prop ${p.key}`);
    }
    const all = ['props', 'objects', 'items', 'ui', 'characters'].flatMap(g => Object.values(ASSET_CATALOG[g]));
    for (const a of [...all, ASSET_CATALOG.terrain]) assert.ok(existsSync(join(root, 'assets', a.url)), a.url);
});

test('village entities reference defined NPCs/objects and stand on walkable ground', () => {
    const json = loadMap('village.json');
    const grid = buildTileGrid(json);
    const { entities, solids } = parseTiledObjects(json);
    const kinds = new Set(entities.map(e => e.kind));
    assert.ok(kinds.has('npc') && kinds.has('object'));
    for (const e of entities.filter(x => x.kind === 'npc' || x.kind === 'object')) {
        assert.ok((e.kind === 'npc' ? NPCS : OBJECTS)[e.ref], e.ref);
        const tx = Math.floor(e.x / json.tilewidth), ty = Math.floor(e.y / json.tileheight);
        assert.equal(grid.blocked[ty * grid.cols + tx], 0, `${e.ref} stands on a blocked tile`);
        const inside = solids.find(s => e.x > s.x && e.x < s.x + s.w && e.y > s.y && e.y < s.y + s.h);
        assert.equal(inside, undefined, `${e.ref} is inside a collision rectangle`);
    }
    for (const npc of Object.keys(NPCS)) assert.ok(entities.some(e => e.ref === npc), `${npc} is not placed in the village`);
    const spawn = parseTiledObjects(json).spawns.default;
    assert.equal(grid.blocked[Math.floor(spawn.y / 16) * grid.cols + Math.floor(spawn.x / 16)], 0, 'spawn is blocked');
});

test('the graph derived from the Lost Path map is the designed graph', () => {
    assert.equal(whisperingWoods.nodes.length, 16);
    assert.equal(whisperingWoods.edges.length, 21);
    const ids = new Set(whisperingWoods.nodes.map(n => n.id));
    assert.ok(ids.has(whisperingWoods.start) && ids.has(whisperingWoods.goal));
    for (const e of whisperingWoods.edges) assert.ok(ids.has(e.from) && ids.has(e.to), `${e.from}-${e.to}`);
});

test('deriveGraph: corridors become edges, blocked tiles separate, terrain sets weight', () => {
    // 11x5 grid:  A . . B   (row 1 corridor, marsh)   C isolated
    const cols = 11, rows = 5;
    const blocked = new Uint8Array(cols * rows).fill(1);
    const terrain = new Array(cols * rows).fill(null);
    const open = (x, y, t = null) => { blocked[y * cols + x] = 0; terrain[y * cols + x] = t; };
    for (let x = 0; x <= 6; x++) open(x, 1, x >= 2 && x <= 4 ? 'marsh' : null);
    open(9, 3); open(10, 3);
    const zones = [{ id: 'A', x: 0, y: 1, w: 2, h: 1 }, { id: 'B', x: 5, y: 1, w: 2, h: 1 }, { id: 'C', x: 9, y: 3, w: 2, h: 1 }];
    const grid = { cols, rows, tileWidth: 16, tileHeight: 16, blocked, terrain };
    const g = deriveGraph(grid, zones, { weighted: true, factors: { marsh: 2 }, hscale: 16 });
    assert.equal(g.edges.length, 1);
    assert.deepEqual([g.edges[0].from, g.edges[0].to], ['A', 'B']);
    // path A(1,1) -> B(6,1): 5 steps; 3 marsh tiles x2 + 2 normal = 8
    assert.equal(g.edges[0].weight, 8);
    assert.equal(g.edges[0].terrain, 'marsh');
    // two corridors that touch outside the zones merge into one component:
    open(3, 2); open(3, 3); open(8, 3);
    zones.push({ id: 'D', x: 3, y: 3, w: 1, h: 1 });
    const g2 = deriveGraph(grid, zones, { weighted: false });
    assert.equal(g2.edges.length, 3);   // A-B, A-D, B-D through the shared corridor
});

test('parseTiledObjects reads spawns, entities and collision from a Tiled export', () => {
    const json = {
        layers: [
            { type: 'tilelayer', name: 'Ground', data: [] },
            { type: 'objectgroup', name: 'Spawns', objects: [{ name: 'default', x: 10, y: 20 }] },
            { type: 'objectgroup', name: 'Entities', objects: [
                { name: 'guide', x: 100, y: 50, properties: [{ name: 'ref', value: 'guide' }, { name: 'kind', value: 'npc' }] },
                { name: 'chest', x: 5, y: 6, properties: [{ name: 'kind', value: 'object' }] },
            ] },
            { type: 'objectgroup', name: 'Collision', objects: [{ x: 0, y: 0, width: 32, height: 64 }] },
        ],
    };
    const r = parseTiledObjects(json);
    assert.deepEqual(r.spawns.default, { x: 10, y: 20 });
    assert.deepEqual(r.entities, [{ ref: 'guide', kind: 'npc', x: 100, y: 50 }, { ref: 'chest', kind: 'object', x: 5, y: 6 }]);
    assert.deepEqual(r.solids, [{ x: 0, y: 0, w: 32, h: 64 }]);
    const scaled = parseTiledObjects(json, 2);
    assert.deepEqual(scaled.solids, [{ x: 0, y: 0, w: 64, h: 128 }]);
});
