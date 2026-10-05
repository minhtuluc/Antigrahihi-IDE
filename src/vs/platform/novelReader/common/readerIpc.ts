/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { READER_LIMITS } from './reader.js';
import type { ReaderAnchor, ReaderStoreApi } from './reader.js';
export type ReaderMethod = Exclude<keyof ReaderStoreApi, 'close'>;
export type ReaderRequest = {
	[K in ReaderMethod]: {
		method: K;
		args: Parameters<ReaderStoreApi[K]>;
	};
}[ReaderMethod];
const arities: Record<ReaderMethod, [
	number,
	number
]> = { listBooks: [0, 0], getBook: [1, 2], getBookManifest: [1, 2], getAsset: [3, 3], getChapter: [3, 3], importBook: [2, 3], previewImport: [2, 3], cancelImport: [0, 0], removeBook: [1, 1], updateBook: [2, 2], savePosition: [1, 1], listAnnotations: [0, 1], saveAnnotation: [1, 1], removeAnnotation: [1, 1], search: [1, 2], getSession: [0, 0], saveSession: [1, 1], getPreferences: [0, 0], savePreferences: [1, 1], exportBackup: [0, 0], restoreBackup: [1, 1], exportAnnotations: [0, 0] };
function record(value: unknown): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Expected object');
	}
}
function text(value: unknown, limit = 4096): asserts value is string {
	if (typeof value !== 'string' || !value.length || value.length > limit) {
		throw new Error('Invalid text');
	}
}
export function validateAnchor(value: unknown): asserts value is ReaderAnchor {
	record(value);
	text(value.bookId, 128);
	text(value.versionId, 128);
	text(value.chapterId, 256);
	if (!Number.isSafeInteger(value.offset) || (value.offset as number) < 0) {
		throw new Error('Invalid canonical offset');
	}
	if (value.blockId !== undefined) {
		text(value.blockId, 256);
	}
	if (value.quote !== undefined && (typeof value.quote !== 'string' || value.quote.length > 4096)) {
		throw new Error('Invalid quote');
	}
}
export function validateReaderRequest(value: unknown): ReaderRequest {
	record(value);
	if (Object.keys(value).some(key => key !== 'method' && key !== 'args')) {
		throw new Error('Unknown request field');
	}
	if (typeof value.method !== 'string' || !Object.hasOwn(arities, value.method)) {
		throw new Error('Unknown reader method');
	}
	const method = value.method as ReaderMethod;
	const args = value.args;
	if (!Array.isArray(args) || args.length < arities[method][0] || args.length > arities[method][1]) {
		throw new Error('Invalid argument count');
	}
	if (['getBook', 'getBookManifest', 'getAsset', 'getChapter', 'removeBook', 'updateBook', 'removeAnnotation', 'search'].includes(method)) {
		text(args[0]);
	}
	if ((method === 'getBook' || method === 'getBookManifest') && args[1] !== undefined) {
		text(args[1], 128);
	}
	if (method === 'getChapter' || method === 'getAsset') {
		text(args[1], 128);
		text(args[2], 256);
	}
	if (method === 'listAnnotations' && args[0] !== undefined) {
		text(args[0], 128);
	}
	if (method === 'savePosition') {
		validateAnchor(args[0]);
	}
	if (method === 'importBook' || method === 'previewImport' || method === 'restoreBackup') {
		if (!(args[0] instanceof Uint8Array) || args[0].byteLength > (method === 'restoreBackup' ? READER_LIMITS.backupBytes : READER_LIMITS.fileBytes)) {
			throw new Error('Input exceeds byte budget');
		}
		if (method !== 'restoreBackup') {
			text(args[1], 4096);
			if (args[2] !== undefined) {
				record(args[2]);
				for (const key of Object.keys(args[2])) {
					if (!['encoding', 'splitPattern', 'title', 'author', 'alias'].includes(key)) {
						throw new Error('Unknown import option');
					}
					text(args[2][key]);
				}
			}
		}
	}
	if (method === 'saveAnnotation') {
		record(args[0]);
		validateAnchor(args[0].anchor);
		if (!['bookmark', 'highlight', 'note'].includes(args[0].kind as string)) {
			throw new Error('Invalid annotation kind');
		}
		if (args[0].endOffset !== undefined && (!Number.isSafeInteger(args[0].endOffset) || (args[0].endOffset as number) < (args[0].anchor as ReaderAnchor).offset)) {
			throw new Error('Invalid annotation range');
		}
		if (args[0].note !== undefined && (typeof args[0].note !== 'string' || args[0].note.length > 100000)) {
			throw new Error('Invalid note');
		}
		if (args[0].color !== undefined) {
			text(args[0].color, 64);
		}
	}
	if (method === 'saveSession') {
		record(args[0]);
		if (!['code', 'book'].includes(args[0].mode as string) || typeof args[0].covered !== 'boolean') {
			throw new Error('Invalid session');
		}
		if (args[0].anchor !== undefined) {
			validateAnchor(args[0].anchor);
		}
	}
	if (method === 'updateBook') {
		record(args[1]);
		if (Object.keys(args[1]).some(key => !['alias', 'tags', 'status'].includes(key))) {
			throw new Error('Unknown metadata field');
		}
		if (args[1].alias !== undefined) {
			text(args[1].alias, 256);
		}
		if (args[1].status !== undefined && !['unread', 'reading', 'finished'].includes(args[1].status as string)) {
			throw new Error('Invalid status');
		}
		if (args[1].tags !== undefined && (!Array.isArray(args[1].tags) || args[1].tags.length > 100 || args[1].tags.some(tag => typeof tag !== 'string' || tag.length > 128))) {
			throw new Error('Invalid tags');
		}
	}
	if (method === 'savePreferences') {
		record(args[0]);
		const p = args[0];
		for (const key of Object.keys(p)) {
			if (!['fontSize', 'lineHeight', 'bookFont', 'bookTheme', 'paginated', 'columns', 'minimap'].includes(key)) {
				throw new Error('Unknown preference');
			}
		}
		if (p.fontSize !== undefined && (typeof p.fontSize !== 'number' || !Number.isFinite(p.fontSize) || p.fontSize < 8 || p.fontSize > 72)) {
			throw new Error('Invalid font size');
		}
		if (p.lineHeight !== undefined && (typeof p.lineHeight !== 'number' || !Number.isFinite(p.lineHeight) || p.lineHeight < 1 || p.lineHeight > 3)) {
			throw new Error('Invalid line height');
		}
		if (p.bookFont !== undefined) {
			text(p.bookFont, 128);
		}
		if (p.bookTheme !== undefined && !['dark', 'light', 'sepia'].includes(p.bookTheme as string)) {
			throw new Error('Invalid theme');
		}
		if (p.columns !== undefined && p.columns !== 1 && p.columns !== 2) {
			throw new Error('Invalid columns');
		}
		for (const k of ['paginated', 'minimap']) {
			if (p[k] !== undefined && typeof p[k] !== 'boolean') {
				throw new Error('Invalid boolean preference');
			}
		}
	}
	if (method === 'search' && args[1] !== undefined) {
		record(args[1]);
		if (args[1].bookId !== undefined) {
			text(args[1].bookId, 128);
		}
		if (args[1].ignoreDiacritics !== undefined && typeof args[1].ignoreDiacritics !== 'boolean') {
			throw new Error('Invalid search options');
		}
	}
	return value as ReaderRequest;
}
export async function dispatchReaderRequest(store: ReaderStoreApi, value: unknown): Promise<unknown> {
	const request = validateReaderRequest(value);
	const method = store[request.method] as (...args: unknown[]) => Promise<unknown>;
	return method.apply(store, request.args);
}
export const handleReaderRequest = dispatchReaderRequest;
