// GameServices - game-wide systems shared by every scene.
// Scenes are created and destroyed; these objects live for the whole session.
import Phaser from 'phaser';

import { NativeApi } from '../net/NativeApi.js';
import { QUESTS } from '../data/quests.js';
import { NPCS, OBJECTS } from '../data/npcs.js';
import { MapManager } from './MapManager.js';
import { ActionHistory } from './ActionHistory.js';
import { EventQueue } from './EventQueue.js';
import { InventorySystem } from './InventorySystem.js';
import { QuestManager } from './QuestManager.js';
import { AudioManager } from './AudioManager.js';

class GameServices {
    constructor() {
        this.emitter = new Phaser.Events.EventEmitter();
        this.api = new NativeApi();
        this.history = new ActionHistory(this.api, this.emitter);
        this.events = new EventQueue(this.api, this.emitter);
        this.inventory = new InventorySystem(this.api, this.emitter);
        this.quests = new QuestManager(this.api, this.emitter, {
            quests: QUESTS,
            history: this.history,
            events: this.events,
            inventory: this.inventory,
        });
        this.audio = new AudioManager();
        this.worldPosition = null;      // where to put the player when returning to the world
        this.playerLook = 'male';       // 'male' | 'female', chosen on the title screen
        this.challengeBanner = null;    // shown by the HUD while in a challenge

        this.api.client.onStatusChange(online => this.emitter.emit('native-status', online));
    }

    // Start a fresh session: reset native state, build the quest linked list,
    // and create every world entity as a C++ object. The village map (Tiled,
    // Entities layer) says which NPCs/objects exist and where.
    async newGame(scene) {
        await this.quests.newGame();
        const specs = MapManager.load('village', scene).entities
            .filter(e => e.kind === 'npc' || e.kind === 'object')
            .map(e => {
                const def = e.kind === 'npc' ? NPCS[e.ref] : OBJECTS[e.ref];
                return { type: def.cppType, id: def.id, x: e.x, y: e.y, param: def.param ?? null, name: def.name };
            });
        await this.api.oop.createBatch(specs);
        await this.inventory.refresh();
        this.worldPosition = null;
        this.history.record('NEW_GAME');
        this.events.enqueue('WELCOME', 'QuestForge');
    }

    setChallengeBanner(banner) {
        this.challengeBanner = banner;
        this.emitter.emit('challenge-banner', banner);
    }
}

export const services = new GameServices();
