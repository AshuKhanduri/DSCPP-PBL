// The Unbalanced Garden - AVL trees in the Garden of Balance.
//
// The player walks the garden map (assets/maps/garden.json). Elarion gives
// hints; the altar of the Ancient Tree opens the lessons; the gate in the
// bottom hedge leads back to the village.
//
// Lessons (lessons/avlLessons.js) are scripts of insertions sent to the C
// engine one at a time - stage 1 to the BST (bst.c), stages 2-5 to the AVL
// tree (avl.c). Each AVL insertion comes back with every step C took
// (placement, imbalance, rotations) and a snapshot of the tree after each;
// AvlTreeView animates from one snapshot to the next.
//
// Stages completed are the quest's progress in QuestManager (0-5), so leaving
// the garden or restarting a stage never loses them.
import { SPRITES, UI } from '../config/assets.js';
import { COLORS, DEPTH, GAME_HEIGHT, textStyle } from '../config/constants.js';
import { NPCS } from '../data/npcs.js';
import { InteractiveObject } from '../entities/InteractiveObject.js';
import { NPC } from '../entities/NPC.js';
import { AvlTreeView } from '../rendering/AvlTreeView.js';
import { LiveWalkthrough } from '../systems/LiveWalkthrough.js';
import { frame } from '../ui/Frame.js';
import { LessonPanel } from '../ui/LessonPanel.js';
import { SIDEBAR } from './BaseChallenge.js';
import { RoamingChallenge } from './RoamingChallenge.js';
import { fmt, heightOf, makeAvlDescriber, makeAvlSource, STAGES, summarizeAvl } from './lessons/avlLessons.js';

const BOARD = { x: 10, y: 52, w: 614, h: 482 };
const TREE_AREA = { x: 30, y: 96, w: 574, h: 420 };
const STRIP = { x: 8, y: GAME_HEIGHT - 100, w: SIDEBAR.x - 16, h: 92 };
const HINT = 'BF = height(left) - height(right). Walk up from the new node: the first |BF| = 2 is repaired. Straight path (LL / RR) = one rotation; bent path (LR / RL) = two.';

export class GardenChallenge extends RoamingChallenge {
    create() {
        this.setupMap(this.quest.config.map);
        this.names = { avl: this.quest.config.avl, bst: this.quest.config.bst };
        this.resultArea = SIDEBAR;
        this.answers = { right: 0, wrong: 0 };
        this.#placeGarden();
        if (this.#progress() === 0) {
            this.dialogue.say([
                { speaker: 'Elarion', text: 'Welcome to the Garden of Balance. See the Ancient Tree in the clearing? Its branches lean, and so does everything it remembers.' },
                { speaker: 'Elarion', text: 'Touch the altar beneath it. The tree will show you, one step at a time, how a tree learns to stand straight.' },
            ]);
        }
    }

    #progress() {
        return this.services.quests.progress.get(this.quest.id)?.current ?? 0;
    }

    // Elarion and the altar come from the garden map's Entities layer.
    #placeGarden() {
        const ents = this.map.entities;
        const keeper = ents.find(e => e.ref === 'keeper');
        const tree = ents.find(e => e.ref === 'ancient_tree');
        if (keeper) this.interaction.add(new NPC(this.scene, NPCS.keeper, keeper, () => this.#talkToKeeper()));
        if (tree) {
            const altar = new InteractiveObject(this.scene, {
                id: 'ancient_tree', name: 'Ancient Tree', label: 'Ancient Tree', verb: 'Tend', sprite: 'stone_altar', objective: true, size: 26,
            }, tree, () => this.#openLessons());
            this.interaction.add(altar);
        }
        const T = this.map.tilePx;
        this.exitY = (this.map.height / T - 1.4) * T;   // walking into the gate gap leaves the garden
    }

    #talkToKeeper() {
        const stage = STAGES[Math.min(this.#progress(), STAGES.length - 1)];
        return this.dialogue.say([{
            speaker: 'Elarion',
            text: this.#progress() >= STAGES.length
                ? 'The Ancient Tree stands straight. Thank you, friend.'
                : `Next at the altar: "${stage.title}" (stage ${this.#progress() + 1} of ${STAGES.length}). Remember: ${HINT}`,
        }]);
    }

    update(time, delta) {
        super.update(time, delta);
        if (!this.player || this.lessonOpen || this.done || this.leaving) return;
        if (this.player.y > this.exitY) {
            this.leaving = true;
            this.scene.returnToWorld();   // QuestScene: back to the village, quest stays active
        }
    }

    // --------------------------------------------------------------- overlay

    #openLessons() {
        if (this.lessonOpen) return;
        this.lessonOpen = true;
        this.frozen = true;
        const s = this.scene;
        frame(s, UI.dialogFrame, BOARD.x, BOARD.y, BOARD.w, BOARD.h, { corner: 7, fallback: 0xffffff }).setScrollFactor(0).setDepth(DEPTH.ui);
        this.boardTitle = s.add.text(BOARD.x + 18, BOARD.y + 14, '', textStyle(13, '#1d2b53', { fontStyle: 'bold' })).setScrollFactor(0).setDepth(DEPTH.ui + 1);
        this.view = new AvlTreeView(s, TREE_AREA, { onSelect: key => { this.selected = key; this.#show(false); } });
        this.strip = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 2);
        this.panel = new LessonPanel(s, SIDEBAR, {
            onNext: () => this.#run(() => this.#next()),
            onSkip: () => this.#run(async () => { this.feedback = null; await this.lesson.skip(); this.#show(true); }),
            onRestart: () => this.#run(() => this.#startStage(this.stageIndex)),
            onAnswer: i => this.#run(() => this.#answer(i)),
            isBlocked: () => this.dialogue.isOpen || this.done || this.busy,
        });
        this.#run(() => this.#startStage(Math.min(this.#progress(), STAGES.length - 1)));
    }

    async #run(fn) {
        if (this.busy) return;
        this.busy = true;
        try { await fn(); } catch (err) {
            this.panel.show({ heading: 'C engine error', title: 'The garden engine could not be reached', text: `${err.message}\n\nPress ESC to leave and try again.`, canNext: false, canRestart: false });
        } finally { this.busy = false; }
    }

    async #say(lines) {
        this.panel.setVisible(false);
        this.busy = false;
        await this.dialogue.say(lines.map(text => ({ speaker: 'Elarion', text })));
        this.busy = true;
        this.panel.setVisible(true);
    }

    // A stage (re)starts with fresh trees in C (BST_CLEAR + AVL_CLEAR).
    async #startStage(index) {
        this.stageIndex = index;
        const stage = STAGES[index];
        this.feedback = null;
        this.selected = null;
        this.trial = stage.graded ? { questions: 0, mistakes: 0 } : null;
        this.view.reset();
        this.boardTitle.setText(`GARDEN OF BALANCE  ·  stage ${index + 1}/${STAGES.length}: ${stage.title}`);
        const src = makeAvlSource(this.api, this.names, stage.script);
        this.source = src;
        this.lesson = new LiveWalkthrough(src, {
            makeDescribe: () => makeAvlDescriber(stage),
            summarize: summarizeAvl,
            canFold: () => Boolean(src.next?.fold),
        });
        await this.lesson.restart();
        this.#show(true);
    }

    async #next() {
        this.feedback = null;
        if (!this.lesson.atEnd) {
            await this.lesson.next();
            this.#show(true);
            return;
        }
        await this.#completeStage();
    }

    async #answer(i) {
        const choice = this.lesson.answer(i);
        if (!choice) return;
        if (this.trial) { if (choice.correct) this.trial.questions++; else this.trial.mistakes++; }
        if (choice.correct) this.answers.right++; else this.answers.wrong++;
        this.feedback = choice.correct
            ? { text: `✔ ${choice.why}`, color: '#52b788' }
            : { text: `✘ ${choice.why}${this.trial ? `\nHint: ${HINT}` : ''}\nTry again.`, color: '#ff8fa3' };
        this.#show(false);
    }

    async #completeStage() {
        const i = this.stageIndex;
        const stage = STAGES[i];
        if (stage.graded) {
            const t = this.trial;
            const allowed = Math.max(3, Math.ceil(t.questions / 4));
            if (t.mistakes > allowed) {
                await this.#say([
                    `The tree stands, but you stumbled ${t.mistakes} times on ${t.questions} questions. Balance needs a steady hand.`,
                    'Let us plant it once more. Watch the balance factors on the way up.',
                ]);
                await this.#startStage(i);
                return;
            }
        }
        if (i + 1 > this.#progress()) this.services.quests.setProgress(this.quest.id, i + 1, STAGES.length);
        if (i + 1 < STAGES.length) {
            await this.#say([STAGE_OUTROS[stage.id]]);
            await this.#startStage(i + 1);
            return;
        }
        await this.#say(['The Ancient Tree stands straight again - every branch within one level of its neighbour. You have restored the Garden of Balance.']);
        this.panel.setVisible(false);
        this.finish({
            success: true,
            title: 'The garden is balanced!',
            lines: [
                `Final restoration: ${this.trial.questions} questions, ${this.trial.mistakes} mistakes`,
                `All answers: ${this.answers.right} right, ${this.answers.wrong} retries`,
                '',
                'BST + sorted input = a crooked tree: O(n).',
                'AVL: every node has BF = h(left) - h(right)',
                '  in -1..+1, so height stays O(log n).',
                'LL → rotate right · RR → rotate left',
                'LR → left at child, then right',
                'RL → right at child, then left',
            ],
        });
    }

    #show(animate) {
        const wt = this.lesson;
        const asking = wt.needsAnswer;
        const v = wt.view;
        const st = wt.state;
        const stage = STAGES[this.stageIndex];
        const nextItem = this.source.next;
        this.panel.show({
            heading: `Stage ${this.stageIndex + 1}/${STAGES.length} · ${stage.title}`,
            counter: this.trial ? `Questions ${this.trial.questions} · mistakes ${this.trial.mistakes}` : `Step ${wt.pos + 1}${wt.skipped ? ` · ${wt.skipped} folded` : ''}`,
            title: asking ? (this.trial ? 'Your answer' : 'Predict before you look') : v.title,
            text: asking ? wt.step.question.prompt : v.text,
            op: asking ? null : v.op,
            info: this.#info(st.tree),
            question: asking ? wt.step.question : null,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: !this.trial && wt.canSkip(),
            nextLabel: wt.atEnd ? (this.stageIndex + 1 < STAGES.length ? `Stage ${this.stageIndex + 2} ▶` : 'Finish ▶')
                : nextItem?.op === 'AVL' && this.stageIndex >= 3 && wt.pos + 1 >= wt.steps.length ? `Insert ${nextItem.key} ▶` : 'Next ▶',
        });
        const hl = { ...(st.hl ?? {}), selected: this.selected ?? st.hl?.selected };
        if (st.tree) this.view.draw(st.tree, hl, { animate });
        this.#drawStrip(st);
    }

    // Node inspection: everything comes from the C snapshot being shown.
    #info(tree) {
        const key = this.selected ?? null;
        const n = key != null ? tree?.nodes.find(x => x.key === key) : null;
        if (!n) return 'Click a node to inspect it.';
        if (n.height == null) return `Node ${n.key} (plain BST: no heights kept).`;
        const hl = heightOf(tree, n.left), hr = heightOf(tree, n.right);
        const meaning = n.bf > 1 || n.bf < -1 ? 'UNBALANCED' : n.bf > 0 ? 'left side taller' : n.bf < 0 ? 'right side taller' : 'both sides equal';
        return `Node ${n.key}: left height ${hl}, right height ${hr}\nheight ${n.height}, BF ${hl} - ${hr} = ${fmt(n.bf)} (${meaning})`;
    }

    #drawStrip(st) {
        const s = this.scene, c = this.strip;
        c.removeAll(true);
        const { x, y, w, h } = STRIP;
        c.add(s.add.rectangle(x, y, w, h, 0x14213d, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        const line = (ty, str, color = '#ffffff', size = 12) => c.add(s.add.text(x + 10, y + ty, str, textStyle(size, color)));
        const done = this.#progress();
        line(8, STAGES.map((sg, i) => `${i < done ? '✔' : i === this.stageIndex ? '▶' : '·'} ${i + 1} ${sg.short}`).join('   '), '#ffd60a', 12);
        const inorder = st.inorder ?? st.tree?.nodes.map(n => n.key).sort((a, b) => a - b) ?? [];
        line(30, `In-order: ${inorder.join(' ') || '-'}${st.valid != null ? `   ·   valid AVL (C): ${st.valid ? 'yes' : 'NO'}` : ''}`);
        line(54, 'Badge = balance factor (green 0, yellow ±1, red ±2) · h = height\nRed node = unbalanced · orange = child · gold = grandchild · blue = rotating', '#8d99ae', 10);
        const k = SPRITES.npc.keeper;
        if (s.textures.exists(k.texture)) {
            c.add(s.add.sprite(x + w - 30, y + h / 2 + 4, k.texture, k.frame).setScale(2.4));
            c.add(s.add.text(x + w - 30, y + 4, 'Elarion', textStyle(10, '#e5c07b')).setOrigin(0.5, 0));
        }
    }

    destroy() {
        this.panel?.destroy();
        this.view?.destroy();
    }
}

const STAGE_OUTROS = {
    crooked: 'You see it now: planted in order, a tree grows crooked, and every search climbs all of it. Next, the rule that keeps it straight.',
    rule: 'Every node within one level of its neighbour - that is balance. But what happens when an insertion breaks the rule?',
    rotations: 'Four ways to fall, four ways to stand. Now you plant the tree yourself.',
    training: 'Your hands are steady. One last tree - restore it alone.',
};
