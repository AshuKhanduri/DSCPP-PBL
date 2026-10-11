// EventQueue - game events go through the C circular queue named "events".
//
//   game code -> enqueue(QUEST_STARTED ...) -> C queue -> pump() dequeues the
//   FRONT item -> 'game-event' is emitted -> HUD shows a notification.
//
// So notifications genuinely appear in FIFO order, one at a time, and the
// queue's capacity (64) is a real limit enforced in C.

const SAFE = /[^A-Za-z0-9_:.,\-]/g;

export class EventQueue {
    constructor(api, emitter) {
        this.api = api;
        this.emitter = emitter;
        this.chain = Promise.resolve();
        this.pending = 0;           // last size reported by the C queue
        this.snapshot = { size: 0, items: [] };
        this.pumping = false;
    }

    enqueue(type, detail = '') {
        const value = (detail ? `${type}:${detail}` : type).replace(SAFE, '_').slice(0, 63);
        this.chain = this.chain
            .then(() => this.api.dsa.enqueue('events', value))
            .then(res => this.#update(res))
            .catch(err => console.warn('[EventQueue]', err.message));
        return this.chain;
    }

    // Process ONE event (FIFO). Called on a timer by the HUD scene.
    async pump() {
        if (this.pumping || this.pending <= 0) return null;
        this.pumping = true;
        try {
            await this.chain;                 // never overtake pending enqueues
            const res = await this.api.dsa.dequeue('events');
            this.#update(res);
            const [type, ...rest] = res.dequeued.text.split(':');
            const event = { type, detail: rest.join(':'), raw: res.dequeued.text };
            this.emitter.emit('game-event', event);
            return event;
        } catch (err) {
            if (err.code === 'QUEUE_EMPTY') this.pending = 0;
            else console.warn('[EventQueue]', err.message);
            return null;
        } finally {
            this.pumping = false;
        }
    }

    #update(res) {
        this.pending = res.size;
        this.snapshot = res;
        this.emitter.emit('events-changed', res);
    }
}
