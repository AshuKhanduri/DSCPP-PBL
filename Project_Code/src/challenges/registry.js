// Challenge registry: quest.challenge -> class.
// To add a new kind of quest gameplay, write a class extending BaseChallenge
// and register it here; QuestScene and QuestManager need no changes.
import { LostPathChallenge } from './LostPathChallenge.js';

export const CHALLENGES = {
    lostPath: LostPathChallenge,
};
