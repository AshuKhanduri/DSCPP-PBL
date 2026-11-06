// TreeView - draws a binary search tree snapshot returned by the C engine
// (BST_INSERT / BST_SEARCH / BST_SHOW: { root, nodes: [{ key, left, right }] }).
//
// Layout comes only from that snapshot: x = position in in-order (so smaller
// keys are always further left), y = depth. JavaScript never decides where a
// key belongs - it only draws where C put it.
//
// draw(state) - see lessons/bstLessons.js for the state fields.
import { DEPTH, textStyle } from '../config/constants.js';

const NODE_W = 40, NODE_H = 26;
const COL = {
    ink: 0x1d2b53, node: 0x1d3d8f, nodeText: '#ffffff', edge: 0x5c677d,
    focus: 0xffd60a, path: 0xff9f1c, fresh: 0x2d6a4f, found: 0x2d6a4f, missing: 0xc1121f, token: 0xff7b00,
};

export function layoutTree(tree, area) {
    const pos = new Map();
    if (!tree?.root && tree?.root !== 0) return { pos, levelH: 0 };
    const byKey = new Map(tree.nodes.map(n => [n.key, n]));
    const order = [];
    const depth = new Map();
    (function walk(k, d) {
        if (k == null) return;
        const n = byKey.get(k);
        walk(n.left, d + 1);
        order.push(k);
        depth.set(k, d);
        walk(n.right, d + 1);
    })(tree.root, 0);
    const maxDepth = Math.max(...depth.values());
    const levelH = Math.min(78, (area.h - NODE_H - 50) / Math.max(1, maxDepth + 1));
    const dx = area.w / (order.length + 1);
    order.forEach((k, i) => pos.set(k, { x: area.x + dx * (i + 1), y: area.y + 24 + depth.get(k) * levelH }));
    return { pos, levelH, dx, byKey };
}

export class TreeView {
    constructor(scene, area, { depth = DEPTH.ui + 1 } = {}) {
        this.scene = scene;
        this.area = area;
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth);
        this.tokenObj = null;
        this.tokenPos = null;
    }

    #slotPos(layout, slot) {
        const p = layout.pos.get(slot.parent);
        const off = Math.max(26, Math.min(70, layout.dx * 0.55));
        return { x: p.x + (slot.side === 'LEFT' ? -off : off), y: p.y + Math.max(48, layout.levelH) };
    }

    draw(st = {}) {
        const s = this.scene;
        const c = this.root;
        c.removeAll(true);
        if (st.schematic) { this.#schematic(st.schematic); this.#token(null); return; }
        const layout = layoutTree(st.tree, this.area);
        const { pos } = layout;
        const g = s.add.graphics();
        c.add(g);

        if (!pos.size) {
            c.add(s.add.text(this.area.x + this.area.w / 2, this.area.y + 40, '(empty tree - no root yet)', textStyle(13, '#5c677d')).setOrigin(0.5));
        }
        // edges, coloured along the path that was compared
        const onPath = new Set(st.path ?? []);
        for (const n of st.tree?.nodes ?? []) {
            for (const child of [n.left, n.right]) {
                if (child == null) continue;
                const a = pos.get(n.key), b = pos.get(child);
                const hot = onPath.has(n.key) && (onPath.has(child) || child === st.found);
                g.lineStyle(hot ? 5 : 3, hot ? COL.path : COL.edge, 1);
                g.lineBetween(a.x, a.y + NODE_H / 2, b.x, b.y - NODE_H / 2);
            }
        }
        // the empty slot a search / insertion ends in
        const slot = st.missing ?? st.token?.slot;
        if (slot && pos.has(slot.parent)) {
            const p = pos.get(slot.parent), q = this.#slotPos(layout, slot);
            g.lineStyle(2, st.missing ? COL.missing : COL.path, 1);
            g.lineBetween(p.x, p.y + NODE_H / 2, q.x, q.y - NODE_H / 2);
            c.add(s.add.rectangle(q.x, q.y, NODE_W, NODE_H, 0xffffff, 1).setStrokeStyle(2, st.missing ? COL.missing : COL.path));
            c.add(s.add.text(q.x, q.y, 'empty', textStyle(10, st.missing ? '#c1121f' : '#5c677d')).setOrigin(0.5));
        }
        // nodes
        for (const [key, p] of pos) {
            let fill = COL.node, stroke = COL.ink, sw = 2;
            if (onPath.has(key)) { stroke = COL.path; sw = 4; }
            if (key === st.newKey) fill = COL.fresh;
            if (key === st.found) fill = COL.found;
            if (key === st.focus) { stroke = COL.focus; sw = 5; }
            const box = s.add.rectangle(p.x, p.y, NODE_W, NODE_H, fill).setStrokeStyle(sw, stroke);
            c.add(box);
            c.add(s.add.text(p.x, p.y, String(key), textStyle(14, COL.nodeText, { fontStyle: 'bold' })).setOrigin(0.5));
            if (key === st.newKey || key === st.found) s.tweens.add({ targets: box, scale: { from: 1.5, to: 1 }, duration: 300 });
            const badge = st.badges?.get(key);
            if (badge) c.add(s.add.text(p.x + NODE_W / 2 - 2, p.y - NODE_H / 2 - 2, badge, textStyle(10, '#1b1b1b', { fontStyle: 'bold', backgroundColor: '#ffd60a', padding: { x: 2, y: 0 } })).setOrigin(0, 1));
        }
        // root label (the root is the shallowest node)
        if (st.tree?.root != null && pos.has(st.tree.root)) {
            const p = pos.get(st.tree.root);
            c.add(s.add.text(p.x, p.y - NODE_H / 2 - 4, 'ROOT', textStyle(10, '#5c677d', { fontStyle: 'bold' })).setOrigin(0.5, 1));
        }
        // comparison bubble next to the node being compared
        if (st.cmp && pos.has(st.cmp.key)) {
            const p = pos.get(st.cmp.key);
            const dir = st.cmp.rel === '<' ? '  → go LEFT' : st.cmp.rel === '>' ? '  → go RIGHT' : '  → FOUND';
            c.add(s.add.text(p.x + NODE_W / 2 + 8, p.y - NODE_H / 2 - 2, `${st.cmp.value} ${st.cmp.rel} ${st.cmp.key}${dir}`, textStyle(12, '#ffffff', {
                fontStyle: 'bold', backgroundColor: '#c1121f', padding: { x: 4, y: 2 },
            })).setOrigin(0, 1));
        }
        // the travelling record
        let tokenAt = null;
        if (st.token) {
            if (st.token.at != null && pos.has(st.token.at)) {
                const p = pos.get(st.token.at);
                tokenAt = { x: p.x, y: p.y - NODE_H - 6 };
            } else if (st.token.slot && pos.has(st.token.slot.parent)) {
                const q = this.#slotPos(layout, st.token.slot);
                tokenAt = { x: q.x, y: q.y - NODE_H - 6 };
            } else if (!pos.size) {
                tokenAt = { x: this.area.x + this.area.w / 2, y: this.area.y + 20 };
            }
        }
        this.#token(tokenAt ? { ...tokenAt, value: st.token.value } : null);
    }

    // The record being inserted / searched for: animated from node to node.
    #token(t) {
        const s = this.scene;
        if (!t) {
            this.tokenObj?.destroy();
            this.tokenObj = null;
            this.tokenPos = null;
            return;
        }
        if (!this.tokenObj || this.tokenObj.value !== t.value) {
            this.tokenObj?.destroy();
            const box = s.add.rectangle(0, 0, NODE_W + 6, NODE_H, COL.token).setStrokeStyle(2, 0xffffff);
            const txt = s.add.text(0, 0, String(t.value), textStyle(14, '#ffffff', { fontStyle: 'bold' })).setOrigin(0.5);
            this.tokenObj = s.add.container(t.x, t.y, [box, txt]).setScrollFactor(0).setDepth(this.root.depth + 1);
            this.tokenObj.value = t.value;
            this.tokenPos = { x: t.x, y: t.y };
            return;
        }
        if (this.tokenPos.x !== t.x || this.tokenPos.y !== t.y) {
            s.tweens.add({ targets: this.tokenObj, x: t.x, y: t.y, duration: 380, ease: 'Sine.easeInOut' });
            this.tokenPos = { x: t.x, y: t.y };
        }
    }

    // Intro drawings that explain the shape of a node and the ordering rule.
    #schematic(kind) {
        const s = this.scene, c = this.root;
        const cx = this.area.x + this.area.w / 2, cy = this.area.y + 70;
        const g = s.add.graphics();
        c.add(g);
        const box = (x, y, label, fill, color = '#ffffff', w = NODE_W + 30) => {
            c.add(s.add.rectangle(x, y, w, NODE_H + 6, fill).setStrokeStyle(2, COL.ink));
            c.add(s.add.text(x, y, label, textStyle(13, color, { fontStyle: 'bold' })).setOrigin(0.5));
        };
        g.lineStyle(3, COL.edge, 1);
        g.lineBetween(cx, cy + 16, cx - 120, cy + 104);
        g.lineBetween(cx, cy + 16, cx + 120, cy + 104);
        if (kind === 'node') {
            box(cx, cy, 'key', COL.node);
            box(cx - 120, cy + 120, 'left child', 0xffffff, '#5c677d', 110);
            box(cx + 120, cy + 120, 'right child', 0xffffff, '#5c677d', 110);
            c.add(s.add.text(cx, cy - 34, 'one NODE', textStyle(12, '#1d2b53', { fontStyle: 'bold' })).setOrigin(0.5));
        } else {
            box(cx, cy, 'N', COL.node);
            box(cx - 120, cy + 120, 'smaller than N', 0xdbe7ff, '#1d2b53', 150);
            box(cx + 120, cy + 120, 'larger than N', 0xffe8cc, '#1d2b53', 150);
            c.add(s.add.text(cx, cy + 190, 'This holds at every node, all the way down.', textStyle(12, '#1d2b53')).setOrigin(0.5));
        }
    }

    destroy() {
        this.tokenObj?.destroy();
        this.root.destroy();
    }
}
