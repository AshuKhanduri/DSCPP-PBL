// The Order of the Forge - the Blacksmith's shipment sorted by weight.
//
// Every sorting operation runs in the C engine (native/c/sort.c): the game
// sends SORT_START once, then asks for ONE operation at a time with
// SORT_STEP and draws the state C returns (rendering/RackView.js). The text
// for each operation comes from lessons/sortLessons.js.
//
//   stages 1-3   Bubble, Selection, Insertion walkthroughs (LiveWalkthrough):
//                Next = one more C operation, predictions before reveals,
//                Skip = finish the current pass as one summary, Restart = SORT_START again
//   stage 4      the trial: the player picks an algorithm and makes every
//                decision (swap? new minimum? shift?) before C performs it
import { SPRITES, UI } from '../config/assets.js';
import { COLORS, DEPTH, GAME_HEIGHT, textStyle } from '../config/constants.js';
import { RackView } from '../rendering/RackView.js';
import { LiveWalkthrough } from '../systems/LiveWalkthrough.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { frame } from '../ui/Frame.js';
import { LessonPanel } from '../ui/LessonPanel.js';
import { BaseChallenge, SIDEBAR } from './BaseChallenge.js';
import { DESCRIBERS, summarizeSort, trialQuestion } from './lessons/sortLessons.js';

const BOARD = { x: 10, y: 52, w: 614, h: 482 };
const RACK = { x: 24, y: 96, w: 586, h: 430 };
const STRIP = { x: 8, y: GAME_HEIGHT - 100, w: SIDEBAR.x - 16, h: 92 };

const NAMES = { BUBBLE: 'Bubble Sort', SELECTION: 'Selection Sort', INSERTION: 'Insertion Sort' };
const RULES = {
    BUBBLE: 'Rule: compare neighbours; swap when the LEFT one is heavier.',
    SELECTION: 'Rule: find the lightest unsorted item; it goes to the front of the unsorted part.',
    INSERTION: 'Rule: shift heavier sorted items right; drop the key into the gap.',
};
const STAGE_COUNT = 4;

export class ForgeOrderChallenge extends BaseChallenge {
    create() {
        const s = this.scene;
        const cfg = this.quest.config;
        this.sortName = cfg.sort;
        this.stages = cfg.stages;
        this.trialCfg = cfg.trial;
        this.resultArea = SIDEBAR;
        this.answers = { right: 0, wrong: 0 };

        frame(s, UI.dialogFrame, BOARD.x, BOARD.y, BOARD.w, BOARD.h, { corner: 7, fallback: 0xffffff }).setScrollFactor(0).setDepth(DEPTH.ui);
        s.add.text(BOARD.x + 18, BOARD.y + 14, 'THE FORGE RACK  ·  lightest → heaviest', textStyle(13, '#1d2b53', { fontStyle: 'bold' })).setScrollFactor(0).setDepth(DEPTH.ui + 1);
        this.strip = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 2);
        this.dialogue = new DialogueBox(s);
        this.panel = new LessonPanel(s, SIDEBAR, {
            onNext: () => this.#run(() => this.#next()),
            onSkip: () => this.#run(async () => { this.feedback = null; await this.lesson.skip(); this.#show(); }),
            onRestart: () => this.#run(() => this.#restart()),
            onAnswer: i => this.#run(() => this.#answer(i)),
            isBlocked: () => this.dialogue.isOpen || this.done || this.busy,
        }).setVisible(false);

        this.#run(() => this.#begin());
    }

    // One engine conversation at a time; errors are shown, never swallowed.
    async #run(fn) {
        if (this.busy) return;
        this.busy = true;
        try { await fn(); } catch (err) { this.#error(err); } finally { this.busy = false; }
    }

    #error(err) {
        this.panel.show({ heading: 'C engine error', title: 'The forge engine could not be reached', text: `${err.message}\n\nPress ESC to leave and try again.`, canNext: false, canRestart: false });
        this.panel.setVisible(true);
    }

    async #say(lines) {
        this.panel.setVisible(false);
        this.busy = false;   // the dialogue owns the keyboard meanwhile
        await this.dialogue.open(lines.map(text => ({ speaker: 'Blacksmith', text })));
        this.busy = true;
        this.panel.setVisible(true);
    }

    async #begin() {
        await this.#say([
            'A shipment came in from the capital and the carters stacked it any old way. Swords next to helms, heavy next to light.',
            'I pack the light gear first and hang the heavy pieces last. So everything on this rack must go lightest to heaviest.',
            'There is more than one way to sort a rack. I will show you three - and then you sort one yourself.',
        ]);
        await this.#startStage(0);
    }

    // ------------------------------------------------------------ walkthroughs

    async #startStage(index) {
        this.stageIndex = index;
        this.phase = 'lesson';
        const st = this.stages[index];
        this.rack?.destroy();
        this.rack = new RackView(this.scene, RACK, st.items);
        this.lesson = new LiveWalkthrough({
            start: () => this.api.dsa.sortStart(this.sortName, st.algorithm, st.values),
            step: () => this.api.dsa.sortStep(this.sortName),
        }, {
            makeDescribe: () => DESCRIBERS[st.algorithm](st.items),
            summarize: summarizeSort,
            canFold: steps => steps.some(s => s.endsGroup),   // after one full pass has been shown
        });
        await this.lesson.restart();
        this.feedback = null;
        this.#show();
    }

    async #next() {
        this.feedback = null;
        if (this.phase === 'trial') { await this.#trialNext(); return; }
        if (this.phase === 'choose') return;
        if (!this.lesson.atEnd) {
            await this.lesson.next();
            this.#show();
            return;
        }
        const algo = this.stages[this.stageIndex].algorithm;
        if (this.stageIndex + 1 < this.stages.length) {
            await this.#say(this.stages[this.stageIndex + 1].intro ?? [`Now ${NAMES[this.stages[this.stageIndex + 1].algorithm]}.`]);
            await this.#startStage(this.stageIndex + 1);
        } else {
            await this.#say([
                `${NAMES[algo]} done. Three ways to the same rack: Bubble swaps neighbours, Selection picks the lightest, Insertion slides each item into place.`,
                'Now a fresh crate. Pick the method you like - but YOU make every decision. My scale will check each one.',
            ]);
            this.#choose();
        }
    }

    async #restart() {
        this.feedback = null;
        if (this.phase === 'lesson') { this.rack.reset(); await this.lesson.restart(); this.#show(); }
        else if (this.phase === 'trial') await this.#startTrial(this.trial.algorithm);
    }

    async #answer(i) {
        if (this.phase === 'choose') { await this.#startTrial(['BUBBLE', 'SELECTION', 'INSERTION'][i]); return; }
        if (this.phase === 'trial') { this.#trialAnswer(i); return; }
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
        const st = this.stages[this.stageIndex];
        const asking = wt.needsAnswer;
        const v = wt.view;
        const raw = wt.state;
        this.panel.show({
            heading: `Stage ${this.stageIndex + 1}/${STAGE_COUNT} · ${NAMES[st.algorithm]}`,
            counter: `Operation ${wt.pos}${raw.pass ? ` · pass ${raw.pass}` : ''}${wt.skipped ? ` · ${wt.skipped} folded` : ''}`,
            title: asking ? 'Predict before you look' : v.title,
            text: asking ? wt.step.question.prompt : v.text,
            op: asking ? null : v.op,
            info: this.#info(raw),
            question: asking ? wt.step.question : null,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: wt.canSkip(),
            nextLabel: wt.atEnd ? (this.stageIndex + 1 < this.stages.length ? `${NAMES[this.stages[this.stageIndex + 1].algorithm].split(' ')[0]} ▶` : 'Final trial ▶') : 'Next ▶',
        });
        // while predicting, the board shows the state BEFORE the operation, or
        // the operation itself with its outcome hidden (which items are compared)
        this.rack.draw(asking && wt.step.question.showStep ? wt.step.state : raw, { reveal: !asking });
        this.#drawStrip(raw);
    }

    #info(raw) {
        const sorted = raw.sortedHi > raw.sortedLo ? `positions ${raw.sortedLo + 1}-${raw.sortedHi}` : 'none yet';
        return `Array in C: [${raw.values.map((x, k) => (k === raw.gap ? '_' : x)).join(', ')}]${raw.gap >= 0 ? `  key ${raw.key}` : ''}\nSorted part: ${sorted}`;
    }

    #drawStrip(raw) {
        const s = this.scene, c = this.strip;
        c.removeAll(true);
        const { x, y, w, h } = STRIP;
        c.add(s.add.rectangle(x, y, w, h, 0x14213d, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        const line = (ty, str, color = '#ffffff', size = 12) => c.add(s.add.text(x + 10, y + ty, str, textStyle(size, color)));
        line(8, `Pass ${raw.pass || '-'}  ·  comparisons ${raw.comparisons}  ·  swaps ${raw.swaps}  ·  shifts ${raw.shifts}${raw.done ? '  ·  DONE' : ''}`, '#ffd60a', 13);
        const stageNo = this.phase === 'lesson' ? this.stageIndex + 1 : STAGE_COUNT;
        line(32, `Stage ${stageNo} of ${STAGE_COUNT}: ${this.stages.map((st, i) => `${i < (this.stageIndex ?? 0) || this.phase !== 'lesson' ? '✔' : i === this.stageIndex ? '▶' : '·'} ${NAMES[st.algorithm].split(' ')[0]}`).join('   ')}   ${this.phase === 'trial' || this.phase === 'choose' ? '▶' : '·'} Trial`);
        line(56, 'Gold = being compared · Blue MIN = current minimum · Orange = key / gap\nGreen = just moved · Green plate = sorted part · Taller bar = heavier', '#8d99ae', 10);
        const smith = SPRITES.npc.blacksmith;
        if (s.textures.exists(smith.texture)) {
            c.add(s.add.sprite(x + w - 30, y + h / 2 + 4, smith.texture, smith.frame).setScale(2.4));
            c.add(s.add.text(x + w - 30, y + 4, 'Smith', textStyle(10, '#e5c07b')).setOrigin(0.5, 0));
        }
    }

    // ------------------------------------------------------------------ trial

    #choose() {
        this.phase = 'choose';
        this.panel.show({
            heading: `Stage ${STAGE_COUNT}/${STAGE_COUNT} · Final trial`,
            counter: '',
            title: 'Choose your method',
            text: `A new crate: ${this.trialCfg.values.join(', ')} kg.\n\nYou will sort it with the method you choose. Before C performs each decision, you decide - the Blacksmith's scale (the C engine) checks you.`,
            question: { choices: Object.values(NAMES).map(label => ({ label })) },
            canNext: false, canSkip: false, canRestart: false,
        });
    }

    async #startTrial(algorithm) {
        if (!algorithm) return;
        this.phase = 'trial';
        this.rack?.destroy();
        this.rack = new RackView(this.scene, RACK, this.trialCfg.items);
        const raw = await this.api.dsa.sortStart(this.sortName, algorithm, this.trialCfg.values);
        this.trial = { algorithm, current: raw, describe: DESCRIBERS[algorithm](this.trialCfg.items), decisions: 0, mistakes: 0, pending: null, log: [] };
        this.trial.describe(raw, null);
        this.feedback = null;
        await this.#trialNext();
    }

    // Ask C for operations until the next one that needs the player's decision.
    async #trialNext() {
        const t = this.trial;
        if (t.pending) return;   // still unanswered
        if (t.current.done) { await this.#trialEnd(); return; }
        t.log = [];
        for (;;) {
            const raw = await this.api.dsa.sortStep(this.sortName);
            const q = trialQuestion(t.algorithm, raw, t.current, this.trialCfg.items);
            const step = t.describe(raw, t.current);
            if (q) { t.pending = { raw, q, step }; break; }
            t.log.push(step.brief ?? step.title);
            t.current = raw;
            if (raw.done) break;
        }
        this.#showTrial();
    }

    #trialAnswer(i) {
        const t = this.trial;
        const choice = t.pending?.q.choices[i];
        if (!choice) return;
        if (!choice.correct) {
            t.mistakes++;
            this.#feedback(false, `${choice.why}\nHint: ${RULES[t.algorithm].replace('Rule: ', '')}`);
            this.#showTrial();
            return;
        }
        this.#feedback(true, choice.why);
        t.decisions++;
        t.current = t.pending.raw;
        t.revealed = t.pending.step;
        t.pending = null;
        this.#showTrial();
    }

    #showTrial() {
        const t = this.trial;
        const asking = Boolean(t.pending);
        const done = !asking && t.current.done;
        const happened = t.log.length ? `What C did meanwhile:\n${t.log.map(l => `• ${l}`).join('\n')}\n\n` : '';
        this.panel.show({
            heading: `Final trial · ${NAMES[t.algorithm]}`,
            counter: `Decisions ${t.decisions} · mistakes ${t.mistakes}`,
            title: asking ? 'Your decision' : done ? 'The crate is sorted' : t.revealed?.title ?? '',
            text: asking ? `${happened}${t.pending.q.prompt}` : done ? `${happened}Every decision has been checked.` : t.revealed?.text ?? '',
            op: asking ? null : t.revealed?.op ?? null,
            info: `${this.#info(t.current)}\n${RULES[t.algorithm]}`,
            question: asking ? t.pending.q : null,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: false,
            nextLabel: done ? 'Show result ▶' : 'Next ▶',
        });
        this.rack.draw(asking && t.pending.raw.op === 'COMPARE' ? t.pending.raw : t.current, { reveal: !asking });
        this.#drawStrip(t.current);
    }

    async #trialEnd() {
        const t = this.trial;
        const allowed = Math.max(2, Math.ceil(t.decisions / 4));
        if (t.mistakes > allowed) {
            await this.#say([
                `The rack is sorted, but you slipped on ${t.mistakes} of ${t.decisions} decisions. A smith who guesses ruins good steel.`,
                `Go over the rule again: ${RULES[t.algorithm].replace('Rule: ', '')} Then try a fresh crate - same method or another.`,
            ]);
            this.#choose();
            return;
        }
        this.panel.setVisible(false);
        this.finish({
            success: true,
            title: 'The rack is in order!',
            lines: [
                `Trial: ${NAMES[t.algorithm]}, ${t.decisions} decisions, ${t.mistakes} mistakes`,
                `Final rack (C): ${t.current.values.join(', ')} kg`,
                `C did ${t.current.comparisons} comparisons, ${t.current.swaps} swaps, ${t.current.shifts} shifts`,
                `Lesson answers: ${this.answers.right} right, ${this.answers.wrong} retries`,
                '',
                'Bubble: swap heavier neighbours right;',
                '  a pass with no swaps means sorted.',
                'Selection: pick the lightest unsorted,',
                '  one swap per pass.',
                'Insertion: shift heavier items right,',
                '  drop the key in the gap.',
            ],
        });
    }

    destroy() {
        this.panel?.destroy();
        this.rack?.destroy();
        this.api.dsa.sortClear(this.sortName).catch(() => {});   // frees the run in C
    }
}
