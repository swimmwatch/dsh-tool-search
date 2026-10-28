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

## Pull requests and releases

Use Conventional Commits 1.0.0 for commit messages and PR titles. The required
policy check validates the PR title; squash merge uses that title for the final
commit. Describe breaking changes with `!` or `BREAKING CHANGE`.

Keep CHANGELOG.md in Keep a Changelog 1.1.0 format. Add accepted changes to
`[Unreleased]`; a release PR moves them into a dated SemVer section. The stable
public contract is documented in [docs/public-contract.md](docs/public-contract.md).

All changes require a PR and the `Required checks` status. CI runs quality,
package installation, all seven deterministic benchmark suites, workflow and
commit policy, secret scanning, dependency auditing and CodeQL. High/Critical
security findings block merging. Never bypass a failed gate. Live providers and
browser acceptance are separately reported, not implied by offline CI.

The project and incorporated author-owned code use Apache-2.0. Preserve NOTICE
and provenance. Follow [docs/releases.md](docs/releases.md) for candidate and
stable publication. See [.github/REPOSITORY_SETUP.md](.github/REPOSITORY_SETUP.md)
for the repository's protection and security settings.
