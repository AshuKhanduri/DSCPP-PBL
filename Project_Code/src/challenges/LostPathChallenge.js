// Lost Path - find the Old Shrine in the Whispering Woods, then learn how BFS
// and DFS explore the same forest, one C operation at a time.
//
// The forest is a Tiled map. Its clearings (Nodes layer) and the trails that
// connect them are turned into a graph by MapGraph, and that graph is what
// the C engine searches. Each clearing gets a letter (A = Forest Edge ...)
// in Nodes-layer order, which is also the order C stores the edges in.
//
// 1. Explore   walk the trails under fog. Walking into a clearing PUSHES it on
//              the C route stack, walking back POPS it. The journal in the
//              sidebar draws the graph you have discovered (vertices + edges).
//              H = lantern (BFS hint), F = scout (DFS reveal), as before.
// 2. Lessons   at the shrine the C engine runs bfs_search_traced() and
//              dfs_search_traced() (native/c) on the forest graph. Every
//              operation it records - enqueue, dequeue, push, pop, neighbour
//              check - becomes a step (lessons/graphLessons.js) replayed on the
//              real forest map: BFS walkthrough -> DFS walkthrough -> comparison.
//              The player advances each step; repeated steps can be folded.
import { COLORS, DEPTH, GAME_HEIGHT, textStyle } from '../config/constants.js';
import { toApiGraph } from '../data/graphs.js';
import { FogOfWar } from '../rendering/FogOfWar.js';
import { edgeKey, GraphOverlay } from '../rendering/GraphOverlay.js';
import { graphForMap } from '../systems/MapGraph.js';
import { Walkthrough } from '../systems/Walkthrough.js';
import { LessonPanel } from '../ui/LessonPanel.js';
import { SIDEBAR } from './BaseChallenge.js';
import { RoamingChallenge } from './RoamingChallenge.js';
import { RouteTracker } from './RouteTracker.js';
import { buildBfsSteps, buildCompareSteps, buildDfsSteps, summarizeBfs, summarizeDfs } from './lessons/graphLessons.js';

const PANEL_W = 960 - SIDEBAR.x;
const STRIP = { x: 8, y: GAME_HEIGHT - 104, w: SIDEBAR.x - 16, h: 96 };   // queue / stack strip under the map
const JOURNAL = { x: SIDEBAR.x + 14, y: 382, w: SIDEBAR.w - 28, h: 232 };
const LEVEL_BADGE = 0xd0d6de;

const PHASES = {
    bfs: { heading: 'Breadth-First Search', end: 'DFS ▶' },
    dfs: { heading: 'Depth-First Search', end: 'Compare ▶' },
    compare: { heading: 'BFS vs DFS', end: 'Finish ▶' },
};

export class LostPathChallenge extends RoamingChallenge {
    create() {
        this.setupMap(this.quest.config.map, { rightPanel: PANEL_W });
        this.graph = graphForMap(this.map, { weighted: false });
        this.apiGraph = toApiGraph(this.graph);
        this.letters = new Map(this.graph.nodes.map((n, i) => [n.id, String.fromCharCode(65 + i)]));
        this.names = new Map(this.graph.nodes.map(n => [n.id, n.label]));
        this.lanterns = 2;
        this.scouts = 1;
        this.answers = { right: 0, wrong: 0 };
        this.info = this.sidebar('Whispering Woods', '');

        this.fog = new FogOfWar(this.scene, this.map);
        this.labels = new Map(this.graph.nodes.map(n => [n.id, this.scene.add.text(n.x, (n.zone.y + 0.4) * this.map.tilePx,
            `${this.letters.get(n.id)}  ${n.label}`,
            textStyle(14, n.id === this.graph.goal ? '#ffd60a' : '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }))
            .setOrigin(0.5, 0).setDepth(DEPTH.labels).setVisible(false)]));

        this.#createJournal();
        this.tracker = new RouteTracker(this.scene, this.map, this.graph, this.api, {
            stackName: 'route',
            onChange: e => this.#onChange(e),
        });
        this.#discover(this.graph.start);
        this.#revealZone(this.graph.goal);   // the shrine's light can be seen from afar
        this.tracker.init().then(() => this.#render()).catch(err => this.flash(err.message, '#e63946'));
        this.#introduce();

        this.keyHandler = event => {
            if (this.done || this.arriving || this.dialogue.isOpen) return;
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

    #L = id => this.letters.get(id);
    #N = id => this.names.get(id);

    #label(id) {
        return `${this.#L(id)} ${this.#N(id)}`;
    }

    // ------------------------------------------------------------ exploring

    // The journal: the part of the forest graph the player has discovered,
    // drawn small in the sidebar (vertices = clearings, edges = trails).
    #createJournal() {
        const { x, y, w, h } = JOURNAL;
        const s = this.scene;
        s.add.text(x, y - 22, 'Journal — the forest as a graph', textStyle(12, '#e5c07b', { fontStyle: 'bold' })).setDepth(DEPTH.ui).setScrollFactor(0);
        s.add.rectangle(x, y, w, h, 0x0d1b2a, 0.9).setOrigin(0).setStrokeStyle(1, COLORS.panelBorder).setDepth(DEPTH.ui).setScrollFactor(0);
        const scale = Math.min((w - 20) / this.map.width, (h - 34) / this.map.height);
        const ox = x + (w - this.map.width * scale) / 2, oy = y + 6;
        this.knownNodes = new Set();
        this.knownEdges = new Set();
        this.journal = new GraphOverlay(s, this.graph, {
            project: p => ({ x: ox + p.x * scale, y: oy + p.y * scale }),
            letters: this.letters, radius: 8, font: 10,
        });
        this.journalNote = s.add.text(x + 6, y + h - 6, '', textStyle(10, '#c9d1d9')).setOrigin(0, 1).setDepth(DEPTH.ui + 2).setScrollFactor(0);
    }

    #drawJournal() {
        const t = this.tracker;
        this.journal.draw({
            known: this.knownNodes, knownEdges: this.knownEdges, current: t?.current ?? this.graph.start,
            done: t?.visitedEver ?? new Set([this.graph.start]), accent: COLORS.route,
        });
        this.journalNote.setText(`${this.knownNodes.size} vertices · ${this.knownEdges.size} edges found`);
    }

    #introduce() {
        const start = this.graph.start;
        const nbs = this.graph.edges.filter(e => e.from === start || e.to === start).map(e => (e.from === start ? e.to : e.from));
        this.dialogue.say([
            { speaker: 'Guide', text: `You stand at clearing ${this.#L(start)}, the ${this.#N(start)}. Look at your journal (right): ${this.#L(start)} is drawn as a circle - a VERTEX.` },
            { speaker: 'Guide', text: `${nbs.length} trails leave it, to ${nbs.map(id => this.#label(id)).join(' and ')}. Each trail joining two clearings is an EDGE. Together they form a GRAPH.` },
            { speaker: 'Guide', text: 'Every clearing you reach adds its trails to the journal. Find the Old Shrine (gold). Walking back the way you came pops your route stack.' },
        ]);
    }

    #revealZone(id) {
        const z = this.tracker.nodes.get(id).zone;
        this.fog.revealRect(z.x, z.y, z.w, z.h, 1);
        this.labels.get(id).setVisible(true);
        this.knownNodes.add(id);
    }

    // Arriving at a clearing shows the trails leading out of it and where they go
    // (the walkable version of "discover your neighbours").
    #discover(id) {
        this.#revealZone(id);
        for (const nb of this.tracker.neighbors(id)) {
            this.fog.revealPoints(nb.edge.points, 1);
            this.#revealZone(nb.id);
            this.knownEdges.add(edgeKey(id, nb.id));
        }
        this.#drawJournal();
    }

    #render(extra = '') {
        const t = this.tracker;
        this.info.setText([
            'Find the OLD SHRINE (gold).',
            'Fog hides what you have not seen.',
            'Entering a clearing PUSHES it on the',
            'C route stack; walking back POPS it.',
            `H  Lantern (BFS hint)   x${this.lanterns}`,
            `F  Scout (DFS reveal)   x${this.scouts}`,
            '',
            `You are at: ${this.#label(t.current)}`,
            `Moves: ${t.moves}   Backtracks: ${t.backtracks}`,
            `Route: ${t.route.map(id => this.#L(id)).join(' → ')}`,
            extra,
        ].join('\n'));
        this.#drawJournal();
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
            this.#discover(next);
            t.drawPath([t.current, next], COLORS.bfs, 8);
        }
        this.#render(`Lantern (BFS): ${res.hops} more trail(s).\nNext: ${next ? this.#label(next) : '-'} (gold).`);
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
        this.#render(`Scout (DFS) went deep first:\n${res.visitOrder.map(id => this.#L(id)).join(' → ')}`);
    }

    // -------------------------------------------------------------- lessons

    async #arrive() {
        this.arriving = true;
        this.frozen = true;
        const t = this.tracker;
        t.enabled = false;
        t.clearOverlay();
        this.info.setText('You reach the Old Shrine!\n\nAsking the C engine to run BFS and DFS\non this forest and record every step…');
        const { start, goal } = this.graph;
        let bfs, dfs, dfsToShrine;
        try {
            // BFS searches for the shrine; DFS maps every clearing (no goal) so
            // its dead ends and backtracking are part of the recording.
            bfs = await this.api.dsa.trace('BFS', this.apiGraph, start, goal);
            dfs = await this.api.dsa.trace('DFS', this.apiGraph, start, null);
            dfsToShrine = await this.api.dsa.path('DFS', this.apiGraph, start, goal);
        } catch (err) {
            this.info.setText(`The C engine could not run the searches:\n${err.message}\n\nPress ESC and try again.`);
            return;
        }
        this.results = { bfs, dfs, dfsToShrine };
        const ctx = { L: this.#L, N: this.#N, start, goal, shrine: goal };
        const bfsSteps = buildBfsSteps(bfs.trace, bfs, ctx);
        const dfsSteps = buildDfsSteps(dfs.trace, ctx);
        const lastBfs = bfsSteps.at(-1).state;
        this.lessons = {
            bfs: new Walkthrough(bfsSteps, { summarize: run => summarizeBfs(run, ctx) }),
            dfs: new Walkthrough(dfsSteps, { summarize: run => summarizeDfs(run, ctx) }),
            compare: new Walkthrough(buildCompareSteps({
                bfs, dfs, bfsLevels: lastBfs.levels, bfsTree: lastBfs.tree,
                dfsTree: dfsSteps.at(-1).state.tree, dfsShrinePath: dfsToShrine.path,
            }, ctx), { summarize: () => ({}) }),
        };
        this.bfsTree = lastBfs.tree;

        this.fog.revealAll();
        this.labels.forEach(l => l.setVisible(false));
        this.player.view?.setVisible?.(false);
        this.journal.setVisible(false);
        const project = await this.showWholeMap({ rightPanel: PANEL_W, bottomPanel: STRIP.h + 8 });
        this.scene.add.rectangle(0, 44, SIDEBAR.x, GAME_HEIGHT - 44, 0x0d1b2a, 0.45).setOrigin(0).setDepth(DEPTH.ui).setScrollFactor(0);
        this.overlay = new GraphOverlay(this.scene, this.graph, {
            project, edgePoints: e => e.points, letters: this.letters, names: this.names, radius: 11, font: 12, depth: DEPTH.ui + 1,
        });
        this.strip = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 2);
        this.panel = new LessonPanel(this.scene, SIDEBAR, {
            onNext: () => this.#next(),
            onSkip: () => { this.feedback = null; this.lesson.skip(); this.#show(); },
            onRestart: () => { this.feedback = null; this.lesson.restart(); this.#show(); },
            onAnswer: i => this.#answer(i),
            isBlocked: () => this.dialogue.isOpen || this.done,
        });
        this.panel.setVisible(false);

        await this.dialogue.say([
            { speaker: 'Guide', text: `You found the shrine in ${t.moves} moves, turning back ${t.backtracks} time(s). Now look at the whole forest as a graph: ${this.graph.nodes.length} clearings (vertices) and ${this.graph.edges.length} trails (edges), lettered A to ${this.#L(this.graph.nodes.at(-1).id)}.` },
            { speaker: 'Guide', text: 'A searcher cannot see the whole forest. It needs a RULE for which clearing to try next - otherwise it wanders in circles, as walkers do.' },
            { speaker: 'Guide', text: 'The C engine has just run two such rules on this exact forest and recorded every step: Breadth-First Search (BFS) and Depth-First Search (DFS). We will replay them one operation at a time.' },
            { speaker: 'Guide', text: `BFS first: from ${this.#L(start)}, find the shrine (${this.#L(goal)}). Take your time - press ENTER for the next step, S to fold repeated steps, R to restart.` },
        ]);
        this.#startPhase('bfs');
    }

    #startPhase(phase) {
        this.phase = phase;
        this.lesson = this.lessons[phase];
        this.lesson.restart();
        this.feedback = null;
        this.panel.setVisible(true);
        this.#show();
    }

    async #next() {
        this.feedback = null;
        if (!this.lesson.atEnd) {
            this.lesson.next();
            this.#show();
            return;
        }
        if (this.phase === 'bfs') {
            this.panel.setVisible(false);
            await this.dialogue.say([
                { speaker: 'Guide', text: 'BFS found the shrine by sweeping outward, level by level. Now DFS, on the same forest and the same trail order.' },
                { speaker: 'Guide', text: 'This time the goal is to map EVERY clearing (a full traversal), so you can see what DFS does when a trail runs out.' },
            ]);
            this.#startPhase('dfs');
        } else if (this.phase === 'dfs') {
            this.#startPhase('compare');
        } else {
            this.#complete();
        }
    }

    #answer(i) {
        const choice = this.lesson.answer(i);
        if (!choice) return;
        if (choice.correct) this.answers.right++; else this.answers.wrong++;
        this.feedback = choice.correct
            ? { text: `✔ ${choice.why}`, color: '#52b788' }
            : { text: `✘ ${choice.why}\nTry again.`, color: '#ff8fa3' };
        this.#show();
    }

    #show() {
        const wt = this.lesson;
        const asking = wt.needsAnswer;
        const v = wt.view;
        const q = asking ? wt.step.question : null;
        const st = wt.state;
        this.panel.show({
            heading: PHASES[this.phase].heading,
            counter: `Step ${wt.pos + 1}/${wt.total}${wt.skipped ? ` · ${wt.skipped} folded` : ''}`,
            title: asking ? 'Predict before you look' : v.title,
            text: asking ? q.prompt : v.text,
            op: asking ? null : v.op,
            info: this.#info(st),
            question: q,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: wt.canSkip(),
            nextLabel: wt.atEnd ? PHASES[this.phase].end : 'Next ▶',
        });
        this.overlay.draw(this.#overlayState(st));
        this.#drawStrip(st);
    }

    #info(st) {
        const L = this.#L;
        if (st.algo === 'BFS') {
            return [
                `Current: ${st.current ? this.#label(st.current) : '—'}`,
                `Visited (marked): ${st.visited.map(L).join(' ')}`,
            ].join('\n');
        }
        if (st.algo === 'DFS') {
            return [
                `Current: ${st.current ? this.#label(st.current) : '—'}`,
                `Visited: ${st.visited.map(L).join(' ') || '—'}`,
                st.branch.length ? `Branch from ${L(this.graph.start)}: ${st.branch.map(L).join('→')}` : '',
            ].filter(Boolean).join('\n');
        }
        return '';
    }

    #overlayState(st) {
        const order = (ids, color) => new Map(ids.map((id, i) => [id, [{ text: String(i + 1), color }]]));
        if (st.algo === 'BFS') {
            const badges = new Map();
            for (const id of st.visited) {
                const b = [];
                const n = st.order.indexOf(id);
                if (n >= 0) b.push({ text: `#${n + 1}`, color: COLORS.bfs });
                b.push({ text: `L${st.levels[id]}`, color: LEVEL_BADGE });
                badges.set(id, b);
            }
            const done = new Set(st.processed);
            if (st.current) done.add(st.current);
            return {
                accent: COLORS.bfs, current: st.current, waiting: new Set(st.queue), done, tree: st.tree,
                examined: st.examined, badges, paths: st.path.length ? [{ ids: st.path, color: 0xffffff }] : [],
            };
        }
        if (st.algo === 'DFS') {
            return {
                accent: COLORS.dfs, current: st.current, waiting: new Set(st.stack.map(s => s.node)), done: new Set(st.visited),
                dead: new Set(st.dead), tree: st.tree, examined: st.examined, badges: order(st.order, COLORS.dfs),
            };
        }
        // comparison
        const all = new Set(this.graph.nodes.map(n => n.id));
        const base = { done: all, accent: COLORS.bfs };
        if (st.show === 'orders') {
            const badges = new Map([...all].map(id => [id, [
                { text: String(st.bfsOrder.indexOf(id) + 1), color: COLORS.bfs },
                { text: String(st.dfsOrder.indexOf(id) + 1), color: COLORS.dfs },
            ]]));
            return { ...base, badges };
        }
        if (st.show === 'levels') {
            return { ...base, tree: this.bfsTree, badges: new Map([...all].map(id => [id, [{ text: `L${st.levels[id]}`, color: LEVEL_BADGE }]])) };
        }
        if (st.show === 'dfsTree') return { ...base, accent: COLORS.dfs, tree: st.dfsTree, badges: order(st.dfsOrder, COLORS.dfs) };
        return { ...base, paths: [{ ids: st.bfsPath, color: COLORS.bfs, offset: -3 }, { ids: st.dfsPath, color: COLORS.dfs, offset: 3 }] };
    }

    // Queue / stack under the map: the frontier exactly as C held it.
    #drawStrip(st) {
        const s = this.scene;
        const c = this.strip;
        c.removeAll(true);
        const { x, y, w, h } = STRIP;
        c.add(s.add.rectangle(x, y, w, h, 0x14213d, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        const L = this.#L;
        const chip = (cx, cy, label, fill, textColor = '#ffffff', width = 26) => {
            c.add(s.add.rectangle(cx, cy, width, 22, fill).setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff));
            c.add(s.add.text(cx + width / 2, cy, label, textStyle(12, textColor, { fontStyle: 'bold' })).setOrigin(0.5));
        };
        const text = (tx, ty, str, color = '#c9d1d9', size = 11) => c.add(s.add.text(tx, ty, str, textStyle(size, color)));

        if (st.algo === 'BFS' || st.algo === 'DFS') {
            const bfs = st.algo === 'BFS';
            text(x + 10, y + 8, bfs ? 'QUEUE' : 'STACK', '#e5c07b', 12);
            text(x + 62, y + 9, bfs ? 'front ▸' : 'top ▸', '#8d99ae');
            let cx = x + 112;
            const items = bfs ? st.queue.map(id => L(id)) : st.stack.map(e => `${L(e.node)}←${e.from ? L(e.from) : '·'}`);
            const width = bfs ? 26 : 44;
            if (!items.length) text(cx, y + 9, '(empty)', '#8d99ae');
            items.forEach((label, i) => {
                if (cx + width > x + w - 70) return;
                chip(cx, y + 16, label, i === 0 ? 0x2a9d8f : 0x1d6fa5, '#ffffff', width);
                cx += width + 4;
            });
            if (items.length) text(cx + 2, y + 9, bfs ? '◂ rear' : '◂ bottom', '#8d99ae');
            text(x + 10, y + 36, `Traversal order: ${st.order.map(L).join(' ') || '—'}`, '#ffffff', 12);
            text(x + 10, y + 58, bfs
                ? 'Grey = not found · Blue = in queue · Gold = explored · Ring = current · L = level\nGreen trail = new neighbour · Red trail = already visited'
                : 'Grey = not visited · Blue = on stack · Purple = visited · Red = dead end · Ring = current\nGreen trail = unvisited neighbour · Red trail = already visited', '#8d99ae', 10);
        } else {
            text(x + 10, y + 10, `BFS order: ${st.bfsOrder.map(L).join(' ')}`, '#ffd60a', 13);
            text(x + 10, y + 34, `DFS order: ${st.dfsOrder.map(L).join(' ')}`, '#c77dff', 13);
            text(x + 10, y + 62, 'Gold = BFS, purple = DFS. Same graph, same start, same trail order.', '#8d99ae', 10);
        }
    }

    #complete() {
        const t = this.tracker;
        const { bfs, dfs, dfsToShrine } = this.results;
        this.panel.setVisible(false);
        this.strip.setVisible(false);
        const L = this.#L;
        this.finish({
            success: true,
            title: 'The Whispering Woods, mapped',
            lines: [
                `Your walk: ${t.moves} moves, ${t.backtracks} backtracks`,
                `Predictions: ${this.answers.right} right, ${this.answers.wrong} retries`,
                '',
                `BFS (queue): ${bfs.visitOrder.map(L).join(' ')}`,
                `  shrine in ${bfs.hops} trails: ${bfs.path.map(L).join('→')}`,
                `DFS (stack): ${dfs.visitOrder.map(L).join(' ')}`,
                `  shrine in ${dfsToShrine.hops} trails: ${dfsToShrine.path.map(L).join('→')}`,
                '',
                'BFS: first in, first out → level by',
                'level → fewest trails.',
                'DFS: last in, first out → deep along',
                'one branch, backtrack at dead ends.',
            ],
        });
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
        this.panel?.destroy();
    }
}
