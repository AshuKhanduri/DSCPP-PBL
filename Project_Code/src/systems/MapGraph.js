// MapGraph - derives the graph the C engine searches FROM the playable map.
//
//   Tiled map -> walkable / blocked tile grid -> zones (Nodes layer)
//             -> graph { nodes, edges } -> BFS / DFS in C
//
// Why zones and not one node per tile: the C engine accepts at most 256 nodes,
// and a 50x50 map has 2500 tiles. So each clearing / town is a NODE, and an
// EDGE exists exactly when a walkable corridor connects two zones without
// passing through a third one. That is the same rule the player experiences:
// if you can walk from A to B without entering another zone, A-B is an edge.
//
// Edge weight (weighted maps): the corridor is measured as the shortest
// 4-connected tile path from zone centre to zone centre, and every tile adds
// its terrain factor (road 1, forest 1.6, ...). weight = ceil(sum * tilePx / hscale).
// Because a 4-connected path is never shorter than the straight line and every
// factor is >= 1, weight >= euclidean / hscale for every edge: the A* heuristic
// (euclidean / hscale) is consistent, so A* stays optimal on derived graphs.
//
// The flood fills below only BUILD the graph (like compiling a nav-mesh);
// every search the game reports runs in the C engine.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function deriveGraph(grid, zones, { weighted = false, factors = {}, hscale = 1, scale = 1 } = {}) {
    const { cols, rows, blocked, terrain } = grid;
    const tilePx = grid.tileWidth * scale;   // game pixels per tile
    const idx = (x, y) => y * cols + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

    // zoneOf[i] = zone index for walkable tiles inside a zone rectangle
    const zoneOf = new Int32Array(cols * rows).fill(-1);
    zones.forEach((z, zi) => {
        for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
            if (inside(x, y) && !blocked[idx(x, y)]) zoneOf[idx(x, y)] = zi;
        }
    });

    // Connected components of walkable, non-zone tiles (the corridors).
    const comp = new Int32Array(cols * rows).fill(-1);
    const touching = [];   // component -> Set(zone index)
    let nComp = 0;
    for (let i = 0; i < cols * rows; i++) {
        if (blocked[i] || zoneOf[i] >= 0 || comp[i] >= 0) continue;
        const touch = new Set();
        const stack = [i];
        comp[i] = nComp;
        while (stack.length) {
            const c = stack.pop();
            const cx = c % cols, cy = (c - cx) / cols;
            for (const [dx, dy] of DIRS) {
                const nx = cx + dx, ny = cy + dy;
                if (!inside(nx, ny)) continue;
                const n = idx(nx, ny);
                if (blocked[n]) continue;
                if (zoneOf[n] >= 0) { touch.add(zoneOf[n]); continue; }
                if (comp[n] < 0) { comp[n] = nComp; stack.push(n); }
            }
        }
        touching.push(touch);
        nComp++;
    }

    // Candidate pairs: zones sharing a corridor, or zones directly adjacent.
    const pairs = new Map();   // "a|b" -> Set(component index, or -1 = direct)
    const addPair = (a, b, c) => {
        if (a === b) return;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!pairs.has(key)) pairs.set(key, new Set());
        pairs.get(key).add(c);
    };
    touching.forEach((set, c) => {
        const list = [...set];
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) addPair(list[i], list[j], c);
    });
    for (let i = 0; i < cols * rows; i++) {
        if (zoneOf[i] < 0) continue;
        const x = i % cols, y = (i - x) / cols;
        for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (inside(nx, ny) && zoneOf[idx(nx, ny)] >= 0) addPair(zoneOf[i], zoneOf[idx(nx, ny)], -1);
        }
    }

    const centre = zi => {
        const z = zones[zi];
        const cx = Math.floor(z.x + z.w / 2), cy = Math.floor(z.y + z.h / 2);
        if (zoneOf[idx(cx, cy)] === zi) return idx(cx, cy);
        // centre tile blocked (e.g. a statue): nearest walkable tile of the zone
        let best = -1, bestD = Infinity;
        for (let i = 0; i < cols * rows; i++) {
            if (zoneOf[i] !== zi) continue;
            const x = i % cols, y = (i - x) / cols, d = (x - cx) ** 2 + (y - cy) ** 2;
            if (d < bestD) { best = i; bestD = d; }
        }
        return best;
    };

    // Shortest tile path centre(a) -> centre(b) through zones a, b and corridor c.
    const corridorPath = (a, b, c) => {
        const allowed = i => !blocked[i] && (zoneOf[i] === a || zoneOf[i] === b || (c >= 0 && comp[i] === c));
        const start = centre(a), goal = centre(b);
        if (start < 0 || goal < 0) return null;
        const prev = new Int32Array(cols * rows).fill(-2);
        prev[start] = -1;
        const queue = [start];
        for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi];
            if (cur === goal) break;
            const x = cur % cols, y = (cur - x) / cols;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx, ny = y + dy;
                if (!inside(nx, ny)) continue;
                const n = idx(nx, ny);
                if (prev[n] !== -2 || !allowed(n)) continue;
                prev[n] = cur;
                queue.push(n);
            }
        }
        if (prev[goal] === -2) return null;
        const path = [];
        for (let i = goal; i !== -1; i = prev[i]) path.push(i);
        return path.reverse();
    };

    const edges = [];
    for (const [key, comps] of pairs) {
        const [a, b] = key.split('|').map(Number);
        let best = null;
        for (const c of comps) {
            const path = corridorPath(a, b, c);
            if (!path) continue;
            let sum = 0;
            const counts = {};
            for (const i of path.slice(1)) {
                const t = terrain[i] ?? 'road';
                sum += factors[t] ?? 1;
                if (zoneOf[i] < 0) counts[t] = (counts[t] ?? 0) + 1;
            }
            const weight = weighted ? Math.ceil((sum * tilePx) / hscale) : 1;
            if (!best || weight < best.weight || (weight === best.weight && path.length < best.path.length)) {
                const main = Object.entries(counts).sort((p, q) => q[1] - p[1])[0]?.[0] ?? 'road';
                best = { weight, path, terrain: main };
            }
        }
        if (!best) continue;
        edges.push({
            from: zones[a].id,
            to: zones[b].id,
            weight: best.weight,
            terrain: best.terrain,
            tiles: best.path.length,
            // world-pixel polyline along the real corridor (for drawing results)
            points: best.path.map(i => {
                const x = i % cols, y = (i - x) / cols;
                return { x: (x + 0.5) * tilePx, y: (y + 0.5) * tilePx };
            }),
        });
    }
    // Deterministic order (zone order in the Nodes layer): DFS follows it.
    const order = new Map(zones.map((z, i) => [z.id, i]));
    edges.sort((e, f) => order.get(e.from) - order.get(f.from) || order.get(e.to) - order.get(f.to));

    const nodes = zones.map((z, zi) => {
        const c = centre(zi);
        const x = c % cols, y = (c - x) / cols;
        return { id: z.id, label: z.label, x: (x + 0.5) * tilePx, y: (y + 0.5) * tilePx, zone: z };
    });
    return { nodes, edges };
}

// Which zone (index into zones) contains world point (x, y)? -1 if none.
export function zoneAt(zones, x, y, tilePx) {
    const tx = Math.floor(x / tilePx), ty = Math.floor(y / tilePx);
    return zones.findIndex(z => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h);
}

// Graph of a loaded GameMap; start / goal come from the map's properties.
export function graphForMap(gameMap, options = {}) {
    const g = deriveGraph(gameMap.grid, gameMap.zones, { ...options, scale: gameMap.scale });
    return { ...g, start: gameMap.properties.start, goal: gameMap.properties.goal };
}
