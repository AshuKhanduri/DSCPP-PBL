// NPC definitions. `cppType` is the C++ class instantiated in the OOP engine
// (Guide, King, Blacksmith, Librarian, Guard) - its virtual greeting() is
// what the NPC says first when you talk to it.
// Positions are NOT here: the Tiled maps place NPCs and objects (Entities
// layer, see data/world.js). Sprites are chosen in config/assets.js (NPCs) and
// by `sprite` below (objects; names from src/data/assetCatalog.js).

export const NPCS = {
    guide: {
        id: 'guide',
        name: 'Guide',
        cppType: 'Guide',
        color: 0x2a9d8f,
        idle: ['The village is safe. The woods... less so.'],
        locked: ['Not yet, friend. Finish what you have started first.'],
    },
    king: {
        id: 'king',
        name: 'King Aldric',
        cppType: 'King',
        color: 0xe9c46a,
        idle: ['My kingdom thanks you.'],
        locked: ['The crown has no task for you yet. Help my people first.'],
    },
    blacksmith: {
        id: 'blacksmith',
        name: 'Blacksmith',
        cppType: 'Blacksmith',
        color: 0xe76f51,
        idle: ['Clang. Clang. Clang.'],
        locked: ['Busy right now. Come back when the Guide and the King are done with you.'],
    },
    librarian: {
        id: 'librarian',
        name: 'Librarian',
        cppType: 'Librarian',
        color: 0x9d4edd,
        idle: ['Shh.'],
        locked: ['The archive is closed for cataloguing. Come back later.'],
    },
    guard: {
        id: 'guard',
        name: 'Tower Guard',
        cppType: 'Guard',
        color: 0x457b9d,
        idle: ['All quiet at the Tower.'],
        locked: ['The Tower is not for the unproven. Earn the King\'s favour first.'],
    },
};

// Interactive objects in the world. `cppType` + `param` build the C++ object
// (Door requires an item, Chest = item:count:gold, QuestObject = collect/deliver).
export const OBJECTS = {
    old_chest: {
        id: 'old_chest',
        name: 'Old Chest',
        cppType: 'Chest',
        param: 'Map_Fragment:1:25',
        color: 0xb5651d,
        shape: 'square',
        verb: 'Open',
        sprite: 'chest',
    },
    tower_door: {
        id: 'tower_door',
        name: 'Tower Door',
        cppType: 'Door',
        param: 'Royal_Seal',
        color: 0x6c584c,
        shape: 'square',
        verb: 'Enter',
        size: 30,
        sprite: 'dungeon_door',
    },
    well: {
        id: 'well',
        name: 'Village Well',
        cppType: 'Chest',
        param: 'Lucky_Coin:1:5',
        color: 0x5c677d,
        shape: 'circle',
        verb: 'Search',
        sprite: 'well',
    },
};
