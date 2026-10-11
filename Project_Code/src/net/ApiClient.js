// ApiClient - the browser's only route to the native engines (HTTP + JSON).

export class ApiError extends Error {
    constructor(status, body) {
        super(body?.message || `HTTP ${status}`);
        this.status = status;
        this.code = body?.error || 'HTTP_ERROR';
        this.body = body;
    }
}

export class ApiClient {
    constructor(base = '/api') {
        this.base = base;
        this.online = null;            // null = unknown yet
        this.listeners = new Set();
    }

    onStatusChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    #setOnline(value) {
        if (this.online === value) return;
        this.online = value;
        for (const fn of this.listeners) fn(value);
    }

    async request(method, path, body) {
        let res;
        try {
            res = await fetch(this.base + path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (err) {
            this.#setOnline(false);
            throw new ApiError(0, { error: 'NETWORK', message: 'Cannot reach the QuestForge server. Is "npm run dev" running?' });
        }
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON error page */ }
        if (res.status === 503 || res.status === 502 || res.status === 504) this.#setOnline(false);
        else this.#setOnline(true);
        if (!res.ok || json?.ok === false) throw new ApiError(res.status, json);
        return json;
    }

    get(path) { return this.request('GET', path); }
    post(path, body = {}) { return this.request('POST', path, body); }
    delete(path) { return this.request('DELETE', path); }
}
