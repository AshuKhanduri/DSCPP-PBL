// Leaderboard scoring - shared by the browser (end screen) and the server,
// which RECOMPUTES the score from the parts and never trusts a sent total.
// Pure functions, no Phaser / no Node APIs.
//
//   score = 100 x main quests completed
//         + up to 400 for first-try answers   (400 x firstTryCorrect / questionsAsked)
//         + 2 x bonus coins collected
//   ties: the faster journey (timeMs) ranks higher, then the earlier run.
//
// A "first-try" answer is the first choice picked for a lesson question; picking
// again after a wrong answer never earns accuracy (ScoreKeeper).

export const SCORING = Object.freeze({
    perQuest: 100,
    accuracyMax: 400,
    perBonusCoin: 2,
});

// Hard limits the server enforces (the real game is far below them).
export const LIMITS = Object.freeze({
    nameMax: 20,
    questsMax: 50,
    questionsMax: 2000,
    bonusCoinsMax: 10000,
    timeMsMin: 1000,
    timeMsMax: 30 * 24 * 3600 * 1000,   // 30 days
    messageMin: 3,
    messageMax: 500,
});

export function accuracyPoints(firstTryCorrect, questionsAsked) {
    if (!questionsAsked) return 0;
    return Math.round((SCORING.accuracyMax * firstTryCorrect) / questionsAsked);
}

export function computeScore({ questsCompleted, firstTryCorrect, questionsAsked, bonusCoins }) {
    const quests = SCORING.perQuest * questsCompleted;
    const accuracy = accuracyPoints(firstTryCorrect, questionsAsked);
    const bonus = SCORING.perBonusCoin * bonusCoins;
    return { total: quests + accuracy + bonus, quests, accuracy, bonus };
}

// Leaderboard order: higher score, then faster, then earlier.
export function compareRuns(a, b) {
    return (b.score - a.score) || (a.timeMs - b.timeMs) || (new Date(a.createdAt) - new Date(b.createdAt));
}

// Player names: the title screen asks for one and the server checks the same rule.
const NAME_CHARS = /^[\p{L}\p{N} '_.\-]+$/u;

export function cleanPlayerName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// null when fine, otherwise the reason (shown to the player / returned as a 400).
export function playerNameProblem(value) {
    const s = cleanPlayerName(value);
    if (!s) return 'Please enter a name.';
    if (s.length > LIMITS.nameMax) return `Names can be at most ${LIMITS.nameMax} characters.`;
    if (!NAME_CHARS.test(s)) return "Use letters, digits, spaces or ' _ - . only.";
    return null;
}

// Names are compared case-insensitively ("Asha" and "asha" are one player).
export function nameKey(name) {
    return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function formatDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
