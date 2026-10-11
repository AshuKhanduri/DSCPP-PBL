import { COLORS } from '../config/constants.js';
import { objectSprite } from '../config/assets.js';
import { createEntityView, footprint } from '../rendering/EntityView.js';
import { GameEntity } from './GameEntity.js';

// InteractiveObject - chests, doors, ore veins, records... Drawn with the
// sprite named by `def.sprite` (see config/assets.js objectSprite), or a
// placeholder shape. Can be marked as a quest objective (pulse + gold label).
export class InteractiveObject extends GameEntity {
    constructor(scene, def, { x, y }, onInteract) {
        super(scene, { id: def.id, name: def.name, x, y });
        this.def = def;
        this.verb = def.verb ?? 'Use';
        this.onInteract = onInteract;
        this.enabled = true;
        this.art = def.sprite ? objectSprite(def.sprite) : null;
        this.view = createEntityView(scene, {
            x, y,
            sprite: this.art,
            shape: def.shape ?? 'square',
            color: def.objective ? COLORS.objective : def.color ?? COLORS.object,
            size: def.size ?? 24,
            label: def.label ?? def.name,
            labelColor: def.objective ? '#ffd60a' : '#ffffff',
        });
        if (def.objective) {
            const s = this.view.baseScale_;
            this.pulse = scene.tweens.add({ targets: this.view.body_, scale: s * 1.12, duration: 600, yoyo: true, repeat: -1 });
        }
    }

    // Rectangle that should block movement (from the sprite's catalog footprint).
    get solidRect() {
        return footprint(this.view, this.art?.solid);
    }

    get promptText() {
        return `${this.verb} ${this.name}`;
    }

    get interactable() {
        return this.enabled;
    }

    // Grey out once used up (e.g. collected ore).
    disable(newLabel) {
        this.enabled = false;
        this.pulse?.stop();
        const body = this.view.body_;
        body.setScale(this.view.baseScale_);
        if (body.setTint) body.setTint(0x777777);
        else body.setFillStyle?.(0x555555);
        if (newLabel && this.view.label_) this.view.label_.setText(newLabel);
    }

    setHighlighted(on) {
        if (this.enabled) super.setHighlighted(on);
    }

    interact() {
        return this.onInteract?.(this);
    }

    destroy() {
        this.pulse?.stop();
        super.destroy();
    }
}
