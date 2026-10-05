import './reader.css';
import { Dimension, addDisposableListener } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import type { ReaderBook, ReaderBookSummary, ReaderImportOptions } from '../../../../platform/novelReader/common/reader.js';
import { projectChapter, canonicalToDisplay, displayToCanonical, copyCanonical, canonicalRangeToDisplay, CodeProjection } from '../common/codeProjection.js';
import { annotatedRuns, safeAssetUrl, internalTarget } from '../common/bookRendering.js';
import { IReaderService } from './readerService.js';
import { ReaderEditorInput } from './readerEditorInput.js';
import { READER_LANGUAGE, registerReaderTokenizer } from './readerLanguage.js';
const COVER_SOURCE = 'export const module0001 = {\n  revision: 1,\n  records: [\n    "validate schema",\n    "resolve module registry",\n    "preserve insertion order"\n  ]\n};\n';
function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] { const e = doc.createElement(tag); if (className)
    e.className = className; if (text !== undefined)
    e.textContent = text; return e; }
export class ReaderEditorPane extends EditorPane {
    static readonly ID = 'workbench.editor.workspaceReader';
    private root!: HTMLElement;
    private toolbar!: HTMLElement;
    private codeHost!: HTMLElement;
    private paper!: HTMLElement;
    private transient!: HTMLElement;
    private status!: HTMLElement;
    private code!: CodeEditorWidget;
    private model?: ITextModel;
    private coverModel?: ITextModel;
    private projection?: CodeProjection;
    private dimension = new Dimension(800, 600);
    private readonly rendered = this._register(new DisposableStore());
    private readonly dialogStore = this._register(new DisposableStore());
    private decorations: string[] = [];
    private importing = false;
    private nodeOffsets = new WeakMap<Node, {
        start: number;
        length: number;
    }>();
    private rendering = false;
    constructor(group: IEditorGroup,
    @ITelemetryService
    telemetry: ITelemetryService,
    @IThemeService
    theme: IThemeService,
    @IStorageService
    storage: IStorageService,
    @IInstantiationService
    private readonly instantiation: IInstantiationService,
    @IModelService
    private readonly models: IModelService,
    @ILanguageService
    private readonly languages: ILanguageService,
    @IClipboardService
    private readonly clipboard: IClipboardService,
    @IReaderService
    private readonly reader: IReaderService) { super(ReaderEditorPane.ID, group, telemetry, theme, storage); this._register(registerReaderTokenizer(languages, theme)); this._register(reader.subscribe(() => { if (this.root)
        this.renderContent(); })); this._register(reader.registerTransient(() => this.closeDialog())); }
    protected override createEditor(parent: HTMLElement): void {
        const doc = parent.ownerDocument;
        this.root = element(doc, 'div', 'workspace-reader');
        this.root.dataset.reader = 'native';
        parent.append(this.root);
        this.toolbar = element(doc, 'nav', 'reader-toolbar');
        this.toolbar.setAttribute('aria-label', 'Module controls');
        this.codeHost = element(doc, 'div', 'reader-code');
        this.paper = element(doc, 'article', 'reader-paper');
        this.paper.tabIndex = 0;
        this.transient = element(doc, 'div', 'reader-transient');
        this.status = element(doc, 'footer', 'reader-progress');
        this.root.append(this.toolbar, this.codeHost, this.paper, this.status, this.transient);
        this.code = this._register(this.instantiation.createInstance(CodeEditorWidget, this.codeHost, { readOnly: true, domReadOnly: true, wordWrap: 'on', minimap: { enabled: true }, fontSize: 15, lineHeight: 26, scrollBeyondLastLine: false, automaticLayout: false, renderValidationDecorations: 'off', contextmenu: false }, { isSimpleWidget: true }));
        this._register(this.code.onDidChangeCursorSelection(e => { if (this.rendering || this.reader.state.covered || !this.projection || !this.model)
            return; const offset = displayToCanonical(this.projection, this.model.getOffsetAt(e.selection.getPosition())); if (offset !== undefined)
            this.reader.position(offset); const range = this.selection(); if (range)
            this.reader.select(range.start, range.end); }));
        this._register(this.code.onDidScrollChange(() => { if (this.rendering || this.reader.state.covered || !this.projection || !this.model)
            return; const range = this.code.getVisibleRanges()[0]; if (range) {
            const offset = displayToCanonical(this.projection, this.model.getOffsetAt(range.getStartPosition()));
            if (offset !== undefined)
                this.reader.position(offset);
        } }));
        this._register(addDisposableListener(this.codeHost, 'copy', (e: ClipboardEvent) => { if (!this.projection || !this.model || this.reader.state.covered)
            return; const selection = this.code.getSelection(); if (!selection)
            return; e.preventDefault(); e.stopPropagation(); e.clipboardData?.setData('text/plain', copyCanonical(this.projection, this.model.getOffsetAt(selection.getStartPosition()), this.model.getOffsetAt(selection.getEndPosition()))); }, true));
        this._register(addDisposableListener(this.codeHost, 'keydown', (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !e.altKey && !e.shiftKey && this.projection) {
            e.preventDefault();
            e.stopImmediatePropagation();
            void this.copySource();
        } }, true));
        this._register(addDisposableListener(this.paper, 'mouseup', () => this.captureSelection()));
        this._register(addDisposableListener(this.paper, 'keyup', () => this.captureSelection()));
        this._register(addDisposableListener(this.paper, 'scroll', () => this.captureViewport()));
        this._register(addDisposableListener(this.root, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && this.transient.childElementCount) {
            this.closeDialog();
            e.preventDefault();
        } if (e.key === 'F9') {
            this.reader.state.covered ? this.reader.uncover() : this.reader.cover();
            e.preventDefault();
        } if (e.altKey && e.key === 'ArrowRight') {
            void this.reader.next(1);
            e.preventDefault();
        } if (e.altKey && e.key === 'ArrowLeft') {
            void this.reader.next(-1);
            e.preventDefault();
        } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            this.searchDialog();
            e.preventDefault();
            e.stopPropagation();
        } }));
        this.coverModel = this.models.createModel(COVER_SOURCE, this.languages.createById(READER_LANGUAGE), URI.from({ scheme: 'novel', authority: 'fixture', path: '/src/modules/module-0001.ts' }), true);
        this.renderContent();
    }
    override async setInput(input: ReaderEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> { await super.setInput(input, options, context, token); this.renderContent(); }
    override layout(dimension: Dimension): void { this.dimension = dimension; if (this.root) {
        this.root.style.height = `${dimension.height}px`;
        this.root.style.width = `${dimension.width}px`;
        this.code.layout(new Dimension(dimension.width, Math.max(0, dimension.height - 74)));
        this.restoreBookAnchor();
    } }
    override focus(): void { super.focus(); this.reader.state.mode === 'book' && !this.reader.state.covered ? this.paper.focus() : this.code.focus(); }
    private button(parent: HTMLElement, label: string, run: () => void | Promise<void>, store = this.rendered): HTMLButtonElement { const b = element(parent.ownerDocument, 'button', 'reader-button', label); b.type = 'button'; parent.append(b); store.add(addDisposableListener(b, 'click', () => { try {
        Promise.resolve(run()).catch(() => this.error('Operation failed. Retry or check the imported dataset.'));
    }
    catch {
        this.error('Operation failed. Retry or check the imported dataset.');
    } })); return b; }
    private error(message: string): void { this.status.textContent = message; this.status.setAttribute('role', 'alert'); }
    private renderContent(): void {
        if (!this.root)
            return;
        this.rendering = true;
        this.rendered.clear();
        this.toolbar.replaceChildren();
        this.paper.replaceChildren();
        this.nodeOffsets = new WeakMap();
        const { state, chapter, book } = this.reader;
        const bookMode = state.mode === 'book' && !state.covered;
        this.root.classList.toggle('book-mode', bookMode);
        this.root.dataset.mode = bookMode ? 'book' : 'code';
        this.root.dataset.covered = String(state.covered);
        this.paper.hidden = !bookMode;
        this.codeHost.hidden = bookMode;
        this.button(this.toolbar, bookMode ? 'Library' : 'Datasets', () => this.libraryDialog());
        this.button(this.toolbar, bookMode ? 'Import book…' : 'Import Dataset…', () => this.importDialog());
        this.button(this.toolbar, '‹', () => this.page(-1));
        this.button(this.toolbar, '›', () => this.page(1));
        this.button(this.toolbar, bookMode ? 'Contents' : 'Outline', () => this.tocDialog());
        this.button(this.toolbar, 'Find', () => this.searchDialog());
        this.button(this.toolbar, bookMode ? 'Bookmarks' : 'Markers', () => this.annotationsDialog());
        this.button(this.toolbar, '＋', () => this.addAnnotationDialog());
        this.button(this.toolbar, bookMode ? 'Code view' : 'Reading view', () => this.reader.mode(bookMode ? 'code' : 'book'));
        this.button(this.toolbar, 'Aa', () => this.preferencesDialog());
        this.button(this.toolbar, state.covered ? 'Resume' : 'Cover', () => state.covered ? this.reader.uncover() : this.reader.cover());
        this.decorations = this.code.deltaDecorations(this.decorations, []);
        const source = state.covered || !chapter ? COVER_SOURCE : projectChapter(chapter.text, chapter.ordinal + 1).text;
        this.projection = chapter && !state.covered ? projectChapter(chapter.text, chapter.ordinal + 1) : undefined;
        if (state.covered || !chapter)
            this.code.setModel(this.coverModel ?? null);
        else {
            if (this.model?.getValue() !== source) {
                this.code.setModel(null);
                this.model?.dispose();
                this.model = this.models.createModel(source, this.languages.createById(READER_LANGUAGE), URI.from({ scheme: 'novel', authority: 'projection', path: '/src/modules/module.ts' }), true);
            }
            this.code.setModel(this.model!);
        }
        this.code.updateOptions({ minimap: { enabled: this.reader.preferences.minimap } });
        if (this.projection && this.model) {
            for (const annotation of this.reader.annotations.filter(a => a.anchor.versionId === book?.versionId && a.anchor.chapterId === chapter?.id)) {
                for (const range of canonicalRangeToDisplay(this.projection, annotation.anchor.offset, annotation.endOffset ?? annotation.anchor.offset + 1)) {
                    const a = this.model.getPositionAt(range.start), b = this.model.getPositionAt(range.end);
                    this.decorations.push(...this.code.deltaDecorations([], [{ range: new Range(a.lineNumber, a.column, b.lineNumber, b.column), options: { description: 'Workspace reader annotation', className: annotation.kind === 'highlight' ? 'reader-code-highlight' : undefined, glyphMarginClassName: 'reader-marker', isWholeLine: annotation.kind === 'bookmark' } }]));
                }
            }
            const position = this.model.getPositionAt(canonicalToDisplay(this.projection, state.anchor?.offset ?? 0));
            this.code.setPosition(position);
            const selected = this.reader.selectedRange;
            if (selected && selected.chapterId === chapter?.id && selected.versionId === book?.versionId) {
                const start = this.model.getPositionAt(canonicalToDisplay(this.projection, selected.start)), end = this.model.getPositionAt(canonicalToDisplay(this.projection, selected.end));
                this.code.setSelection(new Range(start.lineNumber, start.column, end.lineNumber, end.column));
            }
            this.code.revealPositionInCenter(position);
        }
        if (bookMode && chapter && book)
            this.renderBook();
        const offset = state.anchor?.offset ?? 0;
        this.status.textContent = state.covered ? 'TypeScript  •  UTF-8  •  Ln 1, Col 1' : bookMode && chapter ? `${chapter.title}  ·  ${Math.round(offset / Math.max(1, chapter.text.length) * 100)}%` : `TypeScript  •  UTF-8  •  Ln ${this.code.getPosition()?.lineNumber ?? 1}, Col ${this.code.getPosition()?.column ?? 1}`;
        this.status.removeAttribute('role');
        this.layout(this.dimension);
        this.restoreSelection();
        this.rendering = false;
    }
    private renderBook(): void {
        const doc = this.paper.ownerDocument;
        const { book, chapter, preferences } = this.reader;
        if (!book || !chapter)
            return;
        this.paper.dataset.theme = preferences.bookTheme;
        this.paper.classList.toggle('paginated', preferences.paginated);
        this.paper.style.setProperty('--reader-font', preferences.bookFont === 'mono' ? 'monospace' : preferences.bookFont === 'sans' ? 'system-ui' : preferences.bookFont);
        this.paper.style.setProperty('--reader-size', `${preferences.fontSize}px`);
        this.paper.style.setProperty('--reader-leading', String(preferences.lineHeight));
        this.paper.style.setProperty('--reader-columns', String(preferences.columns));
        const body = element(doc, 'div', 'reader-book-body');
        this.paper.append(body);
        if (chapter.ordinal === 0) {
            const cover = safeAssetUrl(this.reader.assets.find(a => a.id === book.coverAssetId));
            if (cover) {
                const img = element(doc, 'img', 'reader-cover');
                img.src = cover;
                img.alt = book.title;
                body.append(img);
            }
            body.append(element(doc, 'h1', 'reader-book-title', book.title), element(doc, 'p', 'reader-author', book.author));
        }
        for (const block of chapter.blocks) {
            const tag = block.kind === 'heading' ? (block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3') : block.kind === 'quote' ? 'blockquote' : block.kind === 'footnote' ? 'aside' : block.kind === 'list' ? 'p' : 'p';
            const e = element(doc, tag, 'reader-block');
            e.id = `reader-block-${block.id}`;
            e.dataset.block = block.id;
            e.dataset.start = String(block.start);
            if (block.kind === 'image') {
                const src = safeAssetUrl(this.reader.assets.find(a => a.id === block.assetId));
                if (src) {
                    const img = element(doc, 'img', 'reader-inline-image');
                    img.src = src;
                    img.alt = block.text;
                    img.loading = 'lazy';
                    this.rendered.add(addDisposableListener(img, 'load', () => this.restoreBookAnchor()));
                    e.append(img);
                }
                else
                    e.append(element(doc, 'span', 'reader-image-unavailable', 'Image unavailable in this view.'));
            }
            else
                for (const run of annotatedRuns(block, this.reader.annotations.filter(a => a.anchor.chapterId === chapter.id && a.anchor.versionId === book.versionId))) {
                    let container: HTMLElement = e;
                    if (run.highlight) {
                        const mark = element(doc, 'mark', 'reader-highlight');
                        mark.style.setProperty('--reader-highlight', run.highlight === 'blue' ? '#8ab5db55' : run.highlight === 'green' ? '#9dc9a655' : '#ead36e66');
                        mark.style.color = 'inherit';
                        e.append(mark);
                        container = mark;
                    }
                    for (const mark of run.marks) {
                        const tag = mark.kind === 'strong' ? 'strong' : mark.kind === 'emphasis' ? 'em' : 'a';
                        const inline = element(doc, tag);
                        if (tag === 'a') {
                            const target = internalTarget(mark.href ?? '');
                            if (target) {
                                inline.setAttribute('href', `#${target}`);
                                this.rendered.add(addDisposableListener(inline, 'click', ev => { ev.preventDefault(); void this.followLink(target); }));
                            }
                        }
                        container.append(inline);
                        container = inline;
                    }
                    const text = doc.createTextNode(run.text);
                    this.nodeOffsets.set(text, { start: run.start, length: run.text.length });
                    container.append(text);
                }
            body.append(e);
        }
        this.paintBookAnnotations();
        this.restoreBookAnchor();
    }
    private paintBookAnnotations(): void { const chapter = this.reader.chapter; if (!chapter)
        return; for (const annotation of this.reader.annotations.filter(a => a.anchor.chapterId === chapter.id && a.anchor.versionId === this.reader.book?.versionId)) {
        const e = [...this.paper.querySelectorAll<HTMLElement>('[data-block]')].find(e => { const start = Number(e.dataset.start); const block = chapter.blocks.find(b => b.id === e.dataset.block); return annotation.anchor.offset >= start && annotation.anchor.offset <= (block?.end ?? start); });
        if (e) {
            if (annotation.kind !== 'highlight')
                e.classList.add('reader-annotated');
        }
    } }
    private domPoint(offset: number): {
        node: Node;
        offset: number;
    } | undefined { const walker = this.paper.ownerDocument.createTreeWalker(this.paper, 4); let node: Node | null; while ((node = walker.nextNode())) {
        const entry = this.nodeOffsets.get(node);
        if (entry && offset >= entry.start && offset <= entry.start + entry.length)
            return { node, offset: offset - entry.start };
    } return undefined; }
    private restoreSelection(): void { const selection = this.reader.selectedRange; if (this.paper.hidden || !selection || selection.chapterId !== this.reader.chapter?.id || selection.versionId !== this.reader.book?.versionId)
        return; const a = this.domPoint(selection.start), b = this.domPoint(selection.end); if (a && b) {
        const range = this.paper.ownerDocument.createRange();
        range.setStart(a.node, a.offset);
        range.setEnd(b.node, b.offset);
        const active = this.paper.ownerDocument.getSelection();
        active?.removeAllRanges();
        active?.addRange(range);
    } }
    private restoreBookAnchor(): void { if (!this.paper || this.paper.hidden)
        return; const offset = this.reader.state.anchor?.offset ?? 0; const blocks = [...this.paper.querySelectorAll<HTMLElement>('[data-start]')]; const block = blocks.reverse().find(e => Number(e.dataset.start) <= offset); if (block) {
        const point = this.domPoint(offset);
        let top = block.offsetTop, left = block.offsetLeft;
        if (point) {
            const range = this.paper.ownerDocument.createRange();
            range.setStart(point.node, point.offset);
            range.collapse(true);
            const rect = range.getBoundingClientRect(), paper = this.paper.getBoundingClientRect();
            if (rect.height) {
                top = this.paper.scrollTop + rect.top - paper.top;
                left = this.paper.scrollLeft + rect.left - paper.left;
            }
        }
        if (this.reader.preferences.paginated)
            this.paper.scrollLeft = Math.floor(left / Math.max(1, this.paper.clientWidth)) * this.paper.clientWidth;
        else
            this.paper.scrollTop = top - 32;
    } }
    private captureViewport(): void { if (this.rendering || this.paper.hidden)
        return; const bounds = this.paper.getBoundingClientRect(); const block = [...this.paper.querySelectorAll<HTMLElement>('[data-start]')].find(e => { const r = e.getBoundingClientRect(); return r.bottom > bounds.top + 24 && r.right > bounds.left && r.left < bounds.right; }); if (block)
        this.reader.position(Number(block.dataset.start)); }
    private nodeOffset(node: Node, offset: number): number | undefined { const map = this.nodeOffsets.get(node); if (map)
        return map.start + Math.min(map.length, offset); if (node.nodeType === 1) {
        const child = node.childNodes[Math.min(offset, node.childNodes.length - 1)];
        if (child)
            return this.nodeOffset(child, 0);
    } return undefined; }
    private selection(): {
        start: number;
        end: number;
    } | undefined { if (this.reader.state.mode === 'book') {
        const selection = this.paper.ownerDocument.getSelection();
        if (!selection?.anchorNode || !selection.focusNode || !this.paper.contains(selection.anchorNode) || !this.paper.contains(selection.focusNode))
            return;
        const a = this.nodeOffset(selection.anchorNode, selection.anchorOffset), b = this.nodeOffset(selection.focusNode, selection.focusOffset);
        if (a === undefined || b === undefined)
            return;
        return { start: Math.min(a, b), end: Math.max(a, b) };
    } if (!this.model || !this.projection)
        return; const range = this.code.getSelection(); if (!range)
        return; const a = displayToCanonical(this.projection, this.model.getOffsetAt(range.getStartPosition())), b = displayToCanonical(this.projection, this.model.getOffsetAt(range.getEndPosition())); if (a === undefined || b === undefined)
        return; return { start: Math.min(a, b), end: Math.max(a, b) }; }
    private captureSelection(): void { const range = this.selection(); if (range) {
        this.reader.position(range.start);
        this.reader.select(range.start, range.end);
    } }
    private async followLink(target: string): Promise<void> { const current = this.reader.chapter; if (!current || !this.reader.book)
        return; const exact = this.reader.book.chapters.find(c => c.id === target); const [chapterPart, fragment] = target.includes('#') ? target.split('#') : exact ? [target, ''] : ['', target]; const chapter = this.reader.book.chapters.find(c => c.id === chapterPart || c.id.endsWith(chapterPart)); if (chapterPart && chapter && chapter.id !== current.id)
        await this.reader.navigate({ bookId: this.reader.book.id, versionId: this.reader.book.versionId, chapterId: chapter.id, offset: 0 }); const block = this.reader.chapter?.blocks.find(b => b.id === fragment || b.id.endsWith(fragment)); if (block) {
        this.reader.position(block.start);
        this.restoreBookAnchor();
    } }
    private async page(delta: number): Promise<void> { if (this.reader.state.mode === 'book' && this.reader.preferences.paginated) {
        const next = this.paper.scrollLeft + delta * this.paper.clientWidth;
        if (next >= 0 && next < this.paper.scrollWidth) {
            this.paper.scrollLeft = next;
            this.captureViewport();
            return;
        }
    } await this.reader.next(delta); }
    private closeDialog(): void { if (this.importing) {
        this.importing = false;
        void this.reader.api.cancelImport().catch(() => { });
    } this.dialogStore.clear(); this.transient?.replaceChildren(); }
    private dialog(title: string): HTMLElement { this.closeDialog(); const doc = this.root.ownerDocument; const backdrop = element(doc, 'div', 'reader-dialog-backdrop'); const panel = element(doc, 'section', 'reader-dialog'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title); panel.append(element(doc, 'h2', undefined, title)); this.button(panel, 'Close', () => this.closeDialog(), this.dialogStore); backdrop.append(panel); this.transient.append(backdrop); return panel; }
    private field(parent: HTMLElement, label: string, value = '', type = 'text'): HTMLInputElement { const wrap = element(parent.ownerDocument, 'label', 'reader-field'); wrap.append(element(parent.ownerDocument, 'span', undefined, label)); const input = element(parent.ownerDocument, 'input'); input.type = type; input.value = value; wrap.append(input); parent.append(wrap); return input; }
    private async importDialog(): Promise<void> { const panel = this.dialog('Import book'); this.importing = true; const file = this.field(panel, 'EPUB or TXT file', '', 'file'); file.accept = '.epub,.txt'; const title = this.field(panel, 'Title'); const author = this.field(panel, 'Author'); const alias = this.field(panel, 'Project alias'); const encoding = this.field(panel, 'TXT encoding', 'utf-8'); const split = this.field(panel, 'TXT chapter heading pattern'); const preview = element(panel.ownerDocument, 'div', 'reader-import-preview', 'Choose a file, then preview its chapters before importing.'); panel.append(preview); let bytes: Uint8Array | undefined; let filename = ''; let prepared: ReaderBook | undefined; let preparedOptions = ''; let preparedFile: File | undefined; const options = (): ReaderImportOptions => ({ title: title.value || undefined, author: author.value || undefined, alias: alias.value || undefined, encoding: encoding.value || undefined, splitPattern: split.value || undefined }); const refresh = async () => { const chosen = file.files?.[0]; if (!chosen)
        return; if (chosen.size > 64 * 1024 * 1024)
        throw new Error('File is too large'); filename = chosen.name; preparedFile = chosen; bytes = new Uint8Array(await chosen.arrayBuffer()); const selectedOptions = options(); prepared = await this.reader.api.previewImport(bytes, filename, selectedOptions); preparedOptions = JSON.stringify(selectedOptions); if (!panel.isConnected)
        return; preview.replaceChildren(element(panel.ownerDocument, 'h3', undefined, prepared.title), element(panel.ownerDocument, 'p', undefined, `${prepared.author} · ${prepared.chapters.length} chapters`)); for (const warning of prepared.warnings ?? [])
        preview.append(element(panel.ownerDocument, 'p', 'reader-warning', warning)); for (const chapter of prepared.chapters.slice(0, 100))
        preview.append(element(panel.ownerDocument, 'p', undefined, chapter.title)); }; this.button(panel, 'Preview chapters', refresh, this.dialogStore); this.button(panel, 'Import and open', async () => { if (!bytes || !prepared || file.files?.[0] !== preparedFile || JSON.stringify(options()) !== preparedOptions) {
        preview.textContent = 'Preview the selected file and current options first.';
        return;
    } const book = await this.reader.api.importBook(bytes, filename, options()); this.importing = false; this.closeDialog(); await this.reader.open(book); }, this.dialogStore); }
    private async libraryDialog(): Promise<void> { const panel = this.dialog('Library'); const filter = this.field(panel, 'Filter title, author, tag or project'); const sort = element(panel.ownerDocument, 'select'); for (const [value, text] of [['recent', 'Recently read'], ['title', 'Title'], ['status', 'Reading status']]) {
        const o = element(panel.ownerDocument, 'option', undefined, text);
        o.value = value;
        sort.append(o);
    } panel.append(sort); const list = element(panel.ownerDocument, 'div', 'reader-library'); panel.append(list); let books = await this.reader.api.listBooks(); let page = 0; if (!panel.isConnected)
        return; const render = () => { list.replaceChildren(); const needle = filter.value.toLocaleLowerCase(); const sorted = books.filter(b => [b.title, b.author, b.alias, ...b.tags].join(' ').toLocaleLowerCase().includes(needle)).sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title) : sort.value === 'status' ? a.status.localeCompare(b.status) : Number(!!b.position) - Number(!!a.position)); if (!sorted.length)
        list.append(element(panel.ownerDocument, 'p', undefined, 'No matching books. Import an EPUB or TXT file to begin.')); for (const book of sorted.slice(page * 12, (page + 1) * 12))
        this.libraryRow(list, book, async () => { books = await this.reader.api.listBooks(); render(); }); }; this.dialogStore.add(addDisposableListener(filter, 'input', () => { page = 0; render(); })); this.dialogStore.add(addDisposableListener(sort, 'change', render)); render(); this.button(panel, 'Previous books', () => { page = Math.max(0, page - 1); render(); }, this.dialogStore); this.button(panel, 'Next books', () => { page = Math.min(Math.floor(Math.max(0, books.length - 1) / 12), page + 1); render(); }, this.dialogStore); this.button(panel, 'Import book…', () => this.importDialog(), this.dialogStore); this.button(panel, 'Export backup…', () => this.reader.api.chooseBackupExport(), this.dialogStore); this.button(panel, 'Restore backup…', () => { const confirm = this.dialog('Restore backup'); confirm.append(element(confirm.ownerDocument, 'p', undefined, 'Restore replaces the current library after validation. Export a backup first if you want to keep this profile.')); this.button(confirm, 'Choose backup and restore', async () => { await this.reader.api.chooseBackupRestore(); this.closeDialog(); await this.reader.initialize(); }, this.dialogStore); }, this.dialogStore); }
    private libraryRow(list: HTMLElement, book: ReaderBookSummary, reload: () => Promise<void>): void { const doc = list.ownerDocument; const row = element(doc, 'div', 'reader-library-row'); row.append(element(doc, 'h3', undefined, book.title), element(doc, 'p', undefined, `${book.author} · ${book.status} · ${book.chapterCount} chapters`)); const alias = this.field(row, 'Project alias', book.alias); const tags = this.field(row, 'Tags', book.tags.join(', ')); const state = element(doc, 'select'); for (const value of ['unread', 'reading', 'finished'] as const) {
        const o = element(doc, 'option', undefined, value);
        o.value = value;
        o.selected = value === book.status;
        state.append(o);
    } row.append(state); this.button(row, book.position ? 'Continue' : 'Read', async () => { const full = await this.reader.api.getBookManifest(book.id, book.versionId); this.closeDialog(); if (book.position)
        await this.reader.navigate(book.position);
    else
        await this.reader.open(full); }, this.dialogStore); this.button(row, 'Save details', async () => { await this.reader.api.updateBook(book.id, { alias: alias.value, tags: tags.value.split(',').map(t => t.trim()).filter(Boolean), status: state.value as ReaderBookSummary['status'] }); await reload(); }, this.dialogStore); this.button(row, 'Remove…', () => { const confirm = this.dialog('Remove book'); confirm.append(element(doc, 'p', undefined, `Remove “${book.title}” and its reading data from this profile? Your source file stays on disk.`)); this.button(confirm, 'Remove book', async () => { await this.reader.api.removeBook(book.id); this.closeDialog(); await this.libraryDialog(); }, this.dialogStore); }, this.dialogStore); list.append(row); if (book.coverAssetId)
        void this.reader.api.getAsset(book.id, book.versionId, book.coverAssetId).then(asset => { if (!row.isConnected)
            return; const src = asset.data.length <= 2 * 1024 * 1024 ? safeAssetUrl(asset) : undefined; if (src) {
            const image = element(doc, 'img', 'reader-library-cover');
            image.src = src;
            image.alt = book.title;
            row.prepend(image);
        } }).catch(() => { }); }
    private tocDialog(): void { const bookMode = this.reader.state.mode === 'book'; const panel = this.dialog(bookMode ? 'Contents' : 'Outline'); if (!this.reader.book) {
        panel.append(element(panel.ownerDocument, 'p', undefined, 'Import a dataset to populate the outline.'));
        return;
    } for (const chapter of this.reader.book.chapters)
        this.button(panel, bookMode ? chapter.title : `src/modules/module-${String(chapter.ordinal + 1).padStart(4, '0')}.ts`, async () => { this.closeDialog(); await this.reader.navigate({ bookId: this.reader.book!.id, versionId: this.reader.book!.versionId, chapterId: chapter.id, offset: 0 }); }, this.dialogStore); this.button(panel, 'Back', () => this.reader.back(), this.dialogStore); }
    private searchDialog(): void { const panel = this.dialog('Find in datasets'); const query = this.field(panel, 'Text'); const accent = this.field(panel, 'Match without Vietnamese accents', '', 'checkbox'); const results = element(panel.ownerDocument, 'div', 'reader-search-results'); panel.append(results); let generation = 0; this.button(panel, 'Search', async () => { const current = ++generation; const found = await this.reader.api.search(query.value, { bookId: this.reader.book?.id, ignoreDiacritics: accent.checked }); if (!panel.isConnected || generation !== current)
        return; results.replaceChildren(); if (!found.length)
        results.append(element(panel.ownerDocument, 'p', undefined, 'No matches. Try a different phrase.')); for (const result of found.slice(0, 200))
        this.button(results, this.reader.state.mode === 'book' ? result.snippet : `module.ts  ${projectChapter(result.snippet, 1).text.split('\n').slice(3, 5).join(' ')}`, async () => { this.closeDialog(); await this.reader.navigate(result.anchor); }, this.dialogStore); }, this.dialogStore); query.focus(); }
    private addAnnotationDialog(): void { const range = this.selection() ?? { start: this.reader.state.anchor?.offset ?? 0, end: this.reader.state.anchor?.offset ?? 0 }; const panel = this.dialog('Add marker'); const note = this.field(panel, 'Note'); const color = element(panel.ownerDocument, 'select'); for (const value of ['yellow', 'blue', 'green']) {
        const option = element(panel.ownerDocument, 'option', undefined, value);
        option.value = value;
        color.append(option);
    } panel.append(color); for (const kind of ['bookmark', 'highlight', 'note'] as const)
        this.button(panel, kind === 'bookmark' ? 'Bookmark position' : kind === 'highlight' ? 'Highlight selection' : 'Save note', async () => { if (kind === 'highlight' && range.end === range.start) {
            panel.append(element(panel.ownerDocument, 'p', undefined, 'Select source text before adding a highlight.'));
            return;
        } await this.reader.annotate(kind, range.start, range.end > range.start ? range.end : undefined, note.value || undefined, color.value); this.closeDialog(); }, this.dialogStore); }
    private async annotationsDialog(): Promise<void> { const panel = this.dialog('Bookmarks and notes'); const annotations = await this.reader.api.listAnnotations(this.reader.book?.id); if (!panel.isConnected)
        return; if (!annotations.length)
        panel.append(element(panel.ownerDocument, 'p', undefined, 'Select text and use ＋ to add a highlight or note.')); for (const annotation of annotations) {
        const row = element(panel.ownerDocument, 'div', 'reader-note-row');
        this.button(row, this.reader.state.mode === 'book' ? `${annotation.kind}: ${annotation.note ?? annotation.anchor.quote ?? annotation.anchor.offset}` : `${annotation.kind} · offset ${annotation.anchor.offset}`, async () => { this.closeDialog(); await this.reader.navigate(annotation.anchor); }, this.dialogStore);
        this.button(row, 'Remove', async () => { await this.reader.api.removeAnnotation(annotation.id); this.reader.annotations = await this.reader.api.listAnnotations(this.reader.book?.id); this.reader.changed(); await this.annotationsDialog(); }, this.dialogStore);
        if (annotation.kind === 'note')
            this.button(row, 'Edit', () => { const edit = this.dialog('Edit note'); const value = this.field(edit, 'Note', annotation.note ?? ''); this.button(edit, 'Save note', async () => { await this.reader.api.saveAnnotation({ kind: 'note', anchor: annotation.anchor, endOffset: annotation.endOffset, note: value.value, color: annotation.color }); await this.reader.api.removeAnnotation(annotation.id); this.closeDialog(); this.reader.annotations = await this.reader.api.listAnnotations(this.reader.book?.id); this.reader.changed(); }, this.dialogStore); }, this.dialogStore);
        panel.append(row);
    } this.button(panel, 'Copy annotation export', async () => this.clipboard.writeText(await this.reader.api.exportAnnotations()), this.dialogStore); }
    private preferencesDialog(): void { const panel = this.dialog('Reading preferences'); const pref = this.reader.preferences; const size = this.field(panel, 'Text size', String(pref.fontSize), 'number'); size.min = '12'; size.max = '36'; const leading = this.field(panel, 'Line height', String(pref.lineHeight), 'number'); leading.min = '1'; leading.max = '3'; leading.step = '0.05'; const select = (label: string, values: string[], current: string) => { const wrap = element(panel.ownerDocument, 'label', 'reader-field'); wrap.append(element(panel.ownerDocument, 'span', undefined, label)); const s = element(panel.ownerDocument, 'select'); for (const value of values) {
        const o = element(panel.ownerDocument, 'option', undefined, value);
        o.value = value;
        o.selected = value === current;
        s.append(o);
    } wrap.append(s); panel.append(wrap); return s; }; const font = select('Typeface', ['Georgia', 'sans', 'mono'], pref.bookFont); const theme = select('Page theme', ['light', 'dark', 'sepia'], pref.bookTheme); const layout = select('Layout', ['scroll', 'one page', 'two pages'], pref.paginated ? pref.columns === 2 ? 'two pages' : 'one page' : 'scroll'); const minimap = this.field(panel, 'Show minimap', '', 'checkbox'); minimap.checked = pref.minimap; this.button(panel, 'Apply', async () => { const offset = this.reader.state.anchor?.offset; await this.reader.preferencesChanged({ fontSize: Math.max(12, Math.min(36, Number(size.value) || 19)), lineHeight: Math.max(1, Math.min(3, Number(leading.value) || 1.75)), bookFont: font.value, bookTheme: theme.value as typeof pref.bookTheme, paginated: layout.value !== 'scroll', columns: layout.value === 'two pages' ? 2 : 1, minimap: minimap.checked }); if (offset !== undefined)
        this.reader.position(offset); this.closeDialog(); }, this.dialogStore); }
    async copySource(): Promise<void> { if (!this.model || !this.projection)
        return; const range = this.code.getSelection(); if (range)
        await this.clipboard.writeText(copyCanonical(this.projection, this.model.getOffsetAt(range.getStartPosition()), this.model.getOffsetAt(range.getEndPosition()))); }
    async copyDisplay(): Promise<void> { const model = this.code.getModel(), range = this.code.getSelection(); if (model && range)
        await this.clipboard.writeText(model.getValueInRange(range)); }
    runReaderAction(action: string): void | Promise<void> { switch (action) {
        case 'library': return this.libraryDialog();
        case 'import': return this.importDialog();
        case 'find': return this.searchDialog();
        case 'preferences': return this.preferencesDialog();
        case 'annotations': return this.annotationsDialog();
        case 'addMarker': return this.addAnnotationDialog();
        case 'copySource': return this.copySource();
        case 'copyDisplay': return this.copyDisplay();
    } }
    override clearInput(): void { this.closeDialog(); this.code?.setModel(null); this.model?.dispose(); this.model = undefined; super.clearInput(); }
    override dispose(): void { this.model?.dispose(); this.coverModel?.dispose(); super.dispose(); }
}
