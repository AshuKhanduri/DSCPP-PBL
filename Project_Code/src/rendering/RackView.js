// RackView - the Blacksmith's weapon rack: draws the array state returned by
// the C sorting engine (SORT_START / SORT_STEP). Each item is one container
// keyed by its C id, so when C swaps or shifts values the item visibly slides
// to its new slot. Insertion Sort's key is drawn lifted above the gap it left
// (C's array still holds a stale copy at the gap; it is not drawn).
//
// draw(raw, { reveal }) - reveal=false hides the outcome of a COMPARE
// (used while the player predicts it).
import { DEPTH, textStyle } from '../config/constants.js';

const COL = {
    tag: 0xf1e3c6, tagEdge: 0x8b5a2b, bar: 0x6c757d, barTop: 0xadb5bd,
    sorted: 0x2d6a4f, unsorted: 0x8d99ae, compare: 0xffd60a, swap: 0x52b788, min: 0x1d6fa5, key: 0xff7b00,
};
const TAG_H = 44;
const KEY_LIFT = 84;   // the key is held this far above its gap

export class RackView {
    constructor(scene, area, items, { depth = DEPTH.ui + 2 } = {}) {
        this.scene = scene;
        this.area = area;
        this.items = items;
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth);
        this.marks = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth + 1);
        this.views = new Map();   // id -> container
    }

    #layout(n) {
        const { x, w } = this.area;
        const slotW = Math.min(100, (w - 20) / Math.max(n, 1));
        const left = x + (w - slotW * n) / 2;
        return { slotW, cx: k => left + slotW * (k + 0.5), baseY: this.area.y + this.area.h - 70 };
    }

    #itemView(id, value, maxValue, slotW) {
        const s = this.scene;
        if (this.views.has(id)) return this.views.get(id);
        const barH = 30 + (value / Math.max(maxValue, 1)) * 120;   // heavier = taller
        const w = slotW - 14;
        const c = s.add.container(0, 0);
        const bar = s.add.rectangle(0, -TAG_H / 2 - barH / 2, w * 0.5, barH, COL.bar).setStrokeStyle(2, 0x343a40);
        const top = s.add.rectangle(0, -TAG_H / 2 - barH + 4, w * 0.5, 8, COL.barTop);
        const tag = s.add.rectangle(0, 0, w, TAG_H, COL.tag).setStrokeStyle(2, COL.tagEdge);
        const kgText = s.add.text(0, -8, `${value} kg`, textStyle(15, '#3d2a14', { fontStyle: 'bold' })).setOrigin(0.5);
        const name = s.add.text(0, 11, this.items[id] ?? `#${id}`, textStyle(10, '#5a3a1a')).setOrigin(0.5);
        c.add([bar, top, tag, kgText, name]);
        c.tag = tag;
        c.value = value;
        this.root.add(c);
        this.views.set(id, c);
        return c;
    }

    reset() {
        this.views.forEach(v => v.destroy());
        this.views.clear();
        this.marks.removeAll(true);
    }

    draw(raw, { reveal = true } = {}) {
        const s = this.scene;
        const n = raw.n;
        const L = this.#layout(n);
        const maxValue = Math.max(1, ...raw.values);
        const m = this.marks;
        m.removeAll(true);
        const g = s.add.graphics();
        m.add(g);

        // plates: green = sorted portion, grey = unsorted
        for (let k = 0; k < n; k++) {
            // while Insertion holds a key, the sorted items occupy [0, sortedHi] minus the gap
            const hi = raw.gap >= 0 ? raw.sortedHi + 1 : raw.sortedHi;
            const inSorted = k >= raw.sortedLo && k < hi && k !== raw.gap;
            g.fillStyle(inSorted ? COL.sorted : COL.unsorted, 1);
            g.fillRect(L.cx(k) - L.slotW / 2 + 4, L.baseY + TAG_H / 2 + 6, L.slotW - 8, 8);
            m.add(s.add.text(L.cx(k), L.baseY + TAG_H / 2 + 18, `${k + 1}`, textStyle(12, '#1d2b53', { fontStyle: 'bold' })).setOrigin(0.5, 0));
        }
        if (n && raw.sortedHi > raw.sortedLo) {
            const a = L.cx(raw.sortedLo) - L.slotW / 2 + 4, b = L.cx(raw.sortedHi - 1) + L.slotW / 2 - 4;
            m.add(s.add.text((a + b) / 2, L.baseY + TAG_H / 2 + 36, raw.done ? 'sorted' : 'sorted part', textStyle(11, '#2d6a4f', { fontStyle: 'bold' })).setOrigin(0.5, 0));
        }

        // items: every slot except Insertion's gap; the key floats above the gap
        const placed = new Set();
        const target = new Map();
        for (let k = 0; k < n; k++) {
            if (k === raw.gap) continue;
            const id = raw.ids[k];
            target.set(id, { x: L.cx(k), y: L.baseY });
            placed.add(id);
        }
        if (raw.gap >= 0) target.set(raw.keyId, { x: L.cx(raw.gap), y: L.baseY - KEY_LIFT });
        for (const [id, pos] of target) {
            const value = id === raw.keyId && raw.gap >= 0 ? raw.key : raw.values[raw.ids.indexOf(id)];
            const v = this.#itemView(id, value, maxValue, L.slotW);
            v.tag.setStrokeStyle(2, 0x8b5a2b);
            if (v.x === 0 && v.y === 0) v.setPosition(pos.x, pos.y);
            else if (v.x !== pos.x || v.y !== pos.y) s.tweens.add({ targets: v, x: pos.x, y: pos.y, duration: 420, ease: 'Sine.easeInOut' });
        }

        const tagOf = k => (k === raw.gap ? null : this.views.get(raw.ids[k]));
        const outline = (k, color) => tagOf(k)?.tag.setStrokeStyle(5, color);
        const above = (k, text, color, dy = 0) => m.add(s.add.text(L.cx(k), L.baseY - TAG_H / 2 - 168 + dy, text, textStyle(11, '#ffffff', {
            fontStyle: 'bold', backgroundColor: '#' + color.toString(16).padStart(6, '0'), padding: { x: 4, y: 2 },
        })).setOrigin(0.5, 1));

        if (raw.gap >= 0) {   // the empty gap and the key held above it
            g.lineStyle(2, COL.key, 1);
            g.strokeRect(L.cx(raw.gap) - L.slotW / 2 + 8, L.baseY - TAG_H / 2, L.slotW - 16, TAG_H);
            m.add(s.add.text(L.cx(raw.gap), L.baseY, 'gap', textStyle(11, '#ff7b00')).setOrigin(0.5));
            this.views.get(raw.keyId)?.tag.setStrokeStyle(5, COL.key);
            m.add(s.add.text(L.cx(raw.gap) - L.slotW / 2 + 6, L.baseY - KEY_LIFT - TAG_H / 2 - 2, 'KEY', textStyle(11, '#ffffff', { fontStyle: 'bold', backgroundColor: '#ff7b00', padding: { x: 4, y: 1 } })).setOrigin(0, 1));
        }
        // a hidden COMPARE must not reveal whether the minimum changed: show the old one
        const minIdx = !reveal && raw.op === 'COMPARE' ? raw.b : raw.min;
        if (minIdx >= 0 && raw.algorithm === 'SELECTION') { outline(minIdx, COL.min); above(minIdx, 'MIN', COL.min, -18); }

        const op = raw.op;
        if (op === 'COMPARE') {
            outline(raw.a, COL.compare);
            if (raw.algorithm === 'BUBBLE') outline(raw.b, COL.compare);
            if (raw.algorithm !== 'SELECTION' || !reveal) above(raw.a, 'compare', 0xb08900);
            if (raw.algorithm === 'BUBBLE') above(raw.b, 'compare', 0xb08900);
            if (reveal) this.#bubble(raw, L);
        } else if (op === 'SWAP') {
            outline(raw.a, COL.swap);
            outline(raw.b, COL.swap);
            above(raw.a, 'swapped', COL.swap);
            if (raw.a !== raw.b) above(raw.b, 'swapped', COL.swap);
        } else if (op === 'SHIFT') {
            outline(raw.b, COL.swap);
            above(raw.b, 'shifted →', COL.swap);
        } else if (op === 'INSERT' || op === 'PLACE') {
            outline(raw.a, COL.swap);
            above(raw.a, op === 'INSERT' ? 'inserted' : 'in place', COL.swap);
        } else if (op === 'PASS_END') {
            above(raw.a, 'FINAL', COL.sorted);
        }
    }

    // "7 > 3" bubble between the compared items, with the outcome.
    #bubble(raw, L) {
        const s = this.scene;
        let text;
        if (raw.algorithm === 'BUBBLE') text = `${raw.values[raw.a]} > ${raw.values[raw.b]} ?  ${raw.result ? 'yes → swap' : 'no → keep'}`;
        else if (raw.algorithm === 'SELECTION') text = `${raw.values[raw.a]} < min ${raw.values[raw.b]} ?  ${raw.result ? 'yes → new MIN' : 'no'}`;
        else text = `${raw.values[raw.a]} > key ${raw.key} ?  ${raw.result ? 'yes → shift' : 'no → stop'}`;
        const x = raw.algorithm === 'BUBBLE' ? (L.cx(raw.a) + L.cx(raw.b)) / 2 : L.cx(raw.a);
        this.marks.add(s.add.text(x, this.area.y + 8, text, textStyle(13, '#ffffff', {
            fontStyle: 'bold', backgroundColor: '#c1121f', padding: { x: 6, y: 3 },
        })).setOrigin(0.5, 0));
    }

    destroy() {
        this.root.destroy();
        this.marks.destroy();
    }
}
