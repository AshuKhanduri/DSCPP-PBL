// Frame - a resizable UI panel drawn from a frame image cut out of the
// reference sheet (nine-slice, drawn at 2x so the pixel-art border stays
// crisp). Falls back to a plain rectangle if the texture is missing.
// Returned object: setPosition / setVisible / setScrollFactor / setDepth and
// resize(w, h) in screen pixels; x, y = top-left.
import { ART_SCALE } from '../config/assets.js';

export function frame(scene, texture, x, y, w, h, { corner = 6, fallback = 0x14213d } = {}) {
    if (!scene.textures.exists(texture)) {
        return scene.add.rectangle(x, y, w, h, fallback, 0.95).setOrigin(0).setStrokeStyle(3, 0xe5c07b);
    }
    const s = ART_SCALE;
    const slice = scene.add.nineslice(x, y, texture, undefined, w / s, h / s, corner, corner, corner, corner)
        .setOrigin(0).setScale(s);
    slice.resize = function resize(nw, nh) {
        this.setSize(nw / s, nh / s);
        return this;
    };
    return slice;
}
