/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let Store: any;
try {
	Store = (await import('../readerStore.ts')).ReaderStore;
}
catch { }
async function storeTest(run: (store: any, root: string) => Promise<void>) {
	assert.ok(Store, 'ReaderStore is implemented'); const root = await mkdtemp(join(tmpdir(), 'reader-store-')); const s = new Store(root); try {
		await run(s, root);
	}
		finally {
		await s.close();
		await rm(root, { recursive: true, force: true });
	}
}
const utf8 = (s: string) => new TextEncoder().encode(s);
function crc32(bytes: Buffer) {
	let n = 0xffffffff; for (const b of bytes) {
		n ^= b;
		for (let i = 0; i < 8; i++) {
			n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
		}
	} return (n ^ 0xffffffff) >>> 0;
}
function zip(files: Record<string, string | Buffer>) {
	const locals: Buffer[] = []; const centers: Buffer[] = []; let offset = 0; for (const [name, value] of Object.entries(files)) {
		const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
		const n = Buffer.from(name);
		const h = Buffer.alloc(30);
		h.writeUInt32LE(0x04034b50);
		h.writeUInt16LE(20, 4);
		h.writeUInt32LE(crc32(b), 14);
		h.writeUInt32LE(b.length, 18);
		h.writeUInt32LE(b.length, 22);
		h.writeUInt16LE(n.length, 26);
		const c = Buffer.alloc(46);
		c.writeUInt32LE(0x02014b50);
		c.writeUInt16LE(20, 4);
		c.writeUInt16LE(20, 6);
		c.writeUInt32LE(crc32(b), 16);
		c.writeUInt32LE(b.length, 20);
		c.writeUInt32LE(b.length, 24);
		c.writeUInt16LE(n.length, 28);
		c.writeUInt32LE(offset, 42);
		locals.push(h, n, b);
		centers.push(c, n);
		offset += h.length + n.length + b.length;
	} const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centers.reduce((s, b) => s + b.length, 0), 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, ...centers, end]);
}
function epub(nav3 = false, extra: Record<string, string | Buffer> = {}) {
	return zip({
		'mimetype': 'application/epub+zip',
		'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
		'OPS/book.opf': `<package version="${nav3 ? '3.0' : '2.0'}"><metadata><dc:title xmlns:dc="urn:dc">Fixture</dc:title><dc:creator xmlns:dc="urn:dc">Author</dc:creator></metadata><manifest><item id="second" href="z.xhtml" media-type="application/xhtml+xml"/><item id="first" href="a.xhtml" media-type="application/xhtml+xml"/><item id="extra" href="hidden.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="${nav3 ? 'nav.xhtml' : 'toc.ncx'}" media-type="${nav3 ? 'application/xhtml+xml' : 'application/x-dtbncx+xml'}" ${nav3 ? 'properties="nav"' : ''}/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine toc="nav"><itemref idref="second"/><itemref idref="first"/><itemref idref="extra"/></spine></package>`,
		'OPS/toc.ncx': '<ncx><navMap><navPoint><navLabel><text>Z first</text></navLabel><content src="z.xhtml"/></navPoint><navPoint><navLabel><text>A second</text></navLabel><content src="a.xhtml"/></navPoint></navMap></ncx>',
		'OPS/nav.xhtml': '<html><body><nav epub:type="toc" xmlns:epub="urn:epub"><ol><li><a href="z.xhtml">Z first</a></li><li><a href="a.xhtml">A second</a></li></ol></nav></body></html>',
		'OPS/z.xhtml': '<html><body><h1>First</h1><p>Hello <strong>world</strong> <em>friend</em> <a href="#fn">note</a>.</p><img src="cover.png" alt="Cover"/><aside id="fn" epub:type="footnote" xmlns:epub="urn:epub">Footnote</aside></body></html>',
		'OPS/a.xhtml': '<html><body><p>Second chapter</p></body></html>',
		'OPS/hidden.xhtml': '<html><body><p>Unlisted spine text</p></body></html>',
		'OPS/cover.png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...extra
	});
}
test('TXT BOM decoding and consistent headings preserve canonical UTF16 offsets', () => storeTest(async (s) => { const b = await s.importBook(utf8('\ufeffChương 1\r\nĐêm 😀.\r\n\r\nChương 2\r\nTiếp.'), 'novel.txt'); assert.equal(b.chapters.length, 2); assert.equal(b.chapters[0].text, 'Chương 1\nĐêm 😀.'); assert.equal(b.chapters[0].blocks[1].start, 9); const p = await s.previewImport(Buffer.concat([Buffer.from([255, 254]), Buffer.from('Chapter 1\nOne\nChapter 2\nTwo', 'utf16le')]), 'u.txt'); assert.equal(p.chapters.length, 2); assert.equal((await s.listBooks()).length, 1); }));
test('same raw bytes with different splitting get immutable versions', () => storeTest(async (s) => { const bytes = utf8('Chapter 1\nA\nChapter 2\nB'); const a = await s.importBook(bytes, 'a.txt'); const b = await s.importBook(bytes, 'a.txt', { splitPattern: '^Never$' }); assert.equal(a.id, b.id); assert.notEqual(a.versionId, b.versionId); assert.equal((await s.getBook(a.id, a.versionId)).chapters.length, 2); assert.equal(b.chapters.length, 1); }));
for (const nav3 of [false, true]) {
	test(`EPUB${nav3 ? 3 : 2} follows spine and retains chapter absent from navigation`, () => storeTest(async (s) => { const b = await s.importBook(epub(nav3), 'fixture.epub'); assert.equal(b.title, 'Fixture'); assert.deepEqual(b.chapters.map((c: any) => c.title), ['Z first', 'A second', 'Chapter 3']); assert.ok(b.chapters[2].text.includes('Unlisted spine text')); assert.ok(b.coverAssetId); assert.ok(b.chapters[0].blocks.some((x: any) => x.kind === 'footnote')); assert.ok(b.chapters[0].blocks.some((x: any) => x.marks?.some((m: any) => m.kind === 'strong'))); }));
}
test('unsafe EPUBs reject without committing partial library data', () => storeTest(async (s) => { await assert.rejects(s.importBook(epub(false, { '../escape': 'bad' }), 'bad.epub')); await assert.rejects(s.importBook(epub(false, { 'OPS/z.xhtml': '<!DOCTYPE html [<!ENTITY leak SYSTEM "file:///etc/passwd">]><html><body>&leak;</body></html>' }), 'bad.epub')); await assert.rejects(s.importBook(epub(false, { 'OPS/z.xhtml': '<html><body><script>alert(1)</script><p>safe</p><img src="https://bad.example/a.png"/></body></html>' }), 'bad.epub')); assert.equal((await s.listBooks()).length, 0); }));
test('SQLite reopen retains old version anchors, annotations, tags and source', () => storeTest(async (s, root) => {
	const a = await s.importBook(utf8('Chapter 1\nĐêm 😀 trời\nChapter 2\nNext'), 'a.txt'); const anchor = { bookId: a.id, versionId: a.versionId, chapterId: a.chapters[0].id, offset: 10 }; await s.savePosition(anchor); const note = await s.saveAnnotation({ kind: 'note', anchor, note: 'Keep', endOffset: 12 }); await s.updateBook(a.id, { alias: 'inventory', tags: ['novel'], status: 'reading' }); await s.saveSession({ anchor, mode: 'book', covered: false }); await s.savePreferences({ fontSize: 22 }); await s.close(); const reopened = new Store(root); try {
		assert.deepEqual((await reopened.listBooks())[0].position, anchor);
		assert.equal((await reopened.listAnnotations())[0].id, note.id);
		assert.equal((await reopened.listBooks())[0].alias, 'inventory');
		assert.equal((await reopened.getSession()).anchor.offset, 10);
		assert.equal((await reopened.getPreferences()).fontSize, 22);
	}
		finally {
		await reopened.close();
	}
}));
test('diacritic search maps decomposed marks and emoji to original canonical UTF16 range', () => storeTest(async (s) => { const b = await s.importBook(utf8('😀 Đêm dêm sáng'), 'a.txt'); const hits = await s.search('dem', { ignoreDiacritics: true }); assert.deepEqual(hits.map((h: any) => [h.anchor.offset, h.endOffset]), [[3, 6], [7, 11]]); assert.equal(hits[0].anchor.versionId, b.versionId); }));
test('backup restores all immutable versions and corruption leaves active DB untouched', () => storeTest(async (s) => { const a = await s.importBook(utf8('Chapter 1\nOne\nChapter 2\nTwo'), 'a.txt'); await s.saveAnnotation({ kind: 'bookmark', anchor: { bookId: a.id, versionId: a.versionId, chapterId: a.chapters[0].id, offset: 2 } }); await s.importBook(utf8('Other'), 'other.txt'); const backup = await s.exportBackup(); await s.removeBook(a.id); await s.restoreBackup(backup); assert.equal((await s.listBooks()).length, 2); assert.equal((await s.listAnnotations()).length, 1); const corrupted = Buffer.from(backup); corrupted[corrupted.length - 10] ^= 1; await assert.rejects(s.restoreBackup(corrupted)); assert.equal((await s.listBooks()).length, 2); assert.equal((await s.getBook(a.id, a.versionId)).chapters.length, 2); }));
test('chapter manifests omit content and assets are fetched explicitly', () => storeTest(async (s) => { const b = await s.importBook(epub(true), 'book.epub'); const m = await s.getBookManifest(b.id); assert.equal(m.chapters[0].text, undefined); assert.equal(m.chapters[0].blocks, undefined); assert.equal(m.assets[0].data, undefined); const c = await s.getChapter(b.id, b.versionId, m.chapters[0].id); assert.ok(c.text.includes('Hello world')); assert.equal((await s.getAsset(b.id, b.versionId, m.assets[0].id)).mime, 'image/png'); }));
test('import rejects unsafe polynomial split matchers before examining lines', () => storeTest(async (s) => { await assert.rejects(s.previewImport(utf8('a'.repeat(4096)), 'test.txt', { splitPattern: 'a+a+a+a+a+b' }), /pattern/i); assert.equal((await s.listBooks()).length, 0); }));
test('TXT canonical copy retains internal blank lines and terminal source spaces', () => storeTest(async (s) => { const b = await s.importBook(utf8('First line  \n\nSecond line\nThird line'), 'test.txt'); assert.equal(b.chapters[0].text, 'First line  \n\nSecond line\nThird line'); }));
test('imports enforce file and entry budgets before any content commit', () => storeTest(async (s) => { await assert.rejects(s.importBook(new Uint8Array(64 * 1024 * 1024 + 1), 'large.txt'), /budget/i); await assert.rejects(s.importBook(epub(false, { 'OPS/too-large.bin': Buffer.alloc(16 * 1024 * 1024 + 1) }), 'bomb.epub'), /budget/i); assert.equal((await s.listBooks()).length, 0); }));
test('backup validation checks canonical checksums even if envelope checksum is recomputed', () => storeTest(async (s) => { const b = await s.importBook(utf8('Original'), 'original.txt'); const bytes = await s.exportBackup(); const envelope = JSON.parse(Buffer.from(bytes).toString()); const payload = JSON.parse(envelope.payload); payload.tables.chapters[0].text = 'Forged'; envelope.payload = JSON.stringify(payload); const { createHash } = await import('node:crypto'); envelope.checksum = createHash('sha256').update(envelope.payload).digest('hex'); await assert.rejects(s.restoreBackup(Buffer.from(JSON.stringify(envelope))), /canonical|block/i); assert.equal((await s.getBook(b.id)).chapters[0].text, 'Original'); }));
test('parser job queue rejects a third pending import rather than retaining unbounded byte copies', () => storeTest(async (s) => { const bytes = epub(); const first = s.previewImport(bytes, 'a.epub'); const second = s.previewImport(bytes, 'b.epub'); await assert.rejects(s.previewImport(bytes, 'c.epub'), /queue|busy|budget/i); await Promise.all([first, second]); }));
test('EPUB requires body content instead of silently losing an invalid spine document', () => storeTest(async (s) => { await assert.rejects(s.importBook(epub(false, { 'OPS/z.xhtml': '<html><p>This content has no body element</p></html>' }), 'bad.epub'), /body/i); assert.equal((await s.listBooks()).length, 0); }));
test('cancelImport aborts active and queued jobs without a partial committed book', () => storeTest(async (s) => {
	assert.equal(typeof s.cancelImport, 'function'); const bytes = epub(); const first = s.importBook(bytes, 'first.epub'); const second = s.importBook(bytes, 'second.epub'); const outcomes = Promise.allSettled([first, second]); await new Promise(resolve => setImmediate(resolve)); await s.cancelImport(); for (const outcome of await outcomes) {
		assert.equal(outcome.status, 'rejected');
		if (outcome.status === 'rejected') {
			assert.match(String(outcome.reason), /cancel/i);
		}
	} assert.equal((await s.listBooks()).length, 0); const b = await s.importBook(utf8('After cancellation'), 'after.txt'); assert.equal(b.chapters[0].text, 'After cancellation');
}));
test('late SQLite constraint failure during restore rolls back profile replacement', () => storeTest(async (s) => { const b = await s.importBook(utf8('Original'), 'original.txt'); await s.savePreferences({ fontSize: 20 }); const bytes = await s.exportBackup(); await s.updateBook(b.id, { alias: 'active-alias' }); const envelope = JSON.parse(Buffer.from(bytes).toString()); const payload = JSON.parse(envelope.payload); payload.tables.settings.push({ ...payload.tables.settings[0] }); envelope.payload = JSON.stringify(payload); const { createHash } = await import('node:crypto'); envelope.checksum = createHash('sha256').update(envelope.payload).digest('hex'); await assert.rejects(s.restoreBackup(Buffer.from(JSON.stringify(envelope))), /unique|constraint/i); assert.equal((await s.listBooks())[0].alias, 'active-alias'); assert.equal((await s.getPreferences()).fontSize, 20); }));
test('close waits for already authorized import to commit and rejects subsequent calls', async () => {
	assert.ok(Store); const root = await mkdtemp(join(tmpdir(), 'reader-close-')); const s = new Store(root); try {
		const pending = s.importBook(utf8('Finish first'), 'finish.txt');
		const closed = s.close();
		const b = await pending;
		await closed;
		await assert.rejects(s.listBooks(), /closed/i);
		const reopened = new Store(root);
		try {
			assert.equal((await reopened.getBook(b.id)).chapters[0].text, 'Finish first');
		}
		finally {
			await reopened.close();
		}
	}
		finally {
		await s.close();
		await rm(root, { recursive: true, force: true });
	}
});
test('inline EPUB images retain their position between canonical text blocks', () => storeTest(async (s) => { const b = await s.importBook(epub(false, { 'OPS/z.xhtml': '<html><body><p><strong>Before<img src="cover.png" alt="Picture"/>After</strong></p></body></html>' }), 'images.epub'); assert.deepEqual(b.chapters[0].blocks.map((x: any) => [x.kind, x.text]), [['paragraph', 'Before'], ['image', 'Picture'], ['paragraph', 'After']]); assert.deepEqual(b.chapters[0].blocks[2].marks.map((m: any) => [m.start, m.end, m.kind]), [[0, 5, 'strong']]); }));
test('EPUB internal links reference canonical target chapters and footnote blocks',()=>storeTest(async s=> {const b=await s.importBook(epub(false,{'OPS/z.xhtml':'<html><body><p><a href="a.xhtml#second">Go</a><a href="#fn">Note</a></p><aside epub:type="footnote" xmlns:epub="urn:epub" id="fn">Note body</aside></body></html>','OPS/a.xhtml':'<html><body><p id="second">Second</p></body></html>'}),'links.epub');const links=b.chapters[0].blocks[0].marks;assert.equal(links[0].href,b.chapters[1].id+'#second');assert.equal(links[1].href,b.chapters[0].id+'#fn');assert.equal(b.chapters[1].blocks[0].id,links[0].href);assert.equal(b.chapters[0].blocks[1].id,links[1].href);}));
test('backup cannot substitute a book identity unrelated to its immutable raw source',()=>storeTest(async s=> {const b=await s.importBook(utf8('Original'),'original.txt');const envelope=JSON.parse(Buffer.from(await s.exportBackup()).toString());const payload=JSON.parse(envelope.payload);payload.tables.books[0].id='book-forged';payload.tables.versions[0].book_id='book-forged';envelope.payload=JSON.stringify(payload);const {createHash}=await import('node:crypto');envelope.checksum=createHash('sha256').update(envelope.payload).digest('hex');await assert.rejects(s.restoreBackup(Buffer.from(JSON.stringify(envelope))),/identity|reference/i);assert.equal((await s.listBooks())[0].id,b.id);}));
test('metadata overrides update the book without changing immutable content versions',()=>storeTest(async s=> {const bytes=utf8('Same content');const a=await s.importBook(bytes,'first.txt',{title:'Initial',author:'First'});const b=await s.importBook(bytes,'first.txt',{title:'Edited',author:'Second',alias:'neutral-service'});assert.equal(a.versionId,b.versionId);assert.equal(b.title,'Edited');assert.equal(b.author,'Second');assert.equal(b.alias,'neutral-service');}));
test('explicit decode choice participates in version even when ASCII text is identical',()=>storeTest(async s=> {const bytes=utf8('Same ASCII');const a=await s.importBook(bytes,'first.txt',{encoding:'utf-8'});const b=await s.importBook(bytes,'first.txt',{encoding:'windows-1252'});assert.equal(a.chapters[0].text,b.chapters[0].text);assert.notEqual(a.versionId,b.versionId);assert.equal((await s.getBook(a.id,a.versionId)).chapters[0].text,'Same ASCII');}));
