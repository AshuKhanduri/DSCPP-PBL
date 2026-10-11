// FogOfWar - darkens every map tile the player has not uncovered yet.
// Tiles are revealed around the player as they walk, and by quest logic
// (a discovered clearing, the trail a lantern lights, a scout's report).
import { DEPTH } from '../config/constants.js';

export class FogOfWar {
    constructor(scene, map, { color = 0x050b08, alpha = 0.9 } = {}) {
        this.map = map;
        this.cols = map.grid.cols;
        this.rows = map.grid.rows;
        this.seen = new Uint8Array(this.cols * this.rows);
        this.g = scene.add.graphics().setDepth(DEPTH.fog);
        this.color = color;
        this.alpha = alpha;
        this.dirty = true;
        this.lastTile = -1;
    }

    revealTile(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
        const i = ty * this.cols + tx;
        if (!this.seen[i]) { this.seen[i] = 1; this.dirty = true; }
    }

    revealRect(x, y, w, h, margin = 0) {
        for (let ty = y - margin; ty < y + h + margin; ty++) for (let tx = x - margin; tx < x + w + margin; tx++) this.revealTile(tx, ty);
    }

    // Reveal a world-px polyline (a trail) with a radius in tiles.
    revealPoints(points, radius = 2) {
        const tp = this.map.tilePx;
        for (const p of points) {
            const cx = Math.floor(p.x / tp), cy = Math.floor(p.y / tp);
            for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) this.revealTile(cx + dx, cy + dy);
        }
    }

    revealAround(x, y, radius = 3) {
        const tp = this.map.tilePx;
        const cx = Math.floor(x / tp), cy = Math.floor(y / tp);
        const key = cy * this.cols + cx;
        if (key === this.lastTile) return;
        this.lastTile = key;
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius + 1) this.revealTile(cx + dx, cy + dy);
        }
    }

    revealAll() {
        this.seen.fill(1);
        this.dirty = true;
    }

    isSeen(tx, ty) {
        return this.seen[ty * this.cols + tx] === 1;
    }

    // Redraw only when something changed (call once per frame).
    draw() {
        if (!this.dirty) return;
        this.dirty = false;
        const tp = this.map.tilePx;
        this.g.clear().fillStyle(this.color, this.alpha);
        for (let ty = 0; ty < this.rows; ty++) {
            // merge horizontal runs of fogged tiles into one rectangle
            let start = -1;
            for (let tx = 0; tx <= this.cols; tx++) {
                const fogged = tx < this.cols && !this.seen[ty * this.cols + tx];
                if (fogged && start < 0) start = tx;
                if (!fogged && start >= 0) { this.g.fillRect(start * tp, ty * tp, (tx - start) * tp, tp); start = -1; }
            }
        }
    }

    destroy() {
        this.g.destroy();
    }
}
