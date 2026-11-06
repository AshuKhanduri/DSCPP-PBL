// AvlTreeView - draws tree snapshots returned by the C engine (AVL_* and
// BST_* responses: { root, nodes: [{ key, left, right, height?, bf? }] }) and
// animates the change from one snapshot to the next.
//
// Nodes are keyed by their key, so after a rotation every node glides from its
// old place to its new one while the edges are redrawn each frame - the player
// sees parents and children re-link. Layout: x = in-order position (a rotation
// keeps the in-order, so nodes move mostly up and down), y = depth.
// Badges show what C computed: height under the node, balance factor beside it.
// Clicking a node calls onSelect(key) (node inspection).
import { DEPTH, textStyle } from '../config/constants.js';

const R = 18;
const COL = {
    node: 0x2d6a4f, edge: 0x5c677d, ink: '#1d2b53', newKey: 0x52b788, unbalanced: 0xc1121f, child: 0xff7b00,
    grandchild: 0xffd60a, pivot: 0x1d6fa5, path: 0xff9f1c, selected: 0x9d4edd,
};

export function layout(tree, area) {
    const pos = new Map();
    if (!tree?.nodes?.length) return pos;
    const by = new Map(tree.nodes.map(n => [n.key, n]));
    const order = [];
    const depth = new Map();
    (function walk(k, d) {
        if (k == null) return;
        walk(by.get(k).left, d + 1);
        order.push(k);
        depth.set(k, d);
        walk(by.get(k).right, d + 1);
    })(tree.root, 0);
    const maxD = Math.max(...depth.values());
    const levelH = Math.min(74, (area.h - 70) / Math.max(1, maxD));
    const dx = Math.min(78, area.w / (order.length + 1));
    const left = area.x + (area.w - dx * (order.length - 1)) / 2;
    order.forEach((k, i) => pos.set(k, { x: left + dx * i, y: area.y + 30 + depth.get(k) * levelH }));
    return pos;
}

export class AvlTreeView {
    constructor(scene, area, { onSelect = null, depth = DEPTH.ui + 2 } = {}) {
        this.scene = scene;
        this.area = area;
        this.onSelect = onSelect;
        this.edges = scene.add.graphics().setScrollFactor(0).setDepth(depth);
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth + 1);
        this.views = new Map();   // key -> container
        this.tree = null;
        this.redraw = () => this.#drawEdges();
        scene.events.on('update', this.redraw);
    }

    #nodeView(key) {
        if (this.views.has(key)) return this.views.get(key);
        const s = this.scene;
        const circle = s.add.circle(0, 0, R, COL.node).setStrokeStyle(3, 0x1b4332);
        const label = s.add.text(0, 0, String(key), textStyle(13, '#ffffff', { fontStyle: 'bold' })).setOrigin(0.5);
        const height = s.add.text(0, R + 3, '', textStyle(10, COL.ink)).setOrigin(0.5, 0);
        const bf = s.add.text(R - 2, -R - 2, '', textStyle(10, '#ffffff', { fontStyle: 'bold', padding: { x: 3, y: 1 } })).setOrigin(0, 0.5);
        const c = s.add.container(0, 0, [circle, label, height, bf]);
        c.setSize(R * 2, R * 2).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onSelect?.(key));
        c.parts = { circle, label, height, bf };
        this.root.add(c);
        this.views.set(key, c);
        return c;
    }

    // tree: C snapshot. hl: { newKey, unbalanced, child, grandchild, pivot, newTop, moved, path, found, selected }
    draw(tree, hl = {}, { animate = true, duration = 650 } = {}) {
        this.tree = tree;
        const pos = layout(tree, this.area);
        for (const [key, v] of this.views) if (!pos.has(key)) { v.destroy(); this.views.delete(key); }
        const onPath = new Set(hl.path ?? []);
        for (const [key, p] of pos) {
            const fresh = !this.views.has(key);
            const v = this.#nodeView(key);
            const n = tree.nodes.find(x => x.key === key);
            let stroke = 0x1b4332, sw = 3, fill = COL.node;
            if (onPath.has(key)) { stroke = COL.path; sw = 4; }
            if (key === hl.grandchild) { stroke = COL.grandchild; sw = 5; }
            if (key === hl.child) { stroke = COL.child; sw = 5; }
            if (key === hl.pivot || key === hl.newTop) { stroke = COL.pivot; sw = 5; }
            if (key === hl.unbalanced) { fill = COL.unbalanced; }
            if (key === hl.newKey || key === hl.found) fill = COL.newKey;
            if (key === hl.selected) { stroke = COL.selected; sw = 6; }
            v.parts.circle.setFillStyle(fill).setStrokeStyle(sw, stroke);
            if (n.height != null) {
                v.parts.height.setText(`h${n.height}`);
                const b = n.bf;
                v.parts.bf.setText(b > 0 ? `+${b}` : `${b}`)
                    .setBackgroundColor(Math.abs(b) > 1 ? '#c1121f' : b === 0 ? '#2d6a4f' : '#b08900');
            } else {
                v.parts.height.setText('');
                v.parts.bf.setText('');
            }
            if (fresh) {
                v.setPosition(p.x, p.y - (animate ? 40 : 0)).setAlpha(animate ? 0 : 1);
                if (animate) this.scene.tweens.add({ targets: v, y: p.y, alpha: 1, duration: 420, ease: 'Back.easeOut' });
            } else if (v.x !== p.x || v.y !== p.y) {
                if (animate) this.scene.tweens.add({ targets: v, x: p.x, y: p.y, duration, ease: 'Sine.easeInOut' });
                else v.setPosition(p.x, p.y);
            }
        }
        this.hl = hl;
        this.#drawEdges();
    }

    #drawEdges() {
        const g = this.edges;
        g.clear();
        if (!this.tree?.nodes?.length) return;
        const hl = this.hl ?? {};
        for (const n of this.tree.nodes) {
            const a = this.views.get(n.key);
            for (const c of [n.left, n.right]) {
                if (c == null) continue;
                const b = this.views.get(c);
                if (!a || !b) continue;
                const moved = c === hl.moved;
                const hot = (n.key === hl.newTop && (c === hl.pivot)) || moved;
                g.lineStyle(hot ? 5 : 3, moved ? COL.child : hot ? COL.pivot : COL.edge, 1);
                g.lineBetween(a.x, a.y + R, b.x, b.y - R);
            }
        }
    }

    setVisible(v) {
        this.root.setVisible(v);
        this.edges.setVisible(v);
        return this;
    }

    reset() {
        this.views.forEach(v => v.destroy());
        this.views.clear();
        this.tree = null;
        this.edges.clear();
    }

    destroy() {
        this.scene.events.off('update', this.redraw);
        this.root.destroy();
        this.edges.destroy();
    }
}
