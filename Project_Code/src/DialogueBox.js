// DialogueBox - speaker name, typewriter text, continue indicator and choices.
//
// open(pages) resolves when the conversation ends. A page is:
//   { speaker, text, source?, choices?: [{ label, onSelect }] }
// A choice's onSelect may return (or resolve to) more pages, which are played
// next - that is how "Accept quest?" branches into accept / decline lines.
import { UI } from '../config/assets.js';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH, textStyle } from '../config/constants.js';
import { frame } from './Frame.js';

const INK = '#1d2b53';        // text colour of the reference's dialogue boxes
const INK_SOFT = '#5c677d';
const SELECT = '#c1121f';

const BOX = { x: 20, y: GAME_HEIGHT - 170, w: GAME_WIDTH - 40, h: 150 };
const CHARS_PER_TICK = 2;

export class DialogueBox {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.pages = [];
        this.index = 0;
        this.choiceIndex = 0;
        this.typing = null;
        this.openedAt = 0;
        this.resolve = null;
        this.busy = false;

        const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.dialogue).setVisible(false);
        this.container = c;
        // Frame + name tab + arrow are cut from the reference's UI panel.
        this.bg = frame(scene, UI.dialogFrame, BOX.x, BOX.y, BOX.w, BOX.h, { corner: 7, fallback: COLORS.panel });
        // name tab: drawn in the reference's colours (its crop has "Mentor" baked in)
        this.nameBg = scene.add.rectangle(BOX.x + 18, BOX.y - 22, 120, 30, 0x1d3d8f).setOrigin(0).setStrokeStyle(3, 0xdbe7ff);
        this.name = scene.add.text(BOX.x + 30, BOX.y - 15, '', textStyle(16, '#ffffff', { fontStyle: 'bold' }));
        this.text = scene.add.text(BOX.x + 24, BOX.y + 22, '', textStyle(17, INK, {
            wordWrap: { width: BOX.w - 48 },
            lineSpacing: 6,
        }));
        this.source = scene.add.text(BOX.x + BOX.w - 18, BOX.y + BOX.h - 12, '', textStyle(11, INK_SOFT)).setOrigin(1, 1);
        this.more = scene.textures.exists(UI.dialogArrow)
            ? scene.add.image(BOX.x + BOX.w - 30, BOX.y + BOX.h - 34, UI.dialogArrow).setScale(2)
            : scene.add.text(BOX.x + BOX.w - 20, BOX.y + BOX.h - 26, '▼ E', textStyle(14, SELECT)).setOrigin(1, 1);
        this.choiceTexts = [];
        c.add([this.bg, this.nameBg, this.name, this.text, this.source, this.more]);

        const kb = scene.input.keyboard;
        this.keyHandler = event => this.#onKey(event);
        kb.on('keydown', this.keyHandler);
        scene.events.once('shutdown', () => kb.off('keydown', this.keyHandler));
        scene.tweens.add({ targets: this.more, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    }

    open(pages) {
        this.pages = [...pages];
        this.index = 0;
        this.isOpen = true;
        this.openedAt = this.scene.time.now;
        this.container.setVisible(true);
        this.#showPage();
        return new Promise(res => { this.resolve = res; });
    }

    close() {
        this.isOpen = false;
        this.container.setVisible(false);
        this.#clearChoices();
        this.typing?.remove();
        this.typing = null;
        const r = this.resolve;
        this.resolve = null;
        r?.();
    }

    get page() {
        return this.pages[this.index];
    }

    #showPage() {
        const p = this.page;
        this.#clearChoices();
        this.name.setText(p.speaker ?? '');
        this.nameBg.setSize(Math.max(70, this.name.width + 26), 30);
        this.nameBg.setVisible(Boolean(p.speaker));
        this.source.setText(p.source ?? '');
        this.text.setText('');
        this.more.setVisible(false);
        this.fullText = p.text;
        let shown = 0;
        this.typing?.remove();
        this.typing = this.scene.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                shown = Math.min(this.fullText.length, shown + CHARS_PER_TICK);
                this.text.setText(this.fullText.slice(0, shown));
                if (shown >= this.fullText.length) this.#finishTyping();
            },
        });
    }

    #finishTyping() {
        this.typing?.remove();
        this.typing = null;
        this.text.setText(this.fullText);
        if (this.page.choices?.length) this.#showChoices();
        else this.more.setVisible(true);
    }

    #showChoices() {
        const choices = this.page.choices;
        this.choiceIndex = 0;
        const top = BOX.y + 24 + this.text.height + 10;
        choices.forEach((ch, i) => {
            const t = this.scene.add.text(BOX.x + 40, top + i * 24, '', textStyle(16, INK))
                .setInteractive({ useHandCursor: true })
                .on('pointerover', () => { this.choiceIndex = i; this.#renderChoices(); })
                .on('pointerdown', () => this.#select(i));
            this.choiceTexts.push(t);
            this.container.add(t);
        });
        this.#renderChoices();
    }

    #renderChoices() {
        this.page.choices.forEach((ch, i) => {
            const sel = i === this.choiceIndex;
            this.choiceTexts[i].setText(`${sel ? '▶' : ' '} ${i + 1}. ${ch.label}`).setColor(sel ? SELECT : INK);
        });
    }

    #clearChoices() {
        this.choiceTexts.forEach(t => t.destroy());
        this.choiceTexts = [];
    }

    async #select(i) {
        if (this.busy) return;
        const choice = this.page.choices[i];
        this.busy = true;
        this.#clearChoices();
        this.text.setText(this.fullText + '\n…');
        let more = null;
        try {
            more = await choice.onSelect?.();
        } finally {
            this.busy = false;
        }
        if (!this.isOpen) return;          // the handler may have closed us (scene change)
        if (Array.isArray(more) && more.length) {
            this.pages = more;
            this.index = 0;
            this.#showPage();
        } else {
            this.close();
        }
    }

    #advance() {
        if (this.typing) { this.#finishTyping(); return; }
        if (this.page.choices?.length) { this.#select(this.choiceIndex); return; }
        this.index++;
        if (this.index >= this.pages.length) this.close();
        else this.#showPage();
    }

    #onKey(event) {
        if (!this.isOpen || this.busy) return;
        if (this.scene.time.now - this.openedAt < 150) return;   // ignore the key that opened us
        const key = event.key;
        const hasChoices = !this.typing && this.page.choices?.length;
        if (hasChoices && (key === 'ArrowUp' || key === 'w' || key === 'W')) {
            this.choiceIndex = (this.choiceIndex + this.page.choices.length - 1) % this.page.choices.length;
            this.#renderChoices();
        } else if (hasChoices && (key === 'ArrowDown' || key === 's' || key === 'S')) {
            this.choiceIndex = (this.choiceIndex + 1) % this.page.choices.length;
            this.#renderChoices();
        } else if (hasChoices && /^[1-9]$/.test(key) && Number(key) <= this.page.choices.length) {
            this.#select(Number(key) - 1);
        } else if (key === 'e' || key === 'E' || key === ' ' || key === 'Enter') {
            this.#advance();
        }
    }
}
