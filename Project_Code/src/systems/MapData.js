// MapData - pure functions over a Tiled JSON export (no Phaser), so the same
// code runs in the browser, in scripts/build-maps.mjs and in the Node tests.
//
// Tiled conventions used by every QuestForge map:
//   tile layers      Ground (+ any others) - drawn; tiles whose tileset
//                    properties say `collides: true` block movement, and a
//                    `terrain` property (road/forest/hills/marsh) sets cost
//   "Blocked"        tile layer: invisible collision painted in Tiled
//   "Props"          tile objects (gid) from the "props" image collection;
//                    custom property `key` = texture key
//   "Collision"      rectangles that block movement (prop footprints)
//   "Entities"       points: `ref`/`kind` (+ any extra properties)
//   "Spawns"         points: name = spawn name
//   "Nodes"          rectangles: graph zones (name = node id, property `label`)

const props = obj => Object.fromEntries((obj?.properties ?? []).map(p => [p.name, p.value]));
const objectLayer = (json, name) => json.layers.find(l => l.type === 'objectgroup' && l.name === name)?.objects ?? [];

// Spawns, entities and collision rectangles, in game pixels (`scale` = game px per map px).
export function parseTiledObjects(json, scale = 1) {
    const spawns = {};
    for (const o of objectLayer(json, 'Spawns')) spawns[o.name || 'default'] = { x: o.x * scale, y: o.y * scale };
    const entities = objectLayer(json, 'Entities').map(o => {
        const { ref, kind, ...extra } = props(o);
        return { ref: ref ?? o.name, kind: kind ?? 'npc', x: o.x * scale, y: o.y * scale, ...extra };
    });
    const solids = objectLayer(json, 'Collision').map(o => ({ x: o.x * scale, y: o.y * scale, w: o.width * scale, h: o.height * scale }));
    return { spawns, entities, solids };
}

// Tile objects in the Props layer -> { key, x, y (bottom-left, game px), w, h }.
export function parseProps(json, scale = 1) {
    return objectLayer(json, 'Props').filter(o => o.gid).map(o => ({
        key: props(o).key,
        name: o.name,
        x: o.x * scale,
        y: o.y * scale,
        w: o.width * scale,
        h: o.height * scale,
    }));
}

// Graph zones (rectangles in the Nodes layer), in TILE units.
export function parseZones(json) {
    const tw = json.tilewidth, th = json.tileheight;
    return objectLayer(json, 'Nodes').map(o => ({
        id: o.name,
        label: props(o).label ?? o.name,
        x: Math.round(o.x / tw),
        y: Math.round(o.y / th),
        w: Math.round(o.width / tw),
        h: Math.round(o.height / th),
    }));
}

export function mapProperties(json) {
    return props(json);
}

// Per-tile tileset properties, keyed by gid.
function tilePropertyIndex(json) {
    const index = new Map();
    for (const ts of json.tilesets ?? []) {
        for (const t of ts.tiles ?? []) index.set(ts.firstgid + t.id, props(t));
    }
    return index;
}

// Walkable/terrain grid built from the tile layers and the Collision rectangles.
//   blocked[i] = 1 if tile i cannot be walked on (water, walls, Blocked layer,
//                or a Collision rectangle covering the tile centre)
//   terrain[i] = terrain name of the top-most tile with a `terrain` property
export function buildTileGrid(json) {
    const cols = json.width, rows = json.height;
    const tw = json.tilewidth, th = json.tileheight;
    const blocked = new Uint8Array(cols * rows);
    const terrain = new Array(cols * rows).fill(null);
    const tileProps = tilePropertyIndex(json);
    for (const layer of json.layers) {
        if (layer.type !== 'tilelayer') continue;
        const isBlockedLayer = layer.name === 'Blocked';
        layer.data.forEach((gid, i) => {
            if (!gid) return;
            if (isBlockedLayer) { blocked[i] = 1; return; }
            const p = tileProps.get(gid);
            if (p?.collides) blocked[i] = 1;
            if (p?.terrain) terrain[i] = p.terrain;
        });
    }
    for (const r of objectLayer(json, 'Collision')) {
        const x0 = Math.max(0, Math.floor(r.x / tw)), x1 = Math.min(cols - 1, Math.floor((r.x + r.width) / tw));
        const y0 = Math.max(0, Math.floor(r.y / th)), y1 = Math.min(rows - 1, Math.floor((r.y + r.height) / th));
        for (let ty = y0; ty <= y1; ty++) {
            for (let tx = x0; tx <= x1; tx++) {
                const cx = (tx + 0.5) * tw, cy = (ty + 0.5) * th;
                if (cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) blocked[ty * cols + tx] = 1;
            }
        }
    }
    return { cols, rows, tileWidth: tw, tileHeight: th, blocked, terrain };
}
