// DsaInspector - TAB panel showing the live native data structures:
//   history stack (top first), event queue (front first), quest linked list.
// Data comes straight from GET /api/dsa/state (C engine memory).
import { COLORS, DEPTH, GAME_WIDTH, textStyle } from '../config/constants.js';

export class DsaInspector {
    constructor(scene, services) {
        this.scene = scene;
        this.services = services;
        this.container = scene.add.container(0, 0).setDepth(DEPTH.overlay).setVisible(false);
        this.loading = false;
    }

    get visible() {
        return this.container.visible;
    }

    toggle() {
        this.container.setVisible(!this.container.visible);
        if (this.container.visible) this.refresh();
    }

    hide() {
        this.container.setVisible(false);
    }

    async refresh() {
        if (!this.visible || this.loading) return;
        this.loading = true;
        try {
            const state = await this.services.api.dsa.state();
            if (this.visible) this.#draw(state);
        } catch (err) {
            this.#draw(null, err.message);
        } finally {
            this.loading = false;
        }
    }

    #draw(state, error) {
        const c = this.container;
        const s = this.scene;
        c.removeAll(true);
        const x = 40, y = 60, w = GAME_WIDTH - 80, h = 500;
        c.add(s.add.rectangle(x, y, w, h, COLORS.panel, 0.97).setOrigin(0).setStrokeStyle(3, COLORS.panelBorder));
        c.add(s.add.text(x + 20, y + 12, 'DSA Inspector — live from the C engine', textStyle(18, '#e5c07b', { fontStyle: 'bold' })));
        if (!state) {
            c.add(s.add.text(x + 20, y + 50, `Native engine unreachable: ${error}`, textStyle(14, '#e63946', { wordWrap: { width: w - 40 } })));
            return;
        }

        // Stack (top first)
        const colW = (w - 60) / 3;
        const sx = x + 20, top = y + 50;
        c.add(s.add.text(sx, top, `STACK "history"  size=${state.history.size}`, textStyle(13, '#4cc9f0', { fontStyle: 'bold' })));
        c.add(s.add.text(sx, top + 18, 'push/pop at the TOP (LIFO)', textStyle(11, '#8d99ae')));
        state.history.items.slice(0, 12).forEach((it, i) => {
            const yy = top + 40 + i * 30;
            c.add(s.add.rectangle(sx, yy, colW - 10, 26, i === 0 ? 0x1d3557 : 0x0d1b2a).setOrigin(0).setStrokeStyle(1, 0x4cc9f0));
            c.add(s.add.text(sx + 6, yy + 5, `${i === 0 ? 'TOP→ ' : ''}${it.text}`, textStyle(11, '#ffffff')));
        });
        if (state.history.size > 12) c.add(s.add.text(sx, top + 40 + 12 * 30, `… ${state.history.size - 12} older`, textStyle(11, '#8d99ae')));

        // Queue (front first)
        const qx = sx + colW + 10;
        const q = state.events;
        c.add(s.add.text(qx, top, `QUEUE "events"  ${q.size}/${q.capacity}`, textStyle(13, '#ffd60a', { fontStyle: 'bold' })));
        c.add(s.add.text(qx, top + 18, 'enqueue at REAR, dequeue at FRONT', textStyle(11, '#8d99ae')));
        if (!q.items.length) c.add(s.add.text(qx, top + 44, '(empty — all events processed)', textStyle(11, '#8d99ae')));
        q.items.slice(0, 12).forEach((it, i) => {
            const yy = top + 40 + i * 30;
            c.add(s.add.rectangle(qx, yy, colW - 10, 26, 0x0d1b2a).setOrigin(0).setStrokeStyle(1, 0xffd60a));
            c.add(s.add.text(qx + 6, yy + 5, `${i === 0 ? 'FRONT→ ' : ''}${it.text}`, textStyle(11, '#ffffff')));
        });

        // Linked list
        const lx = qx + colW + 10;
        c.add(s.add.text(lx, top, 'LINKED LIST quest chain', textStyle(13, '#52b788', { fontStyle: 'bold' })));
        c.add(s.add.text(lx, top + 18, `current → ${state.quests.current ?? 'NULL'}`, textStyle(11, '#8d99ae')));
        state.quests.chain.forEach((n, i) => {
            const yy = top + 40 + i * 56;
            c.add(s.add.rectangle(lx, yy, colW - 10, 34, n.id === state.quests.current ? 0x1b4332 : 0x0d1b2a).setOrigin(0).setStrokeStyle(1, 0x52b788));
            c.add(s.add.text(lx + 6, yy + 3, n.id, textStyle(11, '#ffffff', { fontStyle: 'bold' })));
            c.add(s.add.text(lx + 6, yy + 18, n.status, textStyle(10, '#c9d1d9')));
            c.add(s.add.text(lx + colW / 2 - 5, yy + 36, n.next ? '↓ next' : '↓ NULL', textStyle(10, '#8d99ae')).setOrigin(0.5, 0));
        });
    }
}
