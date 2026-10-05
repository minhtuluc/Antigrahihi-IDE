import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderFacade, ReaderStoreApi } from '../../platform/novelReader/common/reader.js';
const facade: Record<string, unknown> = {};
const methods: Array<Exclude<keyof ReaderStoreApi, 'close'>> = ['listBooks','getBook','getBookManifest','getChapter','getAsset','importBook','previewImport','cancelImport','removeBook','updateBook','savePosition','listAnnotations','saveAnnotation','removeAnnotation','search','getSession','saveSession','getPreferences','savePreferences','exportBackup','restoreBackup','exportAnnotations'];
for (const method of methods) { facade[method] = (...args: unknown[]) => ipcRenderer.invoke('reader:request', { method, args }); }
facade.chooseImport = () => ipcRenderer.invoke('reader:dialog', 'import');
facade.chooseBackupExport = () => ipcRenderer.invoke('reader:dialog', 'export');
facade.chooseBackupRestore = () => ipcRenderer.invoke('reader:dialog', 'restore');
facade.setWindowTitle = (alias: string) => { ipcRenderer.send('reader:title', alias); };
contextBridge.exposeInMainWorld('workspaceReader', Object.freeze(facade) as unknown as ReaderFacade);
