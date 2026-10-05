import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
test('reader product has secure dedicated composition entries', () => {
 for (const file of ['src/vs/code/electron-main/readerMain.ts','src/vs/code/electron-preload/readerPreload.ts','src/vs/code/electron-utility/novelReader/readerIo.ts','src/vs/workbench/reader.main.ts','build/reader/build.mjs','build/reader/run.mjs']) assert.ok(existsSync(file), `Missing ${file}`);
 const main = readFileSync('src/vs/code/electron-main/readerMain.ts','utf8');
 assert.match(main,/contextIsolation: true/); assert.match(main,/nodeIntegration: false/); assert.match(main,/utilityProcess\.fork/); assert.match(main,/setWindowOpenHandler/);
 const renderer = readFileSync('src/vs/workbench/reader.main.ts','utf8');
 assert.match(renderer,/new Workbench\(document.body/);
 assert.doesNotMatch(renderer,/workbench\.(common|desktop|browser)\.main/);
});
test('local scheme rejects remote and path escapes', async () => {
 const { permittedAssetPath, isReaderSender } = await import('../policy.mjs');
 assert.equal(permittedAssetPath('https://evil.test/a','/app'), undefined);
 assert.equal(permittedAssetPath('reader://app/%2e%2e/%2e%2e/secret','/app'), undefined);
 assert.equal(permittedAssetPath('reader://app/main.js','/app'), '/app/main.js');
 assert.equal(isReaderSender('reader://app/index.html','reader://app/index.html'),true);
 assert.equal(isReaderSender('reader://app/other.html','reader://app/index.html'),false);
});
