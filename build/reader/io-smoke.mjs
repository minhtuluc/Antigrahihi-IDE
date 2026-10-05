// Run with the pinned Electron binary and ELECTRON_RUN_AS_NODE=1.
// This exercises the shipped utility bundle using Electron's embedded SQLite binding.
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const profile = mkdtempSync(join(tmpdir(), 'reader-electron-io-'));
process.argv[2] = profile;
const port = new EventEmitter();
let sequence = 0; const pending = new Map();
port.postMessage = value => { const promise = pending.get(value.id); pending.delete(value.id); value.error ? promise.reject(new Error(value.error)) : promise.resolve(value.result); };
Object.defineProperty(process, 'parentPort', { value: port });
await import(join(root, '.reader-out/readerIo.cjs'));
function request(method, ...args) { const id = ++sequence; const promise = new Promise((resolveResult, reject) => pending.set(id, { resolve: resolveResult, reject })); port.emit('message', { data: { id, request: { method, args } } }); return promise; }
try {
 assert.deepEqual(await request('listBooks'), []);
 const imported = await request('importBook', new TextEncoder().encode('Chương 1\nA local paragraph 😀\nChương 2\nContinuation.'), 'fixture.txt');
 assert.equal(imported.chapters.length, 2);
 await request('savePosition', { bookId: imported.id, versionId: imported.versionId, chapterId: imported.chapters[1].id, offset: 3 });
 assert.equal((await request('listBooks'))[0].position.offset, 3);
 assert.ok((await request('exportBackup')).byteLength > 0);
 await assert.rejects(request('executeCommand', 'workbench.action.terminal.new'), /Unknown reader method/);
 console.log(`Reader shipped IO PASS Electron ${process.versions.electron}; Node ${process.versions.node}; SQLite ${process.versions.sqlite}`);
} finally {
 // The smoke driver owns its temporary profile; production uses the main-only shutdown envelope.
 await request('cancelImport');
 rmSync(profile, { recursive: true, force: true });
}
