// Graphs derived from the real Tiled maps, exactly as the game derives them
// (systems/MapGraph.js), for tests that need them without Phaser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTileGrid, mapProperties, parseZones } from '../src/systems/MapData.js';
import { deriveGraph } from '../src/systems/MapGraph.js';
import { ART_SCALE } from '../src/config/assets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadMap(file) {
    return JSON.parse(readFileSync(join(root, 'assets', 'maps', file), 'utf8'));
}

function graphOf(file, options) {
    const json = loadMap(file);
    const props = mapProperties(json);
    const g = deriveGraph(buildTileGrid(json), parseZones(json), { ...options, scale: ART_SCALE });
    return { ...g, start: props.start, goal: props.goal, json };
}

export const whisperingWoods = graphOf('lost_path.json', { weighted: false });
