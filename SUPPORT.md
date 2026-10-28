# Support

Start with [README.md](README.md) for installation, discovery behavior and
embedding configuration, and [CONTRIBUTING.md](CONTRIBUTING.md) for development
checks. The verified target is Node.js 24 with DSH `0.2.1-rc.2`.

## Choose The Right Channel

In the repository's **Issues → New issue** chooser, use:

- **Bug report** for failures, UI problems, loading/unloading or lifecycle bugs.
- **Search quality** for missing tools, incorrect ordering or retrieval regressions.
- **Feature request** for a concrete capability or behavior change.
- **Usage question** for setup and usage questions not answered by the documentation.

No Discussions, chat service or private support email is currently designated.
For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
posting publicly. Community conduct is covered by
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Useful Diagnostic Details

Provide the plugin version **and commit or package SHA-256**, since several local
builds can use `0.1.0`. Include DSH, Node and OS versions, Native/PTC preset, and
the affected tool source: built-in DSH, plugin or MCP.

For retrieval issues, provide a synthetic query, mode (`hybrid`, `bm25` or
`pattern`), limit, expected tool, actual top result and `degraded` value. If
relevant, include public/synthetic original and DSH-registered MCP names.
Describe parent/child-agent behavior with invented identifiers.

These behaviors are intentional:

- Disabled embeddings route hybrid requests to BM25 with `degraded: false`.
- Failure of an enabled embedding provider falls back to BM25 with `degraded: true`.
- Search loads schemas for the next agent step; it does not execute tools.
- Each agent discovers its own additional tools. The limit is 16; configured
  always-available tools do not consume those slots.
- Loading a schema does not bypass DSH permissions or make a missing tool exist.

For a local performance regression, compare the same catalog, build, model and
cache state. Separate index construction, first query and repeated queries from
model/network time. The offline benchmark is `npm run benchmark`; live Ollama
checks are opt-in. Do not change thresholds to make a report pass.

## Before Posting

Use minimal synthetic examples. Remove API keys, authorization headers, cookies,
environment dumps, private URLs, user paths, prompts, full MCP catalogs, DSH
profiles and session history. Share only the relevant safe result fields or
redacted error category; inspect screenshots and attachments too. Do not upload
the entire `.local/`, cache or benchmark-results directory.

Support is provided on a best-effort basis; no response-time commitment is made.
