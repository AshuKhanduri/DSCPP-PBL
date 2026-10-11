// Graph settings for the graph challenges.
//
// The graphs themselves are NOT written here any more: they are derived from
// the playable Tiled map (assets/maps/lost_path.json) by
// systems/MapGraph.js - zones in the "Nodes" layer become nodes, walkable
// corridors between them become edges. The derived graph is what is sent to
// the C engine ({ nodes: [{id,x,y}], edges: [{from,to,weight}] }).

// Cost of one tile by terrain, for weighted graphs. Maps with the
// `terrainSpeed` property also slow the player down on costly terrain.
export const TERRAIN_FACTOR = { road: 1, forest: 1.6, hills: 2.0, marsh: 2.6 };
export const TERRAIN_COLOR = { road: 0xc2a878, forest: 0x2d6a4f, hills: 0x9c6644, marsh: 0x4d908e };

// Strip UI-only fields before sending to the server.
export function toApiGraph(graph) {
    return {
        directed: false,
        nodes: graph.nodes.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })),
        edges: graph.edges.map(({ from, to, weight }) => ({ from, to, weight })),
    };
}
