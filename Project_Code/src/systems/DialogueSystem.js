// DialogueSystem - builds conversations from data and runs them in a DialogueBox.
//
// For an NPC the conversation is:
//   1. the NPC's C++ greeting (virtual greeting() via POST /api/oop/entity/interact)
//   2. quest lines chosen by the quest's status (offer / active / completed / locked)
//   3. choices that call back into QuestManager (accept, begin challenge, ...)
// Nothing here is specific to one NPC or one quest.
import { DialogueBox } from '../ui/DialogueBox.js';
import { QuestStatus } from './QuestManager.js';

export class DialogueSystem {
    constructor(scene, services, { launchChallenge }) {
        this.scene = scene;
        this.services = services;
        this.launchChallenge = launchChallenge;
        this.box = new DialogueBox(scene);
    }

    get isOpen() {
        return this.box.isOpen;
    }

    // Generic: show any pages (used for objects, records, notices).
    say(pages) {
        return this.box.open(pages);
    }

    async talkTo(npc) {
        const { api, history, quests } = this.services;
        history.record('TALK', npc.id);

        let greeting = null;
        try {
            const res = await api.oop.interact(npc.id);
            this.services.inventory.apply(res.player);
            greeting = {
                speaker: npc.name,
                text: res.result.message,
                source: `C++ ${res.entity.type}::interact() → greeting()  (talked ${res.entity.timesTalked}x)`,
            };
        } catch (err) {
            greeting = { speaker: npc.name, text: '…', source: `native engine error: ${err.message}` };
        }

        const quest = quests.questForGiver(npc.id);
        const pages = [greeting, ...this.#questPages(npc, quest)];
        await this.box.open(pages);
    }

    #lines(npc, lines) {
        return (lines ?? []).map(text => ({ speaker: npc.name, text }));
    }

    #questPages(npc, quest) {
        if (!quest) return this.#lines(npc, npc.def.idle);
        const d = quest.dialogue;
        switch (quest.status) {
            case QuestStatus.AVAILABLE: return this.#offer(npc, quest);
            case QuestStatus.ACTIVE: return this.#active(npc, quest);
            case QuestStatus.COMPLETED: return this.#lines(npc, d.completed);
            default: return this.#lines(npc, npc.def.locked);
        }
    }

    #offer(npc, quest) {
        const d = quest.dialogue;
        const pages = this.#lines(npc, d.offer);
        pages[pages.length - 1] = {
            ...pages[pages.length - 1],
            choices: [
                { label: `Accept "${quest.title}"`, onSelect: () => this.#accept(npc, quest) },
                {
                    label: 'Not now',
                    onSelect: () => {
                        this.services.history.record('DECLINE_QUEST', quest.id);
                        return this.#lines(npc, d.decline);
                    },
                },
            ],
        };
        return pages;
    }

    async #accept(npc, quest) {
        const { quests } = this.services;
        try {
            await quests.start(quest.id);
        } catch (err) {
            return [{ speaker: 'System', text: `Could not start the quest: ${err.message}` }];
        }
        const d = quest.dialogue;
        const pages = this.#lines(npc, d.accept);

        // Dialogue quests complete in conversation (e.g. Human Etiquette).
        if (quest.type === 'dialogue') return [...pages, ...this.#lesson(npc, quest)];
        if (quest.entry) return pages;   // started elsewhere (e.g. the Tower door)
        return this.#withBeginChoice(npc, quest, pages);
    }

    #active(npc, quest) {
        const pages = this.#lines(npc, quest.dialogue.active);
        if (quest.type === 'dialogue') {
            // resume the lesson if the player left mid-way
            return [...pages, ...this.#lesson(npc, quest)];
        }
        if (quest.entry) return pages;
        return this.#withBeginChoice(npc, quest, pages);
    }

    #lesson(npc, quest) {
        const lesson = this.#lines(npc, quest.dialogue.lesson);
        lesson[lesson.length - 1] = {
            ...lesson[lesson.length - 1],
            choices: [{
                label: 'Bow and thank the King',
                onSelect: async () => {
                    await this.services.quests.complete(quest.id, { success: true });
                    return [{ speaker: 'Quest complete', text: `${quest.title} complete! Reward: ${rewardLine(quest.reward)}.` }];
                },
            }],
        };
        return lesson;
    }

    #withBeginChoice(npc, quest, pages) {
        const last = pages.length ? pages[pages.length - 1] : { speaker: npc.name, text: 'Ready?' };
        const rest = pages.slice(0, -1);
        return [...rest, {
            ...last,
            choices: [
                { label: `Begin: ${quest.title}`, onSelect: () => { this.box.close(); this.launchChallenge(quest); } },
                { label: 'Later', onSelect: () => [] },
            ],
        }];
    }
}

export function rewardLine(reward) {
    if (!reward) return 'none';
    const parts = [];
    if (reward.gold) parts.push(`${reward.gold} gold`);
    if (reward.xp) parts.push(`${reward.xp} XP`);
    if (reward.item) parts.push(reward.item.replace(/_/g, ' '));
    return parts.join(', ');
}
