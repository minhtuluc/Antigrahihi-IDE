import '../../browser/parts/media/globalCompositeBar.css';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { Action, IAction } from '../../../base/common/actions.js';
import { ActionBar, ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { GLOBAL_ACTIVITY_ID, ACCOUNTS_ACTIVITY_ID } from '../../common/activity.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
export function isAccountsActionVisible(): boolean { return true; }
/** Product composition substitutes only the account/manage affordance: no auth, host or secrets. */
export class GlobalCompositeBar extends Disposable {
 static readonly ACCOUNTS_ICON = Codicon.account;
 readonly element = document.createElement('div');
 readonly onDidChange = Event.None;
 private readonly bar: ActionBar;
 constructor(provider: () => IAction[], _colors: unknown, _hover: unknown, @IContextMenuService private readonly menus: IContextMenuService) {
  super(); this.element.className = 'global-activity';
  this.bar = this._register(new ActionBar(this.element, { orientation: ActionsOrientation.VERTICAL }));
  this.bar.push(new Action(ACCOUNTS_ACTIVITY_ID, 'Account', ThemeIcon.asClassName(Codicon.account), true, async () => this.showScene()), { icon: true, label: false });
  this.bar.push(new Action(GLOBAL_ACTIVITY_ID, 'Manage', ThemeIcon.asClassName(Codicon.settingsGear), true, async () => { menus.showContextMenu({ getAnchor: () => this.element, getActions: provider }); }), { icon: true, label: false });
 }
 private showScene(): void { this.menus.showContextMenu({ getAnchor: () => this.element, getActions: () => [new Action('reader.decoy.localAccount', 'Local workspace', undefined, false)] }); }
 create(parent: HTMLElement): void { parent.appendChild(this.element); }
 getContextMenuActions(): IAction[] { return []; }
 getHeight(height: number, gap = 0): number { return 2 * height + gap; }
 focus(): void { this.bar.focus(); }
}
export class AccountsActivityActionViewItem extends ActionViewItem {
 static readonly ACCOUNTS_VISIBILITY_PREFERENCE_KEY = 'reader.decoy.accounts';
 constructor(_provider: unknown, options: IBaseActionViewItemOptions, _alignment: unknown, _transform: unknown) { super(undefined, new Action(ACCOUNTS_ACTIVITY_ID, 'Local workspace', ThemeIcon.asClassName(Codicon.account)), options); }
}
export class SimpleAccountActivityActionViewItem extends ActionViewItem {
 constructor(_hover: unknown, options: IBaseActionViewItemOptions) { super(undefined, new Action(ACCOUNTS_ACTIVITY_ID, 'Local workspace', ThemeIcon.asClassName(Codicon.account)), options); }
}
export class SimpleGlobalActivityActionViewItem extends ActionViewItem {
 constructor(_hover: unknown, options: IBaseActionViewItemOptions) { super(undefined, new Action(GLOBAL_ACTIVITY_ID, 'Manage', ThemeIcon.asClassName(Codicon.settingsGear)), options); }
}
