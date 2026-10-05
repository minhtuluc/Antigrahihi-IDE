import { ReaderStore } from '../../../platform/novelReader/node/readerStore.js';
import { createReaderIoHandler } from './readerIoHandler.js';
type ParentMessage = { id: number; request: unknown } | { control: 'shutdown' };
const port = (process as typeof process & { parentPort: { on(name: string, fn: (event: { data: ParentMessage }) => void): void; postMessage(data: unknown): void } }).parentPort;
const store = new ReaderStore(process.argv[2]);
const handle = createReaderIoHandler(store, value => port.postMessage(value));
port.on('message', async ({ data }) => {
 if ('control' in data) { if (data.control === 'shutdown') { await store.cancelImport(); await store.close(); process.exit(0); } return; }
 await handle(data);
});
