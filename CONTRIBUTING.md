# Contributing

Use Node.js 24 and the committed npm lockfile. The project uses TypeScript,
Node's test runner, ESLint, Prettier, and the public DSH 0.2.1-rc.2 integration
contracts.

[AGENTS.md](AGENTS.md) is the agent entry point. Its workflow and context rules are
adapted from GPT-Voice; the architecture and commands below belong to this plugin.

```sh
nvm use
npm ci
npm run check
npm run package:verify
npm run benchmark
```

Keep changes in the maintained source directories. Generate `dist/` with
`npm run build`; do not edit compiled files. Runtime packages are created with
`npm pack`. Never commit `node_modules/`, generated output, private logs, session
exports, provider configuration, credentials, or ignored `.local/` installation artifacts.

Add focused regression tests for behavior changes. Preserve tool permissions,
agent isolation, schema integrity, cancellation, catalog-receipt verification,
and the distinction between deterministic stability and absolute semantic
quality. The complete live-Ollama benchmark is opt-in and may have different
results from deterministic fixtures.

The original `tool-search-mcp` checkout is not required to build this project.
`PROVENANCE.json` and `benchmarks/PROVENANCE.json` retain the source revision and
snapshot hashes. Document local adaptations to reused code without replacing
the historical source hashes.

## Code And Runtime Boundaries

Use the pinned official references in [DSH Plugin Architecture](docs/architecture.md)
when changing integration boundaries. Match the installed release instead of
copying newer or monorepo-only APIs. Keep one package for this single-purpose
bundle; the Host and browser companion share public configuration contracts.

- Mirror Node-side Host-shared DSH peer dependencies in development dependencies
  at the same version. Keep browser and type-only dependencies development-only;
  DSH's browser module loader supplies their runtime identity.
- Keep the browser factory compatible with the release's shared module list;
  externalizing an arbitrary `@deepseek-ai/*` import does not make it available
  in the browser. Explicit external modules need a `dsh.client.external` contract.
- Propagate cancellation through asynchronous discovery and provider requests.
  Cancelled work must not activate schemas or be reported as provider degradation.
  Disposing the plugin must stop its in-flight work as well as registrations.

- Keep Node.js `>=24 <25`, DSH `0.2.1-rc.2`, strict TypeScript, ESM, and explicit
  `.js` relative imports. Keep repository documentation, diagnostics, comments,
  and identifiers in English. Use the existing ESLint and Prettier configuration.
- Do not bypass types with `any`, `@ts-ignore`, or non-null assertions. Runtime
  source must not use `console.*`. Keep existing lint exceptions narrow and
  documented; do not add exceptions to hide a violation.
- `src/client/` owns React UI and calls public DSH remote services. Use native
  DSH controls and form state where suitable. React and DSH SDK modules remain
  external to the production client bundle so the host supplies their identity.
- `src/constants.ts`, `src/embedding-settings.ts`, and
  `src/core/shared/types.ts` are shared, browser-safe contracts. They may contain
  pure normalization and validation, but no provider clients, Node imports,
  environment reads, credential resolution, filesystem work, or network calls.
- Provider implementations, caches, and native DSH integration own privileged
  operations. Preserve the `EmbeddingProvider` interface, old imports when
  moving shared exports, provider-specific defaults, and the disabled-embeddings
  path that performs no embedding HTTP requests.
- Search only discovers and loads schemas. DSH still owns validation,
  permissions and execution. Preserve the per-agent load limit, tool replacement
  invalidation, exact-name ordering before truncation, and Native/PTC isolation.
- Cancellation must prevent activation after a cancelled search and reach the
  provider's HTTP request. Keep independent operations isolated: cancelling one
  caller must not abort another caller or discard completed shared vectors.

## Privacy And Diagnostics

- Never persist private runtime queries, tool descriptions/catalogs, API keys,
  session data, or full provider responses in logs or artifacts. Authored synthetic
  test/benchmark fixtures are allowed. The native vector cache belongs
  under `$DSH_HOME/cache/dsh-tool-search` and contains hashes and vectors, not raw
  search inputs. Preserve the existing privacy tests.
- Resolve OpenAI credentials for the current operation through DSH credentials
  or the supported environment fallback. Do not put secret values in settings,
  cache identities or diagnostic errors. The settings UI only describes key
  status and writes newly entered values through `remote.credentials`.
- Preserve safe diagnostics and BM25 fallback on provider errors. Disabled
  embeddings intentionally use BM25 without marking the result degraded.

## Verification By Change

- Documentation-only edits: check Markdown formatting, commands and links.
- Code changes: run `npm run check` (types, lint, formatting, build and tests).
  Tests use `node:test`; the UI harness compiles real DSH SDK controls for Node.
- Client, SDK-boundary or packaging changes: also run `npm run package:verify`.
  Inspect the client dependency graph and packed file list; do not bundle a
  second React/DSH runtime or include development/private artifacts.
- Retrieval, providers, settings that affect search, or registry/lifecycle
  changes: also run `npm run benchmark`. Keep baseline and thresholds unchanged.
- `npm run benchmark:live` and `npm run benchmark:quality` use real Ollama and
  are opt-in. Deterministic gates do not certify absolute semantic quality or
  browser/installed-DSH behavior. Report the checked surface accurately.

Update README when behavior, setup, privacy, packaging or provider configuration
changes. Keep generated results under ignored `benchmarks/results/`, `.local/`
or the task's external artifact directory. Release publication and changes to the
installed DSH profile require explicit user authorization.

## Before public publication

The GitHub issue forms separate bugs, retrieval quality, feature requests and
usage questions. Include a commit or package hash as well as the version when
reporting a local build. Follow [SUPPORT.md](SUPPORT.md) for redaction and
[SECURITY.md](SECURITY.md) for private vulnerability reports. Participation is
covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Use the pull-request template to explain the problem, resulting behavior and
applicable verification. Mark unrelated checks as not applicable with a reason;
do not claim browser or live-provider acceptance from offline tests. Update
[CHANGELOG.md](CHANGELOG.md) for accepted user-visible changes without inventing
release tags or dates.

The GitHub workflow runs the locked install, `check`, `package:verify` and the
offline `benchmark` on Ubuntu/Node 24, without provider keys or a running DSH.
For workflow changes, run `actionlint` when available and inspect triggers,
permissions and pinned action revisions. YAML parsing alone is not a hosted CI run.

Repository-level setup and dependency-update limits are documented in
[REPOSITORY_SETUP.md](.github/REPOSITORY_SETUP.md). These files do not enable
branch protection or private reporting automatically.

1. The owner must choose a redistribution license covering both this plugin and
   the reused private source. The current `UNLICENSED` package and all-rights-
   reserved license do not grant public redistribution permission.
2. Run the regression suite with `npm test`, including the discovery-name and
   retrieval-ranking tests.
3. Run checks and review the actual Git candidate list. Review benchmark results
   against the declared gate; a no-regression result is not an absolute quality
   certificate.
4. Create the intended GitHub repository and add its verified URL only when
   publication is explicitly authorized. This extracted project has no remote
   or release configured.
