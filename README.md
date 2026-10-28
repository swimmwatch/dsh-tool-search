# dsh-tool-search

Native Tool Search plugin for DeepSeek Harness. Public redistribution is not yet
licensed; review [LICENSE](LICENSE), [NOTICE](NOTICE), and
[CONTRIBUTING.md](CONTRIBUTING.md) before publishing.

For help and reports, see [SUPPORT.md](SUPPORT.md). Report suspected vulnerabilities
privately as described in [SECURITY.md](SECURITY.md). Community participation follows
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); accepted changes are tracked in
[CHANGELOG.md](CHANGELOG.md). Repository owners should complete the
[GitHub setup checklist](.github/REPOSITORY_SETUP.md) before public publication.

## Project layout

See [DSH plugin architecture](docs/architecture.md) for the package boundaries,
runtime flow, and official references pinned to DSH `0.2.1-rc.2`.

- `src/`: DSH integration, native discovery tools, settings UI, and MCP name mapping.
- `src/core/`: maintained TypeScript retrieval engine; origin is recorded in `PROVENANCE.json`.
- `test/`: native registry, lifecycle, retrieval, privacy, and settings tests.
- `benchmarks/`: quality, stability, scale, metamorphic, Native, and PTC workloads.
- `scripts/`: build and package verification.
- `docs/`: architecture and version-specific DSH integration guidance.
- `.local/`: ignored installation artifacts and active local handoff inputs.

Use Node.js 24 (`nvm use`) and `npm ci`, then run the checks described below.
No workstation-specific DSH installation or external source checkout is needed
for the automated test suite. Live checks require a separately configured DSH or
local Ollama as documented by the individual benchmark.

The settings UI uses DSH's pinned `dsh-client-ui-primitives` SDK: `SettingsForm`,
`SettingsFormModel`, `Switch`, `SegmentedControl`, `Input`, `Button`, and
`SettingsSecretField`. The slot-provided configuration scope is bridged into the
native form model; DSH owns revision checks, drafts, and save state. API keys use
the existing `remote.credentials` service and their separate save action. The
multiline tool list remains a native textarea because this SDK has no textarea
component. Production resolves the UI SDK through DSH's shared module loader.

Node tests compile the actual SDK components and CSS modules into an ignored
`.local/ui-sdk` fixture; they do not replace the controls with mock components.
SDK rendering dependencies are development-only. A test-only Node 24 module
hook redirects the UI SDK import to that fixture. These checks cover behavior
and markup, not browser layout or live DSH integration.

Native, on-demand discovery of tools registered in DeepSeek Harness. The plugin
searches standard DSH tools, third-party plugin tools and MCP tools. It registers
`tool_search` and `tool_unload` directly in `ctx.tools`; it starts no MCP server
and never executes discovered tools itself.

This is a private local plugin, not an official DeepSeek distribution. Version
0.1.0 is pinned to DSH 0.2.1-rc.2 and Node.js 24. Native and PTC presets are supported. In PTC, discovery runs through `run_code`; the generated tools SDK contains only the configured base tools and capabilities discovered by the calling agent.

## Always-available tools

The default list contains the agreed 39 tool names: shell and files, user questions,
images and skills, discovery, background jobs, workflow and Ralph, goals and
planning, subagents, team tasks and schedules. The version-pinned defaults are
exported as `BASE_TOOLS` in `src/constants.ts`. Names do not register tools,
change permissions, or bypass the calling agent's registry scope.

Open **Plugins → dsh-tool-search → dsh-tool-search → Configure** to edit the
**Always available tools** field. Enter one name per line and click **Save**.
Commas and whitespace are also accepted, and duplicates are removed.
**Use the default 39 tools** prepares the defaults; click Save to apply them.
Changes persist in the active profile's Cordis patch and apply on the next agent
step without restarting the plugin or clearing other agents' discovered tools.
The editor refuses stale revisions rather than overwriting another editor.

The same setting can be supplied in the plugin row:

```yaml
config:
  alwaysAvailableTools:
    - read
    - workflow
    - job_list
```

`tool_search` and `tool_unload` always remain available, even if omitted from
the setting. All other installed tools, including built-in tools omitted from the
list, remain discoverable. Always-available tools consume no loading slots and
cannot be unloaded. Promoting a discovered tool releases its loading slot; after
removing it from the base list, discover it again before calling it.

## Tools

`tool_search({query, limit?, mode?})` finds and loads tools. Use an exact tool name
or focused task keywords. `mode` is `hybrid` (default), `bm25`, or `pattern`;
`limit` defaults to 3 and must be an integer from 1 to 5. Queries are limited to
500 characters. Exact names use the existing literal matcher without embedding
requests. An empty query returns a compact inventory rather than every tool.

An original MCP identifier, such as `specification_review_submit_batch`, also
resolves the shortened, hashed name registered by DSH. Resolution forward-maps
the supplied identifier using the pinned DSH 0.2.1-rc.2 naming contract and
requires that exact result in the calling agent's catalog. It does not reverse
hashes, register aliases, bypass access checks, or change tool schemas. Multiple
matching servers remain distinct results, subject to the requested limit. An
explicit identifier containing `workflow` is not an exact reference to the
built-in `workflow` tool. Natural-language and embedding search remain available.

In BM25 and embedding-outage fallback, an unambiguous explicit reference such as
`Call workflow task_id` or `Используй «sentinel_list»` ranks before ordinary keyword
matches, before either result limit is applied. Exact whole-query names still
rank first. Only complete registered names receive this phrase priority; the
existing whole-query MCP identity mapping is unchanged. Negated clauses,
conflicting provider qualifiers and multiple named tools do not force a winner.
This is a conservative syntactic hint, not a general intent parser: those queries
retain ordinary BM25 evidence and can still return lexical matches. Pattern and
successful semantic hybrid ranking are unchanged.

Search results contain short descriptions and loading state. Full, unchanged
native schemas appear on the next model step. Finish the search call before
invoking a newly loaded capability. Invocation uses DSH's existing execution,
validation, approval and sandbox pipeline.

`tool_unload({names?})` unloads named additional tools. Omit `names` to unload all
additional tools. Each agent has its own active set, bounded to 16 extra tools;
the least recently used entries are evicted when the limit is exceeded. A fresh
agent must discover its own additional tools. Removal, replacement or schema
mutation invalidates an activated tool and requires discovery again.

## Embedding providers

Open **Plugins → dsh-tool-search → dsh-tool-search → Configure**.
**Use embeddings** is enabled by default and **Ollama** remains the default provider.
Existing profiles retain their `embeddingModel`, defaulting to `qwen3-embedding:4b`.
Install the selected model in local Ollama yourself; the plugin does not download models.

Select **OpenAI-compatible** to use OpenAI or a compatible embeddings server.
Set the model (default `text-embedding-3-small`) and API base URL (default
`https://api.openai.com/v1`). The plugin appends `/embeddings`; keep the API prefix
such as `/v1` in the base URL. Remote URLs require HTTPS; HTTP is allowed only on
loopback. Credentials in URLs, query parameters, fragments and redirects are rejected.
Compatibility requires the OpenAI embeddings request and indexed float-vector response.

The API key reference defaults to `DSH_TOOL_SEARCH_OPENAI_API_KEY`. Use **Save API key**
to store a new value through DSH credentials, separately from **Save** for settings.
Only credential presence and writability are returned to the browser; saved keys are
never displayed. Existing DSH credential/environment references can also be selected.
No other provider's key is selected automatically. Official OpenAI needs a key;
compatible servers may operate without one. A missing official key falls back to BM25
without an HTTP request. Key changes take effect on the next search.

Disabling **Use embeddings** makes `hybrid` requests run as BM25, returning
`mode: "bm25"` and `degraded: false`, with no embedding client or HTTP requests.
An embedding failure while enabled still falls back to BM25 with `degraded: true`.
Exact-name, BM25, pattern and empty queries never request embeddings.

```yaml
config:
  embeddingEnabled: true
  embeddingProvider: ollama
  embeddingModel: qwen3-embedding:4b
  openaiEmbeddingModel: text-embedding-3-small
  openaiBaseUrl: https://api.openai.com/v1
  openaiApiKeyRef: DSH_TOOL_SEARCH_OPENAI_API_KEY
```

Settings are live: the next search uses the selected provider and model without
unloading tools or resetting agents. An in-flight search retains its settings and
credential snapshot. Each provider's settings are retained when switching away.
Saving settings alone does not call an embeddings endpoint.

## Search engine and privacy

The plugin reuses the original private `tool-search-mcp` controller, BM25 index,
hybrid ranker, catalog/receipt verification and embedding implementation. The
original TypeScript snapshot and hashes are recorded in `PROVENANCE.json`. The MCP
server entry point and transport are not included. Original project files are
not modified.

By default, hybrid mode uses the installed Ollama `qwen3-embedding:4b` model at
`http://127.0.0.1:11434/api/embed`. Selecting OpenAI-compatible explicitly enables
requests to the configured server, including search queries and prepared tool
descriptions (with names and argument information). If embeddings fail, the existing BM25 fallback is returned with
`degraded: true`. Each embedding HTTP request has an 8-second timeout; the first
uncached catalog can require multiple batches. BM25 and pattern are fully local.

Agent cancellation stops in-flight embedding HTTP requests and prevents further
batches and schema activation. Disabling the plugin also cancels its in-flight
searches. Cancellation is not a provider outage and does not trigger BM25
fallback. Independent searches retain their own cancellation lifetimes.

Only hashed definition vectors are cached under
`$DSH_HOME/cache/dsh-tool-search` (normally `~/.dsh/cache/dsh-tool-search`). Queries,
catalogs, receipts and API keys are not persisted in this cache. Cache identity includes
provider, normalized endpoint, model and text-format versions. Older cache files are
left intact but are not reused across incompatible identities. The original core's Codex cache default
is overridden by the plugin's explicit DSH cache factory.

## Install locally

Back up the profile manifest, lockfile, workspace settings and profile patch.
Duplicate native `tool_search` or `tool_unload` names produce a clear startup
conflict. This package contains no compatibility adapter for older discovery tools.

Install the packed artifact with the normal DSH plugin command:

```sh
npx --yes --package=@deepseek-ai/dsh@0.2.1-rc.2 --package=pnpm@11.9.0 -- \
  dsh plugin --profile web add --workspace-root /absolute/path/dsh-tool-search-0.1.0.tgz
```

Confirm that the profile's effective bundle list includes `dsh-tool-search`, then
restart the Web profile using its existing launcher. No MCP configuration entry
is required. Existing provider configuration, OAuth credentials, other plugins
and core package versions must remain unchanged.

After installation, search and call a standard tool, a specialized plugin tool
and an MCP tool, then unload. Inspect actual `request/header` events to confirm
the wire-visible schemas. The plugin does not require an API-specific native
`type: tool_search` capability: these are ordinary DSH function tools.

## Checks and limits

The `prepare` lifecycle builds the package during a normal development install,
packing, and Git-source installation. A Git install with pnpm may require the
user to allow this package's build script; follow the exact package key printed
by pnpm. Allow only trusted sources and pin a commit. A prebuilt archive avoids
requiring development build tools on the receiving installation. See DSH's
[official packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/user/develop/basic/publish.md#installing-from-github-build-script-catch).

Use Node.js 24 and install the locked development dependencies with `npm ci`.

```sh
npm run check          # types, lint, formatting, clean build, tests
npm run test:coverage  # Node.js coverage report
npm run package:verify
npm run benchmark       # reproducible benchmark suites
npm run benchmark:live  # additionally verify local Ollama quality
npm pack              # builds compiled runtime files before packing
```

All maintained runtime code, tests and scripts are TypeScript. Strict NodeNext
compilation emits JavaScript and type declarations into `dist/`.
The package exports `dist/src/index.js`; development tooling and source maps are
not shipped. `package:verify` packs and extracts the archive, validates its
manifest and public exports, and loads its Host and browser entry points.

The ESLint flat configuration adapts the appropriate checks from
[cloakbrowser-mcp](https://github.com/swimmwatch/cloakbrowser-mcp/blob/main/eslint.config.js):
`typescript-eslint` with type-aware rules, `import-x`, `n`, `promise`, `regexp`,
`sonarjs`, `no-secrets`, `perfectionist`, `jsdoc`, and Prettier compatibility.
The Vitest plugin is intentionally omitted because this project uses `node:test`.
All project files are linted, including the reused core. The small core-only
exceptions preserve upstream string coercion and regular-expression behavior;
the reused parser has a documented complexity limit of 35. New native integration
code uses the stricter project defaults. See `eslint.config.ts`.

Shared limits, base tool names and local embedding defaults live in
`src/constants.ts`; model-facing descriptions and guidance are in
`src/messages.ts`; parameter schemas are in `src/schemas.ts`. Public DSH exports
are used throughout, including `RUN_CODE_NAME` and the official SDK renderers for PTC. Native wire schemas and PTC SDK declarations share the same per-agent discovery state. No private DSH methods are called.

Tests use the actual Cordis lifecycle, DSH registry and execution pipeline,
plus the reused ranking/catalog tests. They cover dynamic activation, unloading,
permissions, cancellation, tool replacement, agent isolation, local embedding
failure and malformed discovery responses. No paid model calls are part of the
test suite. A live local hybrid and browser smoke test are separate.

The original ranking algorithms are retained. Local adaptations are recorded
in `PROVENANCE.json`: TypeScript formatting/imports, shared query/mode limits,
removal of unused MCP-server exports, explicit readonly array types, and
equivalent regular-expression simplifications found by linting.

The migrated benchmark corpus and native DSH integration workload are documented
in [benchmarks/README.md](benchmarks/README.md). Reports distinguish core retrieval,
native registry behavior, deterministic stability and real local embeddings.
Catalog mutation checks hash original descriptions, parameter schemas and output
schemas directly; TypeScript declarations are generated only for discovery.

Only additional tool schemas and unused MCP server instruction sections are
filtered. Existing system instructions, skill catalogs, conversation history,
tool results and other plugin contexts are preserved. Unloading schemas does
not erase earlier messages. Upstream MCP servers remain connected.

Changing the visible tool list can affect provider prefix caching. Evaluate
cache-read tokens, uncached input, output, extra search calls and final task
quality together. A smaller first request alone is not a task-cost benchmark.

Disabling the plugin removes its two tools, guidance, visibility filter and
guards; the underlying tools remain registered. To roll back the migration,
restore the saved profile files and restart the same Web profile. There is no
public npm, marketplace or upstream publication in this local installation.
