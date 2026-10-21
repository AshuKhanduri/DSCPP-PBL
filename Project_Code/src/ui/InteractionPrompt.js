// InteractionPrompt - "E — Talk to Guide", fixed at the bottom of the screen.
import { UI } from '../config/assets.js';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, textStyle } from '../config/constants.js';
import { frame } from './Frame.js';

export class InteractionPrompt {
    constructor(scene) {
        // styled like the reference's small white UI boxes (navy frame)
        this.bg = frame(scene, UI.dialogFrame, 0, GAME_HEIGHT - 62, 200, 44, { corner: 6, fallback: 0x14213d })
            .setScrollFactor(0).setDepth(DEPTH.ui).setVisible(false);
        this.text = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, '', textStyle(17, '#1d2b53', {
            fontStyle: 'bold',
        })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ui).setVisible(false);
    }

    show(message) {
        this.text.setText(`E — ${message}`).setVisible(true);
        const w = this.text.width + 40;
        this.bg.resize(w, 44).setPosition(GAME_WIDTH / 2 - w / 2, GAME_HEIGHT - 62).setVisible(true);
    }

    hide() {
        this.text.setVisible(false);
        this.bg.setVisible(false);
    }
}
