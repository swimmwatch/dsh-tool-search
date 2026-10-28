declare module 'eslint-plugin-promise' {
  import type { ESLint, Linter } from 'eslint';

  const plugin: ESLint.Plugin & {
    configs: { 'flat/recommended': { rules: Linter.RulesRecord } };
  };
  export default plugin;
}
