// GameEntity - client-side base class for everything placed on a map.
// (The authoritative C++ hierarchy lives in native/cpp; this mirrors its shape
// for rendering and input.)
import { setViewHighlighted } from '../rendering/EntityView.js';

export class GameEntity {
    constructor(scene, { id, name, x, y }) {
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.view = null;
    }

    get position() {
        return { x: this.x, y: this.y };
    }

    // Subclasses describe what pressing E does ("Talk to Guide", "Open Old Chest").
    get promptText() {
        return `Interact with ${this.name}`;
    }

    get interactable() {
        return true;
    }

    // Subclasses implement interaction; the InteractionSystem only calls this.
    interact() {}

    setHighlighted(on) {
        setViewHighlighted(this.view, on);
    }

    destroy() {
        this.view?.destroy();
        this.view = null;
    }
}
