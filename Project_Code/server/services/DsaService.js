// DsaService - turns validated JavaScript calls into C engine commands.
import { containerName, int, number, oneOf, token, ValidationError } from '../validation.js';

export const ALGORITHMS = ['BFS', 'DFS'];
const MAX_NODES = 256;
const MAX_EDGES = 2048;

export class DsaService {
    constructor(engine) {
        this.engine = engine;
    }

    ping() { return this.engine.send('PING'); }
    reset() { return this.engine.send('RESET'); }
    state() { return this.engine.send('STATE'); }

    // ---- Stack
    stackPush(name, value, num = 0) {
        return this.engine.send(`STACK_PUSH ${containerName(name, 'stack')} ${token(value, 'value')} ${int(num, 'numericValue')}`);
    }
    stackPop(name) { return this.engine.send(`STACK_POP ${containerName(name, 'stack')}`); }
    stackList(name, limit = 32) {
        return this.engine.send(`STACK_LIST ${containerName(name, 'stack')} ${int(limit, 'limit', { min: 0, max: 1000 })}`);
    }
    stackClear(name) { return this.engine.send(`STACK_CLEAR ${containerName(name, 'stack')}`); }

    // ---- Queue
    queueCreate(name, capacity) {
        return this.engine.send(`QUEUE_CREATE ${containerName(name, 'queue')} ${int(capacity, 'capacity', { min: 1, max: 4096 })}`);
    }
    queueEnqueue(name, value, num = 0) {
        return this.engine.send(`QUEUE_ENQ ${containerName(name, 'queue')} ${token(value, 'value')} ${int(num, 'numericValue')}`);
    }
    queueDequeue(name) { return this.engine.send(`QUEUE_DEQ ${containerName(name, 'queue')}`); }
    queueList(name) { return this.engine.send(`QUEUE_LIST ${containerName(name, 'queue')}`); }
    queueClear(name) { return this.engine.send(`QUEUE_CLEAR ${containerName(name, 'queue')}`); }

    // ---- Linked list
    listInsert(name, value, position = 'TAIL', after = null) {
        const list = containerName(name, 'list');
        const pos = oneOf(position, 'position', ['HEAD', 'TAIL', 'AFTER']);
        const v = token(value, 'value');
        if (pos === 'AFTER') return this.engine.send(`LIST_INSERT ${list} AFTER ${token(after, 'after')} ${v}`);
        return this.engine.send(`LIST_INSERT ${list} ${pos} ${v}`);
    }
    listRemove(name, value) { return this.engine.send(`LIST_REMOVE ${containerName(name, 'list')} ${token(value, 'value')}`); }
    listShow(name) { return this.engine.send(`LIST_SHOW ${containerName(name, 'list')}`); }
    listClear(name) { return this.engine.send(`LIST_CLEAR ${containerName(name, 'list')}`); }

    // ---- Quest chain (linked list)
    async questInit(questIds) {
        if (!Array.isArray(questIds) || questIds.length === 0 || questIds.length > 64) {
            throw new ValidationError('questIds must be a non-empty array (max 64)');
        }
        const ids = questIds.map((q, i) => token(q, `questIds[${i}]`));
        await this.engine.send('QUEST_RESET');
        let last;
        for (const id of ids) {
            last = await this.engine.send(`QUEST_ADD ${id}`);
            if (!last.ok) return last;
        }
        return last;
    }
    questState() { return this.engine.send('QUEST_STATE'); }
    questStart(id) { return this.engine.send(`QUEST_START ${token(id, 'questId')}`); }
    questComplete(id) { return this.engine.send(`QUEST_COMPLETE ${token(id, 'questId')}`); }

    // ---- Graph search
    // graph = { nodes: [{id, x, y}], edges: [{from, to, weight}], directed }
    async path({ algorithm, graph, start, goal, heuristicScale = 1 }) {
        const algo = oneOf(algorithm, 'algorithm', ALGORITHMS);
        const { nodes, edges, directed = false } = graph ?? {};
        if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > MAX_NODES) {
            throw new ValidationError(`graph.nodes must contain 1-${MAX_NODES} nodes`);
        }
        if (!Array.isArray(edges) || edges.length > MAX_EDGES) {
            throw new ValidationError(`graph.edges must be an array of at most ${MAX_EDGES} edges`);
        }
        // Map string ids -> dense indices for the C engine.
        const index = new Map();
        const ids = nodes.map((n, i) => {
            const id = String(n.id);
            if (index.has(id)) throw new ValidationError(`duplicate node id ${id}`);
            index.set(id, i);
            return id;
        });
        const idx = (id, field) => {
            if (!index.has(String(id))) throw new ValidationError(`${field} refers to unknown node ${id}`);
            return index.get(String(id));
        };
        const parts = [
            'PATH', algo, idx(start, 'start'), idx(goal, 'goal'), directed ? 1 : 0, number(heuristicScale, 'heuristicScale') || 1,
            nodes.length,
        ];
        nodes.forEach((n, i) => parts.push(Math.round(number(n.x ?? 0, `nodes[${i}].x`)), Math.round(number(n.y ?? 0, `nodes[${i}].y`))));
        parts.push(edges.length);
        edges.forEach((e, i) => parts.push(idx(e.from, `edges[${i}].from`), idx(e.to, `edges[${i}].to`),
            int(e.weight ?? 1, `edges[${i}].weight`, { min: 0, max: 1e6 })));

        const res = await this.engine.send(parts.join(' '));
        if (!res.ok) return res;
        return {
            ...res,
            path: res.path.map(i => ids[i]),
            visitOrder: res.visitOrder.map(i => ids[i]),
        };
    }
}
