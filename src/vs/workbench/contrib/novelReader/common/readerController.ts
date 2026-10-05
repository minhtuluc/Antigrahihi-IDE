import type { ReaderFacade, ReaderBookManifest, ReaderAsset, ReaderChapter, ReaderAnchor, ReaderPreferences, ReaderAnnotation } from '../../../../platform/novelReader/common/reader.js';
import { reducePresentation, type Presentation } from './presentation.js';
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = { fontSize: 19, lineHeight: 1.75, bookFont: 'Georgia', bookTheme: 'light', paginated: false, columns: 1, minimap: true };
export class ReaderController {
    state: Presentation = { mode: 'code', covered: false };
    book?: ReaderBookManifest;
    assets: ReaderAsset[] = [];
    chapter?: ReaderChapter;
    annotations: ReaderAnnotation[] = [];
    preferences: ReaderPreferences = { ...DEFAULT_READER_PREFERENCES };
    readonly history: ReaderAnchor[] = [];
    selectedRange?: {
        start: number;
        end: number;
        versionId: string;
        chapterId: string;
    };
    select(start: number, end: number): void { const anchor = this.state.anchor; if (anchor && !this.state.covered)
        this.selectedRange = { start: Math.min(start, end), end: Math.max(start, end), versionId: anchor.versionId, chapterId: anchor.chapterId }; }
    private listeners = new Set<() => void>();
    private transients = new Set<() => void>();
    private generation = 0;
    private checkpoint?: ReturnType<typeof setTimeout>;
    private positionSamples = 0;
    constructor(readonly api: ReaderFacade) { }
    subscribe(listener: () => void): {
        dispose(): void;
    } { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }
    registerTransient(close: () => void): {
        dispose(): void;
    } { this.transients.add(close); return { dispose: () => this.transients.delete(close) }; }
    changed(): void { for (const listener of this.listeners)
        listener(); }
    async initialize(): Promise<void> {
        const [session, preferences] = await Promise.all([this.api.getSession(), this.api.getPreferences()]);
        this.preferences = { ...this.preferences, ...preferences };
        this.state = { anchor: session.anchor, mode: 'code', covered: false };
        if (session.anchor)
            await this.navigate(session.anchor, false);
        else
            this.changed();
    }
    async navigate(anchor: ReaderAnchor, remember = true): Promise<void> {
        const generation = ++this.generation;
        const book = this.book?.id === anchor.bookId && this.book.versionId === anchor.versionId ? this.book : await this.api.getBookManifest(anchor.bookId, anchor.versionId);
        const chapter = await this.api.getChapter(book.id, book.versionId, anchor.chapterId);
        const annotations = await this.api.listAnnotations(book.id);
        if (generation !== this.generation)
            return;
        if (remember && this.state.anchor)
            this.history.push({ ...this.state.anchor });
        if (this.history.length > 100)
            this.history.shift();
        this.selectedRange = undefined;
        this.book = book;
        this.chapter = chapter;
        this.annotations = annotations;
        this.assets = [];
        this.state = { ...this.state, anchor: { ...anchor, offset: Math.max(0, Math.min(chapter.text.length, anchor.offset)) } };
        this.api.setWindowTitle(this.state.mode === 'book' ? book.title : book.alias);
        this.changed();
        if (this.state.mode === 'book' && !this.state.covered)
            void this.loadAssets();
        void this.persist();
    }
    async open(book: ReaderBookManifest, offset = 0): Promise<void> { if (!book.chapters.length)
        throw new Error('Dataset has no readable modules. Import another file.'); await this.navigate({ bookId: book.id, versionId: book.versionId, chapterId: book.chapters[0].id, offset }); }
    async back(): Promise<void> { const anchor = this.history.pop(); if (anchor)
        await this.navigate(anchor, false); }
    async next(delta: number): Promise<void> { if (!this.book || !this.chapter)
        return; const i = this.book.chapters.findIndex(c => c.id === this.chapter!.id) + delta; const chapter = this.book.chapters[i]; if (chapter)
        await this.navigate({ bookId: this.book.id, versionId: this.book.versionId, chapterId: chapter.id, offset: 0 }); }
    mode(mode: 'code' | 'book'): void { this.state = reducePresentation(this.state, { type: 'mode', mode }); this.api.setWindowTitle(mode === 'book' ? this.book?.title ?? 'Library' : this.book?.alias ?? 'inventory-service'); this.changed(); if (mode === 'book')
        void this.loadAssets(); void this.persist(); }
    cover(): void { for (const close of [...this.transients])
        close(); this.state = reducePresentation(this.state, { type: 'cover' }); this.api.setWindowTitle('inventory-service'); this.changed(); void this.persist(); }
    uncover(): void { this.state = reducePresentation(this.state, { type: 'uncover' }); this.api.setWindowTitle(this.state.mode === 'book' ? this.book?.title ?? 'Library' : this.book?.alias ?? 'inventory-service'); this.changed(); }
    position(offset: number): void { if (!this.state.anchor || this.state.covered)
        return; this.state = { ...this.state, anchor: { ...this.state.anchor, offset } }; this.positionSamples++;
        if (this.positionSamples >= 4) { this.positionSamples = 0; if (this.checkpoint) { clearTimeout(this.checkpoint); this.checkpoint = undefined; } void this.persist(); return; }
        if (this.checkpoint)
            clearTimeout(this.checkpoint); this.checkpoint = setTimeout(() => { this.checkpoint = undefined; void this.persist(); }, 1500); }
    private async loadAssets(): Promise<void> {
        const book = this.book, chapter = this.chapter, generation = this.generation;
        if (!book || !chapter)
            return;
        const needed = [...new Set([...(chapter.ordinal === 0 && book.coverAssetId ? [book.coverAssetId] : []), ...chapter.blocks.filter(b => b.assetId).map(b => b.assetId!)])].slice(0, 32);
        const assets: ReaderAsset[] = [];
        let size = 0;
        for (const id of needed) {
            if (this.state.mode !== 'book' || this.state.covered || generation !== this.generation)
                return;
            try {
                const asset = await this.api.getAsset(book.id, book.versionId, id);
                if (size + asset.data.length > 24 * 1024 * 1024)
                    break;
                assets.push(asset);
                size += asset.data.length;
            }
            catch { /* Missing assets are displayed with an explicit unavailable label. */ }
        }
        if (generation === this.generation && this.state.mode === 'book' && !this.state.covered) {
            this.assets = assets;
            this.changed();
        }
    }
    async persist(): Promise<void> { try {
        const session = this.api.saveSession({ anchor: this.state.anchor, mode: 'code', covered: false });
        if (this.state.anchor)
            await this.api.savePosition(this.state.anchor);
        await session;
    }
    catch { /* foreground operations report errors; checkpoint remains best effort */ } }
    async preferencesChanged(patch: Partial<ReaderPreferences>): Promise<void> { this.preferences = await this.api.savePreferences(patch); this.changed(); }
    async annotate(kind: ReaderAnnotation['kind'], start: number, end?: number, note?: string, color?: string): Promise<void> { if (!this.state.anchor)
        return; await this.api.saveAnnotation({ kind, anchor: { ...this.state.anchor, offset: start, quote: this.chapter?.text.slice(start, end ?? start + 80) }, endOffset: end, note, color }); this.annotations = await this.api.listAnnotations(this.state.anchor.bookId); this.changed(); }
    dispose(): void { if (this.checkpoint)
        clearTimeout(this.checkpoint); void this.persist(); this.listeners.clear(); this.transients.clear(); }
}
