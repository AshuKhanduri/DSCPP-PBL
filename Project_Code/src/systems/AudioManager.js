// AudioManager - plays a sound if it was loaded, otherwise does nothing.
// Add audio files to assets/audio/, enable them in config/assets.js and the
// existing play() calls start making noise - no gameplay changes needed.
//
// Music: at most ONE looping track exists at a time. It lives on the game-wide
// sound manager (not on a scene), so scene changes, restarts and resizes never
// restart or duplicate it. Asking for the track that is already current is a
// no-op; asking for a different one stops the old track before the new starts.
import { MUSIC_LOOP_START, SOUNDS } from '../config/assets.js';

const MUSIC_VOLUME = 0.5;

export class AudioManager {
    constructor() {
        this.scene = null;
        this.muted = false;
        this.music = null;          // the single Phaser sound instance for music
        this.musicKey = null;       // key of the current (or pending) track
        this.warned = new Set();
    }

    attach(scene) {
        this.scene = scene;
    }

    // The sound manager is shared by every scene of the game.
    get #sound() {
        return this.scene?.sys.game.sound ?? null;
    }

    play(name, config = {}) {
        const key = SOUNDS[name];
        if (this.muted || !this.scene || typeof key !== 'string') return;
        if (!this.scene.cache.audio.exists(key)) return;
        this.scene.sound.play(key, config);
    }

    // fadeIn (ms): start silent and rise to the normal music volume.
    playMusic(name, { fadeIn = 0 } = {}) {
        const key = SOUNDS.music?.[name];
        const sound = this.#sound;
        if (!key || !sound) return;
        if (this.musicKey === key) return;          // already current: never restart
        this.stopMusic();
        if (!this.scene.cache.audio.exists(key)) {
            this.#warnOnce(key, `[Audio] music "${name}" (${key}) is not loaded or unsupported - skipping`);
            return;
        }
        this.musicKey = key;
        this.music = sound.add(key, { loop: true, volume: MUSIC_VOLUME });
        this.#addLoopMarker(this.music, MUSIC_LOOP_START[name] ?? 0);

        // Browsers block audio until the first click / key press. Phaser
        // unlocks on that gesture; start the track then instead of queuing it
        // on a suspended context.
        if (sound.locked) {
            const track = this.music;
            sound.once('unlocked', () => {
                if (this.music === track && !this.muted && !track.isPlaying) this.#start(track);
            });
        } else if (!this.muted) {
            this.#start(this.music);
            if (fadeIn > 0) {
                const track = this.music;
                track.setVolume(0);
                this.scene.tweens.add({ targets: track, volume: MUSIC_VOLUME, duration: fadeIn });
            }
        }
    }

    // Lower the current track to silence, then stop it. Resolves when done.
    fadeOutMusic(duration = 1000) {
        const track = this.music;
        if (!track || !this.scene || duration <= 0 || !track.isPlaying) {
            this.stopMusic();
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.scene.tweens.add({
                targets: track, volume: 0, duration,
                onComplete: () => { if (this.music === track) this.stopMusic(); resolve(); },
            });
        });
    }

    // A marker from `startAt` to the end of the file. Playing a looping marker
    // makes every loop begin at the marker start, not at 0 s.
    #addLoopMarker(track, startAt) {
        if (startAt <= 0 || startAt >= track.totalDuration) return;
        track.addMarker({
            name: 'loop',
            start: startAt,
            duration: track.totalDuration - startAt,
            config: { loop: true, volume: MUSIC_VOLUME },
        });
    }

    #start(track) {
        if (track.markers.loop) track.play('loop');
        else track.play();
    }

    stopMusic() {
        if (this.music) {
            this.music.stop();
            this.music.destroy();
        }
        this.music = null;
        this.musicKey = null;
    }

    toggleMute() {
        this.muted = !this.muted;
        const m = this.music;
        if (m) {
            if (this.muted) m.pause();
            else if (m.isPaused) m.resume();
            else if (!m.isPlaying && !this.#sound?.locked) this.#start(m);   // muted before it ever started
        }
        return this.muted;
    }

    #warnOnce(key, message) {
        if (this.warned.has(key)) return;
        this.warned.add(key);
        console.warn(message);
    }
}
