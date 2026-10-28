# Changelog

Record user-visible changes here when they are accepted. This file does not
declare a release, tag, publication date or redistribution license.

## Unreleased

The package currently uses version `0.1.0`. Identify local builds by commit or
package SHA-256 in addition to that version.

### Current Capabilities

- Native `tool_search` and `tool_unload` for DSH, plugin and MCP tools.
- Per-agent schema loading, configurable always-available tools and a limit of
  16 additional tools, including support for Native and PTC presets.
- Exact-name discovery, BM25, pattern and hybrid retrieval; lexical fallback
  when an enabled embedding provider fails.
- Configurable Ollama and OpenAI-compatible embeddings, with an option to
  disable embedding requests.
- Native DSH settings UI, write-only credential entry and compatibility with
  Node.js 24 and DSH `0.2.1-rc.2`.

### Repository Preparation

- Agent/contributor guidance, issue and pull-request templates, security and
  support policies, and automated quality checks for GitHub.
- Deterministic regression tests and benchmark gates. Live-provider and browser
  acceptance remain separate from these checks.

### Benchmark Coverage

- Added strict retrieval and Native/PTC integration contracts with per-case
  results, mocked provider requests and cancellation/state-transition workloads.
- Protected known-correct outcomes with a case-level stability floor, retaining
  the original corpus, aggregate baseline and acceptance thresholds.
- Extended metamorphic coverage to every corpus case and isolated its cache.
- Rejected incomplete or inconsistent benchmark reports and added deliberate
  failing-result probes for the benchmark gates.
- Separated construction, first-query and warm scale measurements.

### DSH Plugin Conventions

- Pinned architecture guidance and official DSH plugin-development references.
- Shared Host dependency declarations, Git-install preparation, and verification
  of the actual packed artifact without publishing development source maps.
- Browser build validation against the supported DSH shared-module contract.
- Cancellation of discovery and embedding requests, including plugin disposal,
  without treating cancellation as a provider outage.
- Discovery instructions that respect a customized always-available tool list.
