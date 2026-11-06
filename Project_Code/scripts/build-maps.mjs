// build-maps.mjs - writes QuestForge's Tiled maps (assets/maps/*.json).
//
//   node scripts/build-maps.mjs
//
// The maps are ordinary Tiled JSON (orthogonal, 16x16 tiles, embedded
// tilesets) and can be opened and edited in Tiled afterwards. They are
// generated so the layouts are reproducible and so the graph maps can be
// CHECKED: for Lost Path and Royal Route the graph is derived from the
// finished map with the same code the game uses (src/systems/MapGraph.js),
// and the build fails if the walkable corridors do not produce exactly the
// intended edges (e.g. two trails accidentally crossing).
//
// Every image comes from src/data/assetCatalog.js (scripts/extract_assets.py).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_CATALOG } from '../src/data/assetCatalog.js';
import { buildTileGrid, parseZones } from '../src/systems/MapData.js';
import { deriveGraph } from '../src/systems/MapGraph.js';
import { TERRAIN_FACTOR, ROYAL_HSCALE } from '../src/data/graphs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'maps');
const T = 16;          // map tile size (px)
const SCALE = 2;       // game px per map px (matches data/world.js)

// ------------------------------------------------------------ tilesets
const terrain = ASSET_CATALOG.terrain;
const TILE = Object.fromEntries(terrain.tiles.map(t => [t.name, t.id + 1]));   // name -> gid
const PROP_FIRSTGID = terrain.tiles.length + 1;
const PROP_LIST = [
    ...Object.entries(ASSET_CATALOG.props).map(([name, p]) => ({ name, ...p })),
    ...Object.entries(ASSET_CATALOG.objects).map(([name, p]) => ({ name, ...p })),
];
const PROP = Object.fromEntries(PROP_LIST.map((p, i) => [p.name, { ...p, gid: PROP_FIRSTGID + i }]));

const tiledProps = obj => Object.entries(obj).map(([name, value]) => ({
    name, type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string', value,
}));

function tilesetsJson() {
    const rows = Math.ceil(terrain.tiles.length / terrain.columns);
    return [
        {
            firstgid: 1, name: 'terrain', image: '../' + terrain.url, imagewidth: terrain.columns * T, imageheight: rows * T,
            tilewidth: T, tileheight: T, tilecount: terrain.tiles.length, columns: terrain.columns, margin: 0, spacing: 0,
            tiles: terrain.tiles.map(({ id, name, ...p }) => ({ id, properties: tiledProps({ name, ...p }) })),
        },
        {
            // image collection: one image per tile, used by the Props object layer
            firstgid: PROP_FIRSTGID, name: 'props', columns: 0, margin: 0, spacing: 0,
            tilecount: PROP_LIST.length,
            tilewidth: Math.max(...PROP_LIST.map(p => p.w)), tileheight: Math.max(...PROP_LIST.map(p => p.h)),
            grid: { orientation: 'orthogonal', width: 1, height: 1 },
            tiles: PROP_LIST.map((p, i) => ({ id: i, image: '../' + p.url, imagewidth: p.w, imageheight: p.h, properties: tiledProps({ key: p.key }) })),
        },
    ];
}

// ------------------------------------------------------------ builder
function rng(seed) {   // mulberry32: deterministic layouts
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class MapBuilder {
    constructor(id, cols, rows, { ground = 'grass', seed = 1, properties = {} } = {}) {
        Object.assign(this, { id, cols, rows, properties });
        this.random = rng(seed);
        this.ground = new Array(cols * rows).fill(TILE[ground]);
        this.blocked = new Array(cols * rows).fill(0);
        this.props = []; this.collision = []; this.entities = []; this.spawns = []; this.nodes = [];
    }
    i(x, y) { return y * this.cols + x; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    set(x, y, tile) { if (this.inside(x, y)) this.ground[this.i(x, y)] = TILE[tile]; }
    get(x, y) { return this.ground[this.i(x, y)]; }
    fill(x, y, w, h, tile) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, Array.isArray(tile) ? this.pick(tile) : tile); return this; }
    block(x, y, w, h, on = 1) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.inside(xx, yy)) this.blocked[this.i(xx, yy)] = on; }
    isBlocked(x, y) { return !this.inside(x, y) || this.blocked[this.i(x, y)] === 1 || terrain.tiles[this.get(x, y) - 1]?.collides; }
    pick(list) { return list[Math.floor(this.random() * list.length)]; }

    // Place a prop with its bottom-centre at tile coordinates (x, y).
    // Its catalog footprint becomes a Collision rectangle unless solid=false.
    prop(name, x, y, { solid = true } = {}) {
        const p = PROP[name];
        if (!p) throw new Error(`${this.id}: unknown prop ${name}`);
        const bx = Math.round(x * T - p.w / 2), by = Math.round(y * T);
        this.props.push({ gid: p.gid, name, x: bx, y: by, width: p.w, height: p.h, properties: tiledProps({ key: p.key }) });
        if (solid && p.solid) {
            const [fx, fy, fw, fh] = p.solid;
            this.collision.push({ name, x: bx + fx * p.w, y: by - p.h + fy * p.h, width: fw * p.w, height: fh * p.h });
        }
        return this;
    }
    entity(ref, kind, x, y, extra = {}) {
        this.entities.push({ name: ref, x: x * T, y: y * T, properties: tiledProps({ ref, kind, ...extra }) });
        return this;
    }
    spawn(name, x, y) { this.spawns.push({ name, x: x * T, y: y * T }); return this; }
    node(id, label, x, y, w, h) { this.nodes.push({ id, label, x, y, w, h }); return this; }

    toJSON() {
        let oid = 1;
        const obj = o => ({ id: oid++, name: o.name ?? '', type: '', rotation: 0, visible: true, x: o.x, y: o.y, width: o.width ?? 0, height: o.height ?? 0, ...o });
        const layer = (id, name, extra) => ({ id, name, opacity: 1, visible: true, x: 0, y: 0, ...extra });
        const layers = [
            layer(1, 'Ground', { type: 'tilelayer', width: this.cols, height: this.rows, data: this.ground }),
            layer(2, 'Blocked', { type: 'tilelayer', width: this.cols, height: this.rows, opacity: 0.45, data: this.blocked.map(b => (b ? TILE.collision : 0)) }),
            layer(3, 'Props', { type: 'objectgroup', draworder: 'topdown', objects: this.props.map(obj) }),
            layer(4, 'Collision', { type: 'objectgroup', draworder: 'topdown', visible: false, objects: this.collision.map(obj) }),
            layer(5, 'Entities', { type: 'objectgroup', draworder: 'topdown', objects: this.entities.map(e => obj({ ...e, point: true })) }),
            layer(6, 'Spawns', { type: 'objectgroup', draworder: 'topdown', objects: this.spawns.map(s => obj({ ...s, point: true })) }),
        ];
        if (this.nodes.length) {
            layers.push(layer(7, 'Nodes', {
                type: 'objectgroup', draworder: 'topdown',
                objects: this.nodes.map(n => obj({ name: n.id, x: n.x * T, y: n.y * T, width: n.w * T, height: n.h * T, properties: tiledProps({ label: n.label }) })),
            }));
        }
        return {
            compressionlevel: -1, type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
            infinite: false, width: this.cols, height: this.rows, tilewidth: T, tileheight: T,
            nextlayerid: layers.length + 1, nextobjectid: oid,
            properties: tiledProps(this.properties),
            layers, tilesets: tilesetsJson(),
        };
    }

    write() {
        const json = this.toJSON();
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${this.id}.json`), JSON.stringify(json));
        return json;
    }
}

const GRASS = ['grass', 'grass', 'grass', 'grass_b', 'grass_c', 'grass_d'];
const FLOWERS = ['flower_red', 'flower_orange', 'flower_white', 'flower_yellow', 'flower_daisy', 'flower_purple', 'grass_tuft', 'grass_tall'];
const TREES = ['tree_round', 'tree_big', 'tree_green', 'tree_light', 'tree_teal', 'tree_dark'];

// Fill a blocked area with a forest of non-solid trees (the Blocked layer is
// the collision; trees are the skin) on a 2-tile grid.
function forest(m, trees, { density = 0.9 } = {}) {
    for (let y = 1; y < m.rows + 1; y += 2) {
        for (let x = 0; x < m.cols; x += 2) {
            const allBlocked = [[0, 0], [1, 0], [0, -1], [1, -1]].every(([dx, dy]) => m.isBlocked(x + dx, y + dy));
            if (allBlocked && m.random() < density) m.prop(m.pick(trees), x + 1 + (m.random() - 0.5) * 0.4, y + 1, { solid: false });
        }
    }
}

// Carve a corridor of radius r between two tile points (straight line).
// Returns the tiles it opened so trails can be kept apart (see separateTrails).
function carve(m, a, b, r, tile) {
    const opened = new Set();
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2;
    for (let s = 0; s <= steps; s++) {
        const x = Math.round(a.x + ((b.x - a.x) * s) / steps), y = Math.round(a.y + ((b.y - a.y) * s) / steps);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (!m.inside(x + dx, y + dy)) continue;
            m.block(x + dx, y + dy, 1, 1, 0);
            if (tile) m.set(x + dx, y + dy, tile);
            opened.add(m.i(x + dx, y + dy));
        }
    }
    return opened;
}

// Two trails that leave the same clearing at a narrow angle would merge just
// outside it, creating a shortcut that is not in the design. Re-grow forest on
// every tile (outside the clearings) that belongs to - or touches - more than
// one trail, so each trail stays its own corridor.
function separateTrails(m, trails, zones, fillTile) {
    const inZone = (x, y) => zones.some(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    const owner = new Map();
    trails.forEach((tiles, t) => tiles.forEach(i => owner.set(i, owner.has(i) && owner.get(i) !== t ? -1 : t)));
    const wall = [];
    for (const [i, t] of owner) {
        const x = i % m.cols, y = (i - x) / m.cols;
        if (inZone(x, y)) continue;
        const clash = t === -1 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const o = owner.get(m.i(x + dx, y + dy));
            return o !== undefined && o !== t && !inZone(x + dx, y + dy);
        });
        if (clash) wall.push([x, y]);
    }
    for (const [x, y] of wall) { m.block(x, y, 1, 1); m.set(x, y, fillTile); }
}

function checkGraph(json, intended, opts) {
    const g = deriveGraph(buildTileGrid(json), parseZones(json), { ...opts, scale: SCALE });
    const key = (a, b) => [a, b].sort().join('-');
    const got = new Set(g.edges.map(e => key(e.from, e.to)));
    const want = new Set(intended.map(([a, b]) => key(a, b)));
    const missing = [...want].filter(k => !got.has(k));
    const extra = [...got].filter(k => !want.has(k));
    if (missing.length || extra.length) {
        throw new Error(`${json.properties.find(p => p.name === 'title')?.value}: derived graph differs from the design.\n  missing: ${missing.join(', ')}\n  extra: ${extra.join(', ')}`);
    }
    return g;
}

// =================================================================== VILLAGE
function village() {
    const m = new MapBuilder('village', 48, 36, { seed: 7, properties: { title: 'Main Village' } });
    m.fill(0, 0, 48, 36, GRASS);
    // roads
    m.fill(1, 20, 37, 2, 'sand');                 // main street
    m.fill(23, 9, 2, 26, 'sand');                 // north-south street to the castle
    m.fill(11, 22, 2, 7, 'sand');                 // to the Garden of Balance gate
    m.fill(30, 22, 2, 6, 'sand');                 // to the shop
    // royal courtyard + carpet to the castle gate
    m.fill(17, 9, 14, 6, 'stone_light');
    m.fill(23, 8, 2, 7, 'carpet_red');
    // river with a bridge, and the tower island
    m.fill(38, 0, 2, 36, ['water', 'water_b']);
    m.fill(38, 20, 2, 2, 'bridge');
    m.fill(40, 20, 8, 2, 'sand');
    m.fill(42, 14, 2, 6, 'stone');
    m.fill(40, 8, 7, 7, 'stone_grey');
    // pond
    m.fill(16, 29, 5, 4, ['water', 'water_b']);

    // castle and royal area (King + Human Etiquette)
    m.prop('castle', 24, 9.1);
    m.prop('throne', 20.4, 12.2);
    m.prop('torch', 18.2, 11.4).prop('torch', 29.6, 11.4);
    m.prop('banner_royal', 26.7, 11.8, { solid: false }).prop('banner_royal', 21.3, 11.8, { solid: false });
    m.prop('knight_statue', 18.6, 14.6).prop('knight_statue', 29.2, 14.6);
    m.prop('castle_pillar', 17.4, 9.6).prop('castle_pillar', 30.6, 9.6);
    m.entity('king', 'npc', 20.4, 13.3);

    // Guide's hut (Lost Path)
    m.prop('house_red', 8, 19);
    m.prop('sign_wood', 4.2, 19.6).prop('bench_wood', 13.2, 18.6);
    m.entity('guide', 'npc', 10.8, 19.2);

    // Blacksmith's forge (Blacksmith's Challenge)
    m.prop('house_green', 30.6, 19);
    m.prop('forge', 34.4, 19.2).prop('anvil', 36.4, 19.4).prop('barrel_wood', 27.6, 19.2);
    m.entity('blacksmith', 'npc', 33.6, 19.9);

    // Garden of Balance (The Unbalanced Garden) - a hedged garden where the
    // old library stood; the gate leads into the garden map, Elarion keeps it.
    m.fill(6, 29, 9, 6, 'grass_light');
    m.fill(6, 29, 9, 1, 'hedge').fill(6, 29, 1, 6, 'hedge').fill(14, 29, 1, 6, 'hedge').fill(6, 34, 9, 1, 'hedge');
    m.fill(11, 29, 2, 4, 'stone_light');          // gate gap and the path inside
    m.fill(7, 30, 3, 2, 'flowerbed').fill(7, 32, 2, 2, 'flowerbed');
    m.prop('tree_big', 9.6, 33.4).prop('garden_statue', 12, 33.6).prop('flower_bed', 13.4, 31.6, { solid: false });
    m.prop('hedge_pink', 13.4, 33.4, { solid: false }).prop('flower_pot', 10.2, 31.2, { solid: false });
    m.entity('garden_gate', 'object', 12, 29.9);
    m.entity('keeper', 'npc', 9.4, 28.4);

    // Tower of Trials (Tower quest) on the island east of the river
    m.prop('tower', 43, 13.2);
    m.prop('torch', 41.2, 13.4).prop('torch', 44.8, 13.4);
    m.prop('pillar', 40.6, 15.2).prop('pillar', 45.4, 15.2);
    m.entity('tower_door', 'object', 43, 14.4);
    m.entity('guard', 'npc', 44.6, 17.2);

    // other houses / shop
    m.prop('house_blue', 17.2, 19).prop('shop', 31, 27.6).prop('house_blue_small', 4.6, 27.6).prop('house_blue', 36, 33.6);
    m.prop('market_stall', 27.2, 27.4).prop('crate_green', 34.4, 23.6).prop('barrel', 27.4, 24);

    // village objects (C++ Chest objects)
    m.entity('well', 'object', 26.6, 23.6);
    m.entity('old_chest', 'object', 22, 30.4);

    // ambient villagers (decor only: there is no C++ class for them)
    m.entity('kid_1', 'ambient', 17, 28.4, { sheet: 'npc.kids', frame: 0 });
    m.entity('kid_2', 'ambient', 20.4, 28.6, { sheet: 'npc.kids', frame: 3 });
    m.entity('villager_1', 'ambient', 28.6, 25.4, { sheet: 'npc.villagers', frame: 1 });
    m.entity('villager_2', 'ambient', 6.6, 22.8, { sheet: 'npc.villagers', frame: 3 });

    // street decor
    for (const [x, y] of [[21.6, 19.6], [26.2, 19.6], [14.6, 23.4], [35.4, 23.4], [21.6, 26], [26.2, 30]]) m.prop('lamp_post', x, y);
    m.prop('bench_wood', 20.4, 25.4).prop('fountain', 18.6, 25.2).prop('planter', 9.6, 25);
    m.prop('fence', 15.4, 33.6).prop('fence', 17, 33.6).prop('fence', 18.6, 33.6).prop('fence', 20.2, 33.6);
    m.prop('flower_basket', 21.6, 34.2).prop('planter', 25.6, 33);

    // trees around the edge (solid), flowers in the open grass
    const border = [];
    for (let x = 1; x < 37; x += 2.4) border.push([x, 2.2]);
    for (let x = 1; x < 37; x += 2.6) border.push([x, 35.9]);
    for (let y = 4.5; y < 35; y += 2.3) border.push([1, y]);
    for (const [x, y] of border) {
        const nearCastle = x > 15.5 && x < 32 && y < 3;
        const onRoad = y > 18.5 && y < 23 && x < 2;
        if (!nearCastle && !onRoad) m.prop(m.pick(TREES), x, y);
    }
    for (const [x, y] of [[4, 9], [8, 6], [12, 10], [14.5, 6], [34, 6], [35.5, 11], [33, 14.5], [6, 14], [44.5, 26], [42, 31], [46, 34], [45, 4], [41.5, 5.5]]) m.prop(m.pick(TREES), x, y);
    for (let n = 0; n < 70; n++) {
        const x = 2 + m.random() * 35, y = 3 + m.random() * 31;
        const tx = Math.floor(x), ty = Math.floor(y - 0.5);
        if (m.get(tx, ty) >= TILE.sand && m.get(tx, ty) !== TILE.grass_c && m.get(tx, ty) !== TILE.grass_d) continue;
        m.prop(m.pick(FLOWERS), x, y, { solid: false });
    }
    m.spawn('default', 22, 22.6);
    return m.write();
}

// ================================================================= LOST PATH
// Whispering Woods: 16 clearings joined by forest trails. Positions were the
// old hand-drawn graph's; now they are carved into a real walkable forest.
const WOODS = {
    nodes: [
        ['edge', 'Forest Edge', 60, 330], ['birch', 'Birch Grove', 165, 200], ['stream', 'Stream', 165, 470],
        ['oak', 'Old Oak', 265, 110], ['glade', 'Glade', 280, 310], ['ferns', 'Fern Hollow', 265, 560],
        ['ruins', 'Ruins', 380, 190], ['mossy', 'Mossy Rock', 385, 420], ['bog', 'Bog', 380, 585],
        ['ravine', 'Ravine', 480, 100], ['pines', 'Tall Pines', 480, 300], ['cave', 'Cave Mouth', 495, 500],
        ['cliff', 'Cliff Top', 585, 170], ['well', 'Dry Well', 585, 420], ['creek', 'Creek', 590, 585],
        ['shrine', 'Old Shrine', 578, 295],
    ],
    edges: [
        ['edge', 'birch'], ['edge', 'stream'], ['birch', 'oak'], ['birch', 'glade'], ['stream', 'ferns'], ['stream', 'glade'],
        ['oak', 'ruins'], ['glade', 'pines'], ['glade', 'mossy'], ['ferns', 'bog'], ['ruins', 'ravine'], ['ruins', 'pines'],
        ['mossy', 'cave'], ['mossy', 'pines'], ['bog', 'cave'], ['ravine', 'cliff'], ['pines', 'well'], ['cave', 'creek'],
        ['cliff', 'shrine'], ['well', 'shrine'], ['creek', 'well'],
    ],
};

function lostPath() {
    const m = new MapBuilder('lost_path', 56, 54, { ground: 'grass_forest', seed: 11, properties: { title: 'Lost Path', start: 'edge', goal: 'shrine' } });
    m.block(0, 0, 56, 54);
    const at = Object.fromEntries(WOODS.nodes.map(([id, , x, y]) => [id, { x: Math.round(x / 11.5) + 1, y: Math.round(y / 11.5) - 3 }]));
    const trails = WOODS.edges.map(([a, b]) => carve(m, at[a], at[b], 1, 'sand'));
    const zones = WOODS.nodes.map(([id]) => ({ x: at[id].x - 3, y: at[id].y - 3, w: 6, h: 6 }));
    separateTrails(m, trails, zones, 'grass_forest');
    for (const [id, label] of WOODS.nodes) {
        const c = at[id];
        m.node(id, label, c.x - 3, c.y - 3, 6, 6);
        m.block(c.x - 3, c.y - 3, 6, 6, 0);
        m.fill(c.x - 3, c.y - 3, 6, 6, id === 'shrine' ? 'stone_light' : 'grass_light');
    }
    // landmarks inside clearings (walkable decor)
    const s = at.shrine;
    m.prop('stone_shrine', s.x + 0.6, s.y - 0.9).prop('flame', s.x - 1.3, s.y - 1, { solid: false });
    m.prop('stump_big', at.oak.x - 1, at.oak.y - 1, { solid: false });
    m.prop('rock_big', at.mossy.x + 1, at.mossy.y - 1, { solid: false });
    m.prop('well', at.well.x + 1, at.well.y - 1, { solid: false });
    m.prop('gravestone_a', at.ruins.x - 1, at.ruins.y - 1, { solid: false }).prop('gravestone_b', at.ruins.x + 1, at.ruins.y - 1, { solid: false });
    m.prop('flower_purple', at.glade.x - 1, at.glade.y - 1, { solid: false }).prop('flower_daisy', at.glade.x + 1, at.glade.y + 1, { solid: false });
    m.prop('bush_teal', at.bog.x - 1, at.bog.y - 1, { solid: false });
    forest(m, ['tree_pine', 'tree_pine_teal', 'tree_pine_green', 'tree_teal', 'tree_dark', 'tree_green']);
    m.spawn('default', at.edge.x, at.edge.y);
    const json = m.write();
    const g = checkGraph(json, WOODS.edges, { weighted: false });
    console.log(`lost_path: ${g.nodes.length} nodes, ${g.edges.length} edges (matches design)`);
}

// =============================================================== ROYAL ROUTE
const KINGDOM = {
    nodes: [
        ['castle', 'Castle', 60, 330], ['mill', 'Mill', 185, 180], ['farm', 'Farm', 185, 480], ['cross', 'Crossroads', 315, 330],
        ['forest', 'Forest', 320, 120], ['marsh', 'Marsh', 320, 560], ['bridge', 'Bridge', 445, 240], ['village', 'Village', 445, 440],
        ['hills', 'Hills', 560, 120], ['quarry', 'Quarry', 560, 570], ['harbor', 'Harbor', 590, 335],
    ],
    roads: [
        ['castle', 'mill', 'road'], ['castle', 'farm', 'road'], ['castle', 'cross', 'marsh'], ['mill', 'forest', 'road'],
        ['mill', 'cross', 'road'], ['farm', 'cross', 'road'], ['farm', 'marsh', 'road'], ['forest', 'bridge', 'forest'],
        ['forest', 'hills', 'hills'], ['cross', 'bridge', 'road'], ['cross', 'village', 'forest'], ['marsh', 'village', 'marsh'],
        ['marsh', 'quarry', 'road'], ['bridge', 'harbor', 'hills'], ['bridge', 'village', 'road'], ['hills', 'harbor', 'road'],
        ['village', 'harbor', 'road'], ['quarry', 'harbor', 'hills'],
    ],
};
const ROAD_TILE = { road: 'sand', forest: 'grass_forest', hills: 'dirt', marsh: 'marsh' };
const TOWN_DECOR = {
    castle: 'castle_gate', mill: 'house_red', farm: 'house_green', cross: 'signpost', forest: 'house_blue_small',
    marsh: 'house_purple', bridge: 'lamp_blue', village: 'house_blue', hills: 'rock_big', quarry: 'cauldron', harbor: 'barrel_wood',
};

function royalRoute() {
    const m = new MapBuilder('royal_route', 64, 54, {
        ground: 'grass_dark', seed: 23,
        properties: { title: 'Royal Route', start: 'castle', goal: 'harbor', terrainSpeed: true },
    });
    m.block(0, 0, 64, 54);
    const at = Object.fromEntries(KINGDOM.nodes.map(([id, , x, y]) => [id, { x: Math.round(x / 11) + 1, y: Math.round(y / 11) - 4 }]));
    // the sea behind the harbor
    m.fill(60, 0, 4, 54, ['water', 'water_b']);
    const trails = KINGDOM.roads.map(([a, b, kind]) => carve(m, at[a], at[b], 1, ROAD_TILE[kind]));
    separateTrails(m, trails, KINGDOM.nodes.map(([id]) => ({ x: at[id].x - 3, y: at[id].y - 3, w: 7, h: 7 })), 'grass_dark');
    for (const [id, label] of KINGDOM.nodes) {
        const c = at[id];
        m.node(id, label, c.x - 3, c.y - 3, 7, 7);
        m.block(c.x - 3, c.y - 3, 7, 7, 0);
        m.fill(c.x - 3, c.y - 3, 7, 7, id === 'castle' || id === 'harbor' ? 'stone' : 'stone_b');
    }
    // a town landmark beside each zone, on the side without roads
    for (const [id] of KINGDOM.nodes) {
        const c = at[id];
        const sides = [[0, -4.0], [0, 5.6], [-5, 2], [5.4, 2]];
        const free = sides.find(([dx, dy]) => {
            for (let yy = -2; yy <= 0; yy++) for (let xx = -1; xx <= 1; xx++) if (!m.isBlocked(Math.round(c.x + dx + xx), Math.round(c.y + dy + yy))) return false;
            return true;
        });
        if (free) m.prop(TOWN_DECOR[id], c.x + 0.5 + free[0], c.y + free[1] + 0.4, { solid: false });
    }
    // trees along forest roads, rocks along hill roads (decor on blocked tiles)
    forest(m, ['tree_pine', 'tree_round', 'tree_green', 'tree_autumn', 'tree_light', 'tree_cypress'], { density: 0.75 });
    m.spawn('default', at.castle.x, at.castle.y);
    const json = m.write();
    const g = checkGraph(json, KINGDOM.roads, { weighted: true, factors: TERRAIN_FACTOR, hscale: ROYAL_HSCALE });
    console.log(`royal_route: ${g.nodes.length} nodes, ${g.edges.length} edges (matches design)`);
    console.log('  costs: ' + g.edges.map(e => `${e.from}-${e.to}:${e.weight}(${e.terrain})`).join('  '));
}

// ========================================================= GARDEN OF BALANCE
// Hedge-walled garden: gate at the bottom, a winding path to the central
// clearing with the Ancient Tree (opens the AVL lessons) and Elarion's spot.
function garden() {
    const m = new MapBuilder('garden', 26, 22, { ground: 'grass', seed: 17, properties: { title: 'Garden of Balance' } });
    m.fill(0, 0, 26, 22, ['grass', 'grass', 'grass_b', 'grass_light']);
    m.fill(0, 0, 26, 2, 'hedge').fill(0, 0, 1, 22, 'hedge').fill(25, 0, 1, 22, 'hedge').fill(0, 21, 26, 1, 'hedge');
    m.fill(12, 21, 2, 1, 'sand');                                      // the gate gap (exit)
    // winding path: up from the gate, west, north, then east into the clearing
    m.fill(12, 16, 2, 5, 'sand').fill(6, 16, 8, 2, 'sand').fill(6, 11, 2, 7, 'sand').fill(6, 11, 4, 2, 'sand');
    m.fill(16, 12, 6, 2, 'sand').fill(20, 12, 2, 6, 'sand');            // side path to the fountain nook
    m.fill(9, 5, 8, 9, 'stone_light');                                 // the central clearing
    // flower patches
    m.fill(2, 3, 4, 3, 'flowerbed').fill(20, 3, 4, 3, 'flowerbed').fill(2, 18, 4, 2, 'flowerbed').fill(16, 18, 4, 2, 'flowerbed');
    m.fill(9, 15, 2, 1, 'flowerbed').fill(15, 15, 3, 1, 'flowerbed');
    // the Ancient Tree on a stone altar, flanked by statues
    m.prop('tree_big', 13, 8.2);   // the altar in front of it is the interactive object (GardenChallenge)
    m.prop('garden_statue', 10, 9.6).prop('garden_statue', 16, 9.6);
    m.prop('lamp_yellow', 9.6, 13.4).prop('lamp_yellow', 16.4, 13.4);
    // Elarion's corner and the fountain nook
    m.prop('garden_bench', 19.4, 9.4).prop('flower_pot', 21.6, 9.2, { solid: false });
    m.prop('fountain', 21, 17.2).prop('garden_bench', 18, 17.6);
    // trees and hedges along the walls
    for (const [x, y] of [[2, 3], [4.6, 2.6], [22, 2.6], [24, 4], [2, 9], [24, 9.5], [2, 13], [24, 14], [3, 20.6], [9, 20.6], [17, 20.6], [23.4, 20.6]]) m.prop(m.pick(['tree_round', 'tree_light', 'tree_green', 'tree_teal']), x, y);
    for (const [x, y] of [[4, 11], [4, 14.6], [10.4, 19.4], [15.6, 19.4], [18, 3.4], [7.6, 3.4]]) m.prop(m.pick(['hedge_low', 'hedge_pink', 'bush_round', 'bush_berry']), x, y);
    for (let n = 0; n < 26; n++) {
        const x = 2 + m.random() * 22, y = 3 + m.random() * 17;
        if (m.get(Math.floor(x), Math.floor(y - 0.5)) !== TILE.grass && m.get(Math.floor(x), Math.floor(y - 0.5)) !== TILE.grass_light) continue;
        m.prop(m.pick(FLOWERS), x, y, { solid: false });
    }
    m.entity('ancient_tree', 'questObject', 13, 11.2, { role: 'tree' });
    m.entity('keeper', 'npc', 18.4, 10.6);
    m.spawn('default', 13, 19.6);
    m.write();
}

// ================================================================ FORGE YARD
function forgeYard() {
    const m = new MapBuilder('forge_yard', 30, 20, { ground: 'dirt', seed: 3, properties: { title: "Blacksmith's Yard" } });
    m.fill(0, 0, 30, 20, ['dirt', 'dirt', 'dirt_dark']);
    m.fill(0, 0, 30, 3, 'wall_stone');
    m.fill(0, 0, 1, 20, 'wall_stone');
    m.fill(29, 0, 1, 20, 'wall_stone');
    m.fill(0, 19, 30, 1, 'wall_stone');
    m.fill(14, 11, 2, 8, 'stone');
    m.prop('forge', 15, 5.6).prop('forge_small', 11, 5.4).prop('cauldron', 19, 5.2);
    m.prop('iron_fence', 6, 4.4).prop('iron_fence', 23.5, 4.4).prop('banner_red', 8.4, 3.9, { solid: false });
    m.prop('hammer', 17, 10.6, { solid: false });
    for (const [x, y] of [[9, 10], [20.5, 8.5], [7, 15], [24, 13.4]]) m.prop(m.pick(['rock_big', 'rock_small', 'rock_flat']), x, y);
    m.prop('barrel_wood', 27, 17.4).prop('barrel', 25.4, 17.6).prop('crate', 2.4, 13.8);
    m.entity('ore', 'questObject', 4, 6.2, { id: 'ore', role: 'ore' });
    m.entity('ore', 'questObject', 26, 5.6, { id: 'ore', role: 'ore' });
    m.entity('ore', 'questObject', 21.6, 16.8, { id: 'ore', role: 'ore' });
    m.entity('anvil', 'questObject', 15, 9.6, { id: 'anvil', role: 'anvil' });
    m.entity('crate', 'questObject', 3.6, 17.2, { id: 'crate', role: 'crate' });
    m.spawn('default', 15, 17.6);
    m.write();
}

village();
lostPath();
royalRoute();
garden();
forgeYard();
console.log(`maps written to ${OUT}`);
