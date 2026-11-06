// Blacksmith's Challenge - a small task in the forge yard (Tiled map
// assets/maps/forge_yard.json; ore / anvil / crate are its questObject entities).
//
// Every object here is created as a C++ object for this attempt:
//   ore veins    QuestObject  (collect:Iron_Ore)
//   anvil        QuestObject  (deliver:Iron_Ore:3:Iron_Sword)
//   supply crate Chest        (Coal:2:10)
// Pressing E calls the same virtual interact() on each; the C++ class decides
// what happens. The anvil only accepts the delivery when the C++ Player
// really holds enough ore.
import { InteractiveObject } from '../entities/InteractiveObject.js';
import { DEPTH, textStyle } from '../config/constants.js';
import { RoamingChallenge } from './RoamingChallenge.js';

const ROLES = {
    ore: { name: 'Iron Ore Vein', cppType: 'QuestObject', param: 'collect:Iron_Ore', verb: 'Mine', objective: true, shape: 'circle', sprite: 'rock_big' },
    anvil: { name: 'Anvil', cppType: 'QuestObject', param: null, verb: 'Use', color: 0x495057, size: 34, sprite: 'anvil' },
    crate: { name: 'Supply Crate', cppType: 'Chest', param: 'Coal:2:10', verb: 'Open', color: 0xb5651d, sprite: 'chest' },
};

export class ForgeChallenge extends RoamingChallenge {
    create() {
        this.setupMap(this.quest.config.map);
        this.needed = this.quest.config.ore;
        this.collected = 0;
        this.attempt = Date.now().toString(36);
        this.createdIds = [];

        this.hint = this.scene.add.text(480, 600, 'Mine the glowing ore veins, then use the anvil.  (E to interact)',
            textStyle(13, '#ffffff', { backgroundColor: '#0d1b2acc', padding: { x: 8, y: 4 } })).setOrigin(0.5).setDepth(DEPTH.ui).setScrollFactor(0);

        this.#spawnObjects().catch(err => this.flash(`Could not create C++ objects: ${err.message}`, '#e63946'));
    }

    async #spawnObjects() {
        let n = 0;
        const specs = [];
        const placements = [];
        for (const e of this.map.entities) {
            const role = ROLES[e.role];
            const id = `${e.id}${++n}_${this.attempt}`;
            const param = e.role === 'anvil' ? `deliver:Iron_Ore:${this.needed}:Iron_Sword` : role.param;
            specs.push({ type: role.cppType, id, x: e.x, y: e.y, param, name: role.name });
            placements.push({ e, role, id });
        }
        await this.api.oop.createBatch(specs);
        this.createdIds = placements.map(p => p.id);
        for (const { e, role, id } of placements) {
            const obj = new InteractiveObject(this.scene, { id, ...role, label: role.name }, e, o => this.#use(o, e.role));
            this.interaction.add(obj);
            const r = obj.solidRect;
            if (r) this.map.addSolid(r.x, r.y, r.w, r.h);
        }
    }

    async #use(obj, role) {
        const { history, inventory, events, quests } = this.services;
        const res = await this.api.oop.interact(obj.id);
        inventory.apply(res.player);
        const r = res.result;
        history.record(role === 'ore' ? 'MINE_ORE' : role === 'anvil' ? 'USE_ANVIL' : 'OPEN_CHEST', obj.id.split('_')[0]);
        for (const g of r.itemsGained) events.enqueue('ITEM_GAINED', `${g.item}x${g.count}`);

        if (r.action === 'ITEM_COLLECTED') {
            this.collected++;
            obj.disable('(mined)');
            quests.setProgress(this.quest.id, Math.min(this.collected, this.needed), this.needed);
        }
        if (role === 'crate' && r.success) obj.disable('(empty)');

        await this.dialogue.say([{ speaker: obj.name, text: r.message, source: `C++ ${res.entity.type}::interact() → ${r.action}` }]);

        if (r.action === 'ITEM_DELIVERED') {
            const ore = res.player.inventory.find(i => i.item === 'Iron_Ore')?.count ?? 0;
            this.finish({
                success: true,
                title: 'The blade is forged!',
                lines: [
                    `Ore mined: ${this.collected}`,
                    `Delivered: ${this.needed} x Iron Ore`,
                    'Received: Iron Sword',
                    ore ? `Iron Ore left in pack: ${ore}` : '',
                    '',
                    'Behind the scenes (C++):',
                    '  GameEntity* e = find(id);',
                    '  e->interact(player);   // virtual',
                    '',
                    'QuestObject (collect) gave ore,',
                    'Chest gave coal and gold once,',
                    'QuestObject (deliver) checked the',
                    'Player\'s private inventory through',
                    'countItem()/removeItem() before',
                    'handing over the sword.',
                ],
            });
        }
    }

    destroy() {
        // Remove this attempt's C++ objects (fire and forget).
        for (const id of this.createdIds ?? []) this.api.oop.remove(id).catch(() => {});
    }
}
