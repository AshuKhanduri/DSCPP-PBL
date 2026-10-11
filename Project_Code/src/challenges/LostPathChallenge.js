// Lost Path - find the Old Shrine in the Whispering Woods, on foot.
//
// The forest is a Tiled map. Its clearings (Nodes layer) and the trails that
// connect them are turned into a graph by MapGraph, and that graph is what
// the C engine searches. Walking into a clearing pushes it on the C route
// stack; walking back pops it. Fog hides everything you have not uncovered.
//
// Real algorithm use (all executed in C):
//   H  Lantern  -> BFS from the clearing you stand in; the next step of the
//                  shortest path is lit on the real trail (2 uses)
//   F  Scout    -> DFS from your clearing; the scout uncovers clearings in the
//                  order DFS visits them (1 use)
//   On arrival  -> BFS and DFS from the start are compared with your route
//                  and drawn on the forest itself.
import { COLORS, DEPTH, textStyle } from '../config/constants.js';
import { toApiGraph } from '../data/graphs.js';
import { FogOfWar } from '../rendering/FogOfWar.js';
import { graphForMap } from '../systems/MapGraph.js';
import { SIDEBAR } from './BaseChallenge.js';
import { RoamingChallenge } from './RoamingChallenge.js';
import { RouteTracker } from './RouteTracker.js';

const PANEL_W = 960 - SIDEBAR.x;

export class LostPathChallenge extends RoamingChallenge {
    create() {
        this.setupMap(this.quest.config.map, { rightPanel: PANEL_W });
        this.graph = graphForMap(this.map, { weighted: false });
        this.apiGraph = toApiGraph(this.graph);
        this.lanterns = 2;
        this.scouts = 1;
        this.info = this.sidebar('Whispering Woods', '');

        this.fog = new FogOfWar(this.scene, this.map);
        this.labels = new Map(this.graph.nodes.map(n => [n.id, this.scene.add.text(n.x, (n.zone.y + 0.4) * this.map.tilePx, n.label,
            textStyle(14, n.id === this.graph.goal ? '#ffd60a' : '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }))
            .setOrigin(0.5, 0).setDepth(DEPTH.labels).setVisible(false)]));

        this.tracker = new RouteTracker(this.scene, this.map, this.graph, this.api, {
            stackName: 'route',
            onChange: e => this.#onChange(e),
        });
        this.#discover(this.graph.start);
        this.#revealZone(this.graph.goal);   // the shrine's light can be seen from afar
        this.tracker.init().then(() => this.#render()).catch(err => this.flash(err.message, '#e63946'));

        this.keyHandler = event => {
            if (this.done || this.arriving) return;
            if (event.key === 'h' || event.key === 'H') this.#lantern();
            if (event.key === 'f' || event.key === 'F') this.#scout();
        };
        this.scene.input.keyboard.on('keydown', this.keyHandler);
    }

    update(time, delta) {
        super.update(time, delta);
        if (!this.player) return;
        if (!this.arriving) {
            this.tracker.update(this.player.x, this.player.y);
            this.fog.revealAround(this.player.x, this.player.y);
        }
        this.fog.draw();
    }

    #label(id) {
        return this.tracker.nodes.get(id).label;
    }

    #revealZone(id) {
        const z = this.tracker.nodes.get(id).zone;
        this.fog.revealRect(z.x, z.y, z.w, z.h, 1);
        this.labels.get(id).setVisible(true);
    }

    // Arriving at a clearing shows the trails leading out of it and where they go
    // (the walkable version of "discover your neighbours").
    #discover(id) {
        this.#revealZone(id);
        for (const nb of this.tracker.neighbors(id)) {
            this.fog.revealPoints(nb.edge.points, 1);
            this.#revealZone(nb.id);
        }
    }

    #render(extra = '') {
        const t = this.tracker;
        this.info.setText([
            'Find the OLD SHRINE (gold).',
            'Walk the trails. Fog hides what you',
            'have not seen yet.',
            '',
            'Walking into a clearing PUSHES it on',
            'the C route stack; walking back to the',
            'previous clearing POPS it.',
            `H  Lantern (BFS hint)   x${this.lanterns}`,
            `F  Scout (DFS reveal)   x${this.scouts}`,
            '',
            `You are at: ${this.#label(t.current)}`,
            `Moves: ${t.moves}   Backtracks: ${t.backtracks}`,
            `Route stack size: ${t.stackSize ?? 1}`,
            `Route: ${t.route.map(id => this.#label(id)).join(' → ')}`,
            '',
            extra,
        ].join('\n'));
    }

    #onChange(e) {
        if (e.type === 'error') {
            this.flash(e.error.message, '#e63946');
            return;
        }
        this.#discover(e.to);
        this.tracker.clearOverlay();
        this.#render();
        if (this.tracker.atGoal) this.#arrive();
    }

    async #lantern() {
        if (this.lanterns <= 0) { this.flash('The lantern is out of oil.', '#e63946'); return; }
        const t = this.tracker;
        const res = await this.api.dsa.path('BFS', this.apiGraph, t.current, this.graph.goal);
        this.lanterns--;
        this.services.history.record('USE_LANTERN', t.current);
        const next = res.path[1];
        t.clearOverlay();
        if (next) {
            this.fog.revealPoints(t.corridor(t.current, next), 1);
            this.#revealZone(next);
            t.drawPath([t.current, next], COLORS.bfs, 8);
        }
        this.#render(`Lantern (BFS): shortest way is ${res.hops} more clearing(s).\nNext: ${next ? this.#label(next) : '-'} (lit in gold).\nBFS explored ${res.expanded} clearings to know this.`);
    }

    async #scout() {
        if (this.scouts <= 0) { this.flash('Your scout has already gone.', '#e63946'); return; }
        const t = this.tracker;
        const res = await this.api.dsa.path('DFS', this.apiGraph, t.current, this.graph.goal);
        this.scouts--;
        this.services.history.record('USE_SCOUT', t.current);
        this.frozen = true;
        t.clearOverlay();
        await t.animateVisitOrder(res.visitOrder, COLORS.dfs, { delay: 220, onVisit: id => this.#revealZone(id) });
        this.frozen = false;
        this.#render(`Scout (DFS) went deep first and reached ${res.visitOrder.length} clearings (purple numbers):\n${res.visitOrder.map(id => this.#label(id)).join(' → ')}`);
    }

    async #arrive() {
        this.arriving = true;
        this.frozen = true;
        const t = this.tracker;
        t.enabled = false;
        t.clearOverlay();
        this.info.setText('You reach the Old Shrine!\n\nAsking the C engine how BFS and DFS\nwould have searched from the start…');
        const { results } = await this.api.dsa.compare(['BFS', 'DFS'], this.apiGraph, this.graph.start, this.graph.goal);
        const bfs = results.BFS, dfs = results.DFS;
        this.fog.revealAll();
        this.labels.forEach(l => l.setVisible(true));
        await this.showWholeMap({ rightPanel: PANEL_W });
        t.drawPath(dfs.path, COLORS.dfs, 10, 10);
        t.drawPath(bfs.path, COLORS.bfs, 10, -10);
        await t.animateVisitOrder(bfs.visitOrder, COLORS.bfs, { delay: 120, big: true });

        const yourMoves = t.moves;
        const optimal = bfs.hops;
        const rating = yourMoves === optimal ? 'Perfect — you matched BFS!' : yourMoves <= optimal + 3 ? 'Good pathfinding.' : 'You found it — eventually.';
        this.finish({
            success: true,
            title: 'The Old Shrine is found!',
            lines: [
                `Your moves: ${yourMoves} (backtracks: ${t.backtracks})`,
                `Final route on stack: ${t.route.length - 1} moves`,
                '',
                `BFS (gold): ${optimal} moves, explored ${bfs.expanded} nodes`,
                `  ${bfs.path.map(id => this.#label(id)).join(' → ')}`,
                `DFS (purple): ${dfs.hops} moves, explored ${dfs.expanded} nodes`,
                `  ${dfs.path.map(id => this.#label(id)).join(' → ')}`,
                '',
                'Numbers on the forest = BFS visit order:',
                'it finishes every clearing 1 trail away',
                'before any 2 trails away, so its path',
                'has the fewest moves. DFS dives down one',
                'trail first and may find a longer path.',
                '',
                rating,
            ],
        });
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
    }
}
