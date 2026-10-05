import { Event } from '../../../base/common/event.js';
/** Finite declarative catalog. There is intentionally no executable extension API. */
export class ReaderCatalog {
 readonly onDidRegisterExtensions = Event.None; readonly onDidChangeExtensionsStatus = Event.None;
 readonly onDidChangeExtensions = Event.None; readonly onWillActivateByEvent = Event.None;
 readonly extensions = [];
 async whenInstalledExtensionsRegistered(): Promise<boolean> { return true; }
 async activateByEvent(event: string): Promise<void> { throw new Error(`Extension activation unavailable: ${event}`); }
 activationEventIsDone(): boolean { return false; }
 getExtensionsStatus(): Record<string, never> { return {}; }
 async getExtension(): Promise<undefined> { return undefined; }
 async readExtensionPointContributions(): Promise<never[]> { return []; }
}
