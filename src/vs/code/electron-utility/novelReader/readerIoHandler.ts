import { dispatchReaderRequest } from '../../../platform/novelReader/common/readerIpc.js';
import type { ReaderStoreApi } from '../../../platform/novelReader/common/reader.js';
export type ReaderIoReply = { id: number; result?: unknown; error?: string };
export function createReaderIoHandler(store: ReaderStoreApi, reply: (value: ReaderIoReply) => void): (value: { id: number; request: unknown }) => Promise<void> {
 return async value => {
  if (!Number.isSafeInteger(value.id) || value.id < 1) { throw new Error('Invalid IO request identity'); }
  // No global request queue: cancellation is delivered while a parser is awaiting IO.
  try { reply({ id: value.id, result: await dispatchReaderRequest(store, value.request) }); }
  catch (error) { reply({ id: value.id, error: error instanceof Error ? error.message : 'Reader operation failed' }); }
 };
}
