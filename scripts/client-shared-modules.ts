import type { Plugin } from 'esbuild';

// This plugin's subset of the shell-seeded modules in DSH 0.2.1-rc.2:
// https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/client/web/src/platform.ts
// Service injection does not supply a JavaScript module. Extend this set only
// after checking the pinned host's module table, never by namespace wildcard.
const SHARED_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]);

export const clientSharedModules: Plugin = {
  name: 'dsh-shared-browser-modules',
  setup(build) {
    build.onResolve({ filter: /^(?:react(?:\/|$)|@deepseek-ai\/)/ }, ({ path }) => {
      if (!SHARED_MODULES.has(path)) {
        return { errors: [{ text: `Unsupported shared browser module: ${path}` }] };
      }
      return { path, external: true };
    });
  },
};

export function isSharedBrowserModule(specifier: string): boolean {
  return SHARED_MODULES.has(specifier);
}
