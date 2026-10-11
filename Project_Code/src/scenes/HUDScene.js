// HUDScene - runs on top of World/Quest scenes for the whole session.
// Owns the quest bar, notifications, quest log, inventory and DSA inspector,
// and pumps the C event queue (one event per tick, FIFO).
import Phaser from 'phaser';
import { services } from '../systems/GameServices.js';
import { QuestUI } from '../ui/QuestUI.js';
import { Notification } from '../ui/Notification.js';
import { DsaInspector } from '../ui/DsaInspector.js';
import { prettyItem } from '../systems/InventorySystem.js';

const EVENT_PUMP_MS = 650;

export class HUDScene extends Phaser.Scene {
    constructor() {
        super('HUDScene');
    }

    create() {
        this.questUI = new QuestUI(this, services);
        this.toasts = new Notification(this);
        this.inspector = new DsaInspector(this, services);

        const kb = this.input.keyboard;
        kb.addKey('Q').on('down', () => { this.inspector.hide(); this.questUI.toggleLog(); });
        kb.addKey('I').on('down', () => { this.inspector.hide(); this.questUI.toggleInventory(); });
        kb.addKey('TAB').on('down', () => { this.questUI.hidePanels(); this.inspector.toggle(); });
        kb.addKey('M').on('down', () => this.toasts.show(services.audio.toggleMute() ? 'Sound muted' : 'Sound on'));

        const em = services.emitter;
        const refresh = () => this.questUI.refresh();
        const refreshInspector = () => this.inspector.refresh();
        const onEvent = e => { this.#showEvent(e); this.inspector.refresh(); };
        const onNative = online => {
            this.questUI.setNativeStatus(online);
            if (!online) this.toasts.show('Native engine offline', 'Is the server running?', 'ERROR');
        };
        const handlers = [
            ['quests-changed', refresh], ['inventory-changed', refresh], ['challenge-banner', refresh],
            ['history-changed', refreshInspector], ['events-changed', refreshInspector],
            ['game-event', onEvent], ['native-status', onNative],
        ];
        handlers.forEach(([evt, fn]) => em.on(evt, fn));
        this.events.once('shutdown', () => handlers.forEach(([evt, fn]) => em.off(evt, fn)));

        this.time.addEvent({ delay: EVENT_PUMP_MS, loop: true, callback: () => services.events.pump() });
    }

    // Turn a dequeued C-queue event into a notification.
    #showEvent({ type, detail }) {
        const title = id => services.quests.get(id)?.title ?? id;
        switch (type) {
            case 'WELCOME':
                this.toasts.show('Welcome to QuestForge', 'Find the Guide (look for "!") — WASD to move, E to talk.');
                break;
            case 'QUEST_STARTED':
                this.toasts.show('Quest started', title(detail), type);
                break;
            case 'QUEST_COMPLETED':
                this.toasts.show('Quest complete!', title(detail), type);
                break;
            case 'QUEST_UNLOCKED':
                this.toasts.show('New quest available', title(detail), type);
                break;
            case 'OBJECTIVE_UPDATE': {
                const [id, progress] = detail.split(':');
                this.toasts.show('Objective updated', `${title(id)}  ${progress}`, type);
                break;
            }
            case 'REWARD':
                this.toasts.show('Reward', detail.split(',').map(prettyItem).join(', '), type);
                break;
            case 'ITEM_GAINED':
                this.toasts.show('Item gained', prettyItem(detail), type);
                break;
            default:
                this.toasts.show(type, prettyItem(detail));
        }
    }
}
