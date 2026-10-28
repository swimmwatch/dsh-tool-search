import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

const sdk = '@deepseek-ai/dsh-client-ui-primitives';
const output = new URL('../.local/ui-sdk/index.mjs', import.meta.url);
registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? {
          format: 'module',
          shortCircuit: true,
          source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))};`,
        }
      : nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    return specifier === sdk
      ? { url: output.href, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
