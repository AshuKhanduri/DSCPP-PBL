// Adventure - the end of QuestForge: when the farewell is due, and the
// journey statistics shown on the end screen. No Phaser here (tested in Node).
//
// Sources of truth (nothing is counted in JavaScript on the side):
//   quests          QuestManager.all()  - statuses from the C quest linked list
//   bonus locations village map entities whose object def has `bonus: true`
//   opened / gold   the C++ Chest objects (GET /api/oop/entities: opened, gold)
//   total gold      the C++ Player
//
// The adventure state lives for the session (like every other game state); a
// new game resets it. Nothing here is saved across page reloads.

export const DEFAULT_PLAYER_NAME = 'Explorer';

// The ONE place the displayed name is decided. A future username entry only
// has to set profile.name (e.g. from an account) - every screen uses this.
export function playerName(profile) {
    const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
    return name || DEFAULT_PLAYER_NAME;
}

// Main quests are the quests of the chain unless a quest says `main: false`.
export function mainQuests(quests) {
    return quests.filter(q => q.main !== false);
}

export function allMainQuestsComplete(quests) {
    const main = mainQuests(quests);
    return main.length > 0 && main.every(q => q.status === 'COMPLETED');
}

// Bonus (optional) coin locations: entities placed on the village map whose
// object definition is marked `bonus: true`. Returns their stable ids.
export function bonusLocationIds(mapEntities, objectDefs) {
    return mapEntities
        .filter(e => e.kind === 'object' && objectDefs[e.ref]?.bonus === true)
        .map(e => objectDefs[e.ref].id);
}

// cppEntities: the C++ entity list; a Chest reports `opened` and the `gold` it holds.
export function journeyStats({ profile, quests, bonusIds, cppEntities, player }) {
    const main = mainQuests(quests);
    const bonus = bonusIds.map(id => cppEntities.find(e => e.id === id)).filter(Boolean);
    const opened = bonus.filter(e => e.opened === true);
    return {
        name: playerName(profile),
        questsCompleted: main.filter(q => q.status === 'COMPLETED').length,
        questsTotal: main.length,
        locationsFound: opened.length,
        locationsTotal: bonusIds.length,
        // a chest pays its gold exactly once, when it is opened (C++ Chest::interact)
        bonusCoins: opened.reduce((sum, e) => sum + (Number(e.gold) || 0), 0),
        totalCoins: player?.gold ?? null,
    };
}

export class Adventure {
    constructor() {
        this.reset();
    }

    reset(now = Date.now()) {
        this.announced = false;      // "return to the King" notice shown
        this.farewellDone = false;   // the King's farewell has been played
        this.lastStats = null;       // what the end screen showed (kept for this session)
        this.startedAt = now;        // journey time for the leaderboard (wall clock, new game -> farewell)
        this.finishedAt = null;
        this.devRun = false;         // a dev jump (?quest= / F9) was used: not eligible for the leaderboard
        this.submitted = null;       // the leaderboard reply once this journey's score was saved
    }

    get elapsedMs() {
        return (this.finishedAt ?? Date.now()) - this.startedAt;
    }

    // The farewell is due once every main quest is done, and only once.
    isEndingDue(quests) {
        return !this.farewellDone && allMainQuestsComplete(quests);
    }

    get complete() {
        return this.farewellDone;
    }

    markFarewell(now = Date.now()) {
        this.farewellDone = true;
        this.finishedAt ??= now;
    }
}
