// DsaService - turns validated JavaScript calls into C engine commands.
import { containerName, int, number, oneOf, token, ValidationError } from '../validation.js';

export const ALGORITHMS = ['BFS', 'DFS', 'DIJKSTRA', 'ASTAR'];
export const TRACE_ALGORITHMS = ['BFS', 'DFS'];
export const SORT_ALGORITHMS = ['BUBBLE', 'SELECTION', 'INSERTION'];
const SORT_MAX_ITEMS = 64;
const MAX_NODES = 256;
const MAX_EDGES = 2048;
// A trace stores the frontier after every step, so it is limited to
// graphs small enough to walk through by hand.
const MAX_TRACE_NODES = 64;
const MAX_TRACE_EDGES = 256;
const BST_MAX_KEY = 9999;

export class DsaService {
    constructor(engine) {
        this.engine = engine;
    }

    ping() { return this.engine.send('PING'); }
    reset() { return this.engine.send('RESET'); }
    state() { return this.engine.send('STATE'); }

    // ---- Stack (capacity 0 = unlimited; a full stack refuses PUSH)
    stackCreate(name, capacity) {
        return this.engine.send(`STACK_CREATE ${containerName(name, 'stack')} ${int(capacity, 'capacity', { min: 0, max: 1024 })}`);
    }
    stackPeek(name) { return this.engine.send(`STACK_PEEK ${containerName(name, 'stack')}`); }
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
    queuePeek(name) { return this.engine.send(`QUEUE_PEEK ${containerName(name, 'queue')}`); }
    queueList(name) { return this.engine.send(`QUEUE_LIST ${containerName(name, 'queue')}`); }
    queueClear(name) { return this.engine.send(`QUEUE_CLEAR ${containerName(name, 'queue')}`); }

    // ---- Linear queue (array, no wrap-around: shows why circular queues exist)
    lqueueCreate(name, capacity) {
        return this.engine.send(`LQUEUE_CREATE ${containerName(name, 'queue')} ${int(capacity, 'capacity', { min: 1, max: 4096 })}`);
    }
    lqueueEnqueue(name, value, num = 0) {
        return this.engine.send(`LQUEUE_ENQ ${containerName(name, 'queue')} ${token(value, 'value')} ${int(num, 'numericValue')}`);
    }
    lqueueDequeue(name) { return this.engine.send(`LQUEUE_DEQ ${containerName(name, 'queue')}`); }
    lqueuePeek(name) { return this.engine.send(`LQUEUE_PEEK ${containerName(name, 'queue')}`); }
    lqueueList(name) { return this.engine.send(`LQUEUE_LIST ${containerName(name, 'queue')}`); }
    lqueueClear(name) { return this.engine.send(`LQUEUE_CLEAR ${containerName(name, 'queue')}`); }

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

    // ---- Binary search tree (Royal Registry)
    bstInsert(name, key) {
        return this.engine.send(`BST_INSERT ${containerName(name, 'tree')} ${int(key, 'key', { min: 0, max: BST_MAX_KEY })}`);
    }
    bstSearch(name, key) {
        return this.engine.send(`BST_SEARCH ${containerName(name, 'tree')} ${int(key, 'key', { min: 0, max: BST_MAX_KEY })}`);
    }
    bstInorder(name) { return this.engine.send(`BST_INORDER ${containerName(name, 'tree')}`); }
    bstShow(name) { return this.engine.send(`BST_SHOW ${containerName(name, 'tree')}`); }
    bstClear(name) { return this.engine.send(`BST_CLEAR ${containerName(name, 'tree')}`); }

    // ---- Step-by-step sorting (Order of the Forge): one operation per sortStep
    sortStart(name, algorithm, values) {
        if (!Array.isArray(values) || values.length > SORT_MAX_ITEMS) throw new ValidationError(`values must be an array of at most ${SORT_MAX_ITEMS} integers`);
        const vs = values.map((v, i) => int(v, `values[${i}]`, { min: -999999, max: 999999 }));
        return this.engine.send(['SORT_START', containerName(name, 'sort'), oneOf(algorithm, 'algorithm', SORT_ALGORITHMS), vs.length, ...vs].join(' '));
    }
    sortStep(name) { return this.engine.send(`SORT_STEP ${containerName(name, 'sort')}`); }
    sortState(name) { return this.engine.send(`SORT_STATE ${containerName(name, 'sort')}`); }
    sortClear(name) { return this.engine.send(`SORT_CLEAR ${containerName(name, 'sort')}`); }

    // ---- AVL tree (Garden of Balance): insert answers with every rebalancing step
    avlInsert(name, key) {
        return this.engine.send(`AVL_INSERT ${containerName(name, 'tree')} ${int(key, 'key', { min: 0, max: BST_MAX_KEY })}`);
    }
    avlShow(name) { return this.engine.send(`AVL_SHOW ${containerName(name, 'tree')}`); }
    avlClear(name) { return this.engine.send(`AVL_CLEAR ${containerName(name, 'tree')}`); }

    // ---- Graph search
    // graph = { nodes: [{id, x, y}], edges: [{from, to, weight}], directed }
    path(request) {
        return this.#search('PATH', oneOf(request.algorithm, 'algorithm', ALGORITHMS), request, MAX_NODES, MAX_EDGES);
    }

    // Same search plus every operation the C code performed (enqueue, pop,
    // neighbour checks...) with the queue / stack contents after each one.
    async trace(request) {
        const algo = oneOf(request.algorithm, 'algorithm', TRACE_ALGORITHMS);
        const res = await this.#search('TRACE', algo, request, MAX_TRACE_NODES, MAX_TRACE_EDGES);
        if (!res.ok) return res;
        const id = i => (i >= 0 ? res.ids[i] : null);
        const trace = res.trace.map(e => {
            const step = { op: e.op, node: id(e.node), other: id(e.other), flag: e.flag };
            if (e.queue) step.queue = e.queue.map(id);
            if (e.stack) {   // [node, pushedBy, node, pushedBy, ...] top first
                step.stack = [];
                for (let i = 0; i < e.stack.length; i += 2) step.stack.push({ node: id(e.stack[i]), from: id(e.stack[i + 1]) });
            }
            return step;
        });
        const { ids: _ids, ...rest } = res;
        return { ...rest, trace };
    }

    async #search(command, algo, { graph, start, goal, heuristicScale = 1 }, maxNodes, maxEdges) {
        const { nodes, edges, directed = false } = graph ?? {};
        if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > maxNodes) {
            throw new ValidationError(`graph.nodes must contain 1-${maxNodes} nodes`);
        }
        if (!Array.isArray(edges) || edges.length > maxEdges) {
            throw new ValidationError(`graph.edges must be an array of at most ${maxEdges} edges`);
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
        // BFS / DFS without a goal = full traversal (C: NO_GOAL = -1)
        const goalIndex = goal == null && TRACE_ALGORITHMS.includes(algo) ? -1 : idx(goal, 'goal');
        const parts = [
            command, algo, idx(start, 'start'), goalIndex, directed ? 1 : 0, number(heuristicScale, 'heuristicScale') || 1,
            nodes.length,
        ];
        nodes.forEach((n, i) => parts.push(Math.round(number(n.x ?? 0, `nodes[${i}].x`)), Math.round(number(n.y ?? 0, `nodes[${i}].y`))));
        parts.push(edges.length);
        edges.forEach((e, i) => parts.push(idx(e.from, `edges[${i}].from`), idx(e.to, `edges[${i}].to`),
            int(e.weight ?? 1, `edges[${i}].weight`, { min: 0, max: 1e6 })));

        const res = await this.engine.send(parts.join(' '));
        if (!res.ok) return res;
        const mapped = {
            ...res,
            path: res.path.map(i => ids[i]),
            visitOrder: res.visitOrder.map(i => ids[i]),
        };
        if (command === 'TRACE') mapped.ids = ids;   // trace() maps its own indices
        return mapped;
    }
}
