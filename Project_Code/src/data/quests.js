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
                'A pilgrim went missing in the Whispering Woods. The clearings connect like a web - a graph, scholars call it.',
                'Each clearing is a NODE, each trail an EDGE. Will you find the Old Shrine for me?',
            ],
            accept: ['Take this lantern. Press H in the woods: it lights the next step of the shortest way, found by Breadth-First Search.'],
            decline: ['The woods will wait. They always do.'],
            active: ['The Whispering Woods lie beyond the old trail. Ready to go?'],
            completed: ['You found the shrine! BFS checks every clearing one step away before going two steps away - that is why it finds the fewest moves.'],
        },
        config: { map: 'lostPath' },   // graph derived from the map (systems/MapGraph.js)
    },
];
