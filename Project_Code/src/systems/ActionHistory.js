// ActionHistory - records player actions on the C stack named "history".
// The newest action is on top. Requests are chained so the stack order always
// matches the order the actions happened in the game.

const SAFE = /[^A-Za-z0-9_:.,\-]/g;

export class ActionHistory {
    constructor(api, emitter) {
        this.api = api;
        this.emitter = emitter;
        this.chain = Promise.resolve();
        this.snapshot = { size: 0, items: [] };
    }

    record(action, detail = '') {
        const value = (detail ? `${action}:${detail}` : action).replace(SAFE, '_').slice(0, 63);
        this.chain = this.chain
            .then(() => this.api.dsa.stackPush('history', value))
            .then(res => {
                this.snapshot = res;
                this.emitter.emit('history-changed', res);
            })
            .catch(err => console.warn('[ActionHistory]', err.message));
        return this.chain;
    }
}
