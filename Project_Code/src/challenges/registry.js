// Challenge registry: quest.challenge -> class.
// To add a new kind of quest gameplay, write a class extending BaseChallenge
// and register it here; QuestScene and QuestManager need no changes.
import { LostPathChallenge } from './LostPathChallenge.js';
import { RoyalRouteChallenge } from './RoyalRouteChallenge.js';
import { RoyalRegistryChallenge } from './RoyalRegistryChallenge.js';
import { ForgeChallenge } from './ForgeChallenge.js';
import { ForgeOrderChallenge } from './ForgeOrderChallenge.js';
import { GardenChallenge } from './GardenChallenge.js';
import { TowerChallenge } from './TowerChallenge.js';

export const CHALLENGES = {
    lostPath: LostPathChallenge,
    royalRoute: RoyalRouteChallenge,   // no quest uses it now (King Aldric gives the Royal Registry)
    royalRegistry: RoyalRegistryChallenge,
    forge: ForgeChallenge,             // no quest uses it now (the Blacksmith gives The Order of the Forge)
    forgeOrder: ForgeOrderChallenge,
    garden: GardenChallenge,
    tower: TowerChallenge,
};
