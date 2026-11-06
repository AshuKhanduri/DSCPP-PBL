// EndScene - the end of the adventure, after King Aldric's farewell.
//
// A short departure (the explorer walks off down the road at sunset), then
// "A New Journey Awaits" with the journey statistics. Every number comes from
// the game state at this moment (services.journeyStats(): C quest chain, C++
// chests and player) - nothing is computed or remembered here.
// Music: the title-screen track, faded in (the world faded gameplay music out).
// Then: save the score to the leaderboard (S), view it (L), send feedback (F).
import Phaser from 'phaser';
import { PLAYER_LOOKS, UI } from '../config/assets.js';
import { GAME_HEIGHT, GAME_WIDTH, textStyle } from '../config/constants.js';
import { ENDING } from '../data/ending.js';
import { services } from '../systems/GameServices.js';
import { Button } from '../ui/Button.js';
import { frame } from '../ui/Frame.js';
import { isPanelOpen, showFeedback, showLeaderboard, showSaveScore } from '../ui/OnlinePanels.js';
import { formatDuration } from '../data/scoring.js';

const CX = GAME_WIDTH / 2;
const INK = '#1d2b53';

export class EndScene extends Phaser.Scene {
    constructor() {
        super('EndScene');
    }

    create() {
        this.leaving = false;
        services.audio.attach(this);
        services.audio.playMusic('title', { fadeIn: 2000 });
        this.cameras.main.setBackgroundColor('#0d1b2a');
        this.cameras.main.fadeIn(900, 0, 0, 0);
        this.#sky();
        this.#departure();

        // statistics are read now, while the departure plays
        this.stats = null;
        this.statsError = null;
        services.journeyStats()
            .then(s => { this.stats = s; services.adventure.lastStats = s; })
            .catch(err => { this.statsError = err; });
        this.time.delayedCall(2600, () => this.#present());

        const kb = this.input.keyboard;
        kb.on('keydown-ENTER', () => this.#toTitle());
        kb.on('keydown-S', () => this.#saveScore());
        kb.on('keydown-L', () => this.#leaderboard());
        kb.on('keydown-F', () => this.#feedback());
    }

    // sunset bands, a hill line and the road out of town
    #sky() {
        const bands = [0x1b1f3b, 0x2d2a5a, 0x5a3d6b, 0x8c4f6b, 0xc8735a, 0xe5a050];
        const h = 300 / bands.length;
        bands.forEach((c, i) => this.add.rectangle(0, i * h, GAME_WIDTH, h + 1, c).setOrigin(0));
        this.add.circle(CX, 300, 46, 0xffd38a, 0.9);
        this.add.rectangle(0, 300, GAME_WIDTH, GAME_HEIGHT - 300, 0x24442d).setOrigin(0);
        this.add.rectangle(0, 600, GAME_WIDTH, 40, 0xc2a878).setOrigin(0);    // the road (below the button)
        for (let i = 0; i < 40; i++) this.add.rectangle(Math.random() * GAME_WIDTH, Math.random() * 170, 2, 2, 0xffffff, 0.6);
    }

    // the explorer walks out along the road
    #departure() {
        const look = PLAYER_LOOKS[services.playerLook] ?? Object.values(PLAYER_LOOKS)[0];
        const anim = `${services.playerLook}-walk-right`;
        if (this.textures.exists(look.texture)) {
            const hero = this.add.sprite(120, 632, look.texture, 0).setScale(2.4).setOrigin(0.5, 1);
            if (this.anims.exists(anim)) hero.play(anim);
            this.tweens.add({ targets: hero, x: GAME_WIDTH + 60, duration: 9000 });
        }
        this.departLine = this.add.text(CX, 200, '...and so the explorer set out on the road beyond the town.',
            textStyle(16, '#ffffff', { fontStyle: 'italic', stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
        this.tweens.add({ targets: this.departLine, alpha: 1, duration: 900, yoyo: true, hold: 900 });
    }

    #present() {
        if (!this.stats && !this.statsError) { this.time.delayedCall(250, () => this.#present()); return; }
        const s = ENDING.screen;
        const W = 600, H = 420, X = CX - W / 2, Y = 70;
        const panel = this.add.container(0, 0).setAlpha(0);
        panel.add(frame(this, UI.dialogFrame, X, Y, W, H, { corner: 7, fallback: 0xffffff }));
        panel.add(this.add.text(CX, Y + 30, s.title, textStyle(30, INK, { fontStyle: 'bold' })).setOrigin(0.5));
        panel.add(this.add.text(CX, Y + 70, s.subtitle, textStyle(13, '#5c677d', { align: 'center', wordWrap: { width: W - 80 } })).setOrigin(0.5));
        this.tweens.add({ targets: panel, alpha: 1, y: { from: 16, to: 0 }, duration: 900, ease: 'Sine.easeOut' });

        const lines = this.#lines();
        lines.forEach((l, i) => {
            const t = this.add.text(CX, Y + 128 + i * 34, l.text, textStyle(l.size ?? 16, l.color ?? INK, { fontStyle: l.bold ? 'bold' : 'normal' }))
                .setOrigin(0.5).setAlpha(0);
            panel.add(t);
            this.tweens.add({ targets: t, alpha: 1, x: { from: CX - 12, to: CX }, delay: 900 + i * 450, duration: 400 });
        });
        const after = 900 + lines.length * 450;
        const label = this.add.text(CX, Y + H - 72, s.label, textStyle(22, '#c1121f', { fontStyle: 'bold' })).setOrigin(0.5).setAlpha(0);
        const thanks = this.add.text(CX, Y + H - 40, s.thanks, textStyle(14, '#5c677d')).setOrigin(0.5).setAlpha(0);
        panel.add([label, thanks]);
        this.tweens.add({ targets: [label, thanks], alpha: 1, delay: after, duration: 600 });
        this.tweens.add({ targets: label, scale: { from: 1.25, to: 1 }, delay: after, duration: 500, ease: 'Back.easeOut' });

        // a row of four buttons under the panel
        const BW = 196, GAP = 12, row = [
            ['Save Score (S)', () => this.#saveScore()],
            ['Leaderboard (L)', () => this.#leaderboard()],
            ['Feedback (F)', () => this.#feedback()],
            ['Return to Title (Enter)', () => this.#toTitle()],
        ];
        const x0 = CX - (row.length * BW + (row.length - 1) * GAP) / 2;
        const buttons = row.map(([text, fn], i) => new Button(this, x0 + i * (BW + GAP), Y + H + 26, text, fn, { width: BW, height: 38, size: 13 }));
        [this.saveButton, , , this.button] = buttons;
        this.scoreNote = this.add.text(CX, Y + H + 76, '', textStyle(12, '#ffd166', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
        this.#refreshSave();
        for (const b of buttons) {
            b.container.setAlpha(0);
            this.tweens.add({ targets: b.container, alpha: b.enabled ? 1 : 0.4, delay: after + 300, duration: 500 });
        }
    }

    // ---- leaderboard and feedback ----

    get #ready() {
        return Boolean(this.button) && !this.leaving && !isPanelOpen();
    }

    #canSave() {
        const a = services.adventure;
        if (!this.stats) return 'The journey statistics could not be read.';
        if (a.devRun) return 'Dev quest jump used this game: the score is not eligible for the leaderboard.';
        if (a.submitted) return `Score saved: ${a.submitted.entry.score} points, #${a.submitted.rank} on the leaderboard.`;
        return null;
    }

    #refreshSave() {
        const reason = this.#canSave();
        this.saveButton.setEnabled(!reason);
        if (services.adventure.submitted) this.saveButton.setLabel('Score Saved');
        this.scoreNote.setText(reason ?? '');
    }

    #saveScore() {
        if (!this.#ready || this.#canSave()) return;
        const run = services.leaderboardRun(this.stats);
        showSaveScore(this.game, services.online, {
            run, defaultName: this.stats.name,
            onSaved: (res, name) => {
                services.profile.name = name;
                services.adventure.submitted = res;
                this.#refreshSave();
            },
        });
    }

    #leaderboard() {
        if (this.#ready) showLeaderboard(this.game, services.online, { highlight: services.profile.name });
    }

    #feedback() {
        if (this.#ready) showFeedback(this.game, services.online, { name: services.profile.name ?? '', context: 'end' });
    }

    #lines() {
        if (this.statsError) {
            return [{ text: 'Your journey statistics could not be read', bold: true }, { text: `(${this.statsError.message})`, size: 12, color: '#c1121f' }];
        }
        const st = this.stats;
        const lines = [
            { text: st.name, size: 24, bold: true, color: '#7a5c1e' },
            { text: `${st.questsCompleted} / ${st.questsTotal}  Main Quests Completed`, bold: true },
            { text: `${st.locationsFound} / ${st.locationsTotal}  Bonus Coin Locations Discovered` },
            { text: `+${st.bonusCoins}  Bonus Coins Collected` },
        ];
        if (st.totalCoins != null) lines.push({ text: `Total Coins: ${st.totalCoins}`, color: '#5c677d', size: 14 });
        const run = services.leaderboardRun(st);
        lines.push({ text: `Score ${run.score.total}   ·   first-try answers ${run.firstTryCorrect}/${run.questionsAsked}   ·   ${formatDuration(run.timeMs)}`, bold: true, color: '#7a5c1e', size: 15 });
        return lines;
    }

    // Back to the title screen. The statistics stay in services until a new game starts.
    #toTitle() {
        if (this.leaving || !this.button || isPanelOpen()) return;
        this.leaving = true;
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BootScene'));
    }
}

