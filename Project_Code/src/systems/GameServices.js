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
import { Adventure, bonusLocationIds, journeyStats } from './Adventure.js';
import { ENDING } from '../data/ending.js';
import { OnlineApi } from '../net/OnlineApi.js';
import { scoreKeeper } from './ScoreKeeper.js';
import { computeScore } from '../data/scoring.js';

class GameServices {
    constructor() {
        this.emitter = new Phaser.Events.EventEmitter();
        this.api = new NativeApi();
        this.online = new OnlineApi();  // leaderboard + feedback (own client: its errors never mark the engines offline)
        this.score = scoreKeeper;       // first-try answers, counted by the lesson walkthroughs
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
        // Player profile: the end screen reads the name from here (Adventure.playerName).
        // Set when the player types a name to save their score on the leaderboard.
        this.profile = { name: null };
        this.adventure = new Adventure();
        this.bonusIds = [];             // optional coin locations on the village map

        // when the last main quest completes, tell the player to return to the King (once)
        this.emitter.on('quests-changed', q => {
            if (!this.adventure.announced && this.adventure.isEndingDue(q.all())) {
                this.adventure.announced = true;
                this.events.enqueue('ADVENTURE_READY', ENDING.giver);
            }
        });

        this.api.client.onStatusChange(online => this.emitter.emit('native-status', online));

        // The server dropped this tab's game (idle too long / restarted): say so,
        // then reload to the title screen, which starts a fresh session.
        this.api.client.onSessionExpired(() => {
            if (this.sessionExpired) return;
            this.sessionExpired = true;
            this.emitter.emit('session-expired');
            setTimeout(() => window.location.reload(), 4000);
        });
    }

    // Start a fresh session: reset native state, build the quest linked list,
    // and create every world entity as a C++ object. The village map (Tiled,
    // Entities layer) says which NPCs/objects exist and where.
    async newGame(scene) {
        this.adventure.reset();
        this.score.reset();
        await this.quests.newGame();
        const entities = MapManager.load('village', scene).entities;
        this.bonusIds = bonusLocationIds(entities, OBJECTS);
        const specs = entities
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

    // Statistics for the end screen, read from the C quest chain and the C++ objects.
    async journeyStats() {
        const [entities] = await Promise.all([this.api.oop.list(), this.inventory.refresh()]);
        return journeyStats({
            profile: this.profile,
            quests: this.quests.all(),
            bonusIds: this.bonusIds,
            cppEntities: entities.entities,
            player: this.inventory.player,
        });
    }

    // What the leaderboard receives for this journey (the server recomputes the score).
    leaderboardRun(stats) {
        const run = {
            name: stats.name,
            questsCompleted: stats.questsCompleted,
            questsTotal: stats.questsTotal,
            bonusCoins: stats.bonusCoins,
            ...this.score.stats,
            timeMs: Math.round(this.adventure.elapsedMs),
            look: this.playerLook,
        };
        return { ...run, score: computeScore(run) };
    }

    setChallengeBanner(banner) {
        this.challengeBanner = banner;
        this.emitter.emit('challenge-banner', banner);
    }
}

export const services = new GameServices();
