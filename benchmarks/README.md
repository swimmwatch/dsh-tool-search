# DSH Tool Search benchmarks

The active baseline is `baselines/deterministic-dsh-public-v1.json`. It covers
201 cases and 17 fixtures. Dataset identities and source hashes are recorded in
`PROVENANCE.json`. Historical baseline names in the metadata identify archived
source inputs; those files are not needed to run the benchmark.

Run from the project with Node.js 24 and the locked development dependencies:

```sh
npm ci
npm run benchmark       # deterministic quality, metamorphic, scale, native DSH
npm run benchmark:live  # the same suites plus local Ollama quality
```

Each run gets a unique directory under `benchmarks/results/`, containing an
aggregate `report.json`, a short Markdown report and the original child outputs.
The command returns a nonzero exit status if a child fails, produces invalid
JSON, reports `ok: false`, or exceeds the timeout. Failed runs are retained.
Suites run sequentially to avoid competing for benchmark resources.

The runner validates the expected suite identity, coverage, unique case IDs,
metric denominators, aggregate consistency, failure lists, and existing gate
policies. A bare `{"ok":true}` is invalid. Each contract report includes every
executed case, not only an aggregate success flag. Invalid or incomplete reports
fail even when their process exits successfully.

## What is measured

| Suite               | Scope                                                             | Acceptance                                                                                                          |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| quality-offline     | Original 201 cases / 17 fixtures, deterministic embeddings        | Original aggregate floor plus case-level quality floors; no degraded results                                        |
| metamorphic         | Original 500 transformations plus 201 full-catalog reorder checks | All 201 cases and 25 categories visited; expected outcomes, complete visible shortlists for reorder, no degradation |
| scale               | Core search over 5000 tool definitions                            | Correct target; unchanged 2000 ms first-query budget; construction and 20 warm queries reported separately          |
| native              | Actual Cordis/DSH registry and execution pipeline                 | Existing visibility, invocation, isolation, LRU, unload and latency gates                                           |
| ptc                 | Public SDK rendering and nested registry calls                    | Existing declarations, permissions, isolation, unload and PTC coexistence checks                                    |
| retrieval-contracts | 340 explicit search/input/reference contracts                     | Every named case passes; independent expected leader, limit, schema, mode and embedding-call checks                 |
| native-contracts    | 38 state-transition and provider contracts                        | Every Native/PTC registry and mocked-HTTP case passes                                                               |
| quality-ollama      | Opt-in original 201 cases with local Ollama                       | Original strict quality/category gates, no degraded cases                                                           |

The native suite uses synthetic registered tools and the installed DSH packages.
It executes only in-memory fixture callbacks, with no real shell, network tool,
schedule creation, external tool side effects or paid language-model requests.
It is a registry integration benchmark, not a full model conversation test.
Its latency measurement compares direct discovery with discovery through the
DSH tool pipeline. The original tolerance is retained: direct p95 × 1.2 + 50 ms,
over 20 warm iterations; cold latency is reported separately.

With `--live`, the native suite also checks two semantic queries through the
registered `tool_search` tool using real local embeddings. Both must load the
expected plugin/MCP schema without degradation. The simulated embedding outage
also goes through the native registered tool. All definition-vector caches are
isolated in temporary directories and removed after the suite.

Core quality and scale run the bundled retrieval implementation. The native
suite separately exercises the project's adapter, schema generation, loading
state and guards. The PTC suite separately checks SDK and registry integration.

The deterministic embedding adapter is a reproducible lexical feature fixture.
Its absolute accuracy is not evidence of semantic model quality. Its JSON
separately preserves `qualityGatePassed`, which may be false even when the
stability check passes. Ollama quality is independently gated. Both report
`degradedCases`; a fallback cannot masquerade as a successful semantic run.

`forbiddenToolRate` evaluates the first result, while `forbiddenAt5Rate` measures
the presence of case-specific unwanted alternatives anywhere in the five-result
shortlist. The original acceptance policy gates only the first metric. The tail
metric remains visible and must not be interpreted as zero merely because the
suite passed. These are retrieval expectations, not DSH execution permissions.

No whole-task token or cost savings are inferred from these benchmarks. Real
model tasks, cache-read tokens and additional search calls require a separate
matched evaluation.

## Case-level stability and benchmark self-checks

The original aggregate baseline remains unchanged. The additional
`baselines/deterministic-dsh-case-floor-v1.json` records each original case's
quality dimensions from the saved pre-change source snapshot, with source hashes.
It protects known-correct results, recall, reciprocal rank, no-match decisions,
and the absence of forbidden candidates. One improvement cannot compensate for
a regression in another case. Existing mistakes may improve; their wrong tool
names are not pinned as desired answers.

This floor records 169 correct first-result decisions out of 201 (84.08%). It is
a deterministic stability checkpoint, not a new quality target. The original
99% quality gates are retained and reported separately. The new tail check
prevents newly forbidden shortlist entries per case; it does not claim that
existing forbidden entries have disappeared.

Metamorphic checks keep the original public search path. All 201 cases also get
a catalog-order test over their complete visible shortlists. Diagnostic rejected
candidates from the quality suite are not mistaken for advertised no-match
results. Their vector cache is isolated in a temporary directory, as are the
other embedding workloads; runs do not use a user's global cache.

Tests of the benchmark itself inject empty, wrong, degraded, reordered, and
inconsistent results; check compensating regressions; and reject missing or
duplicate scenario IDs. Actual subprocess probes additionally confirm that an
always-no-match search causes a nonzero suite result. These checks validate the
gates; they are not added to the product's retrieval accuracy numerator.

## Strict contract coverage

`retrieval-contracts` covers exact and explicit registered names across DSH,
plugin and MCP naming patterns, including `constructor` and `__proto__`. It
varies registration order, 400 distractors, limits 1/5, BM25, disabled embeddings,
outage fallback, and exact pattern lookup. Other cases cover empty catalogs,
empty/no-match queries, input boundaries, negation, multiple references, provider
conflicts and Unicode lookalikes. Reference cases test the conservative name hint;
they do not claim general natural-language intent understanding. Embedding-call
counters prove bypass or fallback behavior. All providers in this suite are fake.

`native-contracts` exercises complex schemas and canonical JSON results through
DSH's registry, limits and unchanged state after invalid input, hashed MCP names,
LRU refresh, partial unload, catalog replacement/removal, scoped restrictions,
live base-tool edits, cancellation and disposal. Provider cases use mocked HTTP
for Ollama and OpenAI, including malformed responses, outages, cancellation
isolation, disabled embeddings and missing official credentials. These are
ordered integration workloads with synthetic fixture tools, not model tasks.

## PTC integration coverage

The `ptc` suite is a required part of both benchmark commands. It checks the
actual DSH registry, original input/output declarations rendered by the public
SDK generator, native-call collapse, nested fixture dispatch, independent child
loading, unload, the 16-tool LRU, permission guards, no-match results and
coexistence with Standard. Live runs additionally check two semantic discoveries
without embedding fallback. A simulated embedding outage is checked separately.

These checks use an in-memory PTC runtime descriptor and fixture callbacks, not
the Node sandbox or a paid model. Real program and model acceptance is separate.
The suite reports full-catalog, base-only, discovered and unloaded SDK character
counts. Warm prompt-assembly p95 is informational because there is no established
pre-change PTC latency baseline; existing native latency gates are unchanged.

## Migrated source and baseline

The corpus, deterministic adapter, metamorphic transformations, scale workload
and original policies are copied from the existing private `tool-search-mcp`
snapshot. File hashes and adaptations are recorded in `PROVENANCE.json`.
The independent source repository is preserved.

One workstation-specific fixture path was replaced with a neutral `/workspace`
path. The active baseline retains the original metric thresholds, with the new
dataset digest pinned by regression tests. Obsolete intermediate baselines and
migration reports are not part of the maintained source tree.

Old Codex/legacy-helper parity, MCP stdio overhead, archived results and unrelated
model E2E scenario documents are not imported. The native DSH suite replaces
the adapter/transport-specific measurements without restoring removed tools.

Use the individual `benchmark:quality`, `benchmark:quality:offline`,
`benchmark:metamorphic`, `benchmark:scale` and `benchmark:native` scripts when
investigating a suite. The first two intentionally have separate acceptance
policies. Type checking, ESLint and formatting cover benchmark source. Runtime
package archives exclude it; the source archive includes it.
