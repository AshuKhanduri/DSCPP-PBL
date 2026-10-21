// QuestUI - the top HUD bar (active quest + objective, gold/XP) and the quest
// log panel. The quest log draws the C linked list exactly as returned:
// node -> next -> next ... with each node's status.
import { ITEM_ICONS } from '../config/assets.js';
import { COLORS, DEPTH, GAME_WIDTH, textStyle } from '../config/constants.js';

const STATUS_COLOR = { LOCKED: '#6c757d', AVAILABLE: '#ffd60a', ACTIVE: '#4cc9f0', COMPLETED: '#52b788' };
const STATUS_ICON = { LOCKED: '🔒', AVAILABLE: '!', ACTIVE: '▶', COMPLETED: '✔' };

export class QuestUI {
    constructor(scene, services) {
        this.scene = scene;
        this.services = services;

        this.bar = scene.add.rectangle(0, 0, GAME_WIDTH, 44, 0x0d1b2a, 0.88).setOrigin(0).setDepth(DEPTH.ui);
        this.questText = scene.add.text(10, 5, '', textStyle(14, '#ffd60a', { fontStyle: 'bold' })).setDepth(DEPTH.ui);
        this.objectiveText = scene.add.text(10, 24, '', textStyle(12, '#e0e1dd')).setDepth(DEPTH.ui);
        this.statsText = scene.add.text(GAME_WIDTH - 10, 5, '', textStyle(13, '#ffffff')).setOrigin(1, 0).setDepth(DEPTH.ui);
        this.helpText = scene.add.text(GAME_WIDTH - 10, 24, '[Q] Quests  [I] Items  [TAB] DSA', textStyle(11, '#8d99ae'))
            .setOrigin(1, 0).setDepth(DEPTH.ui);

        this.logPanel = scene.add.container(0, 0).setDepth(DEPTH.overlay).setVisible(false);
        this.invPanel = scene.add.container(0, 0).setDepth(DEPTH.overlay).setVisible(false);
        this.nativeOnline = null;
        this.refresh();
    }

    setNativeStatus(online) {
        this.nativeOnline = online;
        this.refresh();
    }

    refresh() {
        const { quests, inventory, challengeBanner } = this.services;
        const active = quests.active();
        if (challengeBanner) {
            this.questText.setText(`CHALLENGE: ${challengeBanner.title}`);
            this.objectiveText.setText(challengeBanner.subtitle ?? '');
        } else if (active) {
            const p = active.progress;
            this.questText.setText(`▶ ${active.title}  (${active.concept})`);
            this.objectiveText.setText(active.objective + (p ? `  [${p.current}/${p.target}]` : ''));
        } else {
            const next = quests.all().find(q => q.status === 'AVAILABLE');
            const giver = next ? next.giver : null;
            this.questText.setText(next ? `Next quest: ${next.title}` : 'Quest complete!');
            this.objectiveText.setText(next ? `Look for the "!" above the ${giverName(giver)}.` : 'More quests are on the way.');
        }
        const pl = inventory.player;
        const native = this.nativeOnline === false ? '  ● NATIVE OFFLINE' : '';
        this.statsText.setText(`Lv ${pl.level}  XP ${pl.xp}  Gold ${pl.gold}${native}`);
        this.statsText.setColor(this.nativeOnline === false ? '#e63946' : '#ffffff');
        if (this.logPanel.visible) this.#drawLog();
        if (this.invPanel.visible) this.#drawInventory();
    }

    toggleLog() {
        this.invPanel.setVisible(false);
        this.logPanel.setVisible(!this.logPanel.visible);
        if (this.logPanel.visible) this.#drawLog();
    }

    toggleInventory() {
        this.logPanel.setVisible(false);
        this.invPanel.setVisible(!this.invPanel.visible);
        if (this.invPanel.visible) this.#drawInventory();
    }

    hidePanels() {
        this.logPanel.setVisible(false);
        this.invPanel.setVisible(false);
    }

    #panel(container, title, subtitle) {
        container.removeAll(true);
        const x = 120, y = 70, w = GAME_WIDTH - 240, h = 470;
        container.add(this.scene.add.rectangle(x, y, w, h, COLORS.panel, 0.97).setOrigin(0).setStrokeStyle(3, COLORS.panelBorder));
        container.add(this.scene.add.text(x + 20, y + 14, title, textStyle(20, '#e5c07b', { fontStyle: 'bold' })));
        container.add(this.scene.add.text(x + 20, y + 42, subtitle, textStyle(12, '#8d99ae')));
        return { x, y, w, h };
    }

    #drawLog() {
        const { x, y } = this.#panel(this.logPanel, 'Quest Log',
            'Quest progression is a linked list in C (quest_chain.c). Completing a node follows node->next.');
        const quests = this.services.quests;
        const chain = quests.chain.length ? quests.chain : quests.all().map(q => ({ id: q.id, status: q.status }));
        chain.forEach((node, i) => {
            const q = quests.get(node.id);
            const rowY = y + 74 + i * 62;
            const color = STATUS_COLOR[node.status];
            this.logPanel.add(this.scene.add.rectangle(x + 20, rowY, 30, 30, 0x000000, 0.3).setOrigin(0).setStrokeStyle(2, Number('0x' + color.slice(1))));
            this.logPanel.add(this.scene.add.text(x + 35, rowY + 15, STATUS_ICON[node.status], textStyle(14, color)).setOrigin(0.5));
            this.logPanel.add(this.scene.add.text(x + 62, rowY, `${i + 1}. ${q.title}`, textStyle(15, color, { fontStyle: 'bold' })));
            this.logPanel.add(this.scene.add.text(x + 62, rowY + 19, `${node.status} · ${q.concept} · ${q.description}`, textStyle(11, '#c9d1d9', { wordWrap: { width: 560 } })));
            if (i < chain.length - 1) this.logPanel.add(this.scene.add.text(x + 35, rowY + 34, '↓ next', textStyle(10, '#8d99ae')).setOrigin(0.5, 0));
        });
        this.logPanel.add(this.scene.add.text(x + 20, y + 74 + chain.length * 62, `current -> ${quests.current ?? 'NULL'}`, textStyle(12, '#4cc9f0')));
    }

    #drawInventory() {
        const { x, y } = this.#panel(this.invPanel, 'Inventory',
            'Owned by the C++ Player object (private std::map, changed only via addItem/removeItem).');
        const pl = this.services.inventory.player;
        this.invPanel.add(this.scene.add.text(x + 20, y + 74, `Level ${pl.level}   XP ${pl.xp}   Gold ${pl.gold}   HP ${pl.health ?? 100}/${pl.maxHealth ?? 100}`, textStyle(15, '#ffffff')));
        const items = pl.inventory ?? [];
        if (!items.length) this.invPanel.add(this.scene.add.text(x + 20, y + 110, '(empty)', textStyle(14, '#8d99ae')));
        items.forEach((it, i) => {
            const icon = ITEM_ICONS[it.item];
            if (icon && this.scene.textures.exists(icon)) {
                const img = this.scene.add.image(x + 30, y + 120 + i * 30, icon);
                img.setScale(Math.min(24 / img.width, 24 / img.height));
                this.invPanel.add(img);
            } else {
                this.invPanel.add(this.scene.add.rectangle(x + 30, y + 118 + i * 30, 14, 14, COLORS.objective).setOrigin(0.5));
            }
            this.invPanel.add(this.scene.add.text(x + 46, y + 110 + i * 30, `${it.item.replace(/_/g, ' ')}  x${it.count}`, textStyle(15, '#ffffff')));
        });
    }
}

function giverName(id) {
    return { guide: 'Guide', king: 'King', blacksmith: 'Blacksmith', librarian: 'Librarian', guard: 'Tower Guard' }[id] ?? id;
}
