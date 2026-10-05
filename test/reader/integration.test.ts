import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReaderStore } from '../../src/vs/platform/novelReader/node/readerStore.js';
import { projectChapter, copyCanonical, canonicalToDisplay, displayToCanonical } from '../../src/vs/workbench/contrib/novelReader/common/codeProjection.js';

test('real TXT import, code mapping, annotations and both-mode anchors survive SQLite reopen and backup', async () => {
 const root = await mkdtemp(join(tmpdir(), 'nide-integrated-'));
 let store = new ReaderStore(root);
 try {
  const bytes = await readFile('test/reader/fixtures/sample.txt');
  const preview = await store.previewImport(bytes, 'sample.txt', { alias: 'cache.ts' });
  assert.equal((await store.listBooks()).length, 0, 'preview must not commit');
  const book = await store.importBook(bytes, 'sample.txt', { alias: 'cache.ts' });
  assert.equal(book.versionId, preview.versionId);
  assert.equal(book.chapters.length, 2);
  const chapter = await store.getChapter(book.id, book.versionId, book.chapters[0].id);
  const projection = projectChapter(chapter.text, 1);
  const offset = chapter.text.indexOf('🌧️');
  assert.ok(offset >= 0);
  const display = canonicalToDisplay(projection, offset);
  assert.equal(displayToCanonical(projection, display), offset);
  assert.equal(copyCanonical(projection, 0, projection.text.length), chapter.text);
  const anchor = { bookId: book.id, versionId: book.versionId, chapterId: chapter.id, offset };
  await store.savePosition(anchor);
  await store.saveSession({ anchor, mode: 'book', covered: false });
  await store.saveAnnotation({ kind: 'highlight', anchor, endOffset: offset + '🌧️'.length, color: '#e8c669' });
  const backup = await store.exportBackup();
  await store.close();
  store = new ReaderStore(root);
  assert.deepEqual((await store.getSession()).anchor, anchor);
  assert.deepEqual((await store.listBooks())[0].position, anchor);
  assert.equal((await store.listAnnotations(book.id))[0].endOffset, offset + '🌧️'.length);
  await store.removeBook(book.id);
  assert.equal((await store.listBooks()).length, 0);
  await store.restoreBackup(backup);
  assert.deepEqual((await store.getSession()).anchor, anchor);
  assert.equal((await store.listAnnotations(book.id)).length, 1);
  const before = await store.listBooks();
  await assert.rejects(store.restoreBackup(new Uint8Array([0, 1, 2])));
  assert.deepEqual(await store.listBooks(), before, 'failed restore preserves current library');
 } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

for (const version of [2, 3]) {
 test(`EPUB${version} imports all spine chapters and diacritic search offsets map into canonical text`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'nide-epub-integration-'));
  const store = new ReaderStore(root);
  try {
   const book = await store.importBook(await readFile(`test/reader/fixtures/sample-epub${version}.epub`), 'fixture.epub');
   assert.equal(book.chapters.length, 2, 'second spine item is deliberately absent from navigation');
   assert.ok(book.chapters[0].blocks.some(block => block.marks?.some(mark => mark.kind === 'strong')));
   const results = await store.search('anh sang', { bookId: book.id, ignoreDiacritics: true });
   assert.ok(results.length > 0);
   const found = results[0];
   const chapter = await store.getChapter(book.id, book.versionId, found.anchor.chapterId);
   assert.equal(chapter.text.slice(found.anchor.offset, found.endOffset), 'Ánh sáng');
   const projection = projectChapter(chapter.text, 2);
   assert.equal(copyCanonical(projection, canonicalToDisplay(projection, found.anchor.offset), canonicalToDisplay(projection, found.endOffset)), 'Ánh sáng');
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
 });
}
