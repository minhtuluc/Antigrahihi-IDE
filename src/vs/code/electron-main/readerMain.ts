import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { permittedAssetPath, isReaderSender } from './readerPolicy.js';
import { validateReaderRequest } from '../../platform/novelReader/common/readerIpc.js';
import { READER_LIMITS } from '../../platform/novelReader/common/reader.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const entry = 'reader://app/index.html';
app.setName('Workspace Reader');
app.setAppUserModelId('org.workspace.reader');
app.setPath('userData', process.env.READER_PROFILE || path.join(app.getPath('appData'), 'workspace-reader'));
protocol.registerSchemesAsPrivileged([{ scheme: 'reader', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
await app.whenReady();
Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'File', submenu: [{ role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }]));
await mkdir(app.getPath('userData'), { recursive: true });
protocol.handle('reader', async request => {
 const target = permittedAssetPath(request.url, root);
 if (!target) { return new Response('Denied', { status: 403 }); }
 const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
 try { return new Response(await readFile(target), { headers: { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' } }); } catch { return new Response('Not found', { status: 404 }); }
});
session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('reader://app/') && !details.url.startsWith('data:') && !details.url.startsWith('blob:') }));
session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
const io = utilityProcess.fork(path.join(root, 'readerIo.cjs'), [path.join(app.getPath('userData'), 'library')], { serviceName: 'Reader IO', stdio: 'pipe' });
io.stdout?.on('data', chunk => console.log(`[reader-io] ${chunk}`));
io.stderr?.on('data', chunk => console.error(`[reader-io] ${chunk}`));
let sequence = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
io.on('message', (message: { id: number; result?: unknown; error?: string }) => { const request = pending.get(message.id); pending.delete(message.id); if (message.error) { request?.reject(new Error(message.error)); } else { request?.resolve(message.result); } });
io.on('exit', code => { for (const request of pending.values()) { request.reject(new Error(`Reader IO exited ${code}`)); } pending.clear(); });
function call(request: unknown): Promise<unknown> { const validated = validateReaderRequest(request); const id = ++sequence; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); io.postMessage({ id, request: validated }); }); }
const window = new BrowserWindow({ width: 1440, height: 960, backgroundColor: '#1e1e1e', title: 'inventory-service — Workspace', webPreferences: { preload: path.join(root, 'readerPreload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', (event, url) => { if (url !== entry) { event.preventDefault(); } });
window.webContents.on('console-message', (_event, level, message) => console.log(`[renderer ${level}] ${message}`));
window.webContents.on('render-process-gone', (_event, detail) => console.error('Reader renderer exited', detail));
function assertSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void { if (event.sender !== window.webContents || !isReaderSender(event.senderFrame?.url, entry)) { throw new Error('Forbidden reader sender'); } }
ipcMain.handle('reader:request', (event, request) => { assertSender(event); return call(request); });
ipcMain.on('reader:title', (event, alias) => { assertSender(event); if (typeof alias !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(alias)) { return; } window.setTitle(`${alias} — Workspace`); });
ipcMain.handle('reader:dialog', async (event, kind) => {
 assertSender(event);
 if (kind === 'import' || kind === 'restore') {
  const selected = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: kind === 'import' ? [{ name: 'Local books', extensions: ['epub', 'txt'] }] : [{ name: 'Reader backup', extensions: ['readerbackup'] }] });
  if (selected.canceled || selected.filePaths.length !== 1) { return; }
  const filename = selected.filePaths[0];
  if ((await stat(filename)).size > (kind === 'import' ? READER_LIMITS.fileBytes : READER_LIMITS.backupBytes)) { throw new Error('Selected file exceeds budget'); }
  const bytes = new Uint8Array(await readFile(filename));
  return kind === 'import' ? call({ method: 'importBook', args: [bytes, path.basename(filename)] }) : call({ method: 'restoreBackup', args: [bytes] });
 }
 if (kind === 'export') {
  const selected = await dialog.showSaveDialog(window, { defaultPath: 'library.readerbackup' });
  if (selected.canceled || !selected.filePath) { return; }
  const bytes = await call({ method: 'exportBackup', args: [] });
  await writeFile(selected.filePath, bytes as Uint8Array); return;
 }
 throw new Error('Unknown native reader dialog');
});
await window.loadURL(entry);
if (process.env.READER_SCREENSHOT) { setTimeout(async () => { const capture = await window.webContents.capturePage(); await writeFile(process.env.READER_SCREENSHOT!, capture.toPNG()); console.log('READER_SCREENSHOT_READY'); if (process.env.READER_SMOKE_EXIT) { app.quit(); } }, 5000); }
let shutdownRequested = false;
let ioExited = false;
io.on('exit', () => { ioExited = true; if (shutdownRequested) { app.quit(); } });
app.on('before-quit', event => {
  if (!ioExited) { event.preventDefault(); if (!shutdownRequested) { shutdownRequested = true; io.postMessage({ control: 'shutdown' }); setTimeout(() => io.kill(), 3000); } }
});
app.on('window-all-closed', () => app.quit());
