// Royal Route - travel the kingdom's roads from the Castle to the Harbor as
// cheaply as possible.
//
// The kingdom is a Tiled map. Towns are zones; the roads between them are
// tiles with a terrain (road / forest / hills / marsh). MapGraph turns them
// into a weighted graph: an edge's cost comes from the terrain tiles along
// that road, and the player really walks slower on costly terrain.
// The route you walk is the C "route" stack (enter a town = push, walk back =
// pop). ENTER at the Harbor dispatches the caravan: the C engine runs Dijkstra
// and A* on the same graph, both routes are drawn on the real roads, a royal
// courier walks the optimal one, and your route is judged against it.
import { CHARACTER_ORIGIN, SPRITES } from '../config/assets.js';
import { COLORS, DEPTH, depthForY, textStyle } from '../config/constants.js';
import { ROYAL_HSCALE, TERRAIN_COLOR, TERRAIN_FACTOR, toApiGraph } from '../data/graphs.js';
import { graphForMap } from '../systems/MapGraph.js';
import { SIDEBAR } from './BaseChallenge.js';
import { RoamingChallenge } from './RoamingChallenge.js';
import { RouteTracker } from './RouteTracker.js';

const ACCEPTABLE_OVERHEAD = 1.25;   // within 25% of optimal still passes
const PANEL_W = 960 - SIDEBAR.x;

export class RoyalRouteChallenge extends RoamingChallenge {
    create() {
        this.setupMap(this.quest.config.map, { rightPanel: PANEL_W });
        this.graph = graphForMap(this.map, { weighted: true, factors: TERRAIN_FACTOR, hscale: ROYAL_HSCALE });
        this.apiGraph = toApiGraph(this.graph);
        this.info = this.sidebar('The Royal Route', '');

        // town names and road costs, on the map itself
        for (const n of this.graph.nodes) {
            this.scene.add.text(n.x, (n.zone.y + 0.3) * this.map.tilePx, n.label, textStyle(14, n.id === this.graph.goal ? '#ffd60a' : '#ffffff', {
                fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
            })).setOrigin(0.5, 0).setDepth(DEPTH.labels);
        }
        for (const e of this.graph.edges) {
            const mid = e.points[Math.floor(e.points.length / 2)];
            this.scene.add.text(mid.x, mid.y, String(e.weight), textStyle(16, '#ffffff', {
                fontStyle: 'bold', backgroundColor: '#' + TERRAIN_COLOR[e.terrain].toString(16).padStart(6, '0') + 'dd', padding: { x: 4, y: 1 },
                stroke: '#000', strokeThickness: 3,
            })).setOrigin(0.5).setDepth(DEPTH.labels - 0.5);
        }

        this.tracker = new RouteTracker(this.scene, this.map, this.graph, this.api, {
            stackName: 'route',
            onChange: e => (e.type === 'error' ? this.flash(e.error.message, '#e63946') : this.#render()),
        });
        this.tracker.init().then(() => this.#render()).catch(err => this.flash(err.message, '#e63946'));

        this.keyHandler = event => {
            if (!this.done && !this.dispatching && event.key === 'Enter') this.#dispatch();
        };
        this.scene.input.keyboard.on('keydown', this.keyHandler);
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.player && !this.dispatching) {
            this.tracker.update(this.player.x, this.player.y);
            const terrain = this.map.terrainAt(this.player.x, this.player.y);
            if (terrain !== this.lastTerrain) { this.lastTerrain = terrain; this.#render(); }
        }
    }

    #label(id) {
        return this.tracker.nodes.get(id).label;
    }

    #render() {
        const t = this.tracker;
        if (!t) return;
        const legend = Object.entries(TERRAIN_FACTOR).map(([k, f]) => `${k} x${f}`).join('  ');
        this.info.setText([
            'Take the caravan road from the Castle',
            'to the HARBOR (gold) as CHEAPLY as you can.',
            'Numbers on roads = travel cost.',
            `Terrain: ${legend}`,
            'Costly terrain also slows you down.',
            '',
            'Entering a town PUSHES it on the C route',
            'stack; walking back POPS it.',
            'ENTER at the Harbor: dispatch caravan',
            '',
            `Underfoot: ${this.lastTerrain ?? 'town'}`,
            `Route cost so far: ${t.routeCost}`,
            'Stack (top first):',
            ...[...t.route].reverse().slice(0, 8).map((id, i) => `  ${i === 0 ? 'TOP→' : '    '} ${this.#label(id)}`),
            '',
            t.atGoal ? '>> At the Harbor. Press ENTER to dispatch. <<' : '',
        ].join('\n'));
    }

    async #dispatch() {
        const t = this.tracker;
        if (!t.atGoal) {
            this.flash('The caravan must reach the Harbor first.', '#e63946');
            return;
        }
        this.dispatching = true;
        this.frozen = true;
        t.enabled = false;
        const { results } = await this.api.dsa.compare(['DIJKSTRA', 'ASTAR'], this.apiGraph, this.graph.start, this.graph.goal, ROYAL_HSCALE);
        const dij = results.DIJKSTRA, astar = results.ASTAR;
        await this.showWholeMap({ rightPanel: PANEL_W });
        t.drawPath(dij.path, COLORS.dijkstra, 10, -10);
        t.drawPath(astar.path, COLORS.astar, 10, 10);
        await t.animateVisitOrder(dij.visitOrder, COLORS.dijkstra, { delay: 140, big: true });
        await this.#courier(dij.path);

        const cost = t.routeCost;
        const optimal = dij.cost;
        const success = cost <= Math.floor(optimal * ACCEPTABLE_OVERHEAD);
        const verdict = cost === optimal
            ? 'Perfect: your route is as cheap as Dijkstra\'s.'
            : success ? `Acceptable: ${cost - optimal} more than optimal.` : `Too costly: ${cost - optimal} more than optimal. Study the gold route and retry.`;
        const samePath = dij.path.join() === astar.path.join();
        this.finish({
            success,
            title: success ? 'The caravan arrives!' : 'The caravan is late…',
            lines: [
                `Your route cost: ${cost}`,
                `  ${t.route.map(id => this.#label(id)).join(' → ')}`,
                '',
                `Dijkstra (gold): cost ${dij.cost}, expanded ${dij.expanded} towns`,
                `  ${dij.path.map(id => this.#label(id)).join(' → ')}`,
                `A* (blue): cost ${astar.cost}, expanded ${astar.expanded} towns`,
                `  ${astar.path.map(id => this.#label(id)).join(' → ')}`,
                `  heuristic consistent: ${astar.heuristicConsistent ? 'yes (optimal guaranteed)' : 'NO'}`,
                samePath ? '' : '  (different path, same cost: a tie)',
                '',
                'Numbers = Dijkstra settle order (by cost',
                'from the Castle). The courier walked it.',
                ...(astar.expanded < dij.expanded
                    ? ['A* adds the straight-line distance to the',
                        `Harbor, so it expanded ${dij.expanded - astar.expanded} fewer towns.`]
                    : ['A* expanded as many towns as Dijkstra:',
                        'the roads wind, so the straight-line guess',
                        'is far below the real cost and rules no',
                        'town out. A* only saves work when its',
                        'heuristic is close to the true cost.']),
                '',
                verdict,
            ],
        });
    }

    // A royal courier walks the optimal route along the real roads.
    #courier(path) {
        const pts = [];
        for (let i = 0; i + 1 < path.length; i++) pts.push(...this.tracker.corridor(path[i], path[i + 1]));
        const s = SPRITES.courier;
        if (!pts.length || !this.scene.textures.exists(s.texture)) return Promise.resolve();
        const sprite = this.scene.add.sprite(pts[0].x, pts[0].y, s.texture, s.frame).setScale(2.4)
            .setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y).setDepth(DEPTH.labels + 1);
        return new Promise(resolve => {
            let i = 0;
            const step = () => {
                i += 3;   // every 3rd tile keeps the walk short
                if (i >= pts.length) { sprite.setPosition(pts.at(-1).x, pts.at(-1).y); resolve(); return; }
                this.scene.tweens.add({
                    targets: sprite, x: pts[i].x, y: pts[i].y, duration: 45,
                    onUpdate: () => sprite.setDepth(Math.max(DEPTH.labels + 1, depthForY(sprite.y))), onComplete: step,
                });
            };
            step();
        });
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
    }
}
