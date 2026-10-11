// InteractionSystem - one system for every NPC and object.
// Each frame it finds the nearest interactable within INTERACT_RADIUS, shows
// "E — <promptText>", and on E calls target.interact(). It knows nothing about
// what a Guide or a Chest does.
import Phaser from 'phaser';
import { INTERACT_RADIUS } from '../config/constants.js';
import { InteractionPrompt } from '../ui/InteractionPrompt.js';

export class InteractionSystem {
    constructor(scene, player, { isBlocked = () => false } = {}) {
        this.scene = scene;
        this.player = player;
        this.isBlocked = isBlocked;     // e.g. dialogue open / waiting for the server
        this.targets = [];
        this.current = null;
        this.prompt = new InteractionPrompt(scene);
        this.busy = false;

        this.keyE = scene.input.keyboard.addKey('E');
        this.keyE.on('down', () => this.#trigger());
    }

    add(entity) {
        this.targets.push(entity);
        return entity;
    }

    remove(entity) {
        this.targets = this.targets.filter(t => t !== entity);
        if (this.current === entity) this.current = null;
    }

    update() {
        if (this.isBlocked() || this.busy) {
            this.#setCurrent(null);
            this.prompt.hide();
            return;
        }
        let best = null;
        let bestDist = INTERACT_RADIUS;
        for (const t of this.targets) {
            if (!t.interactable) continue;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y);
            if (d <= bestDist) {
                best = t;
                bestDist = d;
            }
        }
        this.#setCurrent(best);
        if (best) this.prompt.show(best.promptText);
        else this.prompt.hide();
    }

    #setCurrent(t) {
        if (this.current === t) return;
        this.current?.setHighlighted(false);
        this.current = t;
        t?.setHighlighted(true);
    }

    async #trigger() {
        if (!this.current || this.busy || this.isBlocked()) return;
        const target = this.current;
        this.busy = true;
        this.prompt.hide();
        try {
            await target.interact();
        } catch (err) {
            console.error('[Interaction]', err);
        } finally {
            this.busy = false;
        }
    }
}
