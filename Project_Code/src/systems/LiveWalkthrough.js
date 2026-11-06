// LiveWalkthrough - a Walkthrough whose steps are fetched from the C engine
// ONE operation at a time (Order of the Forge sorting lessons), instead of
// being known in advance like Walkthrough's.
//
//   source.start() -> first raw state (C: SORT_START)
//   source.step()  -> raw state after one more operation (C: SORT_STEP)
//   makeDescribe() -> describe(raw, prev) -> step { kind, title, text, op, brief, state,
//                                 question?, endsGroup?, done? }
//
// next()    asks C for the next operation (or re-shows one already fetched).
//           A step's prediction question is asked BEFORE it is revealed; the
//           answer is checked against what C actually did.
// skip()    asks C for operations up to the end of the current group (a pass)
//           and shows them as ONE summary listing every operation.
// restart() starts the algorithm again in C.
// No Phaser here, so it can be tested in Node with a fake source.

import { ScoreKeeper, scoreKeeper } from './ScoreKeeper.js';

export const LIVE_MAX_SKIP = 12;

export class LiveWalkthrough {
    // makeDescribe is called on every restart, so a describer can count what it
    // has already explained (first comparison, first swap...) from scratch.
    constructor(source, { makeDescribe, summarize, canFold = () => true }) {
        this.source = source;
        this.makeDescribe = makeDescribe;
        this.summarize = summarize;
        this.canFold = canFold;   // (steps so far) -> may the player skip now?
    }

    async restart() {
        this.describe = this.makeDescribe();
        this.steps = [];
        this.raws = [];
        this.pos = 0;
        this.answered = new Set();
        this.skipped = 0;
        this.ahead = null;            // an operation fetched by skip() but not folded (e.g. DONE)
        await this.#push(await this.source.start());
        this.view = this.steps[0];
    }

    async #push(raw) {
        const step = this.describe(raw, this.raws.at(-1) ?? null);
        this.raws.push(raw);
        this.steps.push(step);
        return step;
    }

    async #fetch() {
        if (this.ahead) { const s = this.ahead; this.ahead = null; this.steps.push(s.step); this.raws.push(s.raw); return s.step; }
        return this.#push(await this.source.step());
    }

    get step() { return this.steps[this.pos]; }
    get atEnd() { return Boolean(this.step?.done) && this.view === this.step; }

    get needsAnswer() {
        return Boolean(this.view === this.step && this.step.question && !this.answered.has(this.pos));
    }

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

    async next() {
        if (this.needsAnswer || this.atEnd) return false;
        if (this.pos + 1 >= this.steps.length) await this.#fetch();
        this.pos++;
        this.view = this.steps[this.pos];
        return true;
    }

    canSkip() {
        return !this.needsAnswer && !this.step.done && this.view === this.step && this.canFold(this.steps);
    }

    // Fold the operations up to the end of the current group into one summary.
    async skip() {
        if (!this.canSkip()) return false;
        const run = [];
        while (run.length < LIVE_MAX_SKIP) {
            const raw = await this.source.step();
            const step = this.describe(raw, this.raws.at(-1));
            if (step.done) { this.ahead = { raw, step }; break; }   // the result is shown on its own
            this.raws.push(raw);
            this.steps.push(step);
            run.push(step);
            if (step.endsGroup) break;
        }
        if (!run.length) return this.next();
        this.pos += run.length;
        this.skipped += run.length;
        this.view = run.length === 1 ? run[0] : { ...this.summarize(run), kind: 'summary', covers: run.length, state: run.at(-1).state };
        return true;
    }
}
