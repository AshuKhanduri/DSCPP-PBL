// QuestManager - ONE reusable quest system for every quest.
//
// Quest definitions (title, giver, challenge, reward, dialogue...) live in
// data/quests.js. Quest *status* and progression live in the C linked list
// (quest_chain.c): every start/complete goes through the native engine and
// the returned chain snapshot is applied here. JavaScript never decides on
// its own that a quest is unlocked.

export const QuestStatus = Object.freeze({
    LOCKED: 'LOCKED',
    AVAILABLE: 'AVAILABLE',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
});

export class QuestManager {
    constructor(api, emitter, { quests, history, events, inventory }) {
        this.api = api;
        this.emitter = emitter;
        this.history = history;
        this.events = events;
        this.inventory = inventory;
        this.defs = new Map(quests.map(q => [q.id, q]));
        this.order = quests.map(q => q.id);
        this.status = new Map(this.order.map(id => [id, QuestStatus.LOCKED]));
        this.progress = new Map();    // questId -> { current, target, text }
        this.lastResult = new Map();  // questId -> result summary from the challenge
        this.current = null;
        this.chain = [];              // raw linked-list snapshot from C
    }

    // Apply a quest-chain snapshot returned by the C engine.
    applyChain(state) {
        if (!state?.chain) return;
        this.chain = state.chain;
        for (const node of state.chain) this.status.set(node.id, node.status);
        this.current = state.current;
        this.emitter.emit('quests-changed', this);
    }

    async newGame() {
        const res = await this.api.resetGame(this.order);
        this.progress.clear();
        this.lastResult.clear();
        this.applyChain(res.quests);
        return res;
    }

    async refresh() {
        this.applyChain(await this.api.dsa.questState());
    }

    get(id) {
        const def = this.defs.get(id);
        return def ? { ...def, status: this.status.get(id), progress: this.progress.get(id) } : null;
    }

    getStatus(id) {
        return this.status.get(id);
    }

    all() {
        return this.order.map(id => this.get(id));
    }

    active() {
        const id = this.order.find(q => this.status.get(q) === QuestStatus.ACTIVE);
        return id ? this.get(id) : null;
    }

    // The quest an NPC should talk about: ACTIVE > AVAILABLE > most recent COMPLETED > LOCKED.
    questForGiver(npcId) {
        const mine = this.order.filter(id => this.defs.get(id).giver === npcId);
        const pick = s => mine.find(id => this.status.get(id) === s);
        const completed = mine.filter(id => this.status.get(id) === QuestStatus.COMPLETED);
        const id = pick(QuestStatus.ACTIVE) ?? pick(QuestStatus.AVAILABLE) ?? completed.at(-1) ?? pick(QuestStatus.LOCKED);
        return id ? this.get(id) : null;
    }

    async start(id) {
        const res = await this.api.dsa.questStart(id);
        this.applyChain(res);
        const def = this.defs.get(id);
        if (def.objectiveTarget) this.setProgress(id, 0, def.objectiveTarget, false);
        this.history.record('ACCEPT_QUEST', id);
        this.events.enqueue('QUEST_STARTED', id);
        return this.get(id);
    }

    setProgress(id, current, target, announce = true) {
        this.progress.set(id, { current, target });
        this.emitter.emit('quests-changed', this);
        if (announce) this.events.enqueue('OBJECTIVE_UPDATE', `${id}:${current}/${target}`);
    }

    async complete(id, result = null) {
        const res = await this.api.dsa.questComplete(id);
        this.applyChain(res);
        if (result) this.lastResult.set(id, result);
        const reward = this.defs.get(id).reward;
        await this.inventory.grant(reward);
        this.history.record('COMPLETE_QUEST', id);
        this.events.enqueue('QUEST_COMPLETED', id);
        if (reward) this.events.enqueue('REWARD', rewardText(reward));
        if (res.unlocked) this.events.enqueue('QUEST_UNLOCKED', res.unlocked);
        return { quest: this.get(id), unlocked: res.unlocked ? this.get(res.unlocked) : null };
    }
}

export function rewardText(reward) {
    const parts = [];
    if (reward.gold) parts.push(`${reward.gold}_gold`);
    if (reward.xp) parts.push(`${reward.xp}_xp`);
    if (reward.item) parts.push(reward.item);
    return parts.join(',');
}
