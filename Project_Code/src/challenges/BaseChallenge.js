// BaseChallenge - the contract every challenge module follows.
//
//   create()          build the challenge inside the QuestScene
//   update(t, dt)     per-frame logic (optional)
//   finish(result)    report { success, title, lines } - QuestScene shows it
//                     and, on success, completes the quest via QuestManager
//   destroy()         clean up native objects, timers...
import { COLORS, DEPTH, textStyle } from '../config/constants.js';

export const SIDEBAR = { x: 632, y: 54, w: 318, h: 572 };

export class BaseChallenge {
    constructor(scene, quest, services, onFinish) {
        this.scene = scene;
        this.quest = quest;
        this.services = services;
        this.api = services.api;
        this.onFinish = onFinish;
        this.done = false;
        this.resultArea = { x: SIDEBAR.x, y: SIDEBAR.y, w: SIDEBAR.w, h: SIDEBAR.h };
    }

    create() {}
    update() {}
    destroy() {}

    finish(result) {
        if (this.done) return;
        this.done = true;
        this.onFinish(result);
    }

    // Right-hand information panel. Returns the body text object to update.
    sidebar(title, body = '') {
        const s = this.scene;
        const { x, y, w, h } = SIDEBAR;
        // scrollFactor 0: fixed on screen while the camera follows the player
        s.add.rectangle(x, y, w, h, COLORS.panel, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.panelBorder).setDepth(DEPTH.ui).setScrollFactor(0);
        s.add.text(x + 14, y + 12, title, textStyle(17, '#e5c07b', { fontStyle: 'bold', wordWrap: { width: w - 28 } })).setDepth(DEPTH.ui).setScrollFactor(0);
        return s.add.text(x + 14, y + 44, body, textStyle(13, '#ffffff', { wordWrap: { width: w - 28 }, lineSpacing: 4 })).setDepth(DEPTH.ui).setScrollFactor(0);
    }

    // Short message that fades out (errors, feedback).
    flash(message, color = '#ffd60a', y = 600) {
        const t = this.scene.add.text(316, y, message, textStyle(15, color, {
            fontStyle: 'bold', backgroundColor: '#0d1b2add', padding: { x: 10, y: 5 },
        })).setOrigin(0.5).setDepth(DEPTH.overlay).setScrollFactor(0);
        this.scene.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
    }
}
