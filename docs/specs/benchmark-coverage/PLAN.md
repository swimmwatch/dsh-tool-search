# Benchmark Coverage Review And Implementation

## Objective

Strengthen the offline benchmark so a passing report means the declared workload
ran, existing correct cases did not regress, and native discovery contracts were
checked. Preserve the original 201-case corpus, aggregate baseline, quality
thresholds, and existing Native/PTC performance gates. Do not claim live semantic
quality, browser acceptance, or model-task savings from these checks.

## Review Findings

1. `benchmarks/shared/report.ts` accepts `{"ok":true}` without evidence that any
   case ran. Counts, suite identity, consistency, and failures need validation.
2. Aggregate stability metrics allow one new error to be offset by one fixed
   case. Add a separate case-level floor without blessing existing wrong answers.
3. The metamorphic suite checks only the first 100 cases and compares the current
   implementation against itself. An always-no-match, degraded mutant passes all
   500 transformations. The remaining 101 cases and 13 categories are omitted.
4. Metamorphic searches omit an explicit vector-cache root, touching the user's
   global cache. All benchmark caches must be temporary and isolated.
5. Native/PTC fixtures have trivial schemas and omit limits, schema replacement,
   settings transitions, cancellation, concurrency, and provider contracts.
6. Scale timing excludes construction and reports one query. Documentation says
   1500 ms although the actual gate is 2000 ms. Preserve that executable gate and
   report construction, first query, and warm queries separately.

## Implementation Packets

### 1. Report And Measurement Integrity

- Validate each suite's report against its expected identity and coverage.
- Reject empty, malformed, duplicate, contradictory, or unsuccessful reports.
- Preserve existing acceptance thresholds and clarify scale measurement phases.
- Prove rejection with intentionally corrupt reports and a failing child process.

### 2. Existing Corpus And Metamorphic Coverage

- Record per-case quality dimensions from the saved pre-change source snapshot.
- Gate previously correct results, recall, reciprocal rank, and forbidden results
  independently so aggregate compensation cannot hide a regression.
- Retain the existing 500 transformations and add safe catalog-order changes for
  all 201 cases, including full-shortlist comparison and degradation checks.
- Isolate caches and demonstrate that always-empty/degraded mutations fail.

### 3. Retrieval Contract Matrix

- Add independently expected exact/explicit tool-name cases across native,
  plugin, MCP, and JavaScript property-like names.
- Exercise small/large catalogs, 400 distractors, reversed registration order,
  limits 1/5, BM25, disabled embeddings, outage fallback, and exact pattern lookup.
- Add empty/no-match and invalid-input cases with embedding-call counters.
- Report case IDs individually; do not derive expectations from the matcher.

### 4. Native And PTC State Transitions

- Exercise original complex schemas and JSON results through DSH's registry.
- Cover discovery limits, hashed MCP names, LRU refresh, partial unload, schema
  replacement, scope restrictions, and live base-tool changes.
- Cover cancellation, disposal, concurrent agents, and provider/disabled/fallback
  behavior using isolated caches and mocked HTTP.
- Keep Native/PTC SDK integration distinct from a real PTC sandbox or model run.

## Completion Evidence

- `npm run check`, `npm run package:verify`, and the expanded `npm run benchmark`.
- Negative probes prove the new gates detect the defects they were designed for.
- Compare the original baseline/corpus/threshold hashes against the saved source.
- Retain a report with before/after coverage, results, and known limitations.
- Do not update or restart the installed DSH, publish, or change dependencies.

## Checklist

- [x] Review the existing benchmark and reproduce false passes.
- [x] Save source and benchmark results before changes.
- [x] Implement the four packets and review their integration.
- [x] Run positive checks and deliberate negative probes.
- [x] Record final results, unchanged baselines, and limitations.

## Result

All seven benchmark suites passed: the retained 201-case quality corpus, 701
metamorphic checks, scale, Native, PTC, 340 retrieval contracts, and 38 native
state-transition/provider contracts. `npm run check` passed 185 tests;
`npm run package:verify` passed with 101 runtime files. Production source,
dependencies, original corpus, aggregate baseline, and existing thresholds
remain unchanged.

Deliberate mutants were detected: always-empty search without degradation failed
492 transformations; empty degraded search failed all 701; allowing unloaded
calls failed 10 native contracts; dropping HTTP cancellation failed two.

The deterministic quality corpus remains at 169/201 correct first-result/no-match
decisions (84.08%). This work strengthens regression evidence; it does not repair
the corpus's known retrieval mistakes or certify live-model quality. Live Ollama,
OpenAI, browser and paid-model runs were not performed. The installed DSH was not
changed. The full before/after and mutation evidence is retained in this task's
`outputs/dsh-benchmark-expansion-20261028T153539Z/` artifact directory.

Owner: the current Codex task. All four packets are authorized by the user's
request to review, plan, implement, and verify this benchmark expansion.
