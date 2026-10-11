// WorldScene - the village. Walk around, talk to NPCs, use objects, start quests.
import Phaser from 'phaser';
import { NPCS, OBJECTS } from '../data/npcs.js';
import { NPC } from '../entities/NPC.js';
import { InteractiveObject } from '../entities/InteractiveObject.js';
import { Player } from '../entities/Player.js';
import { CHARACTER_ORIGIN } from '../config/assets.js';
import { depthForY } from '../config/constants.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { MapManager } from '../systems/MapManager.js';
import { QuestStatus } from '../systems/QuestManager.js';
import { services } from '../systems/GameServices.js';

// What each C++ interaction result means for the action-history stack.
const ACTION_FOR_RESULT = {
    CHEST_OPENED: 'OPEN_CHEST',
    CHEST_EMPTY: 'OPEN_CHEST',
    DOOR_OPENED: 'OPEN_DOOR',
    DOOR_OPEN: 'OPEN_DOOR',
    DOOR_LOCKED: 'TRY_DOOR',
};

export class WorldScene extends Phaser.Scene {
    constructor() {
        super('WorldScene');
    }

    create() {
        this.transitioning = false;
        services.audio.attach(this);
        services.audio.playMusic('village');

        this.map = MapManager.load('village', this);
        this.map.render(this);

        const start = services.worldPosition ?? this.map.spawn();
        this.player = new Player(this, start, this.map, {
            look: services.playerLook,
            onMoveSegment: (x, y) => services.history.record('MOVE', `${Math.round(x / 32)},${Math.round(y / 32)}`),
        });

        this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
        this.cameras.main.startFollow(this.player.view, true, 0.15, 0.15);
        this.cameras.main.setRoundPixels(true);
        this.cameras.main.fadeIn(250);

        this.dialogue = new DialogueSystem(this, services, { launchChallenge: q => this.launchChallenge(q) });
        this.interaction = new InteractionSystem(this, this.player, {
            isBlocked: () => this.dialogue.isOpen || this.transitioning,
        });

        this.npcs = [];
        for (const e of this.map.entities) {
            if (e.kind === 'npc') {
                const npc = new NPC(this, NPCS[e.ref], e, n => this.dialogue.talkTo(n));
                this.map.addSolid(e.x - 12, e.y - 12, 24, 24);   // NPCs block movement
                this.npcs.push(npc);
                this.interaction.add(npc);
            } else if (e.kind === 'object') {
                const def = { ...OBJECTS[e.ref], ...(e.sprite ? { sprite: e.sprite } : {}) };
                const obj = this.interaction.add(new InteractiveObject(this, def, e, o => this.useObject(o)));
                const r = obj.solidRect;
                if (r) this.map.addSolid(r.x, r.y, r.w, r.h);
            } else if (e.kind === 'ambient' && this.textures.exists(e.sheet)) {
                // decor villagers: no C++ object, no dialogue
                this.add.sprite(e.x, e.y, e.sheet, e.frame ?? 0).setScale(2)
                    .setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y).setDepth(depthForY(e.y));
                this.map.addSolid(e.x - 10, e.y - 10, 20, 20);
            }
        }
        this.#refreshMarkers();

        const onQuests = () => this.#refreshMarkers();
        services.emitter.on('quests-changed', onQuests);
        this.events.once('shutdown', () => services.emitter.off('quests-changed', onQuests));
    }

    update(_time, delta) {
        this.player.frozen = this.dialogue.isOpen || this.interaction.busy || this.transitioning;
        this.player.update(delta);
        this.interaction.update();
    }

    #refreshMarkers() {
        for (const npc of this.npcs) {
            const q = services.quests.questForGiver(npc.id);
            npc.setQuestMarker(q?.status);
        }
    }

    // Objects are handled by their C++ class: Chest, Door, ...
    async useObject(obj) {
        const { api, history, inventory, events, quests } = services;
        let res;
        try {
            res = await api.oop.interact(obj.id);
        } catch (err) {
            await this.dialogue.say([{ speaker: obj.name, text: `(native engine error: ${err.message})` }]);
            return;
        }
        inventory.apply(res.player);
        history.record(ACTION_FOR_RESULT[res.result.action] ?? 'INTERACT', obj.id);
        for (const g of res.result.itemsGained) events.enqueue('ITEM_GAINED', `${g.item}x${g.count}`);

        // Is this object the entrance to an active quest's challenge?
        const entryQuest = quests.all().find(q => q.entry === obj.id);
        const source = `C++ ${res.entity.type}::interact()  →  ${res.result.action}`;
        if (entryQuest && res.result.success) {
            if (entryQuest.status === QuestStatus.ACTIVE) {
                await this.dialogue.say([{ speaker: obj.name, text: res.result.message, source }]);
                this.launchChallenge(entryQuest);
                return;
            }
            const why = entryQuest.status === QuestStatus.COMPLETED
                ? 'You have already conquered what lies inside.'
                : `Nothing stirs inside. Speak to the ${NPCS[entryQuest.giver].name} first.`;
            await this.dialogue.say([{ speaker: obj.name, text: `${res.result.message} ${why}`, source }]);
            return;
        }
        await this.dialogue.say([{ speaker: obj.name, text: res.result.message, source }]);
    }

    launchChallenge(quest) {
        if (this.transitioning) return;
        this.transitioning = true;
        services.worldPosition = { x: this.player.x, y: this.player.y };
        services.history.record('ENTER_CHALLENGE', quest.id);
        this.cameras.main.fadeOut(250);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('QuestScene', { questId: quest.id }));
    }
}
