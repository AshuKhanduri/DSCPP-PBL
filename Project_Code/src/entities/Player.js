import Phaser from 'phaser';
import { COLORS, depthForY, MOVE_RECORD_DISTANCE, PLAYER_RADIUS, PLAYER_SPEED } from '../config/constants.js';
import { CHARACTER_ORIGIN, PLAYER_LOOKS } from '../config/assets.js';
import { createEntityView } from '../rendering/EntityView.js';
import { GameEntity } from './GameEntity.js';

// Player - WASD / arrow-key movement with collision against the GameMap.
// Movement is resolved per axis so the player slides along walls. The sprite
// plays walk-<dir> while moving and shows idle-<dir> when standing (the
// animations are created once in BootScene).
export class Player extends GameEntity {
    constructor(scene, { x, y }, map, { onMoveSegment, look = 'male' } = {}) {
        super(scene, { id: 'player', name: 'Player', x, y });
        this.map = map;
        this.frozen = false;
        this.onMoveSegment = onMoveSegment;
        this.travelled = 0;
        this.wasMoving = false;
        this.facing = 'down';
        this.look = PLAYER_LOOKS[look] ? look : 'male';

        this.view = createEntityView(scene, {
            x, y,
            sprite: { texture: PLAYER_LOOKS[this.look].texture, frame: 0, origin: CHARACTER_ORIGIN },
            shape: 'circle',
            color: COLORS.player,
            size: PLAYER_RADIUS * 2,
        });
        this.view.body_.setStrokeStyle?.(3, COLORS.playerOutline);
        this.#play(false);

        this.cursors = scene.input.keyboard.createCursorKeys();
        this.keys = scene.input.keyboard.addKeys('W,A,S,D');
    }

    get interactable() {
        return false;
    }

    update(delta) {
        let dx = 0, dy = 0;
        if (!this.frozen) {
            if (this.cursors.left.isDown || this.keys.A.isDown) dx -= 1;
            if (this.cursors.right.isDown || this.keys.D.isDown) dx += 1;
            if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
            if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;
        }
        const moving = dx !== 0 || dy !== 0;
        if (moving) {
            // horizontal input wins the facing on diagonals, like most top-down RPGs
            this.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
            const len = Math.hypot(dx, dy);
            const speed = PLAYER_SPEED * (this.map.speedFactor?.(this.x, this.y) ?? 1);
            const step = (speed * delta) / 1000;
            const before = { x: this.x, y: this.y };
            this.#tryMove((dx / len) * step, 0);
            this.#tryMove(0, (dy / len) * step);
            this.travelled += Phaser.Math.Distance.Between(before.x, before.y, this.x, this.y);
            this.view.setPosition(this.x, this.y).setDepth(depthForY(this.y));
        }
        if (moving !== this.wasMoving || moving) this.#play(moving);
        // A MOVE action is recorded when the player stops after a real distance.
        if (!moving && this.wasMoving && this.travelled >= MOVE_RECORD_DISTANCE) {
            this.onMoveSegment?.(this.x, this.y, this.travelled);
            this.travelled = 0;
        }
        this.wasMoving = moving;
    }

    #play(moving) {
        const body = this.view.body_;
        if (!body.anims) return;   // placeholder shape
        const key = `${this.look}-${moving ? 'walk' : 'idle'}-${this.facing}`;
        if (this.scene.anims.exists(key) && body.anims.getName() !== key) body.play(key);
    }

    #tryMove(mx, my) {
        const nx = this.x + mx;
        const ny = this.y + my;
        const half = PLAYER_RADIUS - 2;
        if (!this.map.isBlocked(nx, ny, half, half)) {
            this.x = nx;
            this.y = ny;
        }
    }

    teleport(x, y) {
        this.x = x;
        this.y = y;
        this.view.setPosition(x, y).setDepth(depthForY(y));
    }
}
