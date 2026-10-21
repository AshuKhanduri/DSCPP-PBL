// Notification - stacked toasts on the right side of the screen, styled like
// the reference's "Quest Received / Quest Completed / Item Obtained" panels
// (navy panel, icon on the left). The HUD feeds it events dequeued from the
// C event queue.
import { ITEM_ICONS, UI } from '../config/assets.js';
import { DEPTH, GAME_WIDTH, textStyle } from '../config/constants.js';

const COLORS_BY_TYPE = {
    QUEST_STARTED: '#ffd166',
    QUEST_COMPLETED: '#80ed99',
    QUEST_UNLOCKED: '#ffd60a',
    OBJECTIVE_UPDATE: '#e5c07b',
    REWARD: '#ffd60a',
    ITEM_GAINED: '#ffd60a',
    ERROR: '#ff6b6b',
};

const ICON_BY_TYPE = {
    QUEST_STARTED: UI.iconQuest,
    QUEST_UNLOCKED: UI.iconQuest,
    OBJECTIVE_UPDATE: UI.iconQuest,
    QUEST_COMPLETED: UI.iconCheck,
    REWARD: UI.iconItem,
    ITEM_GAINED: UI.iconItem,
};

const WIDTH = 300;

export class Notification {
    constructor(scene) {
        this.scene = scene;
        this.toasts = [];
    }

    // `icon` (texture key) overrides the default icon for the type.
    show(title, body = '', type = 'INFO', icon = null) {
        const s = this.scene;
        const color = COLORS_BY_TYPE[type] ?? '#ffffff';
        const key = icon ?? iconFor(type, body) ?? ICON_BY_TYPE[type];
        const hasIcon = key && s.textures.exists(key);
        const textX = hasIcon ? 46 : 12;
        const titleText = s.add.text(textX, 8, title, textStyle(13, color, { fontStyle: 'bold' }));
        const bodyText = s.add.text(textX, 26, body, textStyle(12, '#1d2b53', {
            wordWrap: { width: WIDTH - textX - 18 }, backgroundColor: body ? '#ffffff' : undefined, padding: body ? { x: 5, y: 2 } : undefined,
        }));
        const h = Math.max(44, 30 + (body ? bodyText.height : 0) + 6);
        const bg = s.add.rectangle(0, 0, WIDTH, h, 0x16357a, 0.96).setOrigin(0).setStrokeStyle(3, 0x9cc3ff);
        const parts = [bg, titleText, bodyText];
        if (hasIcon) {
            const img = s.add.image(22, h / 2, key);
            img.setScale(Math.min(28 / img.width, 28 / img.height) * 1.0);
            parts.push(img);
        }
        const t = s.add.container(GAME_WIDTH - 12 - WIDTH, 0, parts).setScrollFactor(0).setDepth(DEPTH.overlay).setAlpha(0);
        t.h_ = h;
        this.toasts.unshift(t);
        this.#layout();
        s.tweens.add({ targets: t, alpha: 1, duration: 200 });
        s.time.delayedCall(3800, () => {
            s.tweens.add({
                targets: t, alpha: 0, duration: 400,
                onComplete: () => {
                    this.toasts = this.toasts.filter(x => x !== t);
                    t.destroy();
                    this.#layout();
                },
            });
        });
    }

    #layout() {
        let y = 56;
        for (const t of this.toasts.slice(0, 5)) {
            t.setY(y);
            y += t.h_ + 6;
        }
        this.toasts.slice(5).forEach(t => t.setVisible(false));
    }
}

// Item notifications show the item's own icon ("Iron_Ore x1" -> ore).
function iconFor(type, body) {
    if (type !== 'ITEM_GAINED' && type !== 'REWARD') return null;
    const item = Object.keys(ITEM_ICONS).find(k => body.replace(/ /g, '_').includes(k));
    return item ? ITEM_ICONS[item] : null;
}
