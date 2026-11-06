// Tower of Trials - Stack, Linear Queue and Circular Queue.
//
// Every operation runs in the C engine (native/c/stack.c, queue.c): the
// lessons are scripts of operations sent to C one at a time
// (lessons/towerLessons.js), drawn from C's answers (rendering/TowerViews.js).
//
//   hub          choose a chamber; each one unlocks the next. Progress is the
//                quest's progress in QuestManager (0-4), so restarting or
//                leaving a chamber never loses it.
//   chambers     1 Stack       lesson + free practice
//                2 Queue       linear-queue lesson, circular-queue lesson, practice
//                3 Comparison  stack and queue fed the same values
//   trial        the Guardian's three seals: every step asks first, graded
import { SPRITES, UI } from '../config/assets.js';
import { COLORS, DEPTH, GAME_HEIGHT, textStyle } from '../config/constants.js';
import { CircularQueueView, eventOf, LinearQueueView, StackView } from '../rendering/TowerViews.js';
import { LiveWalkthrough } from '../systems/LiveWalkthrough.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { frame } from '../ui/Frame.js';
import { LessonPanel } from '../ui/LessonPanel.js';
import { BaseChallenge, SIDEBAR } from './BaseChallenge.js';
import { makeTowerDescriber, makeTowerSource, SCRIPTS, summarizeTower, TRIALS } from './lessons/towerLessons.js';

const BOARD = { x: 10, y: 52, w: 614, h: 482 };
const AREA = { x: 22, y: 92, w: 590, h: 432 };
const STRIP = { x: 8, y: GAME_HEIGHT - 100, w: SIDEBAR.x - 16, h: 92 };
const CAPACITY = 5;
const PRACTICE_VALUES = [15, 25, 35, 45, 55, 65, 75, 85, 95];

const CHAMBERS = [
    {
        id: 'stack', title: 'Stack Chamber', practice: 'stack',
        lessons: [{ structure: 'stack' }],
        intro: ['The first chamber holds a STACK. Whatever goes in last comes out first - Last In, First Out.'],
    },
    {
        id: 'queue', title: 'Queue Chamber', practice: 'circular',
        lessons: [
            { structure: 'linear' },
            { structure: 'circular', intro: ['The simple queue wasted its freed slots. The old builders solved this: let the indices go round in a circle.'] },
        ],
        intro: ['The second chamber holds a QUEUE. Whatever goes in first comes out first - First In, First Out.'],
    },
    {
        id: 'compare', title: 'Comparison Chamber', practice: null,
        lessons: [{ structure: 'compare' }],
        intro: ['Now both at once. Same offerings, same order. Watch which ones each returns.'],
    },
    { id: 'trial', title: "The Guardian's Trial" },
];

const NAME = { stack: 'Stack', linear: 'Linear queue', circular: 'Circular queue', compare: 'Stack vs Queue' };

export class TowerChallenge extends BaseChallenge {
    create() {
        const s = this.scene;
        this.names = { stack: 'tower_stack', queue: 'tower_queue' };
        this.resultArea = SIDEBAR;
        this.answers = { right: 0, wrong: 0 };

        frame(s, UI.dialogFrame, BOARD.x, BOARD.y, BOARD.w, BOARD.h, { corner: 7, fallback: 0xffffff }).setScrollFactor(0).setDepth(DEPTH.ui);
        this.boardTitle = s.add.text(BOARD.x + 18, BOARD.y + 14, 'TOWER OF TRIALS', textStyle(13, '#1d2b53', { fontStyle: 'bold' })).setScrollFactor(0).setDepth(DEPTH.ui + 1);
        this.strip = s.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 2);
        this.views = [];
        this.dialogue = new DialogueBox(s);
        this.panel = new LessonPanel(s, SIDEBAR, {
            onNext: () => this.#run(() => this.#next()),
            onSkip: () => this.#run(async () => { this.feedback = null; await this.lesson.skip(); this.#show(true); }),
            onRestart: () => this.#run(() => this.#restart()),
            onAnswer: i => this.#run(() => this.#answer(i)),
            isBlocked: () => this.dialogue.isOpen || this.done || this.busy,
        }).setVisible(false);

        this.#run(async () => {
            if (this.#progress() === 0) {
                await this.#say([
                    'So you carry the Royal Seal. Listen well, climber.',
                    'Every piece of knowledge here must follow an order. Some must leave in the REVERSE order they arrived - the newest first. Others leave in the SAME order they came - the oldest first.',
                    'Master both rules - the STACK and the QUEUE - and the final gate will open.',
                ]);
            }
            this.#hub();
        });
    }

    // One engine conversation at a time; errors are shown, never swallowed.
    async #run(fn) {
        if (this.busy) return;
        this.busy = true;
        try { await fn(); } catch (err) {
            this.panel.show({ heading: 'C engine error', title: 'The tower engine could not be reached', text: `${err.message}\n\nPress ESC to leave and try again.`, canNext: false, canRestart: false });
            this.panel.setVisible(true);
        } finally { this.busy = false; }
    }

    async #say(lines) {
        this.panel.setVisible(false);
        this.busy = false;
        await this.dialogue.open(lines.map(text => ({ speaker: 'Guardian', text })));
        this.busy = true;
        this.panel.setVisible(true);
    }

    // chambers completed, kept in the quest's progress (QuestManager)
    #progress() {
        return this.services.quests.progress.get(this.quest.id)?.current ?? 0;
    }

    #setViews(structure) {
        this.views.forEach(v => v.destroy());
        const s = this.scene;
        const half = { ...AREA, w: AREA.w / 2 - 6 };
        const right = { ...AREA, x: AREA.x + AREA.w / 2 + 6, w: AREA.w / 2 - 6 };
        this.views = structure === 'stack' ? [new StackView(s, AREA)]
            : structure === 'linear' ? [new LinearQueueView(s, AREA)]
                : structure === 'circular' ? [new CircularQueueView(s, AREA)]
                    : structure === 'compare' ? [new StackView(s, half), new LinearQueueView(s, right)] : [];
        this.structure = structure;
    }

    // ------------------------------------------------------------------- hub

    #hub() {
        this.phase = 'hub';
        this.#setViews(null);
        this.boardTitle.setText('TOWER OF TRIALS  ·  choose a chamber');
        const done = this.#progress();
        this.panel.show({
            heading: 'Tower of Trials',
            counter: `Chambers cleared: ${Math.min(done, 3)}/3${done >= 4 ? ' · trial passed' : ''}`,
            title: 'Choose a chamber',
            text: 'Each chamber opens when the one before it is cleared. You can replay any open chamber; your progress is kept.',
            question: {
                choices: CHAMBERS.map((c, i) => ({ label: `${i < done ? '✔' : i === done ? '▶' : '✖'} ${c.title}${i > done ? ' (locked)' : ''}` })),
            },
            feedback: this.feedback,
            canNext: false, canSkip: false, canRestart: false,
        });
        this.#drawStrip();
    }

    async #enter(i) {
        const done = this.#progress();
        if (i > done) {
            this.feedback = { text: `Locked. Clear the ${CHAMBERS[done].title} first.`, color: '#ff8fa3' };
            this.#hub();
            return;
        }
        this.feedback = null;
        this.chamberIndex = i;
        const ch = CHAMBERS[i];
        if (ch.id === 'trial') { await this.#startTrial(); return; }
        await this.#say(ch.intro);
        await this.#startLesson(0);
    }

    // --------------------------------------------------------------- lessons

    #source(structure, script, capacity) {
        return makeTowerSource(this.api, structure, this.names, capacity, script);
    }

    async #startLesson(index) {
        const ch = CHAMBERS[this.chamberIndex];
        this.lessonIndex = index;
        this.phase = 'lesson';
        const { structure } = ch.lessons[index];
        this.#setViews(structure);
        this.boardTitle.setText(`${ch.title.toUpperCase()}  ·  ${NAME[structure]}`);
        const src = this.#source(structure, SCRIPTS[structure], CAPACITY);
        this.lesson = new LiveWalkthrough(src, {
            makeDescribe: () => makeTowerDescriber(structure),
            summarize: summarizeTower,
            canFold: () => Boolean(src.next?.fold),
        });
        await this.lesson.restart();
        this.feedback = null;
        this.#show(true);
    }

    async #next() {
        this.feedback = null;
        if (this.phase === 'practice') { await this.#completeChamber(); return; }
        if (this.phase === 'trialEnd') { await this.#trialEnd(); return; }
        if (!this.lesson.atEnd) {
            await this.lesson.next();
            this.#show(true);
            return;
        }
        if (this.phase === 'trial') { await this.#nextSeal(); return; }
        const ch = CHAMBERS[this.chamberIndex];
        const nextLesson = ch.lessons[this.lessonIndex + 1];
        if (nextLesson) {
            if (nextLesson.intro) await this.#say(nextLesson.intro);
            await this.#startLesson(this.lessonIndex + 1);
        } else if (ch.practice) {
            await this.#startPractice(ch.practice);
        } else {
            await this.#completeChamber();
        }
    }

    async #restart() {
        this.feedback = null;
        if (this.phase === 'practice') { await this.#startPractice(this.practice.structure); return; }
        if (this.phase === 'lesson' || this.phase === 'trial') {
            await this.lesson.restart();   // re-creates the structure in C
            this.#show(true);
        }
    }

    async #answer(i) {
        if (this.phase === 'hub') { await this.#enter(i); return; }
        if (this.phase === 'practice') { await this.#practiceAction(i); return; }
        if (this.phase !== 'lesson' && this.phase !== 'trial') return;
        const choice = this.lesson.answer(i);
        if (!choice) return;
        if (this.phase === 'trial') { this.trial.questions += choice.correct ? 1 : 0; if (!choice.correct) this.trial.mistakes++; }
        if (choice.correct) this.answers.right++; else this.answers.wrong++;
        this.feedback = choice.correct
            ? { text: `✔ ${choice.why}`, color: '#52b788' }
            : { text: `✘ ${choice.why}${this.phase === 'trial' ? `\nHint: ${HINTS[this.trial.seal.structure]}` : ''}\nTry again.`, color: '#ff8fa3' };
        this.#show(false);
    }

    #show(animate) {
        const wt = this.lesson;
        const asking = wt.needsAnswer;
        const v = wt.view;
        const st = wt.state;
        const trial = this.phase === 'trial';
        const ch = CHAMBERS[this.chamberIndex];
        const lessons = ch.lessons ?? [];
        this.panel.show({
            heading: trial ? `Trial · ${this.trial.seal.title}` : `${ch.title} · ${NAME[this.structure]}`,
            counter: trial
                ? `Seal ${this.trial.index + 1}/${TRIALS.length} · mistakes ${this.trial.mistakes}`
                : `Step ${wt.pos + 1}${lessons.length > 1 ? ` · part ${this.lessonIndex + 1}/${lessons.length}` : ''}${wt.skipped ? ` · ${wt.skipped} folded` : ''}`,
            title: asking ? (trial ? 'Your answer' : 'Predict before you look') : v.title,
            text: asking ? `Next: ${opLabel(wt.step.state.item)}\n\n${wt.step.question.prompt}` : v.text,
            op: asking ? null : v.op,
            info: this.#info(st),
            question: asking ? wt.step.question : null,
            feedback: this.feedback,
            canNext: !asking,
            canSkip: !trial && wt.canSkip(),
            nextLabel: wt.atEnd ? (trial ? (this.trial.index + 1 < TRIALS.length ? 'Next seal ▶' : 'Face the Guardian ▶') : this.#endLabel()) : 'Next ▶',
        });
        // while a question is open the board shows the state BEFORE the operation
        this.#draw(st, animate && !asking, !asking && v.op?.includes('%') ? v.op.split(';')[0] : '');
        this.#drawStrip(st);
    }

    #endLabel() {
        const ch = CHAMBERS[this.chamberIndex];
        if (ch.lessons[this.lessonIndex + 1]) return 'Circular queue ▶';
        return ch.practice ? 'Practice ▶' : 'Clear chamber ▶';
    }

    #draw(state, animate, formula = '') {
        if (!state) return;
        const b = state.bodies;
        const item = animate ? state.item : null;
        if (this.structure === 'compare') {
            this.views[0].draw(b.stack, eventOf(item, b.stack, true));
            this.views[1].draw(b.linear, eventOf(item, b.linear, false), { title: 'QUEUE' });
        } else {
            const body = b[this.structure];
            this.views[0].draw(body, eventOf(item, body, this.structure === 'stack'), { formula });
        }
    }

    #info(state) {
        if (!state) return '';
        const b = state.bodies;
        const line = (k, body) => (k === 'stack'
            ? `Stack in C: [${body.items.map(i => i.value).reverse().join(', ')}]  TOP ${body.items[0]?.value ?? '-'}  size ${body.size}/${body.capacity}`
            : `Queue in C: [${body.items.map(i => i.value).join(', ')}]  FRONT ${body.frontIndex}  REAR ${body.rearIndex}  size ${body.size}/${body.capacity}`);
        return Object.entries(b).map(([k, body]) => line(k, body)).join('\n');
    }

    #drawStrip(state) {
        const s = this.scene, c = this.strip;
        c.removeAll(true);
        const { x, y, w, h } = STRIP;
        c.add(s.add.rectangle(x, y, w, h, 0x14213d, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        const line = (ty, str, color = '#ffffff', size = 12) => c.add(s.add.text(x + 10, y + ty, str, textStyle(size, color)));
        const done = this.#progress();
        line(8, CHAMBERS.map((ch, i) => `${i < done ? '✔' : i === this.chamberIndex && this.phase !== 'hub' ? '▶' : i === done ? '·' : '✖'} ${ch.title.replace(' Chamber', '').replace("The Guardian's ", '')}`).join('   '), '#ffd60a', 12);
        if (state) {
            const b = Object.values(state.bodies)[0];
            line(30, `empty: ${b.empty}   full: ${b.full}   size: ${b.size}/${b.capacity}`);
        }
        line(54, 'Stack: TOP = last in, first out\nQueue: FRONT leaves first, REAR is where new ones join', '#8d99ae', 10);
        const g = SPRITES.npc.guard;
        if (s.textures.exists(g.texture)) {
            c.add(s.add.sprite(x + w - 30, y + h / 2 + 4, g.texture, g.frame).setScale(2.4));
            c.add(s.add.text(x + w - 30, y + 4, 'Guardian', textStyle(10, '#e5c07b')).setOrigin(0.5, 0));
        }
    }

    // -------------------------------------------------------------- practice

    async #startPractice(structure) {
        this.phase = 'practice';
        this.#setViews(structure);
        this.boardTitle.setText(`${CHAMBERS[this.chamberIndex].title.toUpperCase()}  ·  free practice`);
        const script = [];
        const src = this.#source(structure, script, CAPACITY);
        this.practice = { structure, script, src, describe: makeTowerDescriber(structure), state: null, count: 0, added: false, removed: false, valueIndex: 0, last: null };
        const raw = await src.start();
        this.practice.state = { structure, bodies: raw.bodies, item: null };
        this.practice.last = this.practice.describe(raw);
        this.#showPractice(false);
    }

    #practiceActions() {
        const p = this.practice;
        const v = PRACTICE_VALUES[p.valueIndex % PRACTICE_VALUES.length];
        return p.structure === 'stack'
            ? [{ label: `PUSH ${v}`, item: { op: 'PUSH', value: v } }, { label: 'POP', item: { op: 'POP' } }, { label: 'PEEK', item: { op: 'PEEK' } },
                { label: 'isEmpty()', item: { op: 'IS_EMPTY' } }, { label: 'isFull()', item: { op: 'IS_FULL' } }, { label: 'RESET (empty it)', reset: true }]
            : [{ label: `ENQUEUE ${v}`, item: { op: 'ENQ', value: v } }, { label: 'DEQUEUE', item: { op: 'DEQ' } }, { label: 'FRONT', item: { op: 'FRONT' } },
                { label: 'isEmpty()', item: { op: 'IS_EMPTY' } }, { label: 'isFull()', item: { op: 'IS_FULL' } }, { label: 'RESET (empty it)', reset: true }];
    }

    async #practiceAction(i) {
        const p = this.practice;
        const action = this.#practiceActions()[i];
        if (!action) return;
        if (action.reset) { await this.#startPractice(p.structure); return; }
        p.script.push(action.item);
        const raw = await p.src.step();     // C performs it; failures come back with the state
        const body = raw.bodies[p.structure];
        p.last = p.describe(raw);
        p.state = { structure: p.structure, bodies: raw.bodies, item: action.item };
        p.count++;
        if (body.ok !== false && (action.item.op === 'PUSH' || action.item.op === 'ENQ')) { p.added = true; p.valueIndex++; }
        if (body.ok !== false && (action.item.op === 'POP' || action.item.op === 'DEQ')) p.removed = true;
        this.#showPractice(true);
    }

    #showPractice(animate) {
        const p = this.practice;
        const ready = p.count >= 4 && p.added && p.removed;
        this.panel.show({
            heading: `${CHAMBERS[this.chamberIndex].title} · practice`,
            counter: `Operations: ${p.count}`,
            title: p.last.title,
            text: `${p.last.text}\n\nTry it yourself: overflow, underflow, ${p.structure === 'stack' ? 'PEEK vs POP' : 'wrap-around'}.${ready ? '' : '\n(Do at least 4 operations, including an add and a remove.)'}`,
            op: p.last.op,
            info: this.#info(p.state),
            question: { choices: this.#practiceActions().map(a => ({ label: a.label })) },
            canNext: ready, canSkip: false,
            nextLabel: 'Clear chamber ▶',
        });
        const body = p.state.bodies[p.structure];
        this.views[0].draw(body, animate ? eventOf(p.state.item, body, p.structure === 'stack') : null, { formula: p.last.op?.includes('%') ? p.last.op.split(';')[0] : '' });
        this.#drawStrip(p.state);
    }

    async #completeChamber() {
        const i = this.chamberIndex;
        if (i === this.#progress()) {
            this.services.quests.setProgress(this.quest.id, i + 1, CHAMBERS.length);
            this.services.history.record('CHAMBER_CLEARED', CHAMBERS[i].id);
        }
        await this.#say([`The ${CHAMBERS[i].title} is cleared.${CHAMBERS[i + 1] ? ` The way to the ${CHAMBERS[i + 1].title} is open.` : ''}`]);
        this.#hub();
    }

    // ------------------------------------------------------------------ trial

    async #startTrial() {
        await this.#say([
            'You have seen the chambers. Now prove it: three seals - the stack, the queue, the circle.',
            'Before each step I show you, tell me what will happen. Guess, and the seals stay shut.',
        ]);
        this.trial = { index: -1, mistakes: 0, questions: 0 };
        await this.#nextSeal();
    }

    async #nextSeal() {
        this.trial.index++;
        if (this.trial.index >= TRIALS.length) { this.phase = 'trialEnd'; await this.#trialEnd(); return; }
        const seal = TRIALS[this.trial.index];
        this.trial.seal = seal;
        this.phase = 'trial';
        this.#setViews(seal.structure);
        this.boardTitle.setText(`THE GUARDIAN'S TRIAL  ·  ${seal.title.toUpperCase()}`);
        const src = this.#source(seal.structure, seal.script, seal.capacity);
        this.lesson = new LiveWalkthrough(src, { makeDescribe: () => makeTowerDescriber(seal.structure, { trial: true }), summarize: summarizeTower, canFold: () => false });
        await this.lesson.restart();
        this.feedback = null;
        this.#show(true);
    }

    async #trialEnd() {
        const t = this.trial;
        const allowed = Math.max(2, Math.ceil(t.questions / 3));
        if (t.mistakes > allowed) {
            await this.#say([
                `You stumbled ${t.mistakes} times on ${t.questions} questions. The seals do not open for guesses.`,
                'Walk the chambers again if you need to, then face me once more.',
            ]);
            this.#hub();
            return;
        }
        if (this.#progress() < CHAMBERS.length) this.services.quests.setProgress(this.quest.id, CHAMBERS.length, CHAMBERS.length);
        this.panel.setVisible(false);
        this.finish({
            success: true,
            title: 'The final gate opens!',
            lines: [
                `Trial: ${t.questions} questions, ${t.mistakes} mistakes`,
                `All answers: ${this.answers.right} right, ${this.answers.wrong} retries`,
                '',
                'Stack - LIFO: PUSH, POP and PEEK all use',
                '  the TOP. Full → overflow, empty → underflow.',
                'Queue - FIFO: join at the REAR, leave at',
                '  the FRONT.',
                'Linear queue - indices only move right,',
                '  freed slots are wasted.',
                'Circular queue - (index + 1) % capacity',
                '  wraps around and reuses freed slots.',
            ],
        });
    }

    destroy() {
        this.panel?.destroy();
        this.views.forEach(v => v.destroy());
    }
}

const HINTS = {
    stack: 'a stack only ever touches its TOP - the newest element.',
    linear: 'a queue removes at the FRONT - the oldest element.',
    circular: 'indices move with (index + 1) % capacity; size == capacity means full.',
};

function opLabel(item) {
    if (!item) return '';
    const names = { ENQ: 'ENQUEUE', DEQ: 'DEQUEUE', IS_EMPTY: 'isEmpty', IS_FULL: 'isFull', ADD: 'PUSH / ENQUEUE', REMOVE: 'POP / DEQUEUE' };
    return `${names[item.op] ?? item.op}(${item.value ?? ''})`;
}
