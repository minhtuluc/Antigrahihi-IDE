import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ts = createRequire(import.meta.url)('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function collect(path, declarationsOnly = false) {
 let entries;
 try { entries = await readdir(path, { withFileTypes: true }); }
 catch (error) { if (error.code === 'ENOENT') { return []; } throw error; }
 return (await Promise.all(entries.map(entry => entry.isDirectory() ? collect(resolve(path, entry.name), declarationsOnly)
  : (declarationsOnly ? entry.name.endsWith('.d.ts') : entry.name.endsWith('.ts')) ? [resolve(path, entry.name)] : []))).flat();
}
const defaults = ['src/vs/platform/novelReader', 'src/vs/workbench/contrib/novelReader',
 'src/vs/workbench/contrib/ideDecoy', 'src/vs/workbench/services/reader',
 'src/vs/code/electron-main/readerMain.ts', 'src/vs/code/electron-preload/readerPreload.ts',
 'src/vs/code/electron-utility/novelReader', 'src/vs/workbench/reader.ts', 'src/vs/workbench/reader.main.ts'];
const selected = process.argv.slice(2);
const sources = [];
for (const path of selected.length ? selected : defaults) {
 if (path.endsWith('.ts')) { if (ts.sys.fileExists(resolve(root, path))) { sources.push(resolve(root, path)); } }
 else { sources.push(...await collect(resolve(root, path))); }
}
if (!sources.length) { throw new Error('No reader TypeScript sources found.'); }
const typings = await collect(resolve(root, 'src/typings'), true);
const config = ts.readConfigFile(resolve(root, 'src/tsconfig.json'), ts.sys.readFile);
if (config.error) { throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n')); }
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root, 'src'), { noEmit: true }, resolve(root, 'src/tsconfig.json'));
parsed.options.types = [...new Set([...(parsed.options.types ?? []), 'node'])];
parsed.options.allowImportingTsExtensions = true; // Native test sources are bundled before execution.
parsed.options.paths = { ...parsed.options.paths, 'electron': [resolve(root, 'build/reader/typings/electron.d.ts')], 'electron/*': [resolve(root, 'build/reader/typings/electron.d.ts')] };
const program = ts.createProgram([...new Set([...sources, ...typings, resolve(root, 'src/vscode-dts/vscode.d.ts'), resolve(root, 'src/vs/monaco.d.ts')])], parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const formatHost = { getCanonicalFileName: path => path, getCurrentDirectory: () => root, getNewLine: () => '\n' };
console.log(`Reader typecheck: ${sources.length} selected sources, ${program.getSourceFiles().length} transitive files.`);
if (diagnostics.length) {
 console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
 console.error(`${diagnostics.length} diagnostic(s).`);
 process.exitCode = 1;
} else { console.log('No TypeScript diagnostics.'); }
