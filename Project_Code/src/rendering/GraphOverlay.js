// GraphOverlay - draws a graph's nodes and edges in SCREEN space (UI camera)
// and restyles them from a lesson state. Lost Path uses it twice:
//   - the explorer's journal in the sidebar (only discovered clearings/trails)
//   - the BFS / DFS walkthrough, laid over the real forest map: every node sits
//     on its clearing and every edge follows the real trail (corridor), so a
//     highlighted node IS the place in the forest.
//
// state (all fields optional):
//   known, knownEdges   Sets: draw only these nodes / edge keys (journal)
//   current             node being processed (white pulsing ring)
//   waiting             Set: in the queue / on the stack (blue)
//   done                Set: processed (algorithm colour)
//   dead                Set: dead ends (red cross)
//   examined            [{ from, to, fresh }] trails checked this step (green = new, red = already visited)
//   tree                [[parent, child]] trails that discovered a node
//   paths               [{ ids, color, offset }] routes to draw
//   badges              Map id -> [{ text, color }] small labels (order number, level)
//   accent              algorithm colour for `done` and `tree`
import { DEPTH, textStyle } from '../config/constants.js';

const C = {
    edge: 0x8d99ae, unseen: 0x3a3f4b, waiting: 0x1d6fa5, current: 0xffffff,
    fresh: 0x52b788, stale: 0xe63946, goal: 0xffd60a, dead: 0xe63946,
};
const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class GraphOverlay {
    // graph: { nodes: [{ id, x, y }], edges: [{ from, to, points? }], goal }
    // project(p) -> screen {x, y};  edgePoints(edge) -> world points along the edge
    constructor(scene, graph, { project, edgePoints = e => null, letters, names = null, radius = 12, font = 12, depth = DEPTH.ui + 1 }) {
        Object.assign(this, { scene, graph, project, letters, names, radius, font, depth });
        this.byId = new Map(graph.nodes.map(n => [n.id, n]));
        this.edges = new Map(graph.edges.map(e => [edgeKey(e.from, e.to), e]));
        // screen polyline per edge, oriented from e.from to e.to
        this.lines = new Map(graph.edges.map(e => {
            const pts = edgePoints(e) ?? [this.byId.get(e.from), this.byId.get(e.to)];
            return [edgeKey(e.from, e.to), { from: e.from, pts: pts.map(p => project(p)) }];
        }));
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(depth);
        this.gfx = scene.add.graphics();
        this.root.add(this.gfx);
        this.nodeViews = new Map();
        for (const n of graph.nodes) {
            const p = project(n);
            const circle = scene.add.circle(p.x, p.y, radius, C.unseen).setStrokeStyle(2, C.edge);
            const letter = scene.add.text(p.x, p.y, letters.get(n.id), textStyle(font, '#ffffff', { fontStyle: 'bold' })).setOrigin(0.5);
            const name = names
                ? scene.add.text(p.x, p.y + radius + 2, names.get(n.id), textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0)
                : null;
            this.root.add([circle, letter, ...(name ? [name] : [])]);
            this.nodeViews.set(n.id, { p, circle, letter, name });
        }
        this.ring = scene.add.circle(0, 0, radius + 6).setStrokeStyle(3, C.current).setVisible(false);
        this.root.add(this.ring);
        scene.tweens.add({ targets: this.ring, alpha: 0.25, duration: 550, yoyo: true, repeat: -1 });
        this.badgeObjs = [];
    }

    #stroke(a, b, width, color, alpha = 1, offset = 0) {
        const line = this.lines.get(edgeKey(a, b));
        if (!line) return;
        const g = this.gfx;
        g.lineStyle(width, color, alpha);
        g.beginPath();
        line.pts.forEach((p, i) => (i ? g.lineTo(p.x + offset, p.y + offset) : g.moveTo(p.x + offset, p.y + offset)));
        g.strokePath();
    }

    draw(state = {}) {
        const s = state;
        const accent = s.accent ?? 0xffd60a;
        const visibleNode = id => !s.known || s.known.has(id);
        const g = this.gfx;
        g.clear();

        for (const [key, e] of this.edges) {
            if (s.knownEdges && !s.knownEdges.has(key)) continue;
            this.#stroke(e.from, e.to, 3, C.edge, 0.6);
        }
        for (const [a, b] of s.tree ?? []) this.#stroke(a, b, 5, accent, 0.85);
        for (const path of s.paths ?? []) {
            for (let i = 0; i + 1 < path.ids.length; i++) {
                this.#stroke(path.ids[i], path.ids[i + 1], 9, 0x000000, 0.5, path.offset ?? 0);
                this.#stroke(path.ids[i], path.ids[i + 1], 6, path.color, 1, path.offset ?? 0);
            }
        }
        for (const ex of s.examined ?? []) this.#stroke(ex.from, ex.to, 6, ex.fresh ? C.fresh : C.stale, 0.95);

        for (const [id, v] of this.nodeViews) {
            const show = visibleNode(id);
            v.circle.setVisible(show);
            v.letter.setVisible(show);
            v.name?.setVisible(show);
            if (!show) continue;
            let fill = C.unseen, text = '#ffffff';
            if (s.waiting?.has(id)) fill = C.waiting;
            if (s.done?.has(id)) { fill = accent; text = '#1b1b1b'; }
            if (s.dead?.has(id)) fill = C.dead;
            v.circle.setFillStyle(fill).setStrokeStyle(id === this.graph.goal ? 4 : 2, id === this.graph.goal ? C.goal : C.edge);
            v.letter.setColor(text);
        }

        const cur = s.current && this.nodeViews.get(s.current);
        this.ring.setVisible(Boolean(cur));
        if (cur) this.ring.setPosition(cur.p.x, cur.p.y);

        this.badgeObjs.forEach(b => b.destroy());
        this.badgeObjs = [];
        for (const [id, list] of s.badges ?? []) {
            const v = this.nodeViews.get(id);
            if (!v || !visibleNode(id)) continue;
            list.forEach((b, i) => {
                const side = i === 0 ? 1 : -1;   // first badge top-right, second top-left
                const t = this.scene.add.text(v.p.x + side * (this.radius + 1), v.p.y - this.radius - 1, b.text, textStyle(10, '#1b1b1b', {
                    fontStyle: 'bold', backgroundColor: '#' + b.color.toString(16).padStart(6, '0'), padding: { x: 2, y: 0 },
                })).setOrigin(side > 0 ? 0 : 1, 0.5);
                this.root.add(t);
                this.badgeObjs.push(t);
            });
        }
    }

    setVisible(v) {
        this.root.setVisible(v);
        return this;
    }

    destroy() {
        this.root.destroy();
    }
}

export { edgeKey };
