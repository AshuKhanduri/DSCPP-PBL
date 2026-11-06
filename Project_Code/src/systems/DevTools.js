// DevTools - shortcuts for testing quests without replaying the whole game.
// Only active under `npm run dev` (import.meta.env.DEV is false in `npm run build`).
//
//   http://localhost:5173/?quest=tower_of_trials   skip the title screen and open that quest
//                                                  (Vite reloads keep the URL, so after
//                                                  every code edit you land back in it)
//   F9 in the village                              pick any quest from a list
//
// The quest chain still lives in C: every earlier quest is started and completed
// through QuestManager (so C unlocks the next one and its reward is granted -
// e.g. the Royal Seal the Tower door needs). Nothing is faked on the JS side.
import { QuestStatus } from './QuestManager.js';

export const DEV = import.meta.env.DEV;

let jumped = false;   // the URL jump happens once per page load (not again on Return to Title)

export function questFromUrl() {
    if (!DEV || jumped) return null;
    return new URLSearchParams(window.location.search).get('quest');
}

// Complete every quest before `id` in the chain, then accept `id`.
export async function prepareQuest(services, id) {
    const q = services.quests;
    const index = q.order.indexOf(id);
    if (index < 0) throw new Error(`Unknown quest "${id}". Known: ${q.order.join(', ')}`);
    for (const earlier of q.order.slice(0, index)) {
        if (q.getStatus(earlier) === QuestStatus.COMPLETED) continue;
        if (q.getStatus(earlier) === QuestStatus.AVAILABLE) await q.start(earlier);
        await q.complete(earlier, { success: true, title: 'Skipped (dev)' });
    }
    if (q.getStatus(id) === QuestStatus.AVAILABLE) await q.start(id);
    jumped = true;
    services.adventure.devRun = true;      // skipped quests: this journey cannot go on the leaderboard
    services.history.record('DEV_JUMP', id);
    return q.get(id);
}
