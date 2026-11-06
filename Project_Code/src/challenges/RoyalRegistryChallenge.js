// The Royal Registry - King Aldric's records organised as a Binary Search Tree.
//
// Every tree operation runs in the C engine (native/c/bst.c, tree name from
// quest.config.tree). The C response to each BST_INSERT / BST_SEARCH lists
// the comparisons it made and the tree it now holds; this class only turns
// those responses into lesson steps and draws them (rendering/TreeView.js).
//
//   1. intro     a pile of records, a node, the ordering rule
//   2. insert    C inserts the records one by one; each comparison is a step
//   3. search    C searches for one record that exists and one that does not
//   4. practice  the player guides records down the tree; every move is
//                checked against the path C reports, and the final insert is
//                done by C (its parent / side must match the player's slot)
//   5. in-order  C lists the tree in order: the rule makes it sorted
import { SPRITES } from '../config/assets.js';
import { COLORS, DEPTH, GAME_HEIGHT, textStyle } from '../config/constants.js';
import { TreeView } from '../rendering/TreeView.js';
import { Walkthrough } from '../systems/Walkthrough.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { frame } from '../ui/Frame.js';
import { LessonPanel } from '../ui/LessonPanel.js';
import { UI } from '../config/assets.js';
import { BaseChallenge, SIDEBAR } from './BaseChallenge.js';
import { buildInsertSteps, buildIntroSteps, buildSearchSteps, childOf, summarizeBst } from './lessons/bstLessons.js';

const BOARD = { x: 10, y: 52, w: 614, h: 482 };
const TREE_AREA = { x: 24, y: 112, w: 588, h: 410 };
const STRIP = { x: 8, y: GAME_HEIGHT - 100, w: SIDEBAR.x - 16, h: 92 };

const SEARCHES = [60, 65];
const PRACTICE = [
    { type: 'insert', key: 45, text: 'A new record arrives: 45. Guide it down the tree to the empty slot where it belongs.' },
    { type: 'find', key: 40, text: 'The King asks for record 40. Walk down from the root and stop on it.' },
    { type: 'exists', key: 55, text: 'Is record 55 in the registry? Follow the rule until you can be sure.' },
    { type: 'insert', key: 65, text: 'Record 65 - the one we could not find - has just been delivered. File it.' },
];

const PHASES = {
    intro: { heading: 'The Royal Registry', end: 'Insert ▶' },
    insert: { heading: 'BST: insertion', end: 'Search ▶' },
    search: { heading: 'BST: searching', end: 'Your turn ▶' },
    practice: { heading: 'Your turn', end: 'In-order ▶' },
    inorder: { heading: 'BST: in-order', end: 'Finish ▶' },
};
const sign = cmp => (cmp === 'LESS' ? '<' : cmp === 'GREATER' ? '>' : '=');
const side = cmp => (cmp === 'LESS' ? 'LEFT' : 'RIGHT');

export class RoyalRegistryChallenge extends BaseChallenge {
    create() {
        const s = this.scene;
        this.treeName = this.quest.config.tree;
        this.records = this.quest.config.records;
        this.resultArea = SIDEBAR;
        this.answers = { right: 0, wrong: 0 };
        this.mistakes = 0;

        frame(s, UI.dialogFrame, BOARD.x, BOARD.y, BOARD.w, BOARD.h, { corner: 7, fallback: 0xffffff }).setScrollFactor(0).setDepth(DEPTH.ui);
        s.add.text(BOARD.x + 18, BOARD.y + 14, 'ROYAL REGISTRY', textStyle(13, '#1d2b53', { fontStyle: 'bold' })).setScrollFactor(0).setDepth(DEPTH.ui + 1);
        this.pile = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 1);
        this.tree = new TreeView(s, TREE_AREA, { depth: DEPTH.ui + 2 });
        this.strip = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 2);
        this.dialogue = new DialogueBox(s);
        this.panel = new LessonPanel(s, SIDEBAR, {
            onNext: () => this.#next(),
            onSkip: () => { this.feedback = null; this.lesson.skip(); this.#show(); },
            onRestart: () => this.#restart(),
            onAnswer: i => this.#answer(i),
            isBlocked: () => this.dialogue.isOpen || this.done || this.busy,
        }).setVisible(false);

        this.keyHandler = e => {
            if (this.phase !== 'practice' || this.dialogue.isOpen || this.busy) return;
            const labels = this.practiceView?.question?.choices.map(c => c.label) ?? [];
            if (e.key === 'ArrowLeft') this.#answer(labels.indexOf('← Left'));
            if (e.key === 'ArrowRight') this.#answer(labels.indexOf('Right →'));
        };
        s.input.keyboard.on('keydown', this.keyHandler);
        this.#begin().catch(err => this.#fail(err));
    }

    async #begin() {
        await this.dialogue.open([
            { speaker: 'King Aldric', text: 'Welcome to the registry hall. Each royal record has a number. Today they lie in one great pile.' },
            { speaker: 'King Aldric', text: 'Help my clerks shelve them as a Binary Search Tree, so that any record can be found with only a few looks.' },
            { speaker: 'King Aldric', text: 'Go at your own pace: ENTER for the next step, S to fold repeated steps, R to restart a part.' },
        ]);
        await this.#startPhase('intro');
    }

    #fail(err) {
        this.busy = false;
        this.panel.show({ heading: 'C engine error', title: 'The registry could not be reached', text: `${err.message}\n\nPress ESC to leave and try again.`, canNext: false, canRestart: false });
        this.panel.setVisible(true);
    }

    // ------------------------------------------------------------- phases

    async #startPhase(phase) {
        this.phase = phase;
        this.feedback = null;
        this.busy = true;
        if (phase === 'intro') {
            this.lesson = new Walkthrough(buildIntroSteps(this.records), { summarize: summarizeBst });
        } else if (phase === 'insert') {
            this.lesson = new Walkthrough(buildInsertSteps(await this.#insertAll()), { summarize: summarizeBst });
        } else if (phase === 'search') {
            const searches = [];
            for (const key of SEARCHES) searches.push({ key, res: await this.api.dsa.bstSearch(this.treeName, key) });
            this.lesson = new Walkthrough(buildSearchSteps(searches), { summarize: summarizeBst });
        } else if (phase === 'inorder') {
            this.lesson = new Walkthrough(this.#inorderSteps(await this.api.dsa.bstInorder(this.treeName)), { summarize: summarizeBst });
        }
        this.busy = false;
        this.panel.setVisible(true);
        if (phase === 'practice') {
            this.lesson = null;
            this.taskIndex = 0;
            await this.#startTask();
        } else {
            this.#show();
        }
    }

    // C builds the tree from scratch: BST_CLEAR frees every node, then one
    // BST_INSERT per record. Each response is kept for the lesson replay.
    async #insertAll() {
        await this.api.dsa.bstClear(this.treeName);
        const inserts = [];
        for (const key of this.records) inserts.push({ key, res: await this.api.dsa.bstInsert(this.treeName, key) });
        this.cTree = inserts.at(-1).res.tree;
        return inserts;
    }

    async #next() {
        if (this.busy) return;
        this.feedback = null;
        if (this.phase === 'practice') {
            if (this.task.done) await this.#nextTask();
            else if (this.task.atSlot && this.task.type === 'insert') await this.#placeRecord();
            return;
        }
        if (!this.lesson.atEnd) {
            this.lesson.next();
            this.#show();
            return;
        }
        const order = ['intro', 'insert', 'search', 'practice', 'inorder'];
        const nextPhase = order[order.indexOf(this.phase) + 1];
        if (nextPhase === 'practice') {
            this.panel.setVisible(false);
            await this.dialogue.open([{ speaker: 'King Aldric', text: 'You have watched my clerks. Now you guide the records yourself - left or right, one comparison at a time.' }]);
        }
        if (nextPhase) await this.#startPhase(nextPhase);
        else this.#complete();
    }

    async #restart() {
        if (this.busy) return;
        this.feedback = null;
        if (this.phase === 'practice') { await this.#startTask(); return; }
        if (this.phase === 'insert') { await this.#startPhase('insert'); return; }   // C rebuilds the tree too
        this.lesson.restart();
        this.#show();
    }

    #answer(i) {
        if (i < 0 || this.busy) return;
        if (this.phase === 'practice') { this.#practiceAnswer(i); return; }
        const choice = this.lesson.answer(i);
        if (!choice) return;
        this.#feedback(choice.correct, choice.why);
        this.#show();
    }

    #feedback(correct, why) {
        if (correct) this.answers.right++; else this.answers.wrong++;
        this.feedback = correct ? { text: `✔ ${why}`, color: '#52b788' } : { text: `✘ ${why}\nTry again.`, color: '#ff8fa3' };
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
            info: st.tree?.size ? `Tree in C: ${st.tree.size} record${st.tree.size > 1 ? 's' : ''}, height ${this.#height(st.tree)}` : '',
            question: q,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: wt.canSkip(),
            nextLabel: wt.atEnd ? PHASES[this.phase].end : 'Next ▶',
        });
        this.#draw(st);
    }

    #draw(st) {
        this.tree.draw(st);
        this.#drawPile(st.pile ?? []);
        this.#drawStrip(st);
    }

    #height(tree) {
        const byKey = new Map(tree.nodes.map(n => [n.key, n]));
        const h = k => (k == null ? 0 : 1 + Math.max(h(byKey.get(k).left), h(byKey.get(k).right)));
        return h(tree.root);
    }

    #drawPile(pile) {
        const s = this.scene, c = this.pile;
        c.removeAll(true);
        if (!pile.length) return;
        const x0 = BOARD.x + 150, y = BOARD.y + 22;
        c.add(s.add.text(x0, y, 'Waiting:', textStyle(12, '#5c677d')).setOrigin(0, 0.5));
        pile.forEach((k, i) => {
            const x = x0 + 70 + i * 46;
            c.add(s.add.rectangle(x, y, 40, 22, 0xf1e3c6).setStrokeStyle(2, 0x8b5a2b));
            c.add(s.add.text(x, y, String(k), textStyle(12, '#5a3a1a', { fontStyle: 'bold' })).setOrigin(0.5));
        });
    }

    #drawStrip(st) {
        const s = this.scene, c = this.strip;
        c.removeAll(true);
        const { x, y, w, h } = STRIP;
        c.add(s.add.rectangle(x, y, w, h, 0x14213d, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        const line = (ty, str, color = '#ffffff', size = 12) => c.add(s.add.text(x + 10, y + ty, str, textStyle(size, color)));
        const path = st.path ?? [];
        if (st.inorder) {
            line(8, `In-order (from C): ${st.inorder.join('  ')}`, '#ffd60a', 13);
        } else {
            line(8, `Path compared: ${path.length ? path.join(' → ') : '—'}`, '#ffd60a', 13);
            line(30, `Comparisons: ${path.length}${st.tree?.size ? `   ·   records in the tree: ${st.tree.size}` : ''}`);
        }
        line(56, 'Gold border = comparing · Orange = path taken · Green = new / found\nOrange tag = the record travelling down · empty = free child slot', '#8d99ae', 10);
        const king = SPRITES.npc.king;
        if (s.textures.exists(king.texture)) {
            c.add(s.add.sprite(x + w - 30, y + h / 2 + 4, king.texture, king.frame).setScale(2.4));
            c.add(s.add.text(x + w - 30, y + 4, 'King', textStyle(10, '#e5c07b')).setOrigin(0.5, 0));
        }
    }

    // ----------------------------------------------------------- practice

    async #startTask() {
        const def = PRACTICE[this.taskIndex];
        this.busy = true;
        // the path C would take for this key = the correct answer for every move
        const probe = await this.api.dsa.bstSearch(this.treeName, def.key);
        this.busy = false;
        this.task = { ...def, expected: probe.path, tree: probe.tree, exists: probe.found, depth: 0, at: probe.tree.root, path: [], atSlot: null, done: false };
        this.feedback = null;
        this.#showTask();
    }

    #showTask() {
        const t = this.task;
        const n = `${this.taskIndex + 1} of ${PRACTICE.length}`;
        let title, text, choices = null;
        if (t.done) {
            title = `Task ${n} complete`;
            text = t.doneText;
        } else if (t.atSlot) {
            title = `Task ${n}: an empty slot`;
            if (t.type === 'insert') {
                text = `${t.atSlot.parent}'s ${t.atSlot.side.toLowerCase()} slot is empty - this is where ${t.key} belongs. Press NEXT and the C engine will insert ${t.key} (BST_INSERT); its answer must match your slot.`;
            } else {
                text = `You reached ${t.atSlot.parent}'s empty ${t.atSlot.side.toLowerCase()} slot. What does that tell you about record ${t.key}?`;
                choices = [
                    { label: `Keep looking elsewhere for ${t.key}` },
                    { label: `${t.key} is not in the registry` },
                ];
            }
        } else {
            title = `Task ${n}: ${t.type === 'insert' ? 'insert' : 'find'} ${t.key}`;
            text = `${t.text}\n\nThe record is at node ${t.at}. Compare ${t.key} with ${t.at} and choose.`;
            choices = [{ label: '← Left' }, { label: 'Right →' }];
            if (t.type !== 'insert') choices.push({ label: `Found it: this is ${t.key}` });
        }
        this.practiceView = choices ? { question: { choices } } : null;
        this.panel.show({
            heading: PHASES.practice.heading,
            counter: `Task ${n} · mistakes ${this.mistakes}`,
            title, text,
            op: t.lastOp ?? null,
            info: '←/→ arrow keys or 1-3 to answer',
            question: choices ? { choices } : null,
            feedback: this.feedback,
            canNext: t.done || (t.atSlot && t.type === 'insert'),
            canSkip: false,
            nextLabel: t.done ? (this.taskIndex + 1 < PRACTICE.length ? 'Next task ▶' : PHASES.practice.end) : t.atSlot ? `Insert ${t.key} ▶` : 'Next ▶',
        });
        this.#draw({
            tree: t.tree, path: t.path, focus: t.atSlot || t.done ? null : t.at,
            token: t.done ? null : t.atSlot ? { value: t.key, slot: t.atSlot } : { value: t.key, at: t.at },
            newKey: t.inserted ? t.key : null, found: t.foundKey ?? null, missing: t.missing ?? null,
        });
    }

    #practiceAnswer(i) {
        const t = this.task;
        const label = this.practiceView?.question?.choices[i]?.label;
        if (!label || t.done) return;
        const v = t.key;
        if (t.atSlot) {   // find / exists at an empty slot
            const reasons = t.expected.map(p => `${v} ${sign(p.cmp)} ${p.key}: not in ${p.key}'s ${side(p.cmp) === 'LEFT' ? 'right' : 'left'} subtree`);
            if (label.startsWith('Keep')) {
                this.mistakes++;
                this.#feedback(false, `Every comparison ruled out one side:\n${reasons.join('\n')}.\nThis empty slot was the only place ${v} could be.`);
            } else {
                this.#feedback(true, `Correct: ${v} is not in the registry. ${t.expected.length} comparisons were enough to prove it.`);
                t.done = true;
                t.missing = t.atSlot;
                t.doneText = `${v} does not exist. A failed search ends at the empty slot where the record WOULD be.`;
            }
            this.#showTask();
            return;
        }
        const exp = t.expected[t.depth];   // what C compared at this node
        const k = exp.key;
        if (label.startsWith('Found')) {
            if (exp.cmp === 'EQUAL') {
                t.done = true;
                t.foundKey = k;
                t.path.push(k);
                t.lastOp = `${v} == ${k} → found`;
                t.doneText = `Found ${v} after ${t.path.length} comparisons - the same path the C search took: ${t.expected.map(p => p.key).join(' → ')}.`;
                this.#feedback(true, `Yes: this node holds ${v}.`);
            } else {
                this.mistakes++;
                this.#feedback(false, `This node holds ${k}, not ${v}. Since ${v} ${sign(exp.cmp)} ${k}, keep going ${side(exp.cmp).toLowerCase()}.`);
            }
            this.#showTask();
            return;
        }
        const chosen = label.startsWith('←') ? 'LEFT' : 'RIGHT';
        if (exp.cmp === 'EQUAL') {
            this.mistakes++;
            this.#feedback(false, `This node holds ${k} - the record you are looking for. Moving ${chosen.toLowerCase()} would walk away from it.`);
        } else if (chosen !== side(exp.cmp)) {
            this.mistakes++;
            const smaller = exp.cmp === 'LESS';
            this.#feedback(false, `${v} is ${smaller ? 'smaller' : 'larger'} than ${k}, so it must be in ${k}'s ${side(exp.cmp)} subtree. You moved ${chosen.toLowerCase()}, which breaks the BST rule: everything ${chosen.toLowerCase()} of ${k} is ${smaller ? 'larger' : 'smaller'} than ${k}.`);
        } else {
            t.path.push(k);
            t.depth++;
            t.lastOp = `${v} ${sign(exp.cmp)} ${k} → go ${chosen.toLowerCase()}`;
            const child = childOf(t.tree, k, chosen);
            if (child == null) { t.atSlot = { parent: k, side: chosen }; t.at = null; } else t.at = child;
            this.answers.right++;
            this.feedback = { text: `✔ ${v} ${sign(exp.cmp)} ${k}, so ${chosen.toLowerCase()}.`, color: '#52b788' };
        }
        this.#showTask();
    }

    // The player found the slot; C performs the actual insertion.
    async #placeRecord() {
        const t = this.task;
        this.busy = true;
        const res = await this.api.dsa.bstInsert(this.treeName, t.key);
        this.busy = false;
        const agrees = res.inserted && res.parent === t.atSlot.parent && res.side === t.atSlot.side;
        t.tree = res.tree;
        t.inserted = true;
        t.done = true;
        t.lastOp = `bst_insert(${t.key}) → parent ${res.parent}, side ${res.side}`;
        t.doneText = agrees
            ? `C inserted ${t.key} as the ${res.side.toLowerCase()} child of ${res.parent} - exactly the slot you chose. It took ${res.comparisons} comparisons: ${res.path.map(p => p.key).join(' → ')}.`
            : `C placed ${t.key} under ${res.parent} (${res.side}), which differs from your slot - please report this.`;
        this.cTree = res.tree;
        this.#showTask();
    }

    async #nextTask() {
        this.taskIndex++;
        if (this.taskIndex < PRACTICE.length) { await this.#startTask(); return; }
        await this.#startPhase('inorder');
    }

    // --------------------------------------------------------------- in-order

    #inorderSteps(res) {
        const keys = res.keys, tree = res.tree;
        const rootLeft = childOf(tree, tree.root, 'LEFT');
        const options = [...new Set([tree.root, rootLeft, keys[0]])].filter(k => k != null);
        const badges = new Map(keys.map((k, i) => [k, `${i + 1}`]));
        return [
            {
                kind: 'inorder', skippable: false,
                title: 'The registry, in order',
                text: `IN-ORDER traversal visits, at every node:\n1. its LEFT subtree\n2. the node itself\n3. its RIGHT subtree\n\nThe ordering rule says everything on the left is smaller and everything on the right is larger, so this lists the records SORTED:\n${keys.join(', ')}\n\nThe small numbers show the order C visited them.`,
                op: 'bst_inorder(): inorder(left); out[n++] = key; inorder(right)',
                state: { tree, inorder: keys, badges },
                question: {
                    prompt: 'The King wants every record listed from smallest to largest. Which record comes FIRST?',
                    choices: options.map(k => (k === keys[0]
                        ? { label: String(k), correct: true, why: `Yes: ${k} is the leftmost node - keep going left from the root until there is no left child.` }
                        : { label: String(k), correct: false, why: `${k} has smaller records in its left subtree. The smallest record is the LEFTMOST node: from the root, keep going left.` })),
                    state: { tree },
                },
            },
            {
                kind: 'inorder', skippable: false,
                title: 'What the registry gives the King',
                text: `• Insert: compare and go left or right until an empty slot - that slot is the only place the record can go.\n• Search: the same walk. Each comparison discards a whole subtree; at most ${this.#height(tree)} comparisons here (the tree's height), against up to ${tree.size} reads in a pile.\n• In-order: the records come out sorted.\n\nOne caution: if records arrived already sorted (10, 20, 30…), each would go right and the tree would become a long chain - no faster than the pile. Arrival order shapes the tree.`,
                op: null,
                state: { tree, inorder: keys, badges },
            },
        ];
    }

    #complete() {
        this.panel.setVisible(false);
        const tree = this.cTree;
        this.finish({
            success: true,
            title: 'The Royal Registry is in order!',
            lines: [
                `Records in the tree (C): ${tree?.size ?? '?'}`,
                `Answers: ${this.answers.right} right, ${this.answers.wrong} retries`,
                `Practice mistakes: ${this.mistakes}`,
                '',
                'BST rule: smaller → left subtree,',
                'larger → right subtree, at every node.',
                'Insert = search down to an empty slot.',
                'Search: one comparison per level.',
                'In-order traversal = sorted records.',
            ],
        });
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
        this.panel?.destroy();
        this.tree?.destroy();
    }
}
