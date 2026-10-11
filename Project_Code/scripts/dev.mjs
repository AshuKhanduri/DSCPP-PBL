// npm run dev - builds the native engines if needed, then runs the API server
// and the Vite dev server together. Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? '.exe' : '';
const binaries = ['dsa_engine', 'oop_engine'].map(b => join(root, 'native', 'bin', b + exe));

if (!binaries.every(existsSync)) {
    console.log('Native engines not built yet - compiling...');
    const r = spawnSync(process.execPath, [join(root, 'native', 'build.mjs')], { stdio: 'inherit' });
    if (r.status !== 0) {
        console.error('\nNative build failed. The game needs the C/C++ engines; install gcc/g++ and retry.');
        process.exit(1);
    }
}

const children = [
    spawn(process.execPath, [join(root, 'server', 'server.js')], { stdio: 'inherit', cwd: root }),
    spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js')], { stdio: 'inherit', cwd: root }),
];

const stop = () => {
    for (const c of children) c.kill();
    process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', code => { if (code) stop(); });
