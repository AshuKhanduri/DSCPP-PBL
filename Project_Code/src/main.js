import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/constants.js';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { QuestScene } from './scenes/QuestScene.js';
import { HUDScene } from './scenes/HUDScene.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0d1b2a',
    pixelArt: true,             // crisp GBA-style sprites once art is added
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
    },
    // HUDScene is last so it always renders above World/Quest scenes.
    scene: [BootScene, WorldScene, QuestScene, HUDScene],
};

const game = new Phaser.Game(config);
// Handy for debugging in the browser console.
window.__QUESTFORGE__ = game;
