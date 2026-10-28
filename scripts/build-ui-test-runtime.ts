import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sdk = '@deepseek-ai/dsh-client-ui-primitives';
const output = new URL('../.local/ui-sdk/index.mjs', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
// Execute the real SDK controls in Node. CSS modules are compiled by esbuild;
// unrelated browser-only exports and their host-provided imports are eliminated.
await build({
  stdin: {
    contents: `export { Button, Input, Switch, SegmentedControl, SettingsForm, SettingsFormModel, SettingsSecretField } from '${sdk}';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: fileURLToPath(output),
  loader: { '.css': 'local-css' },
  plugins: [
    {
      name: 'host-externals',
      setup(builder) {
        builder.onResolve({ filter: /^[\w@]/ }, (args) =>
          args.path === sdk ? undefined : { path: args.path, external: true, sideEffects: false },
        );
      },
    },
  ],
});
