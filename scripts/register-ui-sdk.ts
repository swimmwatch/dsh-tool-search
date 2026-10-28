import { registerHooks } from 'node:module';

const sdk = '@deepseek-ai/dsh-client-ui-primitives';
const output = new URL('../.local/ui-sdk/index.mjs', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === sdk
      ? { url: output.href, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
