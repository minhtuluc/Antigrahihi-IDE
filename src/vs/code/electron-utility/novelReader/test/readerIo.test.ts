import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReaderStore } from '../../../../platform/novelReader/node/readerStore.js';
import { createReaderIoHandler, ReaderIoReply } from '../readerIoHandler.js';
test('IO owns actual sqlite store and rejects unknown capabilities', async () => {
 const root = mkdtempSync(join(tmpdir(), 'reader-io-')); const store = new ReaderStore(root); const replies: ReaderIoReply[] = [];
 try {
  const handle = createReaderIoHandler(store, value => replies.push(value));
  await handle({ id: 1, request: { method: 'listBooks', args: [] } }); assert.deepEqual(replies.pop(), { id: 1, result: [] });
  await handle({ id: 2, request: { method: 'spawn', args: ['sh'] } }); assert.match(replies.pop()?.error || '', /Unknown reader method/);
  await handle({ id: 3, request: { method: 'importBook', args: [new TextEncoder().encode('Local paragraph'), 'fixture.txt'] } });
  assert.equal((replies.pop()?.result as { chapters: unknown[] }).chapters.length, 1);
  await handle({ id: 4, request: { method: 'listBooks', args: [] } }); assert.equal((replies.pop()?.result as unknown[]).length, 1);
 } finally { await store.close(); rmSync(root, { recursive: true, force: true }); }
});
