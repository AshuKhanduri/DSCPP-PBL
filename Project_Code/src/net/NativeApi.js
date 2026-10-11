// NativeApi - typed wrappers around the Express endpoints.
// Every method here ends up executing C (dsa) or C++ (oop) code on the server.
import { ApiClient } from './ApiClient.js';

export class NativeApi {
    constructor(client = new ApiClient()) {
        this.client = client;
        const c = client;

        this.health = () => c.get('/health');
        this.resetGame = questIds => c.post('/game/reset', { questIds });

        this.dsa = {
            state: () => c.get('/dsa/state'),
            path: (algorithm, graph, start, goal, heuristicScale = 1) =>
                c.post('/dsa/path', { algorithm, graph, start, goal, heuristicScale }),
            compare: (algorithms, graph, start, goal, heuristicScale = 1) =>
                c.post('/dsa/path/compare', { algorithms, graph, start, goal, heuristicScale }),

            stackPush: (stack, value, numericValue = 0) => c.post('/dsa/stack/push', { stack, value, numericValue }),
            stackPop: stack => c.post('/dsa/stack/pop', { stack }),
            stackClear: stack => c.post('/dsa/stack/clear', { stack }),
            stackList: (stack, limit = 32) => c.get(`/dsa/stack/${stack}?limit=${limit}`),

            queueCreate: (queue, capacity) => c.post('/dsa/queue/create', { queue, capacity }),
            enqueue: (queue, value, numericValue = 0) => c.post('/dsa/queue/enqueue', { queue, value, numericValue }),
            dequeue: queue => c.post('/dsa/queue/dequeue', { queue }),
            queueClear: queue => c.post('/dsa/queue/clear', { queue }),
            queueList: queue => c.get(`/dsa/queue/${queue}`),

            listInsert: (list, value, position = 'TAIL', after = null) => c.post('/dsa/list/insert', { list, value, position, after }),
            listRemove: (list, value) => c.post('/dsa/list/remove', { list, value }),
            listClear: list => c.post('/dsa/list/clear', { list }),
            listShow: list => c.get(`/dsa/list/${list}`),

            questState: () => c.get('/dsa/quest/state'),
            questStart: questId => c.post('/dsa/quest/start', { questId }),
            questComplete: questId => c.post('/dsa/quest/complete', { questId }),
        };

        this.oop = {
            create: spec => c.post('/oop/entity/create', spec),
            createBatch: entities => c.post('/oop/entities/batch', { entities }),
            list: () => c.get('/oop/entities'),
            get: id => c.get(`/oop/entity/${id}`),
            remove: id => c.delete(`/oop/entity/${id}`),
            interact: id => c.post('/oop/entity/interact', { id }),
            player: () => c.get('/oop/player'),
            reward: reward => c.post('/oop/player/reward', reward),
            take: (item, count = 1) => c.post('/oop/player/take', { item, count }),
        };
    }
}
