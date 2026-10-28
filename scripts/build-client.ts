import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { z } from 'zod';
import { clientSharedModules, isSharedBrowserModule } from './client-shared-modules.js';

const manifest = z
  .object({ name: z.string() })
  .parse(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')));

const SHARED_BROWSER_MODULES = new Set([
  'src/constants.ts',
  'src/embedding-settings.ts',
  'src/core/shared/types.ts',
]);

const result = await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  plugins: [clientSharedModules],
  metafile: true,
  write: false,
  banner: {
    js: `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;`,
  },
  footer: { js: 'return module.exports;}});' },
});

// Validate the full import graph before emitting the bundle. Tree-shaking must
// not be the boundary that keeps server implementations out of the browser.
for (const input of Object.keys(result.metafile.inputs)) {
  assert.ok(
    input.startsWith('src/client/') || SHARED_BROWSER_MODULES.has(input),
    `Non-client module in the browser dependency graph: ${input}`,
  );
}
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    assert.ok(
      dependency.external && isSharedBrowserModule(dependency.path),
      `Unexpected browser runtime dependency: ${dependency.path}`,
    );
  }
}
await mkdir('dist', { recursive: true });
await Promise.all(result.outputFiles.map((file) => writeFile(file.path, file.contents)));
