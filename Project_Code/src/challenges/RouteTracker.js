// RouteTracker - follows the player across the zones (clearings / towns) of a
// graph map and keeps their route in a C stack (Lost Path).
//
//   walk into a new zone            -> STACK_PUSH zone   (C engine)
//   walk back into the previous one -> STACK_POP         (backtracking)
//
// The route shown on screen is rebuilt from the stack contents the engine
// returns, so what you see is exactly what C holds. The graph is the one
// MapGraph derived from this map, so every zone you can walk between is an
// edge the algorithms also know about.
import { COLORS, DEPTH, textStyle } from '../config/constants.js';
import { zoneAt } from '../systems/MapGraph.js';

export class RouteTracker {
    constructor(scene, map, graph, api, { stackName = 'route', onChange = null } = {}) {
        Object.assign(this, { scene, map, graph, api, stackName, onChange });
        this.nodes = new Map(graph.nodes.map(n => [n.id, n]));
        this.adj = new Map(graph.nodes.map(n => [n.id, []]));
        for (const e of graph.edges) {
            this.adj.get(e.from).push({ id: e.to, edge: e });
            this.adj.get(e.to).push({ id: e.from, edge: e });
        }
        this.zones = graph.nodes.map(n => n.zone);
        this.route = [graph.start];
        this.moves = 0;
        this.backtracks = 0;
        this.visitedEver = new Set([graph.start]);
        this.lastZone = graph.start;
        this.pending = Promise.resolve();
        this.enabled = true;
        this.overlay = scene.add.graphics().setDepth(DEPTH.fog + 1);
        this.routeLayer = scene.add.graphics().setDepth(DEPTH.fog + 0.5);
        this.markers = [];
    }

    get current() { return this.route[this.route.length - 1]; }
    get atGoal() { return this.current === this.graph.goal; }

    get routeCost() {
        let cost = 0;
        for (let i = 0; i + 1 < this.route.length; i++) cost += this.edgeBetween(this.route[i], this.route[i + 1])?.weight ?? 0;
        return cost;
    }

    edgeBetween(a, b) {
        return this.adj.get(a)?.find(n => n.id === b)?.edge ?? null;
    }

    neighbors(id = this.current) {
        return this.adj.get(id) ?? [];
    }

    async init() {
        await this.api.dsa.stackClear(this.stackName);
        this.#applyStack(await this.api.dsa.stackPush(this.stackName, this.graph.start));
        this.redrawRoute();
    }

    // Called every frame with the player's position.
    update(x, y) {
        if (!this.enabled) return;
        const zi = zoneAt(this.zones, x, y, this.map.tilePx);
        const id = zi >= 0 ? this.zones[zi].id : null;
        if (id === this.lastZone) return;
        this.lastZone = id;
        if (!id || id === this.current) return;
        // serialise: each move waits for the previous engine reply
        this.pending = this.pending.then(() => this.#move(id));
    }

    async #move(id) {
        if (id === this.current) return;
        const edge = this.edgeBetween(this.current, id);
        const previous = this.route.length >= 2 ? this.route[this.route.length - 2] : null;
        try {
            let res;
            if (id === previous) {
                res = await this.api.dsa.stackPop(this.stackName);
                this.backtracks++;
            } else {
                res = await this.api.dsa.stackPush(this.stackName, id);
            }
            this.#applyStack(res);
            this.moves++;
            this.visitedEver.add(id);
            this.redrawRoute();
            this.onChange?.({ type: 'move', to: id, edge });
        } catch (err) {
            this.onChange?.({ type: 'error', error: err });
        }
    }

    #applyStack(res) {
        this.route = res.items.map(i => i.text).reverse();   // engine returns top-first
        this.stackSize = res.size;
    }

    // Corridor polyline from a to b (world px), oriented a -> b.
    corridor(a, b) {
        const e = this.edgeBetween(a, b);
        if (!e) return [this.nodes.get(a), this.nodes.get(b)];
        return e.from === a ? e.points : [...e.points].reverse();
    }

    #strokePath(g, ids, width, color, alpha, offset) {
        g.lineStyle(width, color, alpha);
        for (let i = 0; i + 1 < ids.length; i++) {
            const pts = this.corridor(ids[i], ids[i + 1]);
            g.beginPath();
            g.moveTo(pts[0].x + offset, pts[0].y + offset);
            for (const p of pts.slice(1)) g.lineTo(p.x + offset, p.y + offset);
            g.strokePath();
        }
    }

    // The route currently on the C stack, drawn along the real trails.
    redrawRoute() {
        this.routeLayer.clear();
        this.#strokePath(this.routeLayer, this.route, 6, COLORS.route, 0.55, 0);
    }

    // Highlight an algorithm's path along the trails (e.g. the BFS result).
    drawPath(ids, color, width = 8, offset = 0) {
        this.#strokePath(this.overlay, ids, width + 4, 0x000000, 0.5, offset);
        this.#strokePath(this.overlay, ids, width, color, 1, offset);
    }

    // Numbered markers in the order an algorithm visited the zones.
    animateVisitOrder(order, color, { delay = 140, offset = 0, onVisit = null, big = false } = {}) {
        const hex = '#' + color.toString(16).padStart(6, '0');
        return new Promise(resolve => {
            if (!order.length) { resolve(); return; }
            order.forEach((id, i) => {
                this.scene.time.delayedCall(i * delay, () => {
                    const n = this.nodes.get(id);
                    onVisit?.(id);
                    const r = big ? 34 : 22;
                    const ring = this.scene.add.circle(n.x + offset, n.y + offset, r).setStrokeStyle(big ? 8 : 4, color).setDepth(DEPTH.labels - 1);
                    const num = this.scene.add.text(n.x + offset, n.y + offset, String(i + 1), textStyle(big ? 40 : 20, hex, { fontStyle: 'bold', stroke: '#000', strokeThickness: big ? 8 : 4 }))
                        .setOrigin(0.5).setDepth(DEPTH.labels);
                    this.markers.push(ring, num);
                    this.scene.tweens.add({ targets: ring, scale: { from: 1.6, to: 1 }, duration: 250 });
                    if (i === order.length - 1) resolve();
                });
            });
        });
    }

    clearOverlay() {
        this.overlay.clear();
        this.markers.forEach(m => m.destroy());
        this.markers = [];
    }
}
