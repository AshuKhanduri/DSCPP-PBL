// BootScene - loads the art and maps, checks the native engines, lets the
// player pick a hero and starts a new game. L / F open the leaderboard and
// the feedback form.
import Phaser from 'phaser';
import { ASSET_MANIFEST, PLAYER_ANIM, PLAYER_LOOKS } from '../config/assets.js';
import { GAME_HEIGHT, GAME_WIDTH, textStyle } from '../config/constants.js';
import { services } from '../systems/GameServices.js';
import { prepareQuest, questFromUrl } from '../systems/DevTools.js';
import { Button } from '../ui/Button.js';
import { askName, isPanelOpen, showFeedback, showLeaderboard } from '../ui/OnlinePanels.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        const m = ASSET_MANIFEST;
        m.images.forEach(a => this.load.image(a.key, a.url));
        m.spritesheets.forEach(a => this.load.spritesheet(a.key, a.url, { frameWidth: a.frameWidth, frameHeight: a.frameHeight }));
        m.tilemaps.forEach(a => this.load.tilemapTiledJSON(a.key, a.url));
        m.audio.forEach(a => this.load.audio(a.key, a.url));
        this.load.on('loaderror', file => console.warn(`[Boot] asset failed to load: ${file.key} (${file.src})`));

        const bar = this.add.rectangle(GAME_WIDTH / 2 - 200, GAME_HEIGHT / 2, 0, 10, 0xe5c07b).setOrigin(0, 0.5);
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 404, 14).setStrokeStyle(2, 0xe5c07b);
        this.load.on('progress', p => { bar.width = 400 * p; });
        this.load.once('complete', () => this.children.removeAll(true));
    }

    create() {
        this.#createAnimations();
        services.audio.attach(this);
        services.audio.playMusic('title');      // loops through title + hero select
        const cx = GAME_WIDTH / 2;
        this.add.text(cx, 110, 'QUESTFORGE', textStyle(56, '#e5c07b', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 })).setOrigin(0.5);
        this.add.text(cx, 165, 'A data-structures RPG  ·  C (DSA) + C++ (OOP) + Phaser', textStyle(15, '#c9d1d9')).setOrigin(0.5);

        // 1) the player's name (asked first), 2) the character: male or female
        this.nameText = this.add.text(cx, 205, '', textStyle(16, '#ffd60a', { fontStyle: 'bold' })).setOrigin(0.5)
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.#changeName());
        this.look = services.playerLook ?? 'male';
        this.heroes = Object.entries(PLAYER_LOOKS).map(([id, look], i) => {
            const x = cx - 70 + i * 140;
            const frame = this.add.rectangle(x, 280, 96, 110, 0xffffff, 0.08).setStrokeStyle(3, 0x4cc9f0)
                .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.#choose(id));
            const sprite = this.add.sprite(x, 287, look.texture, 0).setScale(3);
            if (this.anims.exists(`${id}-walk-down`)) sprite.play(`${id}-walk-down`);
            const label = this.add.text(x, 347, `${i + 1}  ${look.label}`, textStyle(14, '#ffffff')).setOrigin(0.5);
            return { id, frame, sprite, label };
        });
        this.#renderHeroes();

        this.status = this.add.text(cx, 425, '', textStyle(17, '#ffffff', { align: 'center', wordWrap: { width: 760 } })).setOrigin(0.5);
        this.help = this.add.text(cx, 540, [
            'WASD / Arrows  move          E  interact / continue',
            'Q  quest log     I  inventory     TAB  DSA inspector     M  mute',
        ].join('\n'), textStyle(14, '#8d99ae', { align: 'center', lineSpacing: 8 })).setOrigin(0.5);

        // leaderboard + feedback (served by Express -> MongoDB; not the native engines)
        const online = (fn) => () => { if (!this.starting && !isPanelOpen()) fn(); };
        const board = online(() => showLeaderboard(this.game, services.online, { highlight: services.profile.name }));
        const feedback = online(() => showFeedback(this.game, services.online, { name: services.profile.name ?? '', context: 'title' }));
        new Button(this, cx - 200, 588, 'Leaderboard (L)', board, { width: 190, height: 34, size: 13 });
        new Button(this, cx + 10, 588, 'Feedback (F)', feedback, { width: 190, height: 34, size: 13 });
        this.input.keyboard.on('keydown-L', board);
        this.input.keyboard.on('keydown-F', feedback);

        this.input.keyboard.on('keydown-ENTER', () => this.#start());
        this.input.keyboard.on('keydown-R', () => this.#check());
        this.input.keyboard.on('keydown-ONE', () => this.#choose('male'));
        this.input.keyboard.on('keydown-TWO', () => this.#choose('female'));
        this.input.keyboard.on('keydown-LEFT', () => this.#choose('male'));
        this.input.keyboard.on('keydown-RIGHT', () => this.#choose('female'));
        this.input.keyboard.on('keydown-N', () => this.#changeName());
        this.ready = false;
        this.starting = false;
        this.#showName();
        this.#check();
        // dev: ?quest=<id> skips the title screen, so it never stops to ask a name
        if (!services.profile.name && !questFromUrl()) this.#askName();
    }

    get #named() {
        return Boolean(services.profile.name);
    }

    // The name prompt (first thing on a new title screen). Not skippable.
    async #askName() {
        const name = await askName(this.game, { initial: services.profile.name ?? '' });
        if (name && this.scene.isActive()) { services.profile.name = name; this.#showName(); }
    }

    async #changeName() {
        if (this.starting || isPanelOpen() || !this.#named) return;
        const name = await askName(this.game, { initial: services.profile.name, canCancel: true });
        if (name) services.profile.name = name;
        this.#showName();
    }

    // The character choice appears once the player has a name.
    #showName() {
        const named = this.#named;
        this.nameText.setText(named ? `Welcome, ${services.profile.name}!     (N: change name)` : '');
        for (const h of this.heroes) [h.frame, h.sprite, h.label].forEach(o => o.setVisible(named));
        this.#refreshStatus();
    }

    #refreshStatus() {
        if (!this.ready || this.starting) return;
        this.status.setColor('#52b788').setText('C engine (DSA) ✓    C++ engine (OOP) ✓\n\n' +
            (this.#named ? 'Choose your character (1 Male / 2 Female), then press ENTER' : 'Enter your name to begin'));
    }

    // Walk + idle animation per look and direction, from the 4x4 sheets.
    #createAnimations() {
        const { rows, framesPerRow, fps } = PLAYER_ANIM;
        for (const [id, look] of Object.entries(PLAYER_LOOKS)) {
            if (!this.textures.exists(look.texture)) continue;
            rows.forEach((dir, r) => {
                const first = r * framesPerRow;
                if (!this.anims.exists(`${id}-walk-${dir}`)) {
                    this.anims.create({
                        key: `${id}-walk-${dir}`,
                        frames: this.anims.generateFrameNumbers(look.texture, { start: first, end: first + framesPerRow - 1 }),
                        frameRate: fps,
                        repeat: -1,
                    });
                }
                if (!this.anims.exists(`${id}-idle-${dir}`)) {
                    this.anims.create({ key: `${id}-idle-${dir}`, frames: [{ key: look.texture, frame: first }], frameRate: 1 });
                }
            });
        }
    }

    #choose(look) {
        if (this.starting || !this.#named || isPanelOpen()) return;
        this.look = look;
        this.#renderHeroes();
    }

    #renderHeroes() {
        for (const h of this.heroes) {
            const on = h.id === this.look;
            h.frame.setStrokeStyle(3, on ? 0xffd60a : 0x4a5568).setFillStyle(0xffffff, on ? 0.14 : 0.04);
            h.label.setColor(on ? '#ffd60a' : '#8d99ae');
        }
    }

    async #check() {
        if (this.starting) return;
        this.ready = false;
        this.status.setColor('#ffffff').setText('Connecting to the native C / C++ engines…');
        try {
            const health = await services.api.health();
            this.ready = health.ok;
            this.#refreshStatus();
            if (questFromUrl()) this.#start();   // dev: ?quest=<id> skips the title screen
        } catch (err) {
            if (err.code === 'SERVER_FULL') {      // too many players right now (engines are fine)
                this.status.setColor('#ffd166').setText(`${err.message}\n\nPress R to retry.`);
                return;
            }
            const native = err.body?.native;
            const detail = native
                ? `C engine: ${native.dsa ? 'ok' : 'MISSING'}   C++ engine: ${native.oop ? 'ok' : 'MISSING'}\nRun "npm run build:native" (needs gcc / g++).`
                : 'The API server is not reachable. Start everything with "npm run dev".';
            this.status.setColor('#e63946').setText(`Cannot start: native engines unavailable.\n${detail}\n\nPress R to retry.`);
        }
    }

    async #start() {
        if (!this.ready || this.starting || isPanelOpen()) return;
        if (!this.#named && !questFromUrl()) return;      // the name comes first
        this.starting = true;
        services.playerLook = this.look;
        this.status.setColor('#ffffff').setText('Building quest linked list and C++ entities…');
        try {
            await services.newGame(this);
            const devQuest = questFromUrl() ? await prepareQuest(services, questFromUrl()) : null;
            services.audio.stopMusic();         // title track ends before gameplay music starts
            // dev jump: straight into the quest's challenge (dialogue quests start in the village)
            if (devQuest?.challenge) this.scene.start('QuestScene', { questId: devQuest.id });
            else this.scene.start('WorldScene');
            this.scene.launch('HUDScene');
        } catch (err) {
            this.starting = false;
            this.status.setColor('#e63946').setText(`New game failed: ${err.message}\nPress R to retry.`);
        }
    }
}
