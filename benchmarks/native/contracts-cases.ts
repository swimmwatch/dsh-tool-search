export const CONTRACT_MODES = ['native', 'ptc'] as const;
export type ContractMode = (typeof CONTRACT_MODES)[number];

export const REGISTRY_CONTRACTS = [
  'complex-schema-roundtrip',
  'complex-input-validation',
  'default-and-maximum-limit',
  'invalid-inputs-preserve-state',
  'empty-inventory',
  'hashed-mcp-identities',
  'lru-refresh-and-partial-unload',
  'catalog-replacement-and-removal',
  'scoped-restriction-after-loading',
  'live-base-promotion-and-demotion',
  'cancelled-search',
  'catalog-change-in-flight',
  'disposal-in-flight',
] as const;

export const PROVIDER_CONTRACTS = [
  'semantic-http',
  'network-bypass',
  'outage-fallback',
  'malformed-response',
  'cancellation-isolation',
] as const;

export const CONTRACT_CASE_IDS = [
  ...CONTRACT_MODES.flatMap((mode) => REGISTRY_CONTRACTS.map((name) => `${mode}/${name}`)),
  ...(['ollama', 'openai'] as const).flatMap((provider) =>
    PROVIDER_CONTRACTS.map((name) => `${provider}/${name}`),
  ),
  'disabled/no-embedding-http',
  'openai/missing-key-no-http',
] as const;
