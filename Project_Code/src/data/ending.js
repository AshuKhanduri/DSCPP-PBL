// The end of the adventure: who says farewell, what is said, and the end screen.
// Change the text here; systems/Adventure.js decides WHEN, scenes/EndScene.js draws it.

export const ENDING = {
    // the NPC who gives the farewell once every main quest is complete
    giver: 'king',
    objective: {
        title: 'Return to King Aldric',
        text: 'Every trial is complete. King Aldric awaits you in the castle courtyard.',
    },
    farewell: [
        'You have come a long way, young explorer.',
        'You helped our people, overcame challenges that once seemed impossible, and brought balance and order to this kingdom.',
        'From the paths of the forest to the trials of the tower, you have proven that curiosity, patience and knowledge can take you far.',
        'But your journey does not end here. There is a whole world beyond these walls, waiting to be explored.',
        'Go now, and may good fortune accompany you on every road you travel.',
        'Farewell, brave explorer. And remember... every great adventure begins with the courage to take the next step.',
    ],
    // after the farewell, the King only says this
    afterword: ['The road is yours now, explorer. The kingdom will remember you.'],
    screen: {
        title: 'A New Journey Awaits',
        subtitle: 'Your adventure in the kingdom has come to an end, but the world beyond is waiting.',
        label: 'ADVENTURE COMPLETE',
        thanks: 'Thank you for playing QuestForge.',
    },
};
