// Compiles the native engines into native/bin/.
//   node native/build.mjs          (or: npm run build:native)
// Requires gcc and g++ on PATH (MinGW-w64 / MSYS2 on Windows, build-essential on Linux,
// Xcode command line tools on macOS). Override with CC / CXX environment variables.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const binDir = join(here, 'bin');
const exe = process.platform === 'win32' ? '.exe' : '';
const CC = process.env.CC || 'gcc';
const CXX = process.env.CXX || 'g++';
// Static linking on Windows avoids missing-DLL errors when Node spawns the engine.
const staticFlags = process.platform === 'win32' ? ['-static'] : [];

mkdirSync(binDir, { recursive: true });

const sources = (dir, ext) =>
    readdirSync(join(here, dir)).filter(f => f.endsWith(ext)).map(f => join(here, dir, f));

const targets = [
    {
        name: 'dsa_engine (C)',
        compiler: CC,
        args: ['-std=c11', '-O2', '-Wall', '-Wextra', ...sources('c', '.c'),
            '-o', join(binDir, `dsa_engine${exe}`), '-lm', ...staticFlags],
    },
    {
        name: 'oop_engine (C++)',
        compiler: CXX,
        args: ['-std=c++17', '-O2', '-Wall', '-Wextra', ...sources('cpp', '.cpp'),
            '-o', join(binDir, `oop_engine${exe}`), ...staticFlags],
    },
];

let failed = false;
for (const t of targets) {
    process.stdout.write(`Building ${t.name} with ${t.compiler} ... `);
    const r = spawnSync(t.compiler, t.args, { encoding: 'utf8' });
    if (r.error) {
        failed = true;
        console.log('FAILED');
        console.error(`  Could not run "${t.compiler}": ${r.error.message}`);
        console.error('  Install GCC/G++ and make sure it is on PATH (or set CC / CXX).');
        continue;
    }
    if (r.status !== 0) {
        failed = true;
        console.log('FAILED');
        console.error(r.stderr || r.stdout);
        continue;
    }
    console.log('ok');
    if (r.stderr.trim()) console.log(r.stderr.trim());
}

process.exit(failed ? 1 : 0);
