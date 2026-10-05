import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IReaderService } from './readerService.js';
import type { ReaderBookSummary } from '../../../../platform/novelReader/common/reader.js';
interface ReaderRow {
    label: string;
    description: string;
    book?: ReaderBookSummary;
    chapterId?: string;
}
export class ReaderExplorerView extends ViewPane {
    private list?: WorkbenchList<ReaderRow>;
    private reader?: IReaderService;
    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);
        this.reader = this.instantiationService.invokeFunction(a => a.get(IReaderService));
        this.list = this._register(this.instantiationService.createInstance(WorkbenchList<ReaderRow>, 'workspace-reader-explorer', container, { getHeight: () => 30, getTemplateId: () => 'module' }, [{ templateId: 'module', renderTemplate: (node: HTMLElement) => { const label = node.ownerDocument.createElement('span'); label.className = 'codicon codicon-file-code'; const text = node.ownerDocument.createElement('span'); text.style.marginLeft = '8px'; node.append(label, text); return text; }, renderElement: (row: ReaderRow, _index: number, node: HTMLElement) => { node.textContent = row.label; node.title = row.description; }, disposeTemplate: () => { } }], { identityProvider: { getId: row => row.book?.id ?? row.chapterId ?? row.label }, accessibilityProvider: { getAriaLabel: row => row.label, getWidgetAriaLabel: () => this.id.endsWith('outline') ? 'Outline' : 'Explorer' } }));
        this._register(this.list.onDidOpen(e => { const row = e.element; if (!row || !this.reader)
            return; if (row.book) {
            const book = row.book;
            void (book.position ? this.reader.navigate(book.position) : this.reader.api.getBookManifest(book.id, book.versionId).then(full => this.reader!.open(full)));
        }
        else if (row.chapterId && this.reader.book)
            void this.reader.navigate({ bookId: this.reader.book.id, versionId: this.reader.book.versionId, chapterId: row.chapterId, offset: 0 }); }));
        this._register(this.reader.subscribe(() => { void this.refresh(); }));
        void this.refresh();
    }
    private async refresh(): Promise<void> {
        if (!this.reader || !this.list)
            return;
        const isBook = this.reader.state.mode === 'book' && !this.reader.state.covered;
        let rows: ReaderRow[];
        if (this.id.endsWith('outline'))
            rows = this.reader.state.covered ? [{ label: 'module0001', description: 'src/modules/module-0001.ts' }] : (this.reader.book?.chapters ?? []).map(c => ({ label: isBook ? c.title : `module-${String(c.ordinal + 1).padStart(4, '0')}.ts`, description: isBook ? c.title : 'src/modules', chapterId: c.id }));
        else if (this.reader.state.covered)
            rows = [{ label: 'inventory-service', description: 'Workspace' }, { label: 'src/modules', description: 'Modules' }, { label: 'module-0001.ts', description: 'TypeScript' }];
        else {
            const books = await this.reader.api.listBooks();
            rows = books.length ? books.map(book => ({ label: isBook ? book.title : book.alias, description: isBook ? book.author : 'Workspace dataset', book })) : [{ label: 'inventory-service', description: 'Import Dataset… to begin' }, { label: 'src/modules/module-0001.ts', description: 'TypeScript' }];
        }
        this.list.splice(0, this.list.length, rows);
    }
    protected override layoutBody(height: number, width: number): void { super.layoutBody(height, width); this.list?.layout(height, width); }
    override focus(): void { super.focus(); this.list?.domFocus(); }
}
