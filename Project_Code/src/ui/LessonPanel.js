// LessonPanel - the explanation panel shared by every algorithm lesson
// (Lost Path BFS / DFS, Royal Registry BST). It shows one Walkthrough step:
//
//   heading
//   step title
//   explanation (what happened and WHY)
//   C operation that did it
//   data-structure state
//   prediction choices + feedback (when the step asks a question)
//   step counter + key hints
//   [Next ▶]  [Skip repeats]  [Restart]
//
// The player always advances: nothing moves on a timer.
// Keys: ENTER / SPACE / E = next, S = skip repeated steps, R = restart, 1-9 = answer.
import { COLORS, DEPTH, textStyle } from '../config/constants.js';
import { Button } from './Button.js';

const PAD = 12;
const KEY_GRACE_MS = 300;   // ignore the key press that closed a dialogue

export class LessonPanel {
    // area: { x, y, w, h } on screen
    // handlers: { onNext, onSkip, onRestart, onAnswer(i), isBlocked() }
    constructor(scene, area, handlers) {
        this.scene = scene;
        this.area = area;
        this.handlers = handlers;
        this.blockedAt = 0;
        const { x, y, w, h } = area;
        const add = obj => { this.root.add(obj); return obj; };
        this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.ui + 5);

        add(scene.add.rectangle(x, y, w, h, COLORS.panel, 1).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder));
        this.heading = add(scene.add.text(x + PAD, y + 10, '', textStyle(15, '#e5c07b', { fontStyle: 'bold' })));
        this.title = add(scene.add.text(x + PAD, y + 34, '', textStyle(14, '#ffffff', { fontStyle: 'bold', wordWrap: { width: w - 2 * PAD } })));
        this.body = add(scene.add.text(x + PAD, 0, '', textStyle(12, '#e0e6ed', { wordWrap: { width: w - 2 * PAD }, lineSpacing: 3 })));
        this.opBg = add(scene.add.rectangle(x + PAD - 4, 0, w - 2 * PAD + 8, 10, 0x0d1b2a, 0.9).setOrigin(0).setStrokeStyle(1, 0x2a9d8f));
        this.op = add(scene.add.text(x + PAD, 0, '', textStyle(11, '#80ffdb', { wordWrap: { width: w - 2 * PAD } })));
        this.info = add(scene.add.text(x + PAD, 0, '', textStyle(12, '#c9d1d9', { wordWrap: { width: w - 2 * PAD }, lineSpacing: 2 })));
        this.feedback = add(scene.add.text(x + PAD, 0, '', textStyle(12, '#52b788', { fontStyle: 'bold', wordWrap: { width: w - 2 * PAD }, lineSpacing: 2 })));
        this.choices = [];

        const by = y + h - 40;
        const bw = Math.floor((w - 2 * PAD - 12) / 3);
        this.nextBtn = new Button(scene, x + PAD, by, 'Next ▶', () => this.#act('next'), { width: bw + 10, height: 30, size: 12, color: 0x2d6a4f });
        this.skipBtn = new Button(scene, x + PAD + bw + 16, by, 'Skip repeats', () => this.#act('skip'), { width: bw, height: 30, size: 11 });
        this.restartBtn = new Button(scene, x + PAD + 2 * bw + 22, by, 'Restart', () => this.#act('restart'), { width: bw - 10, height: 30, size: 11, color: 0x6c3a3a });
        this.keysHint = add(scene.add.text(x + w / 2, by - 6, 'ENTER next · S skip repeats · R restart', textStyle(10, '#8d99ae')).setOrigin(0.5, 1));
        this.counter = add(scene.add.text(x + w / 2, by - 22, '', textStyle(11, '#c9d1d9')).setOrigin(0.5, 1));
        for (const b of [this.nextBtn, this.skipBtn, this.restartBtn]) {
            b.container.setScrollFactor(0);
            this.root.add(b.container);
        }

        this.keyHandler = event => this.#onKey(event);
        scene.input.keyboard.on('keydown', this.keyHandler);
    }

    // view: { heading, counter, title, text, op, info, question, feedback: {text, color},
    //         canNext, canSkip, canRestart, nextLabel }
    show(view) {
        const { x, w } = this.area;
        this.heading.setText(view.heading ?? '');
        this.counter.setText(view.counter ?? '');
        this.title.setText(view.title ?? '');
        let cy = this.title.y + this.title.height + 8;

        this.body.setText(view.text ?? '').setY(cy);
        cy += this.body.height + 8;

        this.op.setText(view.op ? `C ▸ ${view.op}` : '').setY(cy + 4);
        this.opBg.setVisible(Boolean(view.op)).setY(cy).setSize(w - 2 * PAD + 8, this.op.height + 8);
        if (view.op) cy += this.op.height + 16;

        this.info.setText(view.info ?? '').setY(cy);
        if (view.info) cy += this.info.height + 8;

        this.choices.forEach(c => c.destroy());
        this.choices = [];
        if (view.question) {
            view.question.choices.forEach((choice, i) => {
                const btn = new Button(this.scene, x + PAD, cy, `${i + 1}  ${choice.label}`, () => this.#act('answer', i), {
                    width: w - 2 * PAD, height: 26, size: 11, color: 0x1d3d8f,
                });
                btn.text.setOrigin(0, 0.5).setX(10);   // labels are kept to one line
                btn.container.setScrollFactor(0);
                this.root.add(btn.container);
                this.choices.push(btn);
                cy += 30;
            });
            cy += 4;
        }

        this.feedback.setText(view.feedback?.text ?? '').setColor(view.feedback?.color ?? '#52b788').setY(cy);

        this.nextBtn.setLabel(view.nextLabel ?? 'Next ▶').setEnabled(view.canNext !== false);
        this.skipBtn.setEnabled(Boolean(view.canSkip));
        this.restartBtn.setEnabled(view.canRestart !== false);
        this.view = view;
    }

    setVisible(v) {
        this.root.setVisible(v);
        return this;
    }

    #act(action, arg) {
        const v = this.view;
        if (!v || !this.root.visible) return;
        if (action === 'next' && v.canNext !== false) this.handlers.onNext?.();
        else if (action === 'skip' && v.canSkip) this.handlers.onSkip?.();
        else if (action === 'restart' && v.canRestart !== false) this.handlers.onRestart?.();
        else if (action === 'answer' && v.question) this.handlers.onAnswer?.(arg);
    }

    #onKey(event) {
        const now = this.scene.time.now;
        if (this.handlers.isBlocked?.()) { this.blockedAt = now; return; }
        if (now - this.blockedAt < KEY_GRACE_MS || !this.root.visible) return;
        const k = event.key;
        if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E') this.#act('next');
        else if (k === 's' || k === 'S') this.#act('skip');
        else if (k === 'r' || k === 'R') this.#act('restart');
        else if (/^[1-9]$/.test(k)) this.#act('answer', Number(k) - 1);
    }

    destroy() {
        this.scene.input.keyboard.off('keydown', this.keyHandler);
        this.choices.forEach(c => c.destroy());
        this.root.destroy();
    }
}
