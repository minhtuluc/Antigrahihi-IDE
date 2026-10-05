import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities, IEditorOpenContext } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { sceneDocument, SceneName } from '../common/scenes.js';
export class DecoyEditorInput extends EditorInput {
    static readonly ID = 'workbench.input.readerScene';
    constructor(readonly scene: SceneName, readonly line: string) { super(); }
    override get typeId(): string { return DecoyEditorInput.ID; }
    override getName(): string { return sceneDocument(this.scene, this.line).name; }
    override get resource(): URI { return URI.from({ scheme: 'reader-scene', authority: this.scene, path: `/src/${this.getName()}` }); }
    override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }
    override matches(other: unknown): boolean { return other instanceof DecoyEditorInput && other.scene === this.scene && other.line === this.line; }
}
export class DecoyEditorPane extends EditorPane {
    static readonly ID = 'workbench.editor.readerScene';
    private host!: HTMLElement;
    private code?: CodeEditorWidget;
    private diff?: DiffEditorWidget;
    private models: ITextModel[] = [];
    private dimension = new Dimension(800, 600);
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
    private readonly modelService: IModelService,
    @ILanguageService
    private readonly language: ILanguageService) { super(DecoyEditorPane.ID, group, telemetry, theme, storage); }
    protected override createEditor(parent: HTMLElement): void { this.host = parent.ownerDocument.createElement('div'); this.host.className = 'reader-scene-editor'; parent.append(this.host); }
    override async setInput(input: DecoyEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> { await super.setInput(input, options, context, token); this.clearScene(); const source = sceneDocument(input.scene, input.line).source; const model = this.modelService.createModel(source, this.language.createById('novel-script'), input.resource, true); this.models.push(model); if (input.scene === 'scm') {
        const original = this.modelService.createModel(source.replace('revision: 2', 'revision: 1').replace('  preserveOrder: true\n', ''), this.language.createById('novel-script'), URI.from({ scheme: 'reader-scene', authority: 'original', path: input.resource.path }), true);
        this.models.push(original);
        this.diff = this.instantiation.createInstance(DiffEditorWidget, this.host, { readOnly: true, originalEditable: false, renderSideBySide: true, renderOverviewRuler: false, minimap: { enabled: false } }, { originalEditor: { isSimpleWidget: true }, modifiedEditor: { isSimpleWidget: true } });
        this.diff.setModel({ original, modified: model });
    }
    else {
        this.code = this.instantiation.createInstance(CodeEditorWidget, this.host, { readOnly: true, domReadOnly: true, wordWrap: 'on', minimap: { enabled: true }, contextmenu: false }, { isSimpleWidget: true });
        this.code.setModel(model);
    } this.layout(this.dimension); }
    private clearScene(): void { this.code?.dispose(); this.diff?.dispose(); this.code = undefined; this.diff = undefined; for (const model of this.models)
        model.dispose(); this.models = []; this.host?.replaceChildren(); }
    override layout(d: Dimension): void { this.dimension = d; if (this.host) {
        this.host.style.height = `${d.height}px`;
        this.host.style.width = `${d.width}px`;
        this.code?.layout(d);
        this.diff?.layout(d);
    } }
    override focus(): void { super.focus(); this.code?.focus(); this.diff?.focus(); }
    override clearInput(): void { this.clearScene(); super.clearInput(); }
    override dispose(): void { this.clearScene(); super.dispose(); }
}
