// Button - clickable placeholder button with an optional keyboard shortcut label.
import { textStyle } from '../config/constants.js';

export class Button {
    constructor(scene, x, y, label, onClick, { width = 150, height = 34, color = 0x264653, size = 14, origin = 0 } = {}) {
        this.scene = scene;
        this.onClick = onClick;
        this.enabled = true;
        this.container = scene.add.container(x, y);
        this.bg = scene.add.rectangle(0, 0, width, height, color).setOrigin(origin).setStrokeStyle(2, 0xe5c07b)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => this.enabled && this.bg.setFillStyle(0x2a9d8f))
            .on('pointerout', () => this.bg.setFillStyle(color))
            .on('pointerdown', () => this.enabled && this.onClick?.());
        const cx = origin === 0 ? width / 2 : 0;
        const cy = origin === 0 ? height / 2 : 0;
        this.text = scene.add.text(cx, cy, label, textStyle(size, '#ffffff', { fontStyle: 'bold' })).setOrigin(0.5);
        this.container.add([this.bg, this.text]);
    }

    setEnabled(on) {
        this.enabled = on;
        this.container.setAlpha(on ? 1 : 0.4);
        return this;
    }

    setLabel(label) {
        this.text.setText(label);
        return this;
    }

    setDepth(d) {
        this.container.setDepth(d);
        return this;
    }

    setVisible(v) {
        this.container.setVisible(v);
        return this;
    }

    destroy() {
        this.container.destroy();
    }
}
