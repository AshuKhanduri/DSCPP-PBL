// RoamingChallenge - base for challenges where the player walks around a
// Tiled map (e.g. Lost Path). Reuses the same Player,
// MapManager, InteractionSystem and DialogueSystem as the village.
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants.js';
import { Player } from '../entities/Player.js';
import { DialogueSystem } from '../systems/DialogueSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { MapManager } from '../systems/MapManager.js';
import { BaseChallenge } from './BaseChallenge.js';

const HUD_BAR = 44;   // HUDScene's top bar covers this many pixels

export class RoamingChallenge extends BaseChallenge {
    // rightPanel: width of a fixed panel on the right; the camera may scroll
    // the map's right edge out from under it.
    setupMap(mapId, { rightPanel = 0 } = {}) {
        const scene = this.scene;
        this.map = MapManager.load(mapId, scene);
        this.map.render(scene);
        this.player = new Player(scene, this.map.spawn(), this.map, {
            look: this.services.playerLook,
            onMoveSegment: (x, y) => this.services.history.record('MOVE', `${this.quest.id}:${Math.round(x / 32)},${Math.round(y / 32)}`),
        });
        this.dialogue = new DialogueSystem(scene, this.services, { launchChallenge: () => {} });
        this.interaction = new InteractionSystem(scene, this.player, {
            isBlocked: () => this.dialogue.isOpen || this.done,
        });

        const cam = scene.cameras.main;
        cam.setBounds(0, -HUD_BAR, Math.max(this.map.width + rightPanel, GAME_WIDTH), Math.max(this.map.height + HUD_BAR, GAME_HEIGHT));
        cam.startFollow(this.player.view, true, 0.15, 0.15);
        cam.setRoundPixels(true);
    }

    // Zoom the camera out so the whole map fits the area left of the panel
    // (used to show an algorithm's result on the real map).
    showWholeMap({ rightPanel = 0, duration = 900 } = {}) {
        const cam = this.scene.cameras.main;
        const areaW = GAME_WIDTH - rightPanel - 16, areaH = GAME_HEIGHT - HUD_BAR - 16;
        const zoom = Math.min(areaW / this.map.width, areaH / this.map.height, 1);
        cam.stopFollow();
        cam.removeBounds();
        // put the map centre at the centre of the free area, not of the screen
        const screenCx = (GAME_WIDTH - rightPanel) / 2, screenCy = HUD_BAR + (GAME_HEIGHT - HUD_BAR) / 2;
        const x = this.map.width / 2 + (GAME_WIDTH / 2 - screenCx) / zoom;
        const y = this.map.height / 2 + (GAME_HEIGHT / 2 - screenCy) / zoom;
        cam.pan(x, y, duration, 'Sine.easeInOut');
        cam.zoomTo(zoom, duration, 'Sine.easeInOut');
        return new Promise(res => this.scene.time.delayedCall(duration, res));
    }

    update(_time, delta) {
        if (!this.player) return;
        this.player.frozen = this.dialogue.isOpen || this.interaction.busy || this.done || this.frozen === true;
        this.player.update(delta);
        this.interaction.update();
    }
}
