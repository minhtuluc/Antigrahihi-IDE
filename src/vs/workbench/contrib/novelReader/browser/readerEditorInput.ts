import { URI } from '../../../../base/common/uri.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { IReaderService } from './readerService.js';
export class ReaderEditorInput extends EditorInput {
    static readonly ID = 'workbench.input.workspaceReader';
    constructor(
    @IReaderService
    private readonly reader: IReaderService) { super(); this._register(reader.subscribe(() => this._onDidChangeLabel.fire())); }
    override get typeId(): string { return ReaderEditorInput.ID; }
    override get editorId(): string { return 'workbench.editor.workspaceReader'; }
    override get resource(): URI { return URI.from({ scheme: 'novel', authority: 'workspace', path: '/src/modules/module.ts' }); }
    override getName(): string { return this.reader.state.covered ? 'module-0001.ts' : this.reader.state.mode === 'book' ? this.reader.book?.title ?? 'Library' : `module-${String((this.reader.chapter?.ordinal ?? 0) + 1).padStart(4, '0')}.ts`; }
    override getDescription(): string { return this.reader.state.covered ? 'inventory-service' : this.reader.state.mode === 'book' ? this.reader.book?.author ?? '' : this.reader.book?.alias ?? 'inventory-service'; }
    override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly; }
    override matches(other: unknown): boolean { return other instanceof ReaderEditorInput; }
}
