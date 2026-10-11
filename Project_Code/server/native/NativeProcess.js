// NativeProcess - talks to a compiled C/C++ engine over stdin/stdout.
//
// The engine is spawned once and kept alive, so its data structures persist
// in native memory between HTTP requests. Each call writes one command line
// and resolves with the next JSON line the engine prints. Commands are
// strictly serialised (one in flight at a time) so responses can never be
// matched to the wrong request.
//
// This class is the only place that knows the transport. Anything with the
// same `send(command) -> Promise<object>` shape (an N-API addon, WebAssembly,
// a socket) can replace it without touching the routes.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export class NativeUnavailableError extends Error {
    constructor(name, binaryPath, reason) {
        super(`${name} native engine unavailable (${reason}). Build it with "npm run build:native". Expected: ${binaryPath}`);
        this.code = 'NATIVE_UNAVAILABLE';
    }
}

export class NativeProcess {
    constructor(name, binaryPath, { timeoutMs = 5000 } = {}) {
        this.name = name;
        this.binaryPath = binaryPath;
        this.timeoutMs = timeoutMs;
        this.child = null;
        this.pending = null;          // { resolve, reject, timer }
        this.chain = Promise.resolve(); // serialises commands
        this.startedAt = null;
        this.restarts = 0;
    }

    get running() {
        return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
    }

    start() {
        if (this.running) return;
        if (!existsSync(this.binaryPath)) throw new NativeUnavailableError(this.name, this.binaryPath, 'binary not found');

        const child = spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        this.child = child;
        this.startedAt = new Date();

        createInterface({ input: child.stdout }).on('line', line => this.#onLine(line));
        child.stderr.on('data', d => console.error(`[${this.name}] ${d.toString().trim()}`));
        child.on('error', err => this.#failPending(new NativeUnavailableError(this.name, this.binaryPath, err.message)));
        child.on('exit', code => {
            if (this.child === child) this.child = null;
            this.#failPending(new Error(`${this.name} engine exited with code ${code}`));
            if (code !== 0 && code !== null) this.restarts++;
        });
    }

    send(command) {
        if (/[\r\n]/.test(command)) return Promise.reject(new Error('command must be a single line'));
        const run = () => new Promise((resolve, reject) => {
            try {
                this.start();
            } catch (err) {
                reject(err);
                return;
            }
            const timer = setTimeout(() => {
                this.pending = null;
                reject(new Error(`${this.name} engine timed out on: ${command.slice(0, 80)}`));
                this.child?.kill();            // a stuck engine is restarted on next call
            }, this.timeoutMs);
            this.pending = { resolve, reject, timer };
            this.child.stdin.write(command + '\n');
        });
        const result = this.chain.then(run, run);
        this.chain = result.catch(() => {});
        return result;
    }

    stop() {
        if (!this.child) return;
        try { this.child.stdin.write('QUIT\n'); } catch { /* already closed */ }
        this.child.kill();
        this.child = null;
    }

    #onLine(line) {
        const p = this.pending;
        if (!p) {
            console.warn(`[${this.name}] unexpected output: ${line}`);
            return;
        }
        this.pending = null;
        clearTimeout(p.timer);
        try {
            p.resolve(JSON.parse(line));
        } catch {
            p.reject(new Error(`${this.name} engine returned invalid JSON: ${line.slice(0, 120)}`));
        }
    }

    #failPending(err) {
        const p = this.pending;
        if (!p) return;
        this.pending = null;
        clearTimeout(p.timer);
        p.reject(err);
    }
}
