import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { clientSharedModules } from '../scripts/client-shared-modules.js';

function compile(contents: string) {
  return build({
    stdin: { contents, loader: 'tsx' },
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [clientSharedModules],
  });
}

await test('client bundles retain only verified host module identities', async () => {
  const result = await compile(`
    import { createElement } from 'react';
    import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
    export const element = createElement(Button, null, <span>Save</span>);
  `);
  const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
  assert.deepEqual(imports.map((item) => item.path).sort(), [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react/jsx-runtime',
  ]);
  assert.ok(imports.every((item) => item.external));
});

await test('client build rejects unprovided DSH modules and React subpaths', async () => {
  for (const name of [
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-api-remotes/client',
    'react/server',
  ]) {
    await assert.rejects(
      compile(`import * as module from ${JSON.stringify(name)}; export { module };`),
      { message: new RegExp(`Unsupported shared browser module: ${name}`) },
    );
  }
});

await test('client contract imports stay type-only and create no module request', async () => {
  const result = await compile(`
    import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
    export function summary(props: PluginConfigViewProps) { return props.view; }
  `);
  assert.deepEqual(
    Object.values(result.metafile.outputs).flatMap((output) => output.imports),
    [],
  );
});
