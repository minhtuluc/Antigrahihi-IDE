import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, '.reader-out');
await mkdir(output, { recursive: true });
const productCuts = { 'globalCompositeBar.js': 'src/vs/workbench/services/reader/readerGlobalCompositeBar.ts', 'remoteAgentService.js': 'src/vs/workbench/services/reader/readerLocalConnection.ts' };
const cuts = { name: 'reader-composition-cuts', setup(build) { build.onResolve({ filter: /codicon\.ttf$/ }, () => ({ path: require.resolve('@vscode/codicons/dist/codicon.ttf') })); build.onResolve({ filter: /(?:globalCompositeBar|remoteAgentService)\.js$/ }, args => ({ path: path.join(root, productCuts[path.basename(args.path)]) })); } };
const shared = { absWorkingDir: root, bundle: true, metafile: true, sourcemap: true, logLevel: 'warning', tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } }, loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.svg': 'file', '.png': 'file' }, nodePaths: [path.join(root, 'build/reader/node_modules'), path.join(root, 'node_modules')] };
const result = {};
for (const [name, entry, platform, format, extension] of [
 ['reader', 'src/vs/workbench/reader.main.ts', 'browser', 'esm', 'js'],
 ['readerMain', 'src/vs/code/electron-main/readerMain.ts', 'node', 'esm', 'mjs'],
 ['readerPreload', 'src/vs/code/electron-preload/readerPreload.ts', 'node', 'cjs', 'cjs'],
 ['readerIo', 'src/vs/code/electron-utility/novelReader/readerIo.ts', 'node', 'cjs', 'cjs']
]) {
 result[name] = await esbuild.build({ ...shared, entryPoints: [entry], outfile: path.join(output, `${name}.${extension}`), platform, format, target: platform === 'node' ? 'node24' : 'chrome142', external: platform === 'node' ? ['electron', 'node:*'] : [], plugins: [cuts] });
 await writeFile(path.join(output, `${name}.meta.json`), JSON.stringify(result[name].metafile, null, 2));
}
const inputs = [...new Set(Object.values(result).flatMap(r => Object.keys(r.metafile.inputs)))].sort();
const forbidden = inputs.filter(p => /(?:contrib\/(?:terminal|scm|debug|tasks|testing|chat|mcp|notebook)|services\/(?:agentHost|authentication|remote|extensions\/(?:browser\/extensionService|electron-browser))|platform\/(?:terminal|agentHost|mcp|git)\/(?:node|electron)|node_modules\/(?:node-pty|@vscode\/ripgrep|@github\/copilot))/.test(p));
if (forbidden.length) throw new Error(`Forbidden product modules:\n${forbidden.join('\n')}`);
await writeFile(path.join(output, 'inventory.json'), JSON.stringify({ entrypoints: Object.keys(result), inputs, forbidden, nativeDependencies: [], capabilities: ['reader:request', 'reader:dialog', 'reader:title'], processes: ['electron-main', 'renderer', 'gpu', 'reader-io'], substitutions: productCuts }, null, 2));
await cp(path.join(root, 'extensions/theme-defaults/themes'), path.join(output, 'themes'), { recursive: true });
await cp(path.join(root, 'LICENSE.txt'), path.join(output, 'LICENSE.txt'));
await writeFile(path.join(output, 'index.html'), `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:;"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="reader.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1e1e1e}</style></head><body><script type="module" src="reader.js"></script></body></html>`);
console.log(`Reader allowlist artifact: ${output}; ${inputs.length} inputs.`);
