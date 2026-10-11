import { CHARACTER_ORIGIN, SPRITES } from '../config/assets.js';
import { createEntityView } from '../rendering/EntityView.js';
import { GameEntity } from './GameEntity.js';

// NPC - a character sprite with a name. What happens on interaction is decided
// by the scene's handler (data-driven dialogue), not hardcoded per NPC.
export class NPC extends GameEntity {
    constructor(scene, def, { x, y }, onInteract) {
        super(scene, { id: def.id, name: def.name, x, y });
        this.def = def;
        this.onInteract = onInteract;
        const sprite = SPRITES.npc[def.id];
        this.view = createEntityView(scene, {
            x, y,
            sprite: sprite && { ...sprite, origin: CHARACTER_ORIGIN },
            shape: 'circle',
            color: def.color,
            size: 28,
            label: def.name,
        });
        this.marker = scene.add.text(x, y + this.view.top_ - 18, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffd60a', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
            .setOrigin(0.5, 1).setDepth(this.view.depth + 1);
    }

    get promptText() {
        return `Talk to ${this.name}`;
    }

    // "!" = has a quest to offer, "?" = quest in progress.
    setQuestMarker(status) {
        this.marker.setText(status === 'AVAILABLE' ? '!' : status === 'ACTIVE' ? '?' : '');
    }

    interact() {
        return this.onInteract?.(this);
    }

    destroy() {
        this.marker?.destroy();
        super.destroy();
    }
}
