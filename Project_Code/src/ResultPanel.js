// ResultPanel - end-of-challenge summary with the actions available next.
import { COLORS, DEPTH, textStyle } from '../config/constants.js';

export class ResultPanel {
    // area: { x, y, w, h } - challenges choose where it goes so it does not
    // hide the algorithm visualisation they want the player to see.
    constructor(scene, result, area, actions) {
        const { x, y, w, h } = area;
        this.container = scene.add.container(0, 0).setDepth(DEPTH.overlay).setScrollFactor(0);
        const border = result.success ? COLORS.good : COLORS.bad;
        this.container.add(scene.add.rectangle(x, y, w, h, COLORS.panel, 0.96).setOrigin(0).setStrokeStyle(3, border));
        this.container.add(scene.add.text(x + 16, y + 14, result.title ?? (result.success ? 'Success!' : 'Failed'),
            textStyle(20, result.success ? '#52b788' : '#e63946', { fontStyle: 'bold', wordWrap: { width: w - 32 } })));
        const body = scene.add.text(x + 16, y + 48, (result.lines ?? []).join('\n'),
            textStyle(13, '#ffffff', { wordWrap: { width: w - 32 }, lineSpacing: 5 }));
        this.container.add(body);
        const actionText = actions.map(a => `[${a.key}] ${a.label}`).join('\n');
        this.container.add(scene.add.text(x + 16, y + h - 14, actionText, textStyle(14, '#ffd60a', { fontStyle: 'bold', lineSpacing: 6, wordWrap: { width: w - 32 } })).setOrigin(0, 1));
    }

    destroy() {
        this.container.destroy();
    }
}
