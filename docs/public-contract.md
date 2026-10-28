# Public contract

The 1.x contract covers the two native DSH function tools, their documented
parameters/results, persistent settings, schema visibility and supported host
versions. Internal ranking weights, implementation modules and test helpers are
not exported extension APIs. The initial supported platform is Node.js 24 with
DSH 0.2.1-rc.2; a plugin version number does not imply support for other hosts.

## Discovery and activation

- `tool_search({ query, limit?, mode? })`: `query` is at most 500 characters;
  `limit` is an integer from 1 to 5, default 3; modes are `hybrid` (default),
  `bm25` and `pattern`. Empty queries return a compact inventory.
- Results contain short matches and load state, the effective mode and a
  `degraded` flag. See the exported TypeScript declarations and parameter
  schemas for the complete result structure.
- Exact names rank first. The documented explicit-name rule applies to BM25
  and embedding-outage fallback. Hybrid semantic ordering may evolve without
  guaranteeing a fixed ranking for arbitrary natural-language queries.
- Selected, unchanged schemas become available on the next model step.
  Discovery never executes the found tools or grants additional permissions.
- `tool_unload({ names? })` removes selected additional schemas; omitted names
  remove all additional schemas. Always-available tools cannot be unloaded.
- Additional schemas are isolated per agent and limited to 16, with least
  recently used eviction. Removed/replaced tools require rediscovery.
  Cancellation prevents activation. Native and PTC share the agent's state.

## Persistent settings

The plugin row ID remains `dsh-tool-search`; the installable package identity is
`@swimmwatch/dsh-tool-search`. Public settings are `alwaysAvailableTools`,
`embeddingEnabled`, `embeddingProvider`, `embeddingModel`,
`openaiEmbeddingModel`, `openaiBaseUrl` and `openaiApiKeyRef`.

Legacy model-only settings retain their Ollama model and provider defaults.
Each search captures its configuration; saving changes does not execute network
requests. Disabling embeddings selects BM25 with `degraded: false`. An enabled
provider failure selects lexical fallback with `degraded: true`.

Credentials remain in DSH's credential service. Cached vectors stay under
`$DSH_HOME/cache/dsh-tool-search`. The package rename does not rename either.

## Compatibility policy

Removing a public field, changing its accepted type or meaning incompatibly,
or dropping a supported host version requires a SemVer major release.
Compatible capabilities are minor changes; corrections that restore documented
behavior are patch changes. Unreleased/RC builds are explicitly prereleases.

Published tags and npm versions are immutable. CHANGELOG.md records material
user-visible changes; security guarantees and benchmark gates must not be
weakened as an undocumented implementation change.
