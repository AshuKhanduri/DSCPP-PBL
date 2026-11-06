// Quest definitions. The ORDER of this array is the order of the quest
// linked list built in C (quest 1 -> quest 2 -> ...).
//
// Fields
//   id, title, concept, description, objective  - text shown in the UI
//   giver        - NPC id that offers the quest
//   type         - 'challenge' (opens QuestScene) or 'dialogue' (completes in conversation)
//   challenge    - key in challenges/registry.js
//   entry        - optional world object id that launches the challenge instead of the giver
//   objectiveTarget - optional numeric goal shown as progress (e.g. 3 ore)
//   reward       - { gold, xp, item } granted to the C++ Player on completion
//   dialogue     - { offer, accept, decline, active, completed, lesson }
//   config       - challenge-specific settings

export const QUESTS = [
    {
        id: 'lost_path',
        title: 'Lost Path',
        concept: 'Graph + BFS / DFS',
        giver: 'guide',
        type: 'challenge',
        challenge: 'lostPath',
        description: 'The Whispering Woods are a maze of clearings. Find the Old Shrine.',
        objective: 'Navigate the forest graph to the Old Shrine.',
        reward: { gold: 40, xp: 100, item: 'Guide_Lantern' },
        dialogue: {
            offer: [
                'A pilgrim went missing in the Whispering Woods. The trails there branch again and again - some lead deeper in, some lead nowhere.',
                'Wandering at random, you may walk in circles. We need a SYSTEMATIC way to explore every path.',
                'Scholars draw such a forest as a GRAPH: each clearing is a VERTEX (or node), each trail joining two clearings is an EDGE.',
                'Some clearings touch one trail, others three or four. Will you walk the woods to the Old Shrine, and then learn two ways to explore them?',
            ],
            accept: [
                'First, find the Old Shrine on foot. The fog hides what you have not seen; your journal will draw the graph as you discover it.',
                'When you reach the shrine, I will show you how Breadth-First and Depth-First Search explore the same woods - step by step.',
                'Take this lantern too: press H in the woods for a hint.',
            ],
            decline: ['The woods will wait. They always do.'],
            active: ['The Whispering Woods lie beyond the old trail. Ready to go?'],
            completed: ['BFS uses a queue and finishes each level before the next, so it finds the fewest trails. DFS uses a stack and dives down one branch, backtracking at dead ends.'],
        },
        config: { map: 'lostPath' },   // graph derived from the map (systems/MapGraph.js)
    },
    {
        id: 'royal_registry',
        title: 'The Royal Registry',
        concept: 'Binary Search Tree',
        giver: 'king',
        type: 'challenge',
        challenge: 'royalRegistry',
        description: 'Organise the King\'s numbered records into a Binary Search Tree so any record can be found quickly.',
        objective: 'Build the Royal Registry tree, then insert and find records yourself.',
        reward: { gold: 80, xp: 150, item: 'Registry_Seal' },
        dialogue: {
            offer: [
                'My royal records are numbered, but my clerks keep them in one great pile. To find record 60 they read every scroll from the top.',
                'A scholar told me of a better shelf: a Binary Search Tree. Each record decides where the next one goes - smaller to one side, larger to the other.',
                'Will you help me organise the Royal Registry?',
            ],
            accept: ['Splendid. My clerks will hand you the records one at a time. Watch where each one goes, and why.'],
            decline: ['Then my clerks keep reading every scroll. Slowly.'],
            active: ['The records are still waiting in the registry hall. Shall we continue?'],
            completed: ['Every comparison sends us left or right, so we never read a record we do not need. Smaller to the left, larger to the right - the whole registry follows that one rule.'],
        },
        // Tree operations run in the C engine (native/c/bst.c), tree name below.
        config: { tree: 'registry', records: [50, 30, 70, 20, 40, 60, 80] },
    },
    {
        id: 'blacksmith_challenge',
        title: 'The Order of the Forge',
        concept: 'Sorting: Bubble, Selection, Insertion',
        giver: 'blacksmith',
        type: 'challenge',
        challenge: 'forgeOrder',
        description: 'A shipment of weapons arrived in a jumble. Sort the rack from lightest to heaviest.',
        objective: 'Learn three ways to sort the rack, then sort a crate yourself.',
        reward: { gold: 60, xp: 120, item: 'Iron_Sword' },
        dialogue: {
            offer: [
                'Blast those carters. A whole shipment of blades, axes and helms, stacked any which way.',
                'I need it on the rack from lightest to heaviest before anything leaves this forge. Will you lend a hand - and a head?',
            ],
            accept: ['Good. Come to the rack. I will show you how a smith sorts - three different ways.'],
            decline: ['The rack will not sort itself, you know.'],
            active: ['The rack is still a mess. Shall we get back to it?'],
            completed: ['A tidy rack. Bubble swaps neighbours, Selection picks the lightest, Insertion slides each piece into place - same result, different work.'],
        },
        // Sorting runs in the C engine (native/c/sort.c) under this run name.
        // ids index `items`: item i is values[i] at the start.
        config: {
            sort: 'forge',
            stages: [
                { algorithm: 'BUBBLE', values: [7, 3, 5, 2, 8], items: ['Spear', 'Dagger', 'Shield', 'Axe', 'Helm'] },
                {
                    algorithm: 'SELECTION', values: [6, 4, 9, 1, 5], items: ['Mace', 'Sword', 'Hammer', 'Knife', 'Bow'],
                    intro: ['Bubble Sort is honest work, but all that swapping wears the arms out.', 'Here is how I do it when I am tired: find the LIGHTEST piece left, and put it where it belongs. Selection Sort.'],
                },
                {
                    algorithm: 'INSERTION', values: [5, 2, 4, 6, 1, 3], items: ['Helm', 'Dagger', 'Shield', 'Axe', 'Knife', 'Mace'],
                    intro: ['My apprentice sorts like a card player. Keep the left end tidy, and slide each new piece into place.', 'Insertion Sort. Watch how the heavier pieces SHIFT over to make room.'],
                },
            ],
            trial: { values: [6, 2, 9, 4, 4], items: ['Sword', 'Dagger', 'Hammer', 'Helm', 'Shield'] },
        },
    },
    {
        id: 'unbalanced_garden',
        title: 'The Unbalanced Garden',
        concept: 'AVL tree (self-balancing BST)',
        giver: 'keeper',
        type: 'challenge',
        challenge: 'garden',
        entry: 'garden_gate',
        description: 'The ancient trees of the Garden of Balance have grown crooked. Learn how AVL trees keep themselves balanced.',
        objective: 'Enter the Garden of Balance and restore the Ancient Tree (5 stages).',
        objectiveTarget: 5,   // stages completed
        reward: { gold: 70, xp: 160, item: 'Balance_Seed' },
        dialogue: {
            offer: [
                'I am Elarion, keeper of the Garden of Balance. Our ancient trees have grown crooked - all their branches lean one way.',
                'In a tree that leans, finding anything means climbing every branch. Will you help me teach them balance again?',
            ],
            accept: ['Come through the garden gate, just here. The Ancient Tree waits in the clearing - touch its altar and it will show you.'],
            decline: ['The trees are patient. Crooked, but patient.'],
            active: ['The gate is open. The Ancient Tree is in the clearing.'],
            completed: ['Every node within one level of its neighbour. The garden stands straight - and anything in it is found in a few steps.'],
        },
        // AVL operations run in the C engine (native/c/avl.c); stage 1 uses the C BST (bst.c).
        config: { map: 'garden', avl: 'garden', bst: 'garden_bst' },
    },
    {
        id: 'human_etiquette',
        title: 'Human Etiquette',
        concept: 'Dialogue',
        giver: 'king',
        type: 'dialogue',
        challenge: null,
        description: 'Learn the customs of the court from the King himself.',
        objective: 'Listen to the King.',
        reward: { gold: 20, xp: 60, item: 'Royal_Seal' },
        dialogue: {
            offer: ['You have served the crown well. But you still walk into my hall like a farmhand.', 'Shall I teach you the etiquette of the court?'],
            accept: ['Very well. Listen closely.'],
            lesson: [
                'First: bow when you enter, and wait to be addressed before you speak.',
                'Second: never turn your back on the throne. Step back three paces, then turn.',
                'Third: a guest praises the host\'s table, even when the soup is cold.',
                'Last: a promise made at court is a debt. Keep it.',
                'You have learned well. Take my Royal Seal - the Guard at the Tower of Trials will recognise it.',
            ],
            decline: ['Manners can wait, it seems. Pity.'],
            active: ['Where were we? Ah, yes - etiquette.'],
            completed: ['Bow, wait, step back, praise the soup, keep your word. You will do fine.'],
        },
    },
    {
        id: 'tower_of_trials',
        title: 'Tower of Trials',
        concept: 'Stack, Queue, Circular Queue',
        giver: 'guard',
        type: 'challenge',
        challenge: 'tower',
        entry: 'tower_door',
        description: 'Three chambers and the Guardian\'s trial: the Stack, the Queue and the Circular Queue.',
        objective: 'Enter the Tower, clear its three chambers and pass the Guardian\'s trial.',
        objectiveTarget: 4,   // chambers cleared (stack, queue, comparison) + the trial
        reward: { gold: 150, xp: 250, item: 'Trial_Crown' },
        dialogue: {
            offer: [
                'The Tower of Trials tests the mind, not the sword. Its Guardian keeps knowledge in strict order.',
                'Some things leave newest-first, others oldest-first. Learn which, and why. Do you accept the trial?',
            ],
            accept: ['Then go to the Tower door. Your Royal Seal will open it. The Guardian waits inside.'],
            decline: ['Wise, perhaps. The Tower humbles many.'],
            active: ['The Tower door is just behind me. The Guardian remembers which chambers you have cleared.'],
            completed: ['You conquered the Tower. Stacks give back the newest, queues the oldest - and a circle wastes no space.'],
        },
        // Every structure lives in the C engine (stack.c, queue.c); scripts in challenges/lessons/towerLessons.js.
        config: {},
    },
];
