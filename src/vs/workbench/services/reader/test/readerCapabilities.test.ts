import { describe as suite, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { ReaderCommandService } from '../readerCommandService.js';
import { ReaderCatalog } from '../readerCatalog.js';
suite('reader finite runtime contracts', () => {
 test('unknown command rejects without activation or service lookup', async () => {
  const service = new ReaderCommandService({ invokeFunction() { throw new Error('Unexpected invocation'); } } as any);
  await assert.rejects(service.executeCommand('workbench.action.terminal.new'), /Unavailable reader command/);
  await assert.rejects(service.executeCommand('workbench.action.chat.open'), /Unavailable reader command/);
 });
 test('static catalog barrier resolves and cannot activate an extension', async () => {
  const catalog = new ReaderCatalog();
  assert.equal(await catalog.whenInstalledExtensionsRegistered(), true);
  assert.deepEqual(catalog.extensions, []);
  await assert.rejects(catalog.activateByEvent('onStartupFinished'), /activation unavailable/);
 });
});
