// Asset configuration - the single place gameplay code gets art from.
//
// Every image is cut from the reference sheet (assets/reference/) by
// scripts/extract_assets.py, which also writes src/data/assetCatalog.js
// (url, size, collision footprint of each file). Maps are Tiled JSON built by
// scripts/build-maps.mjs. Gameplay code refers to asset IDs/keys below, never
// to file paths. Files in assets/ are served from the site root.
import { ASSET_CATALOG as C } from '../data/assetCatalog.js';

const list = group => Object.values(C[group]).map(a => ({ key: a.key, url: a.url }));

export const ASSET_MANIFEST = {
    images: [
        { key: C.terrain.key, url: C.terrain.url },
        ...list('props'),
        ...list('objects'),
        ...list('items'),
        ...list('ui'),
    ],
    spritesheets: Object.values(C.characters).map(c => ({ key: c.key, url: c.url, frameWidth: c.frameWidth, frameHeight: c.frameHeight })),
    tilemaps: [
        { key: 'map.village', url: 'maps/village.json' },
        { key: 'map.lostPath', url: 'maps/lost_path.json' },
    ],
    audio: [
        // No audio exists yet. AudioManager silently skips missing sounds.
        // { key: 'sfx.talk', url: 'audio/talk.ogg' },
    ],
};

// Tiled tileset name -> texture key (MapManager.addTilesetImage).
export const TILESETS = { terrain: C.terrain.key };

// Game pixels per art pixel: 16px art is drawn at 32px (nearest-neighbour).
export const ART_SCALE = 2;

// Player looks (chosen on the title screen). Sheet rows: down, left, right, up;
// 4 frames per row (the reference README says 3, the drawn sheet has 4).
export const PLAYER_LOOKS = {
    male: { texture: 'player.male', label: 'Hero' },
    female: { texture: 'player.female', label: 'Heroine' },
};
export const PLAYER_ANIM = { rows: ['down', 'left', 'right', 'up'], framesPerRow: 4, fps: 8 };

// NPC id -> sprite sheet (frames: 0 = down, 1 = side, 2 = up). The reference
// has no King, so the King uses the Elder (robed, white-bearded).
export const SPRITES = {
    npc: {
        guide: { texture: 'npc.guide', frame: 0 },
        king: { texture: 'npc.elder', frame: 0 },
        blacksmith: { texture: 'npc.blacksmith', frame: 0 },
        librarian: { texture: 'npc.librarian', frame: 0 },
        guard: { texture: 'npc.guard', frame: 0 },
    },
};

// Characters stand on their feet: origin near the bottom of the 16x24 frame.
export const CHARACTER_ORIGIN = { x: 0.5, y: 0.78 };

// Sprite name (from the catalog) -> texture key + footprint, for objects
// placed by maps / challenges (e.g. `sprite: 'chest'` on an entity).
export function objectSprite(name) {
    const a = C.objects[name] ?? C.props[name] ?? C.items[name];
    return a ? { texture: a.key, solid: a.solid, w: a.w, h: a.h } : null;
}

// Item id (C++ inventory) -> icon texture key.
export const ITEM_ICONS = {
    Guide_Lantern: 'obj.flame',
    Royal_Map: 'item.map',
    Archive_Key: 'item.key',
    Royal_Seal: 'item.coin_gold',
    Trial_Crown: 'item.ingot_gold',
    Iron_Ore: 'item.ore',
    Iron_Sword: 'obj.hammer',
    Coal: 'item.ingot_iron',
    Map_Fragment: 'item.scroll',
    Lucky_Coin: 'item.coin_copper',
    gold: 'item.coin_gold',
};

export const UI = {
    dialogFrame: 'ui.dialog_frame',
    dialogArrow: 'ui.dialog_arrow',
    iconQuest: 'ui.icon_quest',
    iconCheck: 'ui.icon_check',
    iconItem: 'item.key',
};

// Sound keys used by AudioManager. Missing sounds are silently skipped.
export const SOUNDS = {
    talk: 'sfx.talk',
    reward: 'sfx.reward',
    error: 'sfx.error',
    step: 'sfx.step',
    music: { village: 'music.village' },
};
