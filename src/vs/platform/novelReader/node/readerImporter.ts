/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import * as yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { READER_LIMITS } from '../common/reader.js';
import type { ReaderAsset, ReaderBlock, ReaderBook, ReaderChapter, ReaderImportOptions, ReaderMark } from '../common/reader.js';
export const IMPORT_POLICY = 'reader-import-v1:utf16-lf-preserve-unicode:blocks-v1:epub-spine-v1';
export const hash = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
export interface ImportedBook {
	book: ReaderBook;
	rawHash: string;
	contentHash: string;
	choices: {
		encoding: string;
		splitPattern: string;
	};
}
function normalize(text: string): string { return text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n'); }
function chapter(id: string, ordinal: number, title: string, blocks: ReaderBlock[]): ReaderChapter {
	let text = '';
	for (const [index, block] of blocks.entries()) {
		if (index > 0) {
			text += '\n';
		}
		block.start = text.length;
		text += block.text;
		block.end = text.length;
	}
	if (Buffer.byteLength(text, 'utf8') > READER_LIMITS.chapterBytes) {
		throw new Error('Chapter exceeds 2 MiB canonical text budget');
	}
	return { id, ordinal, title, text, blocks };
}
function decode(bytes: Uint8Array, requested?: string): {
	text: string;
	encoding: string;
} {
	let encoding = requested?.toLowerCase().replace(/^utf8$/, 'utf-8').replace(/^utf16le$/, 'utf-16le').replace(/^utf16be$/, 'utf-16be');
	if (!encoding) {
		encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
	}
	if (!['utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'windows-1258', 'gb18030', 'big5', 'shift_jis'].includes(encoding)) {
		throw new Error('Unsupported text encoding; choose a supported encoding in preview');
	}
	return { text: normalize(new TextDecoder(encoding, { fatal: true }).decode(bytes)), encoding };
}
function splitText(text: string, pattern?: string): ReaderChapter[] {
	const lines = text.split('\n');
	let matcher: RegExp;
	if (pattern !== undefined) {
		// A bounded line matcher, with no groups/lookarounds/backreferences or repeated quantifiers.
		if (pattern.length > 128 || !pattern.startsWith('^') || /[(){}|]|\\[1-9]|(?:[*+?])(?:[*+?])/.test(pattern) || (pattern.match(/[*+]/g)?.length ?? 0) > 1 || (pattern.match(/\?/g)?.length ?? 0) > 2) {
			throw new Error('Split pattern must be a simple bounded line expression');
		}
		matcher = new RegExp(pattern, 'iu');
	}
	else {
		matcher = /^\s*(?:chapter\s+\d+|chương\s+\d+|第[一二三四五六七八九十百千\d]+[章回])(?:\s|[:.\-]|$)/iu;
	}
	const hits = lines.flatMap((line, index) => line.length <= 4096 && matcher.test(line) ? [index] : []);
	const headings = hits.length >= 2 ? new Set(hits) : new Set<number>();
	const parts: {
		title: string;
		lines: string[];
	}[] = [];
	let current = { title: 'Chapter 1', lines: [] as string[] };
	for (let i = 0; i < lines.length; i++) {
		if (headings.has(i)) {
			if (current.lines.some(line => line.trim())) {
				parts.push(current);
			}
			current = { title: lines[i].trim(), lines: [] };
		}
		current.lines.push(lines[i]);
	}
	if (current.lines.some(line => line.trim()) || !parts.length) {
		parts.push(current);
	}
	return parts.map((part, ordinal) => {
		const id = `chapter-${ordinal + 1}`;
		// Preserve nonblank source lines, including spaces; blank separators become canonical LF boundaries.
		while (part.lines.length && part.lines[0] === '') {
			part.lines.shift();
		}
		while (part.lines.length && part.lines[part.lines.length - 1] === '') {
			part.lines.pop();
		}
		const blocks = part.lines.map((line, i): ReaderBlock => ({ id: `${id}-block-${i + 1}`, kind: i === 0 && headings.size > 0 && matcher.test(line) ? 'heading' : 'paragraph', text: line, start: 0, end: 0, ...(i === 0 && headings.size > 0 && matcher.test(line) ? { level: 1 } : {}) }));
		return chapter(id, ordinal, part.title, blocks);
	});
}
function archivePath(path: string): string {
	if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').includes('..')) {
		throw new Error('Unsafe EPUB archive path');
	}
	return posix.normalize(path);
}
function resolveHref(base: string, href: string): string {
	if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href) || href.includes('\\') || href.startsWith('/')) {
		throw new Error('External EPUB resource is forbidden');
	}
	let decoded: string;
	try {
		decoded = decodeURIComponent(href.split('#')[0].split('?')[0]);
	}
	catch {
		throw new Error('Malformed EPUB resource path');
	}
	const joined = posix.normalize(posix.join(posix.dirname(base), decoded || posix.basename(base)));
	return archivePath(joined);
}
async function readArchive(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Buffer>> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
			if (error || !zip) {
				reject(error ?? new Error('Invalid EPUB archive'));
				return;
			}
			const files = new Map<string, Buffer>();
			let total = 0;
			let entries = 0;
			let failed = false;
			let activeStream: import('node:stream').Readable | undefined;
			const abort = () => fail(signal?.reason ?? new Error('Import cancelled'));
			const cleanup = () => signal?.removeEventListener('abort', abort);
			const fail = (err: unknown) => {
				if (!failed) {
					failed = true;
					cleanup();
					activeStream?.destroy();
					zip.close();
					reject(err);
				}
			};
			signal?.addEventListener('abort', abort, { once: true });
			if (signal?.aborted) {
				abort();
				return;
			}
			zip.on('error', fail);
			zip.on('entry', entry => {
				try {
					const name = archivePath(entry.fileName);
					if (++entries > READER_LIMITS.zipEntries || total + entry.uncompressedSize > READER_LIMITS.zipBytes || entry.uncompressedSize > READER_LIMITS.assetBytes || (entry.generalPurposeBitFlag & 1) !== 0 || files.has(name)) {
						throw new Error('EPUB entry exceeds archive budget or is encrypted/duplicated');
					}
					if ((entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) {
						throw new Error('EPUB symbolic links are forbidden');
					}
					if (name.endsWith('/')) {
						zip.readEntry();
						return;
					}
					total += entry.uncompressedSize;
					zip.openReadStream(entry, (err, stream) => {
						if (err || !stream) {
							fail(err ?? new Error('Cannot read EPUB entry'));
							return;
						}
						activeStream = stream;
						const chunks: Buffer[] = [];
						let length = 0;
						stream.on('data', (chunk: Buffer) => {
							length += chunk.length; if (length > entry.uncompressedSize || length > READER_LIMITS.assetBytes) {
								stream.destroy(new Error('EPUB inflated entry exceeds budget'));
							}
							else {
								chunks.push(chunk);
							}
						});
						stream.on('error', fail);
						stream.on('end', () => {
							if (failed) {
								return;
							} if (length !== entry.uncompressedSize) {
								fail(new Error('EPUB entry size mismatch'));
								return;
							} files.set(name, Buffer.concat(chunks)); zip.readEntry();
						});
					});
				}
				catch (err) {
					fail(err);
				}
			});
			zip.on('end', () => {
				if (!failed) {
					cleanup();
					zip.close();
					resolve(files);
				}
			});
			zip.readEntry();
		});
	});
}
type XmlNode = Record<string, any>;
function xml(bytes: Uint8Array): XmlNode[] {
	const text = decode(bytes).text;
	if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) {
		throw new Error('EPUB external entities and DTDs are forbidden');
	}
	if (XMLValidator.validate(text) !== true) {
		throw new Error('Malformed EPUB XML');
	}
	return new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, trimValues: false, parseTagValue: false, parseAttributeValue: false, processEntities: true, htmlEntities: true }).parse(text) as XmlNode[];
}
function name(node: XmlNode): string { return Object.keys(node).find(key => key !== ':@') ?? ''; }
function children(node: XmlNode): XmlNode[] { const v = node[name(node)]; return Array.isArray(v) ? v : []; }
function attrs(node: XmlNode): Record<string, string> { return node[':@'] ?? {}; }
function find(nodes: XmlNode[], tag: string): XmlNode[] {
	const result: XmlNode[] = []; for (const node of nodes) {
		if (name(node) === tag) {
			result.push(node);
		}
		result.push(...find(children(node), tag));
	} return result;
}
function nodeText(nodes: XmlNode[]): string { return nodes.map(node => name(node) === '#text' ? String(node['#text']) : nodeText(children(node))).join(''); }
const compact = (text: string) => normalize(text).replace(/\s+/gu, ' ').trim();
function required(files: Map<string, Buffer>, path: string): Buffer {
	const bytes = files.get(path); if (!bytes) {
		throw new Error(`EPUB is missing required entry: ${path}`);
	} return bytes;
}
function safeAsset(path: string, mime: string, bytes: Uint8Array): ReaderAsset {
	if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) {
		throw new Error('Unsupported image format (SVG and active content are forbidden)');
	}
	if (bytes.byteLength > READER_LIMITS.assetBytes) {
		throw new Error('Image exceeds asset budget');
	}
	return { id: `asset-${hash(path + ':' + hash(bytes)).slice(0, 24)}`, mime, data: Buffer.from(bytes).toString('base64') };
}
function htmlBlocks(nodes: XmlNode[], path: string, chapterId: string, assets: Map<string, ReaderAsset>, warnings: Set<string>): ReaderBlock[] {
	const blocks: ReaderBlock[] = [];
	const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'aside', 'td', 'th', 'pre']);
	function inline(list: XmlNode[], marks: ReaderMark[], state: {
		text: string;
		images: {
			offset: number;
			node: XmlNode;
		}[];
	}): void {
		for (const node of list) {
			const tag = name(node);
			const a = attrs(node);
			const start = state.text.length;
			if (tag === '#text') {
				state.text += String(node['#text']).replace(/\s+/gu, ' ');
				continue;
			}
			if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'style') {
				throw new Error('EPUB active content is forbidden');
			}
			if (tag === 'img') {
				state.images.push({ offset: state.text.length, node });
				continue;
			}
			if (tag === 'br') {
				state.text += '\n';
				continue;
			}
			if (['audio', 'video', 'math', 'table'].includes(tag)) {
				warnings.add(`Unsupported ${tag} was linearized or omitted`);
			}
			inline(children(node), marks, state);
			const end = state.text.length;
			if (end > start && ['strong', 'b', 'em', 'i', 'a'].includes(tag)) {
				const kind = tag === 'a' ? 'link' : tag === 'strong' || tag === 'b' ? 'strong' : 'emphasis';
				let href: string | undefined;
				if (tag === 'a' && a.href) {
					const resource = resolveHref(path, a.href);
					href = `${resource}${a.href.includes('#') ? '#' + a.href.split('#')[1] : ''}`;
				}
				marks.push({ start, end, kind, ...(href ? { href } : {}) });
			}
		}
	}
	function addImage(node: XmlNode) {
		const a = attrs(node);
		if (!a.src) {
			return;
		}
		const asset = assets.get(resolveHref(path, a.src));
		if (!asset) {
			warnings.add('An unsupported or missing image was omitted');
			return;
		}
		blocks.push({ id: `${chapterId}-block-${blocks.length + 1}`, kind: 'image', text: a.alt ?? '', start: 0, end: 0, assetId: asset.id });
	}
	function visit(list: XmlNode[]) {
		for (const node of list) {
			const tag = name(node);
			const a = attrs(node);
			if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
				throw new Error('EPUB active content is forbidden');
			}
			if (tag === 'style' || tag === 'head') {
				continue;
			}
			if (['audio', 'video', 'math', 'table'].includes(tag)) {
				warnings.add(`Unsupported ${tag} was linearized or omitted`);
			}
			if (tag === 'img') {
				addImage(node);
				continue;
			}
			if (blockTags.has(tag)) {
				const state = {
					text: '', images: [] as {
						offset: number;
						node: XmlNode;
					}[]
				};
				const marks: ReaderMark[] = [];
				inline(children(node), marks, state);
				let first = true;
				const emit = (from: number, to: number) => {
					const segment = state.text.slice(from, to);
					const leading = segment.length - segment.trimStart().length;
					const text = segment.trim();
					const adjusted = marks.map(m => ({ ...m, start: Math.max(0, m.start - from - leading), end: Math.min(text.length, m.end - from - leading) })).filter(m => m.end > m.start);
					if (text) {
						const kind: ReaderBlock['kind'] = /footnote|endnote/.test(a.type ?? a.role ?? '') ? 'footnote' : /^h[1-6]$/.test(tag) ? 'heading' : tag === 'li' ? 'list' : tag === 'blockquote' ? 'quote' : 'paragraph';
						blocks.push({ id: first && a.id ? `${chapterId}#${a.id}` : `${chapterId}-block-${blocks.length + 1}`, kind, text, start: 0, end: 0, ...(kind === 'heading' ? { level: Number(tag[1]) } : {}), ...(adjusted.length ? { marks: adjusted } : {}) });
						first = false;
					}
				};
				let from = 0;
				for (const image of state.images) {
					emit(from, image.offset);
					addImage(image.node);
					from = image.offset;
				}
				emit(from, state.text.length);
			}
			else if (tag === '#text') {
				const text = compact(String(node['#text']));
				if (text) {
					blocks.push({ id: `${chapterId}-block-${blocks.length + 1}`, kind: 'paragraph', text, start: 0, end: 0 });
				}
			}
			else {
				visit(children(node));
			}
		}
	}
	visit(nodes);
	return blocks;
}
async function epub(bytes: Uint8Array, signal?: AbortSignal): Promise<Pick<ReaderBook, 'chapters' | 'assets' | 'title' | 'author' | 'coverAssetId' | 'warnings'>> {
	const files = await readArchive(bytes, signal);
	signal?.throwIfAborted();
	if (files.has('META-INF/encryption.xml')) {
		throw new Error('DRM/encrypted EPUBs are unsupported');
	}
	const container = xml(required(files, 'META-INF/container.xml'));
	const rootfile = find(container, 'rootfile')[0];
	const opfPath = archivePath(attrs(rootfile ?? {})['full-path'] ?? '');
	const opf = xml(required(files, opfPath));
	const packageNode = find(opf, 'package')[0];
	if (!packageNode) {
		throw new Error('EPUB package missing');
	}
	if (find(opf, 'meta').some(n => attrs(n).property === 'rendition:layout' && compact(nodeText(children(n))) === 'pre-paginated')) {
		throw new Error('Fixed layout EPUBs are unsupported');
	}
	const items = new Map<string, {
		path: string;
		mime: string;
		properties: string;
	}>();
	for (const item of find(opf, 'item')) {
		const a = attrs(item);
		if (!a.id || !a.href || !a['media-type']) {
			throw new Error('Malformed EPUB manifest');
		}
		if (items.has(a.id)) {
			throw new Error('Duplicate EPUB manifest ID');
		}
		items.set(a.id, { path: resolveHref(opfPath, a.href), mime: a['media-type'], properties: a.properties ?? '' });
	}
	const warnings = new Set<string>();
	const assets = new Map<string, ReaderAsset>();
	let coverAssetId: string | undefined;
	const legacyCover = find(opf, 'meta').find(n => attrs(n).name === 'cover');
	for (const [id, item] of items) {
		if (item.mime.startsWith('image/')) {
			if (item.mime === 'image/svg+xml') {
				warnings.add('SVG image omitted because active resources are unsupported');
				continue;
			}
			const asset = safeAsset(item.path, item.mime, required(files, item.path));
			assets.set(item.path, asset);
			if (item.properties.split(/\s+/).includes('cover-image') || attrs(legacyCover ?? {}).content === id) {
				coverAssetId = asset.id;
			}
		}
	}
	const titles = new Map<string, string>();
	const nav = [...items.values()].find(item => item.properties.split(/\s+/).includes('nav'));
	const ncx = items.get(attrs(find(opf, 'spine')[0] ?? {}).toc) ?? [...items.values()].find(item => item.mime === 'application/x-dtbncx+xml');
	if (nav) {
		const document = xml(required(files, nav.path));
		const toc = find(document, 'nav').find(n => /(?:^|\s)toc(?:\s|$)/.test(attrs(n).type ?? '')) ?? find(document, 'nav')[0];
		for (const a of find(toc ? children(toc) : document, 'a')) {
			const href = attrs(a).href;
			if (href) {
				const path = resolveHref(nav.path, href);
				if (!titles.has(path)) {
					titles.set(path, compact(nodeText(children(a))));
				}
			}
		}
	}
	else if (ncx) {
		for (const point of find(xml(required(files, ncx.path)), 'navPoint')) {
			const content = find(children(point), 'content')[0];
			const href = attrs(content ?? {}).src;
			if (href) {
				const path = resolveHref(ncx.path, href);
				if (!titles.has(path)) {
					titles.set(path, compact(nodeText(children(find(children(point), 'navLabel')[0] ?? {}))));
				}
			}
		}
	}
	else {
		warnings.add('Navigation missing; table of contents reconstructed from spine');
	}
	const chapters: ReaderChapter[] = [];
	for (const ref of find(opf, 'itemref')) {
		const item = items.get(attrs(ref).idref);
		if (!item) {
			throw new Error('EPUB spine references an unknown manifest item');
		}
		if (!['application/xhtml+xml', 'text/html'].includes(item.mime)) {
			throw new Error('Unsupported spine media type');
		}
		const document = xml(required(files, item.path));
		const id = `chapter-${chapters.length + 1}-${hash(item.path).slice(0, 12)}`;
		const body = find(document, 'body')[0];
		if (!body) {
			throw new Error('EPUB spine document is missing its body element');
		}
		const blocks = htmlBlocks(children(body), item.path, id, assets, warnings);
		const title = titles.get(item.path) || blocks.find(block => block.kind === 'heading')?.text || `Chapter ${chapters.length + 1}`;
		if (!titles.has(item.path)) {
			warnings.add('Spine content absent from navigation was retained');
		}
		chapters.push(chapter(id, chapters.length, title, blocks));
	}
	if (!chapters.length) {
		throw new Error('EPUB has no readable spine chapters');
	}
	// Convert internal hyperlinks to canonical chapter/block identifiers; no renderer receives archive paths.
	for (const ch of chapters) {
		for (const block of ch.blocks) {
			for (const mark of block.marks ?? []) {
				if (mark.kind === 'link' && mark.href) {
					const [path, fragment] = mark.href.split('#');
					const index = [...find(opf, 'itemref')].findIndex(ref => items.get(attrs(ref).idref)?.path === path);
					if (index >= 0) {
						mark.href = `${chapters[index].id}${fragment ? '#' + fragment : ''}`;
					}
					else {
						delete mark.href;
						warnings.add('Non-spine link target omitted');
					}
				}
			}
		}
	}
	return { chapters, assets: [...assets.values()], title: compact(nodeText(children(find(opf, 'title')[0] ?? {}))) || 'Untitled', author: compact(nodeText(children(find(opf, 'creator')[0] ?? {}))), ...(coverAssetId ? { coverAssetId } : {}), warnings: [...warnings] };
}
export async function parseBook(bytes: Uint8Array, filename: string, options: ReaderImportOptions = {}, signal?: AbortSignal): Promise<ImportedBook> {
	signal?.throwIfAborted();
	if (!(bytes instanceof Uint8Array) || bytes.byteLength > READER_LIMITS.fileBytes) {
		throw new Error('Import exceeds 64 MiB file budget');
	}
	const rawHash = hash(bytes);
	const isEpub = /\.epub$/i.test(filename);
	let encoding = 'epub-xml';
	let content: Pick<ReaderBook, 'chapters' | 'assets' | 'title' | 'author' | 'coverAssetId' | 'warnings'>;
	if (isEpub) {
		content = await epub(bytes, signal);
	}
	else {
		if (!/\.txt$/i.test(filename)) {
			throw new Error('Only TXT and EPUB files are supported');
		}
		const decoded = decode(bytes, options.encoding);
		encoding = decoded.encoding;
		content = { chapters: splitText(decoded.text, options.splitPattern), assets: [], title: posix.basename(filename.replace(/\\/g, '/'), '.txt'), author: '', warnings: [`Decoded as ${encoding}; canonical text uses LF and preserves Unicode code points`] };
	}
	signal?.throwIfAborted();
	const choices = { encoding, splitPattern: options.splitPattern ?? 'consistent-headings-v1' };
	const contentHash = hash(JSON.stringify({ chapters: content.chapters, assets: content.assets }));
	const versionId = hash(JSON.stringify({ rawHash, choices, policy: IMPORT_POLICY, contentHash }));
	const id = `book-${rawHash.slice(0, 32)}`;
	return { book: { ...content, id, versionId, title: options.title ?? content.title, author: options.author ?? content.author, alias: options.alias ?? `inventory-${rawHash.slice(0, 8)}` }, rawHash, contentHash, choices };
}
