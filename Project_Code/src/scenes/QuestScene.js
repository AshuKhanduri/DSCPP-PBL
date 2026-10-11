// QuestScene - hosts ONE challenge module chosen by the quest's `challenge`
// key (see challenges/registry.js), then shows the result and returns to the
// world. Adding a quest type = adding a challenge class, not a new scene.
import Phaser from 'phaser';
import { CHALLENGES } from '../challenges/registry.js';
import { services } from '../systems/GameServices.js';
import { ResultPanel } from '../ui/ResultPanel.js';
import { rewardLine } from '../systems/DialogueSystem.js';

export class QuestScene extends Phaser.Scene {
    constructor() {
        super('QuestScene');
    }

    init(data) {
        this.questId = data.questId;
        this.result = null;
        this.closing = false;
    }

    create() {
        services.audio.attach(this);
        const quest = services.quests.get(this.questId);
        this.quest = quest;
        const Challenge = CHALLENGES[quest?.challenge];
        if (!Challenge) {
            this.add.text(40, 80, `No challenge registered for "${quest?.challenge}"`, { color: '#e63946' });
            this.time.delayedCall(1500, () => this.returnToWorld());
            return;
        }

        services.setChallengeBanner({ title: quest.title, subtitle: `${quest.concept}  ·  ESC = leave` });
        this.cameras.main.setBackgroundColor('#1b263b');
        this.cameras.main.fadeIn(250);
        // A second camera draws the fixed UI (sidebar, dialogue, results) so the
        // world camera can follow the player and zoom out to show a result.
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);

        this.challenge = new Challenge(this, quest, services, result => this.finish(result));
        this.challenge.create();
        this.#assignCameras();

        this.input.keyboard.on('keydown', event => this.#onKey(event));
    }

    update(time, delta) {
        if (!this.result) this.challenge?.update(time, delta);
        this.#assignCameras();
    }

    // scrollFactor 0 = screen-fixed UI -> UI camera only; everything else -> world camera only.
    #assignCameras() {
        const main = this.cameras.main, ui = this.uiCamera;
        for (const obj of this.children.list) {
            const isUi = obj.scrollFactorX === 0;
            if (obj.uiCameraTag_ === isUi) continue;
            obj.uiCameraTag_ = isUi;
            obj.cameraFilter = isUi ? main.id : ui.id;   // cameraFilter = cameras that must NOT draw it
        }
    }

    // Called by the challenge when the player succeeds or fails.
    finish(result) {
        if (this.result) return;
        this.result = result;
        this.resultShownAt = this.time.now;   // ignore the key press that ended the challenge
        services.history.record(result.success ? 'CHALLENGE_SUCCESS' : 'CHALLENGE_FAILED', this.questId);
        const actions = result.success
            ? [{ key: 'E', label: `Claim reward (${rewardLine(this.quest.reward)})` }]
            : [{ key: 'R', label: 'Retry' }, { key: 'ESC', label: 'Return to the village' }];
        this.panel = new ResultPanel(this, result, this.challenge.resultArea ?? { x: 630, y: 60, w: 320, h: 560 }, actions);
    }

    async #onKey(event) {
        if (this.closing) return;
        if (this.result && this.time.now - this.resultShownAt < 400) return;
        const k = event.key;
        if (this.result?.success && (k === 'e' || k === 'E' || k === 'Enter')) {
            this.closing = true;
            try {
                await services.quests.complete(this.questId, this.result);
            } catch (err) {
                console.error(err);
            }
            this.returnToWorld();
        } else if (this.result && !this.result.success && (k === 'r' || k === 'R')) {
            this.closing = true;
            services.history.record('RETRY_CHALLENGE', this.questId);
            this.challenge?.destroy?.();
            this.scene.restart({ questId: this.questId });
        } else if (k === 'Escape' && !this.result?.success) {
            this.returnToWorld();
        }
    }

    returnToWorld() {
        this.closing = true;
        services.setChallengeBanner(null);
        services.history.record('LEAVE_CHALLENGE', this.questId);
        this.challenge?.destroy?.();
        this.cameras.main.fadeOut(200);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('WorldScene'));
    }
}
