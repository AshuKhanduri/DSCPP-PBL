// AudioManager - plays a sound if it was loaded, otherwise does nothing.
// Add audio files to assets/audio/, enable them in config/assets.js and the
// existing play() calls start making noise - no gameplay changes needed.
import { SOUNDS } from '../config/assets.js';

export class AudioManager {
    constructor() {
        this.scene = null;
        this.muted = false;
        this.music = null;
    }

    attach(scene) {
        this.scene = scene;
    }

    play(name, config = {}) {
        const key = SOUNDS[name];
        if (this.muted || !this.scene || typeof key !== 'string') return;
        if (!this.scene.cache.audio.exists(key)) return;
        this.scene.sound.play(key, config);
    }

    playMusic(name) {
        const key = SOUNDS.music?.[name];
        if (!this.scene || !key || !this.scene.cache.audio.exists(key)) return;
        if (this.music?.key === key) return;
        this.music?.stop();
        this.music = this.scene.sound.add(key, { loop: true, volume: 0.5 });
        if (!this.muted) this.music.play();
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.music) this.muted ? this.music.pause() : this.music.resume();
        return this.muted;
    }
}
