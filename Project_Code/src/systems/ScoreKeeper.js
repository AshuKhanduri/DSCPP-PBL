// ScoreKeeper - counts first-try answers to lesson questions for the leaderboard.
//
// Every lesson question in the game goes through Walkthrough.answer() or
// LiveWalkthrough.answer(); both report here. A question counts ONCE per game,
// on its first attempt:
//   - a wrong pick followed by the right one is not a first-try answer;
//   - Restart replays the same questions (same key), which are not counted
//     again, so restarting cannot farm accuracy.
// The key is the question's position in its lesson plus its prompt and choices.
// No Phaser here (tested in Node). Reset by GameServices.newGame.

export class ScoreKeeper {
    constructor() {
        this.reset();
    }

    reset() {
        this.seen = new Set();
        this.questionsAsked = 0;
        this.firstTryCorrect = 0;
    }

    static keyOf(pos, question) {
        const labels = (question?.choices ?? []).map(c => c.label).join('|');
        return `${pos}\u0000${question?.prompt ?? ''}\u0000${labels}`;
    }

    // Returns true when this attempt was counted (the question's first attempt).
    record(key, correct) {
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        this.questionsAsked++;
        if (correct) this.firstTryCorrect++;
        return true;
    }

    get stats() {
        return { questionsAsked: this.questionsAsked, firstTryCorrect: this.firstTryCorrect };
    }
}

export const scoreKeeper = new ScoreKeeper();
