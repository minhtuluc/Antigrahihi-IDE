import './ideDecoy.css';
import { localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DecoyEditorInput, DecoyEditorPane } from './decoyEditor.js';
import { getScene, replayTerminal, DECOY_ACTIONS, SceneName } from '../common/scenes.js';
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(DecoyEditorPane, DecoyEditorPane.ID, 'Workspace source'), [new SyncDescriptor(DecoyEditorInput)]);
export class DecoyView extends ViewPane {
    private list?: WorkbenchList<string>;
    private scene: SceneName = 'terminal';
    private toggled = false;
    private lines: string[] = [];
    private input?: HTMLInputElement;
    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);
        container.classList.add('ide-decoy');
        this.scene = this.id.slice(this.id.lastIndexOf('.') + 1) as SceneName;
        this.lines = getScene(this.scene);
        const host = container.ownerDocument.createElement('div');
        host.className = 'ide-decoy-list';
        container.append(host);
        this.list = this._register(this.instantiationService.createInstance(WorkbenchList<string>, 'workspace-decoy', host, { getHeight: () => 28, getTemplateId: () => 'scene' }, [{ templateId: 'scene', renderTemplate: (node: HTMLElement) => { const label = node.ownerDocument.createElement('span'); label.className = 'ide-decoy-line'; node.append(label); return label; }, renderElement: (line: string, _i: number, node: HTMLElement) => { node.textContent = line; }, disposeTemplate: () => { } }], { accessibilityProvider: { getAriaLabel: line => line, getWidgetAriaLabel: () => `${this.scene} scene` } }));
        this.list.splice(0, 0, this.lines);
        this._register(this.list.onDidOpen(e => { if (!e.element)
            return; this.list?.setSelection([this.lines.indexOf(e.element)]); if (this.scene === 'scm' && /^[MA]  /.test(e.element) || this.scene === 'testing' && e.element.startsWith('✓') || this.scene === 'debug' && e.element.includes('.ts')) {
            const editor = this.instantiationService.invokeFunction(a => a.get(IEditorService));
            void editor.openEditor(new DecoyEditorInput(this.scene, e.element), { pinned: true });
        } }));
        const controls = container.ownerDocument.createElement('div');
        controls.className = 'ide-decoy-controls';
        const action = container.ownerDocument.createElement('button');
        action.type = 'button';
        action.textContent = this.scene === 'debug' ? 'Continue' : this.scene === 'testing' ? 'Replay results' : this.scene === 'extensions' ? 'Toggle scene extension' : this.scene === 'chat' ? 'Replay reply' : 'Reset scene';
        controls.append(action);
        this._register(addDisposableListener(action, 'click', () => { this.toggled = !this.toggled; this.lines = getScene(this.scene); if (this.scene === 'debug')
            this.lines[1] = this.toggled ? 'Running fixture' : 'Paused on breakpoint'; if (this.scene === 'extensions')
            this.lines[1] = this.toggled ? 'Disabled in this scene' : 'Active in this workspace'; if (this.scene === 'chat')
            this.lines.push('Assistant: Review the registry boundary fixture next.'); this.list?.splice(0, this.list.length, this.lines); }));
        if (this.scene === 'terminal' || this.scene === 'chat') {
            const input = container.ownerDocument.createElement('input');
            input.type = 'text';
            input.className = 'ide-decoy-input';
            input.maxLength = 1024;
            input.placeholder = this.scene === 'terminal' ? 'inventory-service >' : 'Message';
            input.setAttribute('aria-label', this.scene === 'terminal' ? 'Scene command' : 'Scene message');
            this.input = input;
            controls.prepend(input);
            this._register(addDisposableListener(input, 'keydown', (e: KeyboardEvent) => { if (e.key !== 'Enter')
                return; e.preventDefault(); this.lines = this.scene === 'terminal' ? replayTerminal(this.lines, input.value) : [...this.lines, `You: ${input.value.slice(0, 1024)}`, 'Assistant: The local fixture has no additional response.'].slice(-100); input.value = ''; this.list?.splice(0, this.list.length, this.lines); if (this.list?.length)
                this.list.reveal(this.list.length - 1); }));
        }
        container.append(controls);
    }
    protected override layoutBody(height: number, width: number): void { super.layoutBody(height, width); this.list?.layout(Math.max(0, height - 42), width); }
    override focus(): void { super.focus(); this.input ? this.input.focus() : this.list?.domFocus(); }
}
const definitions: {
    scene: SceneName;
    name: string;
    icon: typeof Codicon.terminal;
    location: ViewContainerLocation;
}[] = [{ scene: 'terminal', name: 'Terminal', icon: Codicon.terminal, location: ViewContainerLocation.Panel }, { scene: 'scm', name: 'Source Control', icon: Codicon.sourceControl, location: ViewContainerLocation.Sidebar }, { scene: 'debug', name: 'Run and Debug', icon: Codicon.debugAlt, location: ViewContainerLocation.Sidebar }, { scene: 'testing', name: 'Testing', icon: Codicon.beaker, location: ViewContainerLocation.Sidebar }, { scene: 'extensions', name: 'Extensions', icon: Codicon.extensions, location: ViewContainerLocation.Sidebar }, { scene: 'chat', name: 'Chat', icon: Codicon.commentDiscussion, location: ViewContainerLocation.AuxiliaryBar }, { scene: 'problems', name: 'Problems', icon: Codicon.warning, location: ViewContainerLocation.Panel }, { scene: 'output', name: 'Output', icon: Codicon.output, location: ViewContainerLocation.Panel }];
for (const def of definitions) {
    const id = `reader.decoy.container.${def.scene}`;
    const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({ id, title: localize2(id, def.name), icon: def.icon, ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true }]), storageId: id, order: definitions.indexOf(def) + 1 }, def.location);
    Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([{ id: `reader.decoy.view.${def.scene}`, name: localize2(`${id}.view`, def.name), ctorDescriptor: new SyncDescriptor(DecoyView), canToggleVisibility: true, canMoveView: true }], container);
}
for (const [id, scene] of Object.entries(DECOY_ACTIONS))
    registerAction2(class extends Action2 {
        constructor() { super({ id, title: localize2(id, `Workspace: Show ${scene}`), f1: true }); }
        async run(a: ServicesAccessor): Promise<void> { await a.get(IViewsService).openView(`reader.decoy.view.${scene}`, true); }
    });
