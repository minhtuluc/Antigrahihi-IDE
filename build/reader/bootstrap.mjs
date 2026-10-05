import { lstat, symlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (Number(process.versions.node.split('.')[0]) < 24) { throw new Error('Reader build and SQLite tests require Node24 or later.'); }
// Core TypeScript resolves packages from the source root. Preserve any existing checkout installation.
try { await lstat(resolve(root, 'node_modules')); }
catch (error) {
 if (error.code !== 'ENOENT') { throw error; }
 await symlink(process.platform === 'win32' ? resolve(root, 'build/reader/node_modules') : 'build/reader/node_modules', resolve(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}
console.log('Reader toolchain ready; existing IDE dependency installation preserved.');
