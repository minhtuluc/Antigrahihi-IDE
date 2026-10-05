import { cp, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
let platform = process.platform;
let electronDir = resolve(root, '../../code-oss/.build/electron');
for (let index = 0; index < args.length; index++) {
 if (args[index] === '--platform' && args[index + 1]) { platform = args[++index]; }
 else if (args[index] === '--electron-dir' && args[index + 1]) { electronDir = resolve(args[++index]); }
 else { throw new Error('Usage: package.mjs [--platform linux|win32] [--electron-dir PINNED_RUNTIME_DIRECTORY]'); }
}
if (!['linux', 'win32'].includes(platform)) { throw new Error('Portable packaging supports Linux and Windows.'); }
const runtimeExecutable = join(electronDir, platform === 'win32' ? 'electron.exe' : 'code-oss');
try { await stat(runtimeExecutable); } catch { throw new Error(`Pinned ${platform} Electron runtime missing: ${runtimeExecutable}`); }
const runtimeVersion = (await readFile(join(electronDir, 'version'), 'utf8')).trim();
if (runtimeVersion !== '43.7.3') { throw new Error(`Expected pinned Electron43.7.3, received ${runtimeVersion}.`); }
const output = join(root, '.reader-out');
const inventory = JSON.parse(await readFile(join(output, 'inventory.json'), 'utf8'));
if (!Array.isArray(inventory.forbidden) || inventory.forbidden.length) { throw new Error('Build inventory failed capability audit.'); }
const directory = join(root, '.reader-dist', platform, 'WorkspaceReader');
await mkdir(directory, { recursive: true });
// Only the Electron runtime and audited reader outputs enter the product folder.
await cp(electronDir, directory, { recursive: true, filter: source => !source.endsWith('default_app.asar') });
const app = join(directory, 'resources', 'app');
await mkdir(app, { recursive: true });
const files = await readdir(output, { withFileTypes: true });
const hashes = {};
for (const entry of files) {
 if (entry.name.endsWith('.map') || entry.name.endsWith('.meta.json')) { continue; }
 if (entry.isDirectory()) {
  if (entry.name !== 'themes') { throw new Error(`Unlisted product directory: ${entry.name}`); }
 } else if (!/^(?:index\.html|reader(?:Main\.mjs|Preload\.cjs|Io\.cjs|\.js|\.css)|inventory\.json|LICENSE\.txt|[^/]+\.(?:ttf|woff2?|svg|png))$/.test(entry.name)) {
  throw new Error(`Unlisted product artifact: ${entry.name}`);
 }
 await cp(join(output, entry.name), join(app, entry.name), { recursive: true });
 if (entry.isFile()) { hashes[entry.name] = createHash('sha256').update(await readFile(join(output, entry.name))).digest('hex'); }
}
await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'workspace-reader', productName: 'Workspace Reader', version: '0.3.0-dev', main: 'readerMain.mjs', type: 'module' }, null, 2) + '\n');
await writeFile(join(directory, 'reader-package.json'), JSON.stringify({ platform, expectedElectron: '43.7.3', builtAt: new Date().toISOString(), hashes, forbidden: inventory.forbidden, nativeGuiVerified: false, windowsVerified: false }, null, 2) + '\n');
if (platform === 'linux') {
 await writeFile(join(directory, 'workspace-reader.sh'), '#!/bin/sh\nset -eu\nreader_root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$reader_root/code-oss" "$reader_root/resources/app" "$@"\n', { mode: 0o755 });
 const archive = join(root, '.reader-dist', 'WorkspaceReader-linux.tar.gz');
 const result = spawnSync('tar', ['-czf', archive, '-C', dirname(directory), 'WorkspaceReader'], { stdio: 'inherit' });
 if (result.error) { throw result.error; }
 if (result.status !== 0) { throw new Error(`tar failed: ${result.status}`); }
 console.log(`Portable folder: ${directory}\nArchive: ${archive}`);
} else {
 await writeFile(join(directory, 'workspace-reader.cmd'), '@echo off\r\n"%~dp0electron.exe" "%~dp0resources\\app" %*\r\n');
 console.log(`Windows portable folder: ${directory}. Windows execution remains unverified until tested on Windows.`);
}
