import { performance } from 'node:perf_hooks';

import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import type { ToolMetadata } from '../../src/core/shared/types.js';
import {
  BENCHMARK_SCHEMA_VERSION,
  PERFORMANCE_POLICY,
  SCALE_CATALOG_SIZE,
  SCALE_SEARCH_BUDGET_MS,
} from '../shared/benchmark-policy.js';

const TARGET_INDEX = 4_321;
const QUERY = 'find security exception for compliance control SOC2-CC6.1';
const TARGET_NAME = 'mcp__knowledge__find_security_exception';

function buildCatalog(): readonly ToolMetadata[] {
  return Array.from({ length: SCALE_CATALOG_SIZE }, (_, index) => ({
    name: index === TARGET_INDEX ? TARGET_NAME : `mcp__distractor_${index}__read_fixture_record`,
    description:
      index === TARGET_INDEX
        ? 'Find one security exception by compliance control identifier.'
        : `Read unrelated fixture record ${index}.`,
  }));
}

function main(): void {
  const constructionStartedAt = performance.now();
  const service = new ToolSearchService(buildCatalog(), {
    policyProfile: 'read-only',
  });
  const constructionMs = performance.now() - constructionStartedAt;
  const startedAt = performance.now();
  const result = service.lexical(QUERY, 'bm25');
  const elapsedMs = performance.now() - startedAt;
  const selectedToolName = result.candidates[0]?.name ?? null;
  const samples: number[] = [];
  let warmCorrect = true;
  for (let iteration = 0; iteration < PERFORMANCE_POLICY.iterations; iteration++) {
    const started = performance.now();
    const warmResult = service.lexical(QUERY, 'bm25');
    samples.push(performance.now() - started);
    warmCorrect &&= warmResult.matched && warmResult.candidates[0]?.name === TARGET_NAME;
  }
  samples.sort((left, right) => left - right);
  const ok =
    result.matched &&
    selectedToolName === TARGET_NAME &&
    warmCorrect &&
    elapsedMs <= SCALE_SEARCH_BUDGET_MS;
  const report = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    ok,
    catalogSize: SCALE_CATALOG_SIZE,
    selectedToolName,
    matched: result.matched,
    constructionMs: Number(constructionMs.toFixed(1)),
    firstQueryMs: elapsedMs,
    searchBudgetMs: SCALE_SEARCH_BUDGET_MS,
    warm: {
      iterations: PERFORMANCE_POLICY.iterations,
      correct: warmCorrect,
      p95Ms: Number((samples[Math.ceil(samples.length * 0.95) - 1] ?? 0).toFixed(1)),
      informationalOnly: true,
    },
    elapsedMs,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!ok) process.exitCode = 1;
}

main();
