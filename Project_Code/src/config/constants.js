// Global tuning values and placeholder colours.
// Placeholder colours are only used when no sprite/tile is configured in assets.js.

export const GAME_WIDTH = 960;   // 3:2, the GBA aspect ratio
export const GAME_HEIGHT = 640;
export const TILE_SIZE = 32;

export const PLAYER_SPEED = 190;          // px / second
export const PLAYER_RADIUS = 13;
export const INTERACT_RADIUS = 60;        // px between player and target centres
export const MOVE_RECORD_DISTANCE = 96;   // px travelled before a MOVE is pushed to the stack

export const DEPTH = {
    terrain: 0,
    decor: 5,
    entities: 10,       // props, NPCs, objects and the player are y-sorted from here (see depthForY)
    fog: 18,
    labels: 20,
    player: 15,
    ui: 1000,
    dialogue: 2000,
    overlay: 3000,
};

// Depth for anything standing on the map: lower on screen = drawn in front.
export function depthForY(y) {
    return DEPTH.entities + y / 10000;
}

export const COLORS = {
    player: 0xffffff,
    playerOutline: 0x1d3557,
    npcOutline: 0x111111,
    object: 0xc68642,
    objective: 0xffd60a,
    text: '#ffffff',
    textDark: '#1b1b1b',
    textMuted: '#c9d1d9',
    panel: 0x14213d,
    panelBorder: 0xe5c07b,
    good: 0x52b788,
    bad: 0xe63946,
    accent: 0xe5c07b,
    graphEdge: 0x8d99ae,
    graphNode: 0xedf2f4,
    graphFog: 0x3a3f4b,
    bfs: 0xffd60a,
    dfs: 0xc77dff,
    route: 0xff7b00,
};

export const FONT = {
    family: 'monospace',
};

// Text style helper so every placeholder label looks the same.
export function textStyle(size = 14, color = COLORS.text, extra = {}) {
    return { fontFamily: FONT.family, fontSize: `${size}px`, color, ...extra };
}
