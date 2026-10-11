// EntityView - the visual for any entity.
// If the configured texture exists (see config/assets.js) a pixel-art sprite
// is used; otherwise a placeholder circle/square is drawn. Either way the
// caller gets the same container with a name label, so the art never changes
// gameplay code.
import { ART_SCALE } from '../config/assets.js';
import { COLORS, depthForY, textStyle } from '../config/constants.js';

export function createEntityView(scene, { x, y, sprite, shape = 'circle', color, size = 26, label, labelColor = '#ffffff', depth }) {
    const container = scene.add.container(x, y).setDepth(depth ?? depthForY(y));
    let body;
    let top = -size / 2;
    if (sprite && scene.textures.exists(sprite.texture)) {
        const origin = sprite.origin ?? { x: 0.5, y: 0.5 };
        body = scene.add.sprite(0, 0, sprite.texture, sprite.frame ?? 0)
            .setScale(sprite.scale ?? ART_SCALE)
            .setOrigin(origin.x, origin.y);
        top = -body.displayHeight * origin.y;
    } else if (shape === 'square') {
        body = scene.add.rectangle(0, 0, size, size, color).setStrokeStyle(2, COLORS.npcOutline);
    } else {
        body = scene.add.circle(0, 0, size / 2, color).setStrokeStyle(2, COLORS.npcOutline);
    }
    container.add(body);

    let text = null;
    if (label) {
        text = scene.add.text(0, top - 4, label, textStyle(12, labelColor, {
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        })).setOrigin(0.5, 1);
        container.add(text);
    }
    container.body_ = body;
    container.label_ = text;
    container.top_ = top;
    container.baseScale_ = body.scale;
    return container;
}

// Highlight the entity the player can interact with.
export function setViewHighlighted(view, on) {
    const body = view?.body_;
    if (!body) return;
    if (body.setStrokeStyle && !body.setTint) {
        body.setStrokeStyle(on ? 4 : 2, on ? 0xffffff : 0x111111);
    } else if (on) {
        body.setTint(0xfff1b8);
    } else {
        body.clearTint();
    }
}

// Footprint rectangle (game px) of a sprite drawn by createEntityView, from the
// catalog's `solid` fractions. Used to make objects block movement.
export function footprint(view, solid) {
    const body = view?.body_;
    if (!body || !solid || !body.displayWidth) return null;
    const w = body.displayWidth, h = body.displayHeight;
    const left = view.x - w * body.originX, topY = view.y - h * body.originY;
    const [fx, fy, fw, fh] = solid;
    return { x: left + fx * w, y: topY + fy * h, w: fw * w, h: fh * h };
}
