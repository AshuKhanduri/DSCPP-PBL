// MapManager - turns a Tiled map into a GameMap: something that can be drawn,
// that answers "is this rectangle blocked?", and that lists spawns, entities,
// props and graph zones. Gameplay code only ever talks to GameMap.
//
// Visual layers (Ground tiles, Props images) and collision data (Blocked
// tiles, colliding tile properties, Collision rectangles) are separate in the
// map; all collision questions go through one tile grid + rectangle list, the
// same grid systems/MapGraph.js derives the quest graphs from.
import { ART_SCALE, TILESETS } from '../config/assets.js';
import { DEPTH, depthForY } from '../config/constants.js';
import { TERRAIN_FACTOR } from '../data/graphs.js';
import { MAPS } from '../data/world.js';
import { buildTileGrid, mapProperties, parseProps, parseTiledObjects, parseZones } from './MapData.js';

export { parseTiledObjects } from './MapData.js';

export class GameMap {
    constructor({ id, json, scale }) {
        const objects = parseTiledObjects(json, scale);
        this.id = id;
        this.json = json;
        this.scale = scale;
        this.grid = buildTileGrid(json);
        this.tilePx = json.tilewidth * scale;            // game px per tile
        this.width = json.width * this.tilePx;
        this.height = json.height * this.tilePx;
        this.spawns = objects.spawns;
        this.entities = objects.entities;
        this.solids = objects.solids;                    // [{x, y, w, h}] game px
        this.props = parseProps(json, scale);
        this.zones = parseZones(json);                   // tile units
        this.properties = mapProperties(json);
    }

    render(scene) {
        const tilemap = scene.make.tilemap({ key: MAPS[this.id].tilemapKey });
        const tilesets = Object.entries(TILESETS).map(([name, key]) => tilemap.addTilesetImage(name, key)).filter(Boolean);
        tilemap.layers.forEach((l, i) => {
            const layer = tilemap.createLayer(l.name, tilesets, 0, 0);
            if (!layer) return;
            layer.setScale(this.scale).setDepth(DEPTH.terrain + i * 0.01);
            if (l.name === 'Blocked') layer.setVisible(false);   // collision only
        });
        // Props: y-sorted with characters so you can walk behind a tree.
        for (const p of this.props) {
            if (!scene.textures.exists(p.key)) continue;
            scene.add.image(p.x, p.y, p.key).setOrigin(0, 1).setScale(this.scale).setDepth(depthForY(p.y));
        }
    }

    spawn(name = 'default') {
        return this.spawns[name] ?? this.spawns.default ?? { x: this.width / 2, y: this.height / 2 };
    }

    // Runtime blockers (NPC bodies, object footprints) on top of the map's own collision.
    addSolid(x, y, w, h) {
        this.solids.push({ x, y, w, h });
    }

    tileBlocked(tx, ty) {
        const { cols, rows, blocked } = this.grid;
        return tx < 0 || ty < 0 || tx >= cols || ty >= rows || blocked[ty * cols + tx] === 1;
    }

    // Axis-aligned rectangle (centre x/y, half sizes) against tiles, solids and bounds.
    isBlocked(cx, cy, halfW, halfH) {
        const l = cx - halfW, r = cx + halfW, t = cy - halfH, b = cy + halfH;
        if (l < 0 || t < 0 || r > this.width || b > this.height) return true;
        const tp = this.tilePx;
        for (let ty = Math.floor(t / tp); ty <= Math.floor(b / tp); ty++) {
            for (let tx = Math.floor(l / tp); tx <= Math.floor(r / tp); tx++) if (this.tileBlocked(tx, ty)) return true;
        }
        for (const s of this.solids) {
            if (l < s.x + s.w && r > s.x && t < s.y + s.h && b > s.y) return true;
        }
        return false;
    }

    terrainAt(x, y) {
        const tx = Math.floor(x / this.tilePx), ty = Math.floor(y / this.tilePx);
        return this.grid.terrain[ty * this.grid.cols + tx] ?? null;
    }

    // Movement speed multiplier. Only maps with the `terrainSpeed` property
    // slow the player on costly terrain.
    speedFactor(x, y) {
        if (!this.properties.terrainSpeed) return 1;
        return 1 / (TERRAIN_FACTOR[this.terrainAt(x, y)] ?? 1);
    }
}

export class MapManager {
    // Load a map by id. Needs the scene for the tilemap cache (BootScene loads them).
    static load(id, scene) {
        const def = MAPS[id];
        if (!def) throw new Error(`Unknown map "${id}"`);
        const cached = scene.cache.tilemap.get(def.tilemapKey);
        if (!cached) throw new Error(`Map "${id}" (${def.file}) is not loaded. Run "node scripts/build-maps.mjs".`);
        return new GameMap({ id, json: cached.data, scale: ART_SCALE });
    }
}
