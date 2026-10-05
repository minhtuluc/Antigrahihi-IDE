/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type PresentationMode = 'code' | 'book';
export interface ReaderAnchor {
	bookId: string;
	versionId: string;
	chapterId: string;
	offset: number;
	blockId?: string;
	quote?: string;
}
export interface ReaderMark {
	start: number;
	end: number;
	kind: 'strong' | 'emphasis' | 'link';
	href?: string;
}
export interface ReaderBlock {
	id: string;
	kind: 'paragraph' | 'heading' | 'image' | 'footnote' | 'quote' | 'list';
	text: string;
	start: number;
	end: number;
	level?: number;
	marks?: ReaderMark[];
	assetId?: string;
	href?: string;
}
export interface ReaderChapter {
	id: string;
	ordinal: number;
	title: string;
	text: string;
	blocks: ReaderBlock[];
}
export interface ReaderAsset {
	id: string;
	mime: string;
	data: string;
}
export interface ReaderBook {
	id: string;
	versionId: string;
	title: string;
	author: string;
	alias: string;
	chapters: ReaderChapter[];
	assets: ReaderAsset[];
	coverAssetId?: string;
	warnings?: string[];
}
export type ReaderBookManifest = Omit<ReaderBook, 'chapters' | 'assets'> & {
	chapters: Pick<ReaderChapter, 'id' | 'ordinal' | 'title'>[];
	assets: Pick<ReaderAsset, 'id' | 'mime'>[];
};
export interface ReaderBookSummary {
	id: string;
	versionId: string;
	title: string;
	author: string;
	alias: string;
	chapterCount: number;
	coverAssetId?: string;
	tags: string[];
	status: 'unread' | 'reading' | 'finished';
	position?: ReaderAnchor;
}
export interface ReaderAnnotation {
	id: string;
	kind: 'bookmark' | 'highlight' | 'note';
	anchor: ReaderAnchor;
	endOffset?: number;
	color?: string;
	note?: string;
	createdAt: number;
}
export interface ReaderSearchResult {
	anchor: ReaderAnchor;
	endOffset: number;
	snippet: string;
}
export interface ReaderImportOptions {
	encoding?: string;
	splitPattern?: string;
	title?: string;
	author?: string;
	alias?: string;
}
export interface ReaderPreferences {
	fontSize: number;
	lineHeight: number;
	bookFont: string;
	bookTheme: 'dark' | 'light' | 'sepia';
	paginated: boolean;
	columns: 1 | 2;
	minimap: boolean;
}
export interface ReaderSession {
	anchor?: ReaderAnchor;
	mode: PresentationMode;
	covered: boolean;
}
export interface ReaderStoreApi {
	listBooks(): Promise<ReaderBookSummary[]>;
	getBook(bookId: string, versionId?: string): Promise<ReaderBook>;
	getBookManifest(bookId: string, versionId?: string): Promise<ReaderBookManifest>;
	getAsset(bookId: string, versionId: string, assetId: string): Promise<ReaderAsset>;
	getChapter(bookId: string, versionId: string, chapterId: string): Promise<ReaderChapter>;
	importBook(bytes: Uint8Array, filename: string, options?: ReaderImportOptions): Promise<ReaderBook>;
	previewImport(bytes: Uint8Array, filename: string, options?: ReaderImportOptions): Promise<ReaderBook>;
	cancelImport(): Promise<void>;
	removeBook(bookId: string): Promise<void>;
	updateBook(bookId: string, patch: {
		alias?: string;
		tags?: string[];
		status?: ReaderBookSummary['status'];
	}): Promise<void>;
	savePosition(anchor: ReaderAnchor): Promise<void>;
	listAnnotations(bookId?: string): Promise<ReaderAnnotation[]>;
	saveAnnotation(annotation: Omit<ReaderAnnotation, 'id' | 'createdAt'>): Promise<ReaderAnnotation>;
	removeAnnotation(id: string): Promise<void>;
	search(query: string, options?: {
		bookId?: string;
		ignoreDiacritics?: boolean;
	}): Promise<ReaderSearchResult[]>;
	getSession(): Promise<ReaderSession>;
	saveSession(session: ReaderSession): Promise<void>;
	getPreferences(): Promise<ReaderPreferences>;
	savePreferences(preferences: Partial<ReaderPreferences>): Promise<ReaderPreferences>;
	exportBackup(): Promise<Uint8Array>;
	restoreBackup(bytes: Uint8Array): Promise<void>;
	exportAnnotations(): Promise<string>;
	close(): Promise<void>;
}
export interface ReaderFacade extends Omit<ReaderStoreApi, 'close'> {
	chooseImport(): Promise<ReaderBook | undefined>;
	chooseBackupExport(): Promise<void>;
	chooseBackupRestore(): Promise<void>;
	setWindowTitle(alias: string): void;
}
export const READER_LIMITS = Object.freeze({ fileBytes: 64 * 1024 * 1024, zipEntries: 20000, zipBytes: 256 * 1024 * 1024, assetBytes: 16 * 1024 * 1024, chapterBytes: 2 * 1024 * 1024, backupBytes: 768 * 1024 * 1024 });
