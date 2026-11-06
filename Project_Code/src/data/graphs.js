// Graph settings for the graph challenges.
//
// The graphs themselves are NOT written here any more: they are derived from
// the playable Tiled maps (assets/maps/lost_path.json, royal_route.json) by
// systems/MapGraph.js - zones in the "Nodes" layer become nodes, walkable
// corridors between them become edges. The derived graph is what is sent to
// the C engine ({ nodes: [{id,x,y}], edges: [{from,to,weight}] }).

// Royal Route: cost of one tile of road by terrain (factor >= 1 keeps A*'s
// straight-line heuristic consistent). The player also walks slower on
// costly terrain, so the cost is felt, not only computed.
export const TERRAIN_FACTOR = { road: 1, forest: 1.6, hills: 2.0, marsh: 2.6 };
export const TERRAIN_COLOR = { road: 0xc2a878, forest: 0x2d6a4f, hills: 0x9c6644, marsh: 0x4d908e };

// Game pixels per unit of travel cost (2 tiles of 32px). A* heuristic =
// straight-line distance / ROYAL_HSCALE.
export const ROYAL_HSCALE = 64;

// Strip UI-only fields before sending to the server.
export function toApiGraph(graph) {
    return {
        directed: false,
        nodes: graph.nodes.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })),
        edges: graph.edges.map(({ from, to, weight }) => ({ from, to, weight })),
    };
}
