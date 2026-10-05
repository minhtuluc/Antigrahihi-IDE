import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize2 } from '../../../../nls.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IReaderService, ReaderService } from './readerService.js';
import { ReaderEditorPane } from './readerEditorPane.js';
import { ReaderEditorInput } from './readerEditorInput.js';
import { ReaderExplorerView } from './readerViews.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
registerSingleton(IReaderService, ReaderService, InstantiationType.Delayed);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(ReaderEditorPane, ReaderEditorPane.ID, 'Workspace'), [new SyncDescriptor(ReaderEditorInput)]);
const explorer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({ id: 'workbench.view.readerExplorer', title: localize2('reader.explorer', 'Explorer'), icon: Codicon.files, ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.readerExplorer', { mergeViewWithContainerWhenSingleView: false }]), storageId: 'readerExplorer', order: 0 }, ViewContainerLocation.Sidebar);
Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([{ id: 'reader.explorer', name: localize2('reader.datasets', 'Workspace'), ctorDescriptor: new SyncDescriptor(ReaderExplorerView), canToggleVisibility: true, canMoveView: true, weight: 70, order: 0 }, { id: 'reader.outline', name: localize2('reader.outline', 'Outline'), ctorDescriptor: new SyncDescriptor(ReaderExplorerView), canToggleVisibility: true, canMoveView: true, weight: 30, order: 1 }], explorer);
class ReaderStartup {
    constructor(
    @IReaderService
    reader: IReaderService,
    @IEditorService
    editor: IEditorService,
    @IInstantiationService
    instantiation: IInstantiationService) {
        // Open the preloaded neutral source immediately; canonical restore happens after first paint.
        void editor.openEditor(instantiation.createInstance(ReaderEditorInput), { pinned: true }).then(() => reader.initialize()).catch(() => { });
    }
}
registerWorkbenchContribution2('workbench.contrib.workspaceReader', ReaderStartup, WorkbenchPhase.AfterRestored);
registerAction2(class extends Action2 {
    constructor() { super({ id: 'reader.toggleMode', title: localize2('reader.toggleMode', 'Workspace: Toggle reading view'), f1: true }); }
    run(a: ServicesAccessor): void { const r = a.get(IReaderService); r.mode(r.state.mode === 'book' ? 'code' : 'book'); }
});
registerAction2(class extends Action2 {
    constructor() { super({ id: 'reader.cover', title: localize2('reader.cover', 'Workspace: Cover / Resume'), f1: true, keybinding: { weight: 200, primary: KeyCode.F9 } }); }
    run(a: ServicesAccessor): void { const r = a.get(IReaderService); r.state.covered ? r.uncover() : r.cover(); }
});
registerAction2(class extends Action2 {
    constructor() { super({ id: 'reader.next', title: localize2('reader.next', 'Workspace: Next module'), f1: true }); }
    run(a: ServicesAccessor): Promise<void> { return a.get(IReaderService).next(1); }
});
registerAction2(class extends Action2 {
    constructor() { super({ id: 'reader.previous', title: localize2('reader.previous', 'Workspace: Previous module'), f1: true }); }
    run(a: ServicesAccessor): Promise<void> { return a.get(IReaderService).next(-1); }
});
registerAction2(class extends Action2 {
    constructor() { super({ id: 'reader.back', title: localize2('reader.back', 'Workspace: Navigate back'), f1: true }); }
    run(a: ServicesAccessor): Promise<void> { return a.get(IReaderService).back(); }
});
for (const [command, label] of Object.entries({ library: 'Datasets', import: 'Import Dataset…', find: 'Find in datasets', preferences: 'Reading preferences', annotations: 'Markers', addMarker: 'Add marker', copySource: 'Copy source text', copyDisplay: 'Copy Display' }))
    registerAction2(class extends Action2 {
        constructor() { super({ id: `reader.${command}`, title: localize2(`reader.${command}`, `Workspace: ${label}`), f1: true }); }
        async run(a: ServicesAccessor): Promise<void> { const pane = a.get(IEditorService).activeEditorPane; if (pane instanceof ReaderEditorPane)
            await pane.runReaderAction(command); }
    });
