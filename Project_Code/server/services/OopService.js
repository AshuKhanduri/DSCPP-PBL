// OopService - turns validated JavaScript calls into C++ engine commands.
import { displayName, int, number, token, ValidationError } from '../validation.js';

export const ENTITY_TYPES = ['Guide', 'King', 'Blacksmith', 'Librarian', 'Guard', 'Door', 'Chest', 'QuestObject'];

export class OopService {
    constructor(engine) {
        this.engine = engine;
    }

    ping() { return this.engine.send('PING'); }
    reset() { return this.engine.send('RESET'); }

    create({ type, id, x = 0, y = 0, param = null, name }) {
        if (!ENTITY_TYPES.includes(type)) throw new ValidationError(`type must be one of ${ENTITY_TYPES.join(', ')}`);
        const p = param == null || param === '' ? '-' : token(param, 'param');
        return this.engine.send(`CREATE ${type} ${token(id, 'id')} ${number(x, 'x')} ${number(y, 'y')} ${p} ${displayName(name ?? id)}`);
    }

    list() { return this.engine.send('LIST'); }
    get(id) { return this.engine.send(`GET ${token(id, 'id')}`); }
    remove(id) { return this.engine.send(`REMOVE ${token(id, 'id')}`); }
    interact(id) { return this.engine.send(`INTERACT ${token(id, 'id')}`); }
    player() { return this.engine.send('PLAYER'); }

    reward({ gold = 0, xp = 0, item = null, count = 1 }) {
        const it = item ? token(item, 'item') : '-';
        return this.engine.send(`REWARD ${int(gold, 'gold', { min: 0, max: 1e6 })} ${int(xp, 'xp', { min: 0, max: 1e6 })} ${it} ${int(count, 'count', { min: 1, max: 999 })}`);
    }

    take(item, count = 1) {
        return this.engine.send(`TAKE ${token(item, 'item')} ${int(count, 'count', { min: 1, max: 999 })}`);
    }
}
