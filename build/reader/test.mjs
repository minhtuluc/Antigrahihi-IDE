// Reader tests use the pinned build Node and existing, read-only esbuild dependency.
import { createRequire } from 'node:module';
import { readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.url)('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const roots = process.argv.slice(2);
const paths = roots.length ? roots.map(path => resolve(root, path)) : [
 resolve(root, 'src/vs/platform/novelReader'),
 resolve(root, 'src/vs/workbench/contrib/novelReader'),
 resolve(root, 'src/vs/workbench/contrib/ideDecoy'),
 resolve(root, 'src/vs/workbench/services/reader'),
 resolve(root, 'build/reader/test'),
 resolve(root, 'test/reader')
];
async function collect(path) {
 if (/\.test\.(ts|mjs)$/.test(path)) { return [path]; }
 let entries;
 try { entries = await readdir(path, { withFileTypes: true }); }
 catch (error) { if (error.code === 'ENOENT') { return []; } throw error; }
 return (await Promise.all(entries.map(entry => entry.isDirectory()
  ? collect(resolve(path, entry.name))
  : /\.test\.(ts|mjs)$/.test(entry.name) ? [resolve(path, entry.name)] : []))).flat();
}
const tests = [...new Set((await Promise.all(paths.map(collect))).flat())].sort();
if (!tests.length) { throw new Error('No reader tests found.'); }
const out = resolve(root, '.reader-tests');
await mkdir(out, { recursive: true });
const bundled = [];
for (const test of tests) {
 const output = resolve(out, relative(root, test).replaceAll('/', '__').replace(/\.(ts|mjs)$/, '.mjs'));
 await build({ entryPoints: [test], outfile: output, bundle: true, platform: 'node', format: 'esm',
  packages: 'external', target: 'node24', sourcemap: 'inline',
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } });
 bundled.push(output);
}
const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', ...bundled], { cwd: root, stdio: 'inherit', timeout: 60000 });
if (result.error) { throw result.error; }
process.exitCode = result.status ?? 1;
