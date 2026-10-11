// Creates the two native engine connections used by the server.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeProcess } from './NativeProcess.js';

const binDir = process.env.QUESTFORGE_NATIVE_BIN
    || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native', 'bin');
const exe = process.platform === 'win32' ? '.exe' : '';

export function createEngines() {
    return {
        dsa: new NativeProcess('dsa(C)', join(binDir, `dsa_engine${exe}`)),
        oop: new NativeProcess('oop(C++)', join(binDir, `oop_engine${exe}`)),
    };
}
