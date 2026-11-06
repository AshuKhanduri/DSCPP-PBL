// Walkthrough - the player-paced step engine behind every algorithm lesson
// (Lost Path BFS / DFS, Royal Registry BST). No Phaser here: it only decides
// which step is shown, so it can be tested in Node.
//
// A step is plain data built from what the C engine reported:
//   { kind, title, text, op, brief, state,
//     skippable,   may be folded into a "skip repeated steps" summary
//     boundary,    a summary stops before this step (e.g. a new BFS level)
//     question }   optional prediction: { prompt, choices: [{ label, correct, why }], state? }
//
// next()  -> the following step (blocked while a question is unanswered)
// skip()  -> folds the run of upcoming skippable steps into ONE summary step
//            whose text lists every operation it covers (nothing is hidden)
// restart() -> back to step 1

import { ScoreKeeper, scoreKeeper } from './ScoreKeeper.js';

export const MIN_SKIP = 2;   // a "run" must cover at least this many steps
export const MAX_SKIP = 8;   // ...and at most this many, so its summary stays readable

export class Walkthrough {
    // summarize(steps) -> { title, text, op } describing the folded steps
    constructor(steps, { summarize }) {
        if (!steps.length) throw new Error('a walkthrough needs at least one step');
        this.steps = steps;
        this.summarize = summarize;
        this.restart();
    }

    restart() {
        this.pos = 0;
        this.answered = new Set();
        this.skipped = 0;
        this.view = this.steps[0];
    }

    get total() { return this.steps.length; }
    get atEnd() { return this.pos >= this.steps.length - 1; }
    get step() { return this.steps[this.pos]; }

    // A prediction is asked before its step is revealed.
    get needsAnswer() {
        return Boolean(this.view === this.step && this.step.question && !this.answered.has(this.pos));
    }

    // State to draw: while a question is open, the world BEFORE the step.
    get state() {
        if (this.needsAnswer) return this.step.question.state ?? this.steps[this.pos - 1]?.state ?? this.step.state;
        return this.view.state;
    }

    answer(index) {
        const choice = this.step.question?.choices[index];
        if (!choice || !this.needsAnswer) return null;
        scoreKeeper.record(ScoreKeeper.keyOf(this.pos, this.step.question), choice.correct === true);   // first attempt only
        if (choice.correct) this.answered.add(this.pos);
        return choice;
    }

    next() {
        if (this.needsAnswer || this.atEnd) return false;
        this.pos++;
        this.view = this.steps[this.pos];
        return true;
    }

    // The steps a skip would fold, starting right after the current one.
    upcomingRun() {
        if (this.needsAnswer) return [];
        const run = [];
        for (let i = this.pos + 1; i < this.steps.length; i++) {
            const s = this.steps[i];
            if (!s.skippable || (run.length && s.boundary) || run.length >= MAX_SKIP) break;
            run.push(s);
        }
        return run;
    }

    canSkip() {
        return this.upcomingRun().length >= MIN_SKIP;
    }

    skip() {
        const run = this.upcomingRun();
        if (run.length < MIN_SKIP) return false;
        this.pos += run.length;
        this.skipped += run.length;
        const last = run[run.length - 1];
        this.view = { ...this.summarize(run), kind: 'summary', covers: run.length, state: last.state };
        return true;
    }
}
