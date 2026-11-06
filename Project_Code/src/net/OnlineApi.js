// OnlineApi - leaderboard and feedback (Express -> MongoDB, see server/routes/online.js).
// Uses its OWN ApiClient: a database outage (503) must not make the HUD report
// the native C/C++ engines as offline.
import { ApiClient } from './ApiClient.js';

export class OnlineApi {
    constructor(client = new ApiClient()) {
        this.client = client;
    }

    status() { return this.client.get('/online/status'); }
    leaderboard(limit = 10) { return this.client.get(`/online/leaderboard?limit=${limit}`); }
    submitScore(run) { return this.client.post('/online/scores', run); }
    sendFeedback({ rating, message, name, context }) { return this.client.post('/online/feedback', { rating, message, name, context }); }
}
