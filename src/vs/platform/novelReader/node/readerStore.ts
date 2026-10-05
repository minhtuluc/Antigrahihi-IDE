/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate as yieldIo } from 'node:timers/promises';
import { READER_LIMITS } from '../common/reader.js';
import type { ReaderAnchor, ReaderAnnotation, ReaderAsset, ReaderBook, ReaderBookManifest, ReaderBookSummary, ReaderChapter, ReaderImportOptions, ReaderPreferences, ReaderSearchResult, ReaderSession, ReaderStoreApi } from '../common/reader.js';
import { validateAnchor, validateReaderRequest } from '../common/readerIpc.js';
import { hash, IMPORT_POLICY, parseBook } from './readerImporter.js';
const DEFAULTS: ReaderPreferences = { fontSize: 18, lineHeight: 1.6, bookFont: 'serif', bookTheme: 'dark', paginated: false, columns: 1, minimap: true };
const TABLES = ['raw_sources', 'books', 'versions', 'chapters', 'assets', 'annotations', 'settings'] as const;
type Row = Record<string, any>;
function parse<T>(value: unknown): T {
	if (typeof value !== 'string') {
		throw new Error('Corrupt reader data');
	} return JSON.parse(value) as T;
}
function object(value: unknown): asserts value is Row {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid backup record');
	}
}
function string(value: unknown, max = 4096): asserts value is string {
	if (typeof value !== 'string' || value.length > max) {
		throw new Error('Invalid backup string');
	}
}
function fold(text: string, diacritics: boolean): {
	text: string;
	starts: number[];
	ends: number[];
} {
	let output = '';
	const starts: number[] = [];
	const ends: number[] = [];
	let offset = 0;
	// A base plus its combining marks is one search unit, preserving the complete source range.
	for (const match of text.matchAll(/[^\p{M}]\p{M}*|\p{M}+/gu)) {
		const source = match[0];
		const start = match.index ?? offset;
		const end = start + source.length;
		const normalized = (diacritics ? source.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd') : source).toLocaleLowerCase('und');
		for (let i = 0; i < normalized.length; i++) {
			starts.push(start);
			ends.push(end);
		}
		output += normalized;
		offset = end;
	}
	return { text: output, starts, ends };
}
export class ReaderStore implements ReaderStoreApi {
	private readonly db: DatabaseSync;
	private closed = false;
	private closing = false;
	private pendingJobs = 0;
	private importController = new AbortController();
	private jobs: Promise<unknown> = Promise.resolve();
	constructor(readonly root: string) {
		mkdirSync(root, { recursive: true, mode: 0o700 });
		this.db = new DatabaseSync(join(root, 'reader.sqlite'));
		this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;`);
		const version = (this.db.prepare('PRAGMA user_version').get() as Row).user_version;
		if (version !== 0 && version !== 1) {
			this.db.close();
			throw new Error('Unsupported reader database schema');
		}
		this.db.exec(`BEGIN IMMEDIATE;
   CREATE TABLE IF NOT EXISTS raw_sources (id TEXT PRIMARY KEY, data BLOB NOT NULL);
   CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, current_version TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL, alias TEXT NOT NULL, tags TEXT NOT NULL, status TEXT NOT NULL, position TEXT);
   CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, raw_hash TEXT NOT NULL REFERENCES raw_sources(id), filename TEXT NOT NULL, choices TEXT NOT NULL, policy TEXT NOT NULL, content_hash TEXT NOT NULL, metadata TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS chapters (version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE, id TEXT NOT NULL, ordinal INTEGER NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, blocks TEXT NOT NULL, PRIMARY KEY(version_id,id));
   CREATE TABLE IF NOT EXISTS assets (version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE, id TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(version_id,id));
   CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS chapter_order ON chapters(version_id,ordinal);
   PRAGMA user_version=1; COMMIT;`);
	}
	private check(method: string, args: unknown[]): void {
		if (this.closed || this.closing) {
			throw new Error('Reader store is closed');
		} validateReaderRequest({ method, args });
	}
	private transaction<T>(run: () => T): T {
		this.db.exec('BEGIN IMMEDIATE'); try {
			const result = run();
			this.db.exec('COMMIT');
			return result;
		}
		catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
	}
	private jobCapacity(): void {
		if (this.pendingJobs >= 2) {
			throw new Error('Import queue is busy; maximum two pending jobs');
		}
	}
	private schedule<T>(run: () => Promise<T>): Promise<T> { this.pendingJobs++; const job = this.jobs.then(run).finally(() => { this.pendingJobs--; }); this.jobs = job.catch(() => undefined); return job; }
	private bookRow(bookId: string): Row {
		const row = this.db.prepare('SELECT * FROM books WHERE id=?').get(bookId); if (!row) {
			throw new Error('Book not found');
		} return row;
	}
	private chapterRow(bookId: string, versionId: string, chapterId: string): Row {
		const row = this.db.prepare('SELECT c.* FROM chapters c JOIN versions v ON v.id=c.version_id WHERE v.book_id=? AND c.version_id=? AND c.id=?').get(bookId, versionId, chapterId); if (!row) {
			throw new Error('Chapter/version not found');
		} return row;
	}
	private anchor(anchor: ReaderAnchor, endOffset?: number): void {
		validateAnchor(anchor); const row = this.chapterRow(anchor.bookId, anchor.versionId, anchor.chapterId); if (anchor.offset > row.text.length || (endOffset !== undefined && (endOffset < anchor.offset || endOffset > row.text.length))) {
			throw new Error('Anchor outside canonical chapter');
		} if (anchor.blockId && !parse<ReaderChapter['blocks']>(row.blocks).some(b => b.id === anchor.blockId && anchor.offset >= b.start && anchor.offset <= b.end)) {
			throw new Error('Anchor block is not present at canonical offset');
		}
	}
	async listBooks(): Promise<ReaderBookSummary[]> {
		this.check('listBooks', []);
		return this.db.prepare('SELECT b.*,v.metadata,(SELECT count(*) FROM chapters c WHERE c.version_id=b.current_version) AS chapter_count FROM books b JOIN versions v ON v.id=b.current_version ORDER BY b.rowid DESC').all().map((row: Row) => { const metadata = parse<Row>(row.metadata); return { id: row.id, versionId: row.current_version, title: row.title, author: row.author, alias: row.alias, chapterCount: Number(row.chapter_count), tags: parse<string[]>(row.tags), status: row.status, ...(metadata.coverAssetId ? { coverAssetId: metadata.coverAssetId } : {}), ...(row.position ? { position: parse<ReaderAnchor>(row.position) } : {}) }; });
	}
	async getBook(bookId: string, versionId?: string): Promise<ReaderBook> {
		this.check('getBook', [bookId, ...(versionId !== undefined ? [versionId] : [])]);
		return this.readBook(bookId, versionId);
	}
	private readBook(bookId: string, versionId?: string): ReaderBook {
		const b = this.bookRow(bookId);
		const version = this.db.prepare('SELECT * FROM versions WHERE book_id=? AND id=?').get(bookId, versionId ?? b.current_version) as Row | undefined;
		if (!version) {
			throw new Error('Book version not found');
		}
		return { ...parse<Row>(version.metadata), id: bookId, versionId: version.id, title: b.title, author: b.author, alias: b.alias, chapters: this.db.prepare('SELECT * FROM chapters WHERE version_id=? ORDER BY ordinal').all(version.id).map(row => this.toChapter(row)), assets: this.db.prepare('SELECT id,mime,data FROM assets WHERE version_id=? ORDER BY rowid').all(version.id).map(row => ({ id: String(row.id), mime: String(row.mime), data: String(row.data) })) } as ReaderBook;
	}
	async getBookManifest(bookId: string, versionId?: string): Promise<ReaderBookManifest> {
		this.check('getBookManifest', [bookId, ...(versionId !== undefined ? [versionId] : [])]);
		const b = this.bookRow(bookId);
		const version = this.db.prepare('SELECT * FROM versions WHERE book_id=? AND id=?').get(bookId, versionId ?? b.current_version) as Row | undefined;
		if (!version) {
			throw new Error('Book version not found');
		}
		return { ...parse<Row>(version.metadata), id: bookId, versionId: version.id, title: b.title, author: b.author, alias: b.alias, chapters: this.db.prepare('SELECT id,ordinal,title FROM chapters WHERE version_id=? ORDER BY ordinal').all(version.id).map(row => ({ id: String(row.id), ordinal: Number(row.ordinal), title: String(row.title) })), assets: this.db.prepare('SELECT id,mime FROM assets WHERE version_id=? ORDER BY rowid').all(version.id).map(row => ({ id: String(row.id), mime: String(row.mime) })) } as ReaderBookManifest;
	}
	async getAsset(bookId: string, versionId: string, assetId: string): Promise<ReaderAsset> {
		this.check('getAsset', [bookId, versionId, assetId]); const row = this.db.prepare('SELECT a.id,a.mime,a.data FROM assets a JOIN versions v ON v.id=a.version_id WHERE v.book_id=? AND v.id=? AND a.id=?').get(bookId, versionId, assetId); if (!row) {
			throw new Error('Book asset not found');
		} return { id: String(row.id), mime: String(row.mime), data: String(row.data) };
	}
	private toChapter(row: Row): ReaderChapter { return { id: row.id, ordinal: Number(row.ordinal), title: row.title, text: row.text, blocks: parse(row.blocks) }; }
	async getChapter(bookId: string, versionId: string, chapterId: string): Promise<ReaderChapter> { this.check('getChapter', [bookId, versionId, chapterId]); return this.toChapter(this.chapterRow(bookId, versionId, chapterId)); }
	async previewImport(bytes: Uint8Array, filename: string, options: ReaderImportOptions = {}): Promise<ReaderBook> { this.check('previewImport', [bytes, filename, options]); this.jobCapacity(); const snapshot = Buffer.from(bytes); const choices = { ...options }; const signal = this.importController.signal; return this.schedule(async () => { await yieldIo(); signal.throwIfAborted(); const result = await parseBook(snapshot, filename, choices, signal); await yieldIo(); signal.throwIfAborted(); return result.book; }); }
	async importBook(bytes: Uint8Array, filename: string, options: ReaderImportOptions = {}): Promise<ReaderBook> {
		this.check('importBook', [bytes, filename, options]);
		this.jobCapacity();
		const signal = this.importController.signal;
		const snapshot = Buffer.from(bytes);
		const importOptions = { ...options };
		return this.schedule(async () => {
			await yieldIo();
			signal.throwIfAborted();
			const imported = await parseBook(snapshot, filename, importOptions, signal);
			await yieldIo();
			signal.throwIfAborted();
			const book = imported.book;
			if (this.closed) {
				throw new Error('Reader store closed during import');
			}
			this.transaction(() => {
				this.db.prepare('INSERT OR IGNORE INTO raw_sources(id,data) VALUES(?,?)').run(imported.rawHash, snapshot);
				this.db.prepare('INSERT OR IGNORE INTO books(id,current_version,title,author,alias,tags,status) VALUES(?,?,?,?,?,?,?)').run(book.id, book.versionId, book.title, book.author, book.alias, '[]', 'unread');
				const existed = this.db.prepare('SELECT id FROM versions WHERE id=?').get(book.versionId);
				if (!existed) {
					const { chapters, assets, id, versionId, ...metadata } = book;
					this.db.prepare('INSERT INTO versions(id,book_id,raw_hash,filename,choices,policy,content_hash,metadata) VALUES(?,?,?,?,?,?,?,?)').run(versionId, id, imported.rawHash, filename, JSON.stringify(imported.choices), IMPORT_POLICY, imported.contentHash, JSON.stringify(metadata));
					const insertChapter = this.db.prepare('INSERT INTO chapters(version_id,id,ordinal,title,text,blocks) VALUES(?,?,?,?,?,?)');
					for (const c of chapters) {
						insertChapter.run(versionId, c.id, c.ordinal, c.title, c.text, JSON.stringify(c.blocks));
					}
					const insertAsset = this.db.prepare('INSERT INTO assets(version_id,id,mime,data) VALUES(?,?,?,?)');
					for (const a of assets) {
						insertAsset.run(versionId, a.id, a.mime, a.data);
					}
				}
				this.db.prepare('UPDATE books SET current_version=? WHERE id=?').run(book.versionId, book.id);
				if (importOptions.alias !== undefined) {
					this.db.prepare('UPDATE books SET alias=? WHERE id=?').run(importOptions.alias, book.id);
				}
				if (importOptions.title !== undefined) { this.db.prepare('UPDATE books SET title=? WHERE id=?').run(importOptions.title, book.id); }
				if (importOptions.author !== undefined) { this.db.prepare('UPDATE books SET author=? WHERE id=?').run(importOptions.author, book.id); }
			});
			return this.readBook(book.id, book.versionId);
		});
	}
	async cancelImport(): Promise<void> { this.check('cancelImport', []); this.importController.abort(new Error('Import cancelled')); this.importController = new AbortController(); }
	async removeBook(bookId: string): Promise<void> {
		this.check('removeBook', [bookId]); this.transaction(() => {
			this.db.prepare('DELETE FROM books WHERE id=?').run(bookId); this.db.prepare('DELETE FROM raw_sources WHERE id NOT IN (SELECT raw_hash FROM versions)').run(); const s = this.setting<ReaderSession>('session'); if (s?.anchor?.bookId === bookId) {
				this.setSetting('session', { mode: 'code', covered: false });
			}
		});
	}
	async updateBook(bookId: string, patch: {
		alias?: string;
		tags?: string[];
		status?: ReaderBookSummary['status'];
	}): Promise<void> { this.check('updateBook', [bookId, patch]); const row = this.bookRow(bookId); this.db.prepare('UPDATE books SET alias=?,tags=?,status=? WHERE id=?').run(patch.alias ?? row.alias, patch.tags ? JSON.stringify([...new Set(patch.tags)]) : row.tags, patch.status ?? row.status, bookId); }
	async savePosition(anchor: ReaderAnchor): Promise<void> { this.check('savePosition', [anchor]); this.anchor(anchor); this.db.prepare('UPDATE books SET position=? WHERE id=?').run(JSON.stringify(anchor), anchor.bookId); }
	async listAnnotations(bookId?: string): Promise<ReaderAnnotation[]> { this.check('listAnnotations', bookId ? [bookId] : []); const rows = bookId ? this.db.prepare('SELECT data FROM annotations WHERE book_id=? ORDER BY rowid').all(bookId) : this.db.prepare('SELECT data FROM annotations ORDER BY rowid').all(); return rows.map(row => parse<ReaderAnnotation>(row.data)); }
	async saveAnnotation(annotation: Omit<ReaderAnnotation, 'id' | 'createdAt'>): Promise<ReaderAnnotation> { this.check('saveAnnotation', [annotation]); this.anchor(annotation.anchor, annotation.endOffset); const result = { ...annotation, id: randomUUID(), createdAt: Date.now() }; this.db.prepare('INSERT INTO annotations(id,book_id,data) VALUES(?,?,?)').run(result.id, result.anchor.bookId, JSON.stringify(result)); return result; }
	async removeAnnotation(id: string): Promise<void> { this.check('removeAnnotation', [id]); this.db.prepare('DELETE FROM annotations WHERE id=?').run(id); }
	async search(query: string, options: {
		bookId?: string;
		ignoreDiacritics?: boolean;
	} = {}): Promise<ReaderSearchResult[]> {
		this.check('search', [query, options]);
		const needle = fold(query, !!options.ignoreDiacritics).text;
		if (!needle.trim()) {
			return [];
		}
		const rows = options.bookId ? this.db.prepare('SELECT c.*,v.book_id FROM chapters c JOIN versions v ON v.id=c.version_id JOIN books b ON b.current_version=v.id WHERE b.id=? ORDER BY c.ordinal').iterate(options.bookId) : this.db.prepare('SELECT c.*,v.book_id FROM chapters c JOIN versions v ON v.id=c.version_id JOIN books b ON b.current_version=v.id ORDER BY b.rowid DESC,c.ordinal').iterate();
		const results: ReaderSearchResult[] = [];
		for (const row of rows) {
			const haystack = fold(row.text as string, !!options.ignoreDiacritics);
			let at = haystack.text.indexOf(needle);
			while (at >= 0) {
				const start = haystack.starts[at];
				const end = haystack.ends[at + needle.length - 1];
				results.push({ anchor: { bookId: row.book_id as string, versionId: row.version_id as string, chapterId: row.id as string, offset: start }, endOffset: end, snippet: (row.text as string).slice(Math.max(0, start - 50), Math.min((row.text as string).length, end + 80)) });
				if (results.length >= 500) {
					return results;
				}
				at = haystack.text.indexOf(needle, at + Math.max(1, needle.length));
			}
		}
		return results;
	}
	private setting<T>(key: string): T | undefined { const row = this.db.prepare('SELECT data FROM settings WHERE key=?').get(key); return row ? parse<T>(row.data) : undefined; }
	private setSetting(key: string, data: unknown): void { this.db.prepare('INSERT INTO settings(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(data)); }
	async getSession(): Promise<ReaderSession> { this.check('getSession', []); return this.setting<ReaderSession>('session') ?? { mode: 'code', covered: false }; }
	async saveSession(session: ReaderSession): Promise<void> {
		this.check('saveSession', [session]); if (session.anchor) {
			this.anchor(session.anchor);
		} this.setSetting('session', session);
	}
	async getPreferences(): Promise<ReaderPreferences> { this.check('getPreferences', []); return { ...DEFAULTS, ...this.setting<ReaderPreferences>('preferences') }; }
	async savePreferences(preferences: Partial<ReaderPreferences>): Promise<ReaderPreferences> { this.check('savePreferences', [preferences]); const result = { ...DEFAULTS, ...this.setting<ReaderPreferences>('preferences'), ...preferences }; this.setSetting('preferences', result); return result; }
	async exportAnnotations(): Promise<string> { this.check('exportAnnotations', []); return JSON.stringify({ schema: 1, annotations: await this.listAnnotations() }, null, 2); }
	async exportBackup(): Promise<Uint8Array> {
		this.check('exportBackup', []);
		const tables: Record<string, Row[]> = {};
		// One synchronous snapshot cannot interleave with utility requests or import commits.
		this.db.exec('BEGIN');
		try {
			let payloadBytes = 1024;
			for (const table of TABLES) {
				tables[table] = [];
				for (const source of this.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate()) {
					const row = table === 'raw_sources' ? { ...source, data: Buffer.from(source.data as Uint8Array).toString('base64') } : source;
					payloadBytes += Buffer.byteLength(JSON.stringify(row)) + 1;
					// Reserve room for the escaped envelope before collecting the entire library.
					if (payloadBytes > READER_LIMITS.backupBytes / 2 || tables[table].length >= 200000) { throw new Error('Backup exceeds serialization budget'); }
					tables[table].push(row);
				}
			}
			this.db.exec('COMMIT');
		}
		catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
		const payload = JSON.stringify({ schema: 1, policy: IMPORT_POLICY, tables });
		const bytes = Buffer.from(JSON.stringify({ format: 'workspace-reader-backup', checksum: hash(payload), payload }));
		if (bytes.byteLength > READER_LIMITS.backupBytes) {
			throw new Error('Backup exceeds 768 MiB budget');
		}
		return bytes;
	}
	async restoreBackup(bytes: Uint8Array): Promise<void> {
		this.check('restoreBackup', [bytes]);
		if (this.pendingJobs) {
			throw new Error('Cancel or finish imports before restoring a backup');
		}
		const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		object(envelope);
		if (envelope.format !== 'workspace-reader-backup' || typeof envelope.payload !== 'string' || envelope.checksum !== hash(envelope.payload)) {
			throw new Error('Backup checksum mismatch');
		}
		const snapshot = JSON.parse(envelope.payload);
		object(snapshot);
		if (snapshot.schema !== 1 || snapshot.policy !== IMPORT_POLICY) {
			throw new Error('Unsupported backup schema/policy');
		}
		object(snapshot.tables);
		const tables = snapshot.tables as Record<string, Row[]>;
		for (const table of TABLES) {
			if (!Array.isArray(tables[table]) || tables[table].length > 200000) {
				throw new Error('Backup table exceeds record budget');
			}
			for (const row of tables[table]) {
				object(row);
			}
		}
		const raw = new Map<string, Buffer>();
		const books = new Map<string, Row>();
		const versions = new Map<string, Row>();
		const chapters = new Map<string, ReaderChapter[]>();
		const assets = new Map<string, ReaderBook['assets']>();
		let decodedBytes = 0;
		for (const row of tables.raw_sources) {
			string(row.id, 64);
			string(row.data, Math.ceil(READER_LIMITS.fileBytes * 4 / 3) + 4);
			const data = Buffer.from(row.data, 'base64');
			if (data.toString('base64') !== row.data) { throw new Error('Malformed backup base64'); }
			decodedBytes += data.length;
			if (data.length > READER_LIMITS.fileBytes || decodedBytes > READER_LIMITS.backupBytes || hash(data) !== row.id || raw.has(row.id)) {
				throw new Error('Backup source checksum or budget mismatch');
			}
			raw.set(row.id, data);
		}
		for (const row of tables.books) {
			string(row.id, 128);
			string(row.current_version, 64);
			string(row.title);
			string(row.author);
			validateReaderRequest({ method: 'updateBook', args: [row.id, { alias: row.alias, tags: parse(row.tags), status: row.status }] });
			if (books.has(row.id)) {
				throw new Error('Duplicate book');
			}
			books.set(row.id, row);
		}
		for (const row of tables.versions) {
			string(row.id, 64);
			string(row.filename);
			if (!books.has(row.book_id) || !raw.has(row.raw_hash) || row.book_id !== `book-${String(row.raw_hash).slice(0, 32)}` || row.policy !== IMPORT_POLICY || versions.has(row.id)) {
				throw new Error('Invalid backup version reference');
			}
			object(parse(row.choices));
			object(parse(row.metadata));
			versions.set(row.id, row);
			chapters.set(row.id, []);
			assets.set(row.id, []);
		}
		for (const row of tables.chapters) {
			if (!versions.has(row.version_id)) {
				throw new Error('Invalid chapter version');
			}
			string(row.id, 256);
			string(row.title);
			string(row.text, READER_LIMITS.chapterBytes);
			if (Buffer.byteLength(row.text) > READER_LIMITS.chapterBytes || !Number.isSafeInteger(row.ordinal) || row.ordinal < 0) {
				throw new Error('Invalid chapter budget/ordinal');
			}
			const c = this.toChapter(row);
			if (!Array.isArray(c.blocks) || c.blocks.length > 200000) {
				throw new Error('Invalid canonical blocks');
			}
			let reconstructed = '';
			const blockIds = new Set<string>();
			for (const b of c.blocks) {
				object(b);
				string(b.id, 256);
				string(b.text, READER_LIMITS.chapterBytes);
				if (blockIds.has(b.id) || !['paragraph', 'heading', 'image', 'footnote', 'quote', 'list'].includes(b.kind)) {
					throw new Error('Invalid block identity/kind');
				}
				blockIds.add(b.id);
				if (reconstructed) {
					reconstructed += '\n';
				}
				if (b.start !== reconstructed.length) {
					throw new Error('Invalid block start');
				}
				reconstructed += b.text;
				if (b.end !== reconstructed.length) {
					throw new Error('Invalid block end');
				}
				for (const m of b.marks ?? []) {
					object(m);
					if (!Number.isSafeInteger(m.start) || !Number.isSafeInteger(m.end) || m.start < 0 || m.end < m.start || m.end > b.text.length || !['strong', 'emphasis', 'link'].includes(m.kind) || m.href && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(m.href)) {
						throw new Error('Invalid canonical mark');
					}
				}
			}
			if (reconstructed !== c.text) {
				throw new Error('Canonical chapter checksum structure mismatch');
			}
			chapters.get(row.version_id)!.push(c);
		}
		for (const row of tables.assets) {
			if (!versions.has(row.version_id) || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(row.mime)) {
				throw new Error('Invalid backup asset');
			}
			string(row.id, 256);
			string(row.data, Math.ceil(READER_LIMITS.assetBytes * 4 / 3) + 4);
			const data = Buffer.from(row.data, 'base64');
			if (data.length > READER_LIMITS.assetBytes || data.toString('base64') !== row.data) {
				throw new Error('Invalid asset budget/base64');
			}
			assets.get(row.version_id)!.push({ id: row.id, mime: row.mime, data: row.data });
		}
		for (const [id, row] of versions) {
			const list = chapters.get(id)!.sort((a, b) => a.ordinal - b.ordinal);
			const imageList = assets.get(id)!;
			const unique = new Set(list.map(c => c.id));
			if (!list.length || unique.size !== list.length || list.some((c, i) => c.ordinal !== i)) {
				throw new Error('Invalid chapter order');
			}
			const contentHash = hash(JSON.stringify({ chapters: list, assets: imageList }));
			if (contentHash !== row.content_hash || hash(JSON.stringify({ rawHash: row.raw_hash, choices: parse(row.choices), policy: row.policy, contentHash })) !== id) {
				throw new Error('Canonical version checksum mismatch');
			}
			const imageIds = new Set(imageList.map(a => a.id));
			for (const c of list) {
				for (const b of c.blocks) {
					if (b.assetId && !imageIds.has(b.assetId)) {
						throw new Error('Unknown block asset');
					}
				}
			}
			const metadata = parse<Row>(row.metadata);
			if (metadata.coverAssetId && !imageIds.has(metadata.coverAssetId)) {
				throw new Error('Unknown cover asset');
			}
		}
		const checkAnchor = (anchor: ReaderAnchor, end?: number) => {
			validateAnchor(anchor); const v = versions.get(anchor.versionId); const c = chapters.get(anchor.versionId)?.find(c => c.id === anchor.chapterId); if (!c || v?.book_id !== anchor.bookId || anchor.offset > c.text.length || end !== undefined && end > c.text.length) {
				throw new Error('Invalid backup anchor');
			}
		};
		for (const row of books.values()) {
			if (versions.get(row.current_version)?.book_id !== row.id) {
				throw new Error('Unknown current version');
			}
			if (row.position) {
				checkAnchor(parse(row.position));
			}
		}
		for (const row of tables.annotations) {
			string(row.id, 128);
			const a = parse<ReaderAnnotation>(row.data);
			validateReaderRequest({ method: 'saveAnnotation', args: [a] });
			if (a.id !== row.id || a.anchor.bookId !== row.book_id || !Number.isSafeInteger(a.createdAt)) {
				throw new Error('Invalid annotation identity');
			}
			checkAnchor(a.anchor, a.endOffset);
		}
		for (const row of tables.settings) {
			if (row.key === 'session') {
				const s = parse<ReaderSession>(row.data);
				validateReaderRequest({ method: 'saveSession', args: [s] });
				if (s.anchor) {
					checkAnchor(s.anchor);
				}
			}
			else if (row.key === 'preferences') {
				validateReaderRequest({ method: 'savePreferences', args: [parse(row.data)] });
			}
			else {
				throw new Error('Unknown reader setting');
			}
		}
		this.transaction(() => {
			for (const table of [...TABLES].reverse()) {
				this.db.exec(`DELETE FROM ${table}`);
			}
			for (const row of tables.raw_sources) {
				this.db.prepare('INSERT INTO raw_sources(id,data) VALUES(?,?)').run(row.id, raw.get(row.id)!);
			}
			for (const row of tables.books) {
				this.db.prepare('INSERT INTO books(id,current_version,title,author,alias,tags,status,position) VALUES(?,?,?,?,?,?,?,?)').run(row.id, row.current_version, row.title, row.author, row.alias, row.tags, row.status, row.position ?? null);
			}
			for (const row of tables.versions) {
				this.db.prepare('INSERT INTO versions(id,book_id,raw_hash,filename,choices,policy,content_hash,metadata) VALUES(?,?,?,?,?,?,?,?)').run(row.id, row.book_id, row.raw_hash, row.filename, row.choices, row.policy, row.content_hash, row.metadata);
			}
			for (const row of tables.chapters) {
				this.db.prepare('INSERT INTO chapters(version_id,id,ordinal,title,text,blocks) VALUES(?,?,?,?,?,?)').run(row.version_id, row.id, row.ordinal, row.title, row.text, row.blocks);
			}
			for (const row of tables.assets) {
				this.db.prepare('INSERT INTO assets(version_id,id,mime,data) VALUES(?,?,?,?)').run(row.version_id, row.id, row.mime, row.data);
			}
			for (const row of tables.annotations) {
				this.db.prepare('INSERT INTO annotations(id,book_id,data) VALUES(?,?,?)').run(row.id, row.book_id, row.data);
			}
			for (const row of tables.settings) {
				this.db.prepare('INSERT INTO settings(key,data) VALUES(?,?)').run(row.key, row.data);
			}
		});
	}
	async close(): Promise<void> {
		if (this.closed) {
			return;
		} this.closing = true; await this.jobs; if (!this.closed) {
			this.closed = true;
			this.db.close();
		}
	}
}
