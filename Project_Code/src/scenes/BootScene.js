// BootScene - loads the art and maps, checks the native engines, lets the
// player pick a hero and starts a new game.
import Phaser from 'phaser';
import { ASSET_MANIFEST, PLAYER_ANIM, PLAYER_LOOKS } from '../config/assets.js';
import { GAME_HEIGHT, GAME_WIDTH, textStyle } from '../config/constants.js';
import { services } from '../systems/GameServices.js';

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
        const cx = GAME_WIDTH / 2;
        this.add.text(cx, 110, 'QUESTFORGE', textStyle(56, '#e5c07b', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 })).setOrigin(0.5);
        this.add.text(cx, 165, 'A data-structures RPG  ·  C (DSA) + C++ (OOP) + Phaser', textStyle(15, '#c9d1d9')).setOrigin(0.5);

        // hero choice
        this.look = services.playerLook ?? 'male';
        this.heroes = Object.entries(PLAYER_LOOKS).map(([id, look], i) => {
            const x = cx - 70 + i * 140;
            const frame = this.add.rectangle(x, 255, 96, 110, 0xffffff, 0.08).setStrokeStyle(3, 0x4cc9f0);
            const sprite = this.add.sprite(x, 262, look.texture, 0).setScale(3);
            if (this.anims.exists(`${id}-walk-down`)) sprite.play(`${id}-walk-down`);
            const label = this.add.text(x, 322, `${i + 1}  ${look.label}`, textStyle(14, '#ffffff')).setOrigin(0.5);
            return { id, frame, sprite, label };
        });
        this.#renderHeroes();

        this.status = this.add.text(cx, 400, '', textStyle(17, '#ffffff', { align: 'center', wordWrap: { width: 760 } })).setOrigin(0.5);
        this.help = this.add.text(cx, 540, [
            'WASD / Arrows  move          E  interact / continue',
            'Q  quest log     I  inventory     TAB  DSA inspector     M  mute',
        ].join('\n'), textStyle(14, '#8d99ae', { align: 'center', lineSpacing: 8 })).setOrigin(0.5);

        this.input.keyboard.on('keydown-ENTER', () => this.#start());
        this.input.keyboard.on('keydown-R', () => this.#check());
        this.input.keyboard.on('keydown-ONE', () => this.#choose('male'));
        this.input.keyboard.on('keydown-TWO', () => this.#choose('female'));
        this.input.keyboard.on('keydown-LEFT', () => this.#choose('male'));
        this.input.keyboard.on('keydown-RIGHT', () => this.#choose('female'));
        this.ready = false;
        this.starting = false;
        this.#check();
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
        if (this.starting) return;
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
            this.status.setColor('#52b788').setText('C engine (DSA) ✓    C++ engine (OOP) ✓\n\nChoose a hero (1 / 2), then press ENTER');
        } catch (err) {
            const native = err.body?.native;
            const detail = native
                ? `C engine: ${native.dsa ? 'ok' : 'MISSING'}   C++ engine: ${native.oop ? 'ok' : 'MISSING'}\nRun "npm run build:native" (needs gcc / g++).`
                : 'The API server is not reachable. Start everything with "npm run dev".';
            this.status.setColor('#e63946').setText(`Cannot start: native engines unavailable.\n${detail}\n\nPress R to retry.`);
        }
    }

    async #start() {
        if (!this.ready || this.starting) return;
        this.starting = true;
        services.playerLook = this.look;
        this.status.setColor('#ffffff').setText('Building quest linked list and C++ entities…');
        try {
            await services.newGame(this);
            this.scene.start('WorldScene');
            this.scene.launch('HUDScene');
        } catch (err) {
            this.starting = false;
            this.status.setColor('#e63946').setText(`New game failed: ${err.message}\nPress R to retry.`);
        }
    }
}
