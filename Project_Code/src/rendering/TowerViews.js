// Tower of Trials views. Each draws the state returned by the C engine
// (STACK_* / LQUEUE_* / QUEUE_* responses) and animates the operation that
// produced it - nothing here decides what a stack or queue contains.
//
//   StackView          vertical, TOP pointer, capacity slots
//   LinearQueueView    horizontal array: FRONT / REAR indices, spent slots
//   CircularQueueView  the same array bent into a ring; FRONT / REAR travel
//                      around it, so the wrap from the last index to 0 is visible
//
// draw(body, event): event = { op, ok, value, result } describes the last
// operation (null = just show the state).
import { DEPTH, textStyle } from '../config/constants.js';

const C = {
    cell: 0x5c677d, cellEdge: 0x1d2b53, value: '#ffffff', empty: 0xadb5bd, spent: 0xced4da,
    top: '#c1121f', front: 0x2d6a4f, rear: 0xff7b00, bad: 0xc1121f, peek: 0xffd60a, ink: '#1d2b53', muted: '#5c677d',
};

const hex = c => '#' + c.toString(16).padStart(6, '0');

// What the last C operation did, from the lesson step state.
// ADD / REMOVE (comparison chamber) mean push / pop on a stack, enqueue / dequeue on a queue.
export function eventOf(item, body, isStack) {
    if (!item || !body) return null;
    const kind = item.op === 'ADD' ? (isStack ? 'PUSH' : 'ENQ') : item.op === 'REMOVE' ? (isStack ? 'POP' : 'DEQ') : item.op;
    return { kind, ok: body.ok !== false, value: item.value, result: body.popped ?? body.dequeued ?? body.peeked ?? null, index: body.index };
}

class BaseView {
    constructor(scene, area, depth = DEPTH.ui + 2) {
        this.scene = scene;
        this.area = area;
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth);
    }

    text(x, y, str, size = 12, color = C.ink, extra = {}) {
        const t = this.scene.add.text(x, y, str, textStyle(size, color, extra));
        this.root.add(t);
        return t;
    }

    cell(x, y, w, h, label, fill = C.cell, edge = C.cellEdge, textColor = C.value) {
        const s = this.scene;
        const c = s.add.container(x, y, [
            s.add.rectangle(0, 0, w, h, fill).setStrokeStyle(2, edge),
            s.add.text(0, 0, label, textStyle(15, textColor, { fontStyle: 'bold' })).setOrigin(0.5),
        ]);
        this.root.add(c);
        return c;
    }

    slot(x, y, w, h, alpha = 1) {
        const g = this.scene.add.rectangle(x, y, w, h, 0xffffff, 0).setStrokeStyle(2, C.empty, alpha);
        this.root.add(g);
        return g;
    }

    banner(x, y, str) {
        const t = this.text(x, y, str, 14, '#ffffff', { fontStyle: 'bold', backgroundColor: hex(C.bad), padding: { x: 8, y: 4 } }).setOrigin(0.5);
        this.scene.tweens.add({ targets: t, scale: { from: 1.3, to: 1 }, duration: 250 });
        return t;
    }

    shake(target) {
        this.scene.tweens.add({ targets: target, x: target.x + 6, duration: 50, yoyo: true, repeat: 3 });
    }

    label(x, y, str, color, origin = [0.5, 0.5]) {
        return this.text(x, y, str, 11, '#ffffff', { fontStyle: 'bold', backgroundColor: hex(color), padding: { x: 4, y: 2 } }).setOrigin(...origin);
    }

    clear() { this.root.removeAll(true); }
    setVisible(v) { this.root.setVisible(v); return this; }
    destroy() { this.root.destroy(); }
}

export class StackView extends BaseView {
    draw(body, ev) {
        this.clear();
        const { x, y, w, h } = this.area;
        const cap = body.capacity || 5;
        const cw = Math.min(140, w - 120), ch = Math.min(44, (h - 110) / cap - 6);
        const cx = x + w / 2, bottom = y + h - 46;
        const yOf = i => bottom - i * (ch + 6);
        const items = body.items.map(i => i.value).reverse();   // bottom first
        this.text(cx, y + 6, `STACK  ·  capacity ${cap}  ·  size ${body.size}`, 12, C.ink, { fontStyle: 'bold' }).setOrigin(0.5, 0);
        const g = this.scene.add.graphics();
        this.root.add(g);
        g.fillStyle(0x343a40, 1).fillRect(cx - cw / 2 - 12, bottom + ch / 2 + 4, cw + 24, 8);
        g.lineStyle(3, 0x343a40, 1).lineBetween(cx - cw / 2 - 10, bottom + ch / 2 + 4, cx - cw / 2 - 10, yOf(cap - 1) - ch / 2 - 4)
            .lineBetween(cx + cw / 2 + 10, bottom + ch / 2 + 4, cx + cw / 2 + 10, yOf(cap - 1) - ch / 2 - 4);
        for (let i = 0; i < cap; i++) this.slot(cx, yOf(i), cw, ch, 0.6);
        const cells = items.map((v, i) => this.cell(cx, yOf(i), cw, ch, String(v)));
        this.text(cx, bottom + ch / 2 + 16, 'bottom', 11, C.muted).setOrigin(0.5, 0);

        const topIdx = items.length - 1;
        if (topIdx >= 0) this.label(cx - cw / 2 - 20, yOf(topIdx), 'TOP →', 0xc1121f, [1, 0.5]);
        else this.label(cx - cw / 2 - 20, bottom, 'TOP: none', 0xc1121f, [1, 0.5]);

        if (!ev) return;
        const s = this.scene;
        if (ev.kind === 'PUSH' && ev.ok && cells[topIdx]) {
            s.tweens.add({ targets: cells[topIdx], y: { from: yOf(topIdx) - 90, to: yOf(topIdx) }, alpha: { from: 0, to: 1 }, duration: 320, ease: 'Back.easeOut' });
        } else if (ev.kind === 'PUSH') {
            const ghost = this.cell(cx, yOf(cap) - 4, cw, ch, String(ev.value), C.bad);
            this.shake(ghost);
            this.banner(cx + cw / 2 + 80, yOf(cap) - 4, 'OVERFLOW');
        } else if ((ev.kind === 'POP') && ev.ok) {
            const ghost = this.cell(cx, yOf(topIdx + 1), cw, ch, String(ev.result.value), 0x2d6a4f);
            s.tweens.add({ targets: ghost, y: yOf(topIdx + 1) - 80, x: cx + cw, alpha: 0, duration: 650, ease: 'Sine.easeIn' });
            this.label(cx + cw / 2 + 16, yOf(topIdx + 1), `POP → ${ev.result.value}`, 0x2d6a4f, [0, 0.5]);
        } else if (ev.kind === 'PEEK' && ev.ok) {
            cells[topIdx].list[0].setStrokeStyle(4, C.peek);
            s.tweens.add({ targets: cells[topIdx], scale: { from: 1.12, to: 1 }, duration: 300, yoyo: false });
            this.label(cx + cw / 2 + 16, yOf(topIdx), `PEEK → ${ev.result.value} (stays)`, 0xb08900, [0, 0.5]);
        } else if (!ev.ok) {
            this.banner(cx, bottom - ch, 'UNDERFLOW');
        } else if (ev.kind === 'IS_EMPTY' || ev.kind === 'IS_FULL') {
            this.label(cx + cw / 2 + 16, y + 40, ev.kind === 'IS_EMPTY' ? `isEmpty() → ${body.empty}` : `isFull() → ${body.full}`, 0x1d3d8f, [0, 0.5]);
        }
    }
}

export class LinearQueueView extends BaseView {
    draw(body, ev, { title = 'LINEAR QUEUE' } = {}) {
        this.clear();
        const { x, y, w, h } = this.area;
        const cap = body.capacity;
        const cw = Math.min(84, (w - 80) / cap), ch = 46;
        const left = x + (w - cw * cap) / 2, cy = y + h / 2;
        const xOf = i => left + cw * (i + 0.5);
        this.text(x + w / 2, y + 6, `${title}  ·  capacity ${cap}  ·  size ${body.size}`, 12, C.ink, { fontStyle: 'bold' }).setOrigin(0.5, 0);
        this.text(left - 6, cy - ch / 2 - 34, '◀ leave at FRONT', 11, C.muted).setOrigin(0, 0.5);
        this.text(left + cw * cap + 6, cy - ch / 2 - 34, 'join at REAR ◀', 11, C.muted).setOrigin(1, 0.5);
        const cells = [];
        body.slots.forEach((sl, i) => {
            if (sl === 'spent') {
                this.cell(xOf(i), cy, cw - 6, ch, 'spent', C.spent, C.empty, C.muted).list[1].setFontSize(11);
            } else if (sl) {
                cells[i] = this.cell(xOf(i), cy, cw - 6, ch, String(sl.value));
            } else {
                this.slot(xOf(i), cy, cw - 6, ch);
            }
            this.text(xOf(i), cy + ch / 2 + 6, `[${i}]`, 11, C.muted).setOrigin(0.5, 0);
        });
        this.#markers(body, xOf, cy, ch, cw);
        if (!ev) return;
        this.#animate(ev, body, cells, xOf, cy, cw, ch, left);
    }

    #markers(body, xOf, cy, ch, cw) {
        const fx = xOf(body.frontIndex), rx = body.rearIndex < 0 ? xOf(0) - cw : xOf(body.rearIndex);
        const f = this.label(fx, cy - ch / 2 - 12, `FRONT ${body.frontIndex}`, C.front);
        const r = this.label(rx, cy + ch / 2 + 32, `REAR ${body.rearIndex}`, C.rear);
        // slide from where they were last time
        if (this.lastFront != null && this.lastFront !== fx) this.scene.tweens.add({ targets: f, x: { from: this.lastFront, to: fx }, duration: 350 });
        if (this.lastRear != null && this.lastRear !== rx) this.scene.tweens.add({ targets: r, x: { from: this.lastRear, to: rx }, duration: 350 });
        this.lastFront = fx;
        this.lastRear = rx;
    }

    #animate(ev, body, cells, xOf, cy, cw, ch, left) {
        const s = this.scene;
        if (ev.kind === 'ENQ' && ev.ok) {
            const c = cells[ev.index];
            if (c) s.tweens.add({ targets: c, x: { from: left + cw * body.capacity + 40, to: xOf(ev.index) }, alpha: { from: 0, to: 1 }, duration: 380, ease: 'Sine.easeOut' });
        } else if (ev.kind === 'ENQ') {
            const ghost = this.cell(left + cw * body.capacity + 34, cy, cw - 10, ch, String(ev.value), C.bad);
            this.shake(ghost);
            this.banner(left + cw * body.capacity - 20, cy + ch + 46, 'OVERFLOW');
        } else if (ev.kind === 'DEQ' && ev.ok && ev.result) {
            const ghost = this.cell(xOf(ev.index), cy, cw - 6, ch, String(ev.result.value), 0x2d6a4f);
            s.tweens.add({ targets: ghost, x: left - 40, alpha: 0, duration: 650, ease: 'Sine.easeIn' });
        } else if (ev.kind === 'FRONT' && ev.ok) {
            cells[ev.index]?.list[0].setStrokeStyle(4, C.peek);
            this.label(xOf(ev.index), cy - ch / 2 - 56, `FRONT() → ${ev.result.value} (stays)`, 0xb08900);
        } else if (!ev.ok) {
            this.banner(left + cw * body.capacity / 2, cy + ch + 46, 'UNDERFLOW');
        }
    }
}

export class CircularQueueView extends BaseView {
    draw(body, ev, { formula = '' } = {}) {
        this.clear();
        const { x, y, w, h } = this.area;
        const cap = body.capacity;
        const cx = x + w / 2, cy = y + h / 2 + 8;
        const R = Math.min(w, h) / 2 - 70;
        const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / cap;
        const at = (i, r = R) => ({ x: cx + r * Math.cos(ang(i)), y: cy + r * Math.sin(ang(i)) });
        this.text(cx, y + 6, `CIRCULAR QUEUE  ·  capacity ${cap}  ·  size ${body.size}`, 12, C.ink, { fontStyle: 'bold' }).setOrigin(0.5, 0);
        const g = this.scene.add.graphics();
        this.root.add(g);
        g.lineStyle(3, C.empty, 1).strokeCircle(cx, cy, R);
        // direction of travel: index i -> i + 1, and the last index back to 0
        const a = at(cap - 1, R), b = at(0, R);
        g.lineStyle(4, C.rear, 0.8).beginPath();
        g.arc(cx, cy, R, ang(cap - 1) + 0.25, ang(0) + 2 * Math.PI - 0.25, false).strokePath();
        this.text((a.x + b.x) / 2, (a.y + b.y) / 2 - 18, `${cap - 1} → 0`, 11, '#ff7b00', { fontStyle: 'bold' }).setOrigin(0.5);
        const cells = [];
        body.slots.forEach((sl, i) => {
            const p = at(i);
            if (sl) cells[i] = this.cell(p.x, p.y, 58, 38, String(sl.value));
            else this.root.add(this.scene.add.rectangle(p.x, p.y, 58, 38, 0xffffff, 1).setStrokeStyle(2, C.empty));
            const lp = at(i, R + 44);
            this.text(lp.x, lp.y, `[${i}]`, 12, C.muted, { fontStyle: 'bold' }).setOrigin(0.5);
        });
        this.text(cx, cy - 14, `size ${body.size} / ${cap}`, 14, C.ink, { fontStyle: 'bold' }).setOrigin(0.5);
        this.text(cx, cy + 8, body.empty ? 'empty' : body.full ? 'FULL' : '', 12, body.full ? '#c1121f' : C.muted).setOrigin(0.5);
        if (formula) this.text(cx, cy + 30, formula, 12, '#ff7b00', { fontStyle: 'bold' }).setOrigin(0.5);

        const none = { x: cx, y: cy + 56 };   // REAR = -1: no slot yet
        this.#marker('front', body.frontIndex, R - 56, cap, at, `FRONT ${body.frontIndex}`, C.front, 0, none);
        this.#marker('rear', body.rearIndex, R - 56, cap, at, `REAR ${body.rearIndex}`, C.rear, 22, none);
        if (!ev) return;
        const s = this.scene;
        if (ev.kind === 'ENQ' && ev.ok) {
            const c = cells[ev.index];
            if (c) s.tweens.add({ targets: c, scale: { from: 0, to: 1 }, duration: 320, ease: 'Back.easeOut' });
        } else if (ev.kind === 'ENQ') {
            this.banner(cx, y + h - 22, 'OVERFLOW - every slot is used');
        } else if (ev.kind === 'DEQ' && ev.ok && ev.result) {
            const p = at(ev.index);
            const ghost = this.cell(p.x, p.y, 58, 38, String(ev.result.value), 0x2d6a4f);
            s.tweens.add({ targets: ghost, x: cx, y: cy, alpha: 0, scale: 0.5, duration: 650 });
        } else if (ev.kind === 'FRONT' && ev.ok) {
            cells[ev.index]?.list[0].setStrokeStyle(4, C.peek);
        } else if (!ev.ok) {
            this.banner(cx, y + h - 22, 'UNDERFLOW - nothing to remove');
        }
    }

    // FRONT / REAR tags inside the ring; they travel ALONG the circle (so a
    // wrap from the last index to 0 is a short step forward, not a jump back).
    #marker(name, index, r, cap, at, text, color, dy, none) {
        const key = `last_${name}`;
        const tag = this.label(0, 0, text, color);
        if (index < 0) { tag.setPosition(none.x, none.y + dy); this[key] = null; return null; }
        const idx = index;
        const place = t => { const p = at(t, r); tag.setPosition(p.x, p.y + dy); };
        const from = this[key];
        this[key] = idx;
        if (from == null || from === idx) { place(idx); return null; }
        const steps = (idx - from + cap) % cap;   // always forward
        const counter = this.scene.tweens.addCounter({ from: 0, to: steps, duration: 300 + 120 * steps, onUpdate: tw => place(from + tw.getValue()) });
        place(from);
        return counter;
    }
}
