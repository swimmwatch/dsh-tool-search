import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONTRACT_CASE_IDS } from '../benchmarks/native/contracts-cases.js';
import { QUALITY_CASES } from '../benchmarks/retrieval/cases/quality-cases.js';
import { caseBaselineSchema } from '../benchmarks/shared/case-quality-gate.js';
import { QUALITY_CATEGORIES, type QualityCaseScore } from '../benchmarks/shared/quality-types.js';
import { type BenchmarkSuite, evaluateChildReport } from '../benchmarks/shared/report.js';

const SUITES: readonly BenchmarkSuite[] = [
  'quality-offline',
  'quality-ollama',
  'metamorphic',
  'scale',
  'native',
  'ptc',
  'retrieval-contracts',
  'native-contracts',
];

await test('every benchmark suite rejects vacuous success reports', () => {
  for (const suite of SUITES) {
    for (const report of [
      { ok: true },
      { ok: true, schemaVersion: 2, cases: 0, failures: ['hidden failure'], elapsedMs: 0 },
      { ok: true, schemaVersion: 99, cases: 1, elapsedMs: 0 },
    ]) {
      assert.throws(() => evaluateChildReport(JSON.stringify(report), 0, suite), suite);
    }
  }
});

function scaleReport() {
  return {
    schemaVersion: 2,
    ok: true,
    catalogSize: 5_000,
    selectedToolName: 'mcp__knowledge__find_security_exception',
    matched: true,
    constructionMs: 10,
    firstQueryMs: 5,
    elapsedMs: 5,
    searchBudgetMs: 2_000,
    warm: { iterations: 20, p95Ms: 1, correct: true, informationalOnly: true },
  };
}

await test('scale evidence rejects wrong targets, skipped work, or a relaxed budget', () => {
  const report = scaleReport();
  assert.equal(evaluateChildReport(JSON.stringify(report), 0, 'scale').passed, true);
  const corrupt = [
    { ...report, selectedToolName: 'wrong' },
    { ...report, matched: false },
    { ...report, catalogSize: 0 },
    { ...report, elapsedMs: 2_001, firstQueryMs: 2_001 },
    { ...report, searchBudgetMs: 3_000 },
    { ...report, warm: { ...report.warm, iterations: 0 } },
    { ...report, warm: { ...report.warm, correct: false } },
  ];
  for (const value of corrupt)
    assert.throws(() => evaluateChildReport(JSON.stringify(value), 0, 'scale'));
  const failed = { ...report, ok: false, matched: false };
  assert.equal(evaluateChildReport(JSON.stringify(failed), 0, 'scale').passed, false);
});

await test('metamorphic evidence rejects missing coverage, degradation and hidden failures', () => {
  const report = {
    schemaVersion: 2,
    ok: true,
    seed: 0x5eed_2026,
    transformations: 701,
    sourceCases: 201,
    categories: 25,
    degradedCases: 0,
    failedTransformationIds: [],
    elapsedMs: 10,
  };
  assert.equal(evaluateChildReport(JSON.stringify(report), 0, 'metamorphic').passed, true);
  const corrupt = [
    { ...report, transformations: 500 },
    { ...report, sourceCases: 100 },
    { ...report, categories: 12 },
    { ...report, degradedCases: 1 },
    { ...report, failedTransformationIds: ['query:reorder'] },
  ];
  for (const value of corrupt)
    assert.throws(() => evaluateChildReport(JSON.stringify(value), 0, 'metamorphic'));
});

function contractReport() {
  return {
    schemaVersion: 2,
    suite: 'native-contracts',
    ok: true,
    cases: CONTRACT_CASE_IDS.length,
    passedCases: CONTRACT_CASE_IDS.length,
    results: CONTRACT_CASE_IDS.map((id) => ({ id, passed: true })),
    failures: [] as { id: string; error: string }[],
    elapsedMs: 1,
  };
}

await test('contract evidence rejects duplicate, omitted and contradictory case results', () => {
  const report = contractReport();
  const firstId = CONTRACT_CASE_IDS[0];
  assert.ok(firstId);
  const failedResults = report.results.map((result, index) =>
    index === 0 ? { ...result, passed: false } : result,
  );
  assert.equal(evaluateChildReport(JSON.stringify(report), 0, 'native-contracts').passed, true);
  const corrupt = [
    { ...report, suite: 'retrieval-contracts' },
    { ...report, cases: 0, passedCases: 0, results: [] },
    { ...report, cases: report.cases + 1 },
    {
      ...report,
      cases: report.cases - 1,
      passedCases: report.passedCases - 1,
      results: report.results.slice(1),
    },
    { ...report, results: [report.results[0], report.results[0]] },
    { ...report, results: failedResults },
    { ...report, failures: [{ id: firstId, error: 'failed' }] },
  ];
  for (const value of corrupt)
    assert.throws(() => evaluateChildReport(JSON.stringify(value), 0, 'native-contracts'));
  const failed = {
    ...report,
    ok: false,
    passedCases: report.cases - 1,
    results: failedResults,
    failures: [{ id: firstId, error: 'failed' }],
  };
  assert.equal(evaluateChildReport(JSON.stringify(failed), 0, 'native-contracts').passed, false);
});

function metricsFor(scores: readonly QualityCaseScore[]) {
  const average = (values: readonly (boolean | number | null)[]) => {
    const present = values.filter((value) => value !== null);
    return present.length
      ? Number(
          (present.reduce<number>((sum, value) => sum + Number(value), 0) / present.length).toFixed(
            4,
          ),
        )
      : null;
  };
  return {
    cases: scores.length,
    positiveCases: scores.filter((item) => item.recallAt5 !== null).length,
    noMatchCases: scores.filter((item) => item.noMatchCorrect !== null).length,
    top1Accuracy: average(scores.map((item) => item.top1Correct)),
    recallAt5: average(scores.map((item) => item.recallAt5)),
    meanReciprocalRank: average(scores.map((item) => item.reciprocalRank)),
    noMatchAccuracy: average(scores.map((item) => item.noMatchCorrect)),
    forbiddenToolRate: average(scores.map((item) => item.forbiddenTop1)),
    forbiddenAt5Rate: average(scores.map((item) => item.forbiddenAt5)),
  };
}

function qualityReport() {
  const floor = caseBaselineSchema.parse(
    JSON.parse(
      readFileSync(
        new URL('../benchmarks/baselines/deterministic-dsh-case-floor-v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const categories = Object.fromEntries(
    QUALITY_CATEGORIES.map((category) => {
      const ids = new Set(
        QUALITY_CASES.filter((item) => item.category === category).map(({ id }) => id),
      );
      return [category, metricsFor(floor.cases.filter(({ id }) => ids.has(id)))];
    }),
  );
  return {
    schemaVersion: 2,
    ok: true,
    layer: 'retrieval-core',
    embeddingBackend: 'deterministic',
    datasetDigest: floor.datasetDigest,
    mode: floor.mode,
    embeddingModel: floor.embeddingModel,
    fixtures: 17,
    degradedCases: 0,
    elapsedMs: 1,
    categories,
    ...metricsFor(floor.cases),
    caseEvaluations: floor.cases,
    gate: 'deterministic_stability',
    qualityGatePassed: false,
    aggregateGatePassed: true,
    caseGatePassed: true,
    caseRegressionIds: [],
  };
}

await test('quality evidence cannot hide a per-case regression behind successful aggregate flags', () => {
  const report = qualityReport();
  assert.equal(evaluateChildReport(JSON.stringify(report), 0, 'quality-offline').passed, true);
  const knownSuccess = report.caseEvaluations.find((item) => item.top1Correct);
  assert.ok(knownSuccess);
  const corrupt = [
    { ...report, top1Accuracy: 0 },
    { ...report, top1Accuracy: 1 },
    { ...report, qualityGatePassed: true },
    { ...report, meanReciprocalRank: 1 },
    { ...report, datasetDigest: '0'.repeat(64) },
    { ...report, embeddingBackend: 'ollama' },
    { ...report, caseEvaluations: report.caseEvaluations.slice(1) },
    {
      ...report,
      caseEvaluations: report.caseEvaluations.map((item) =>
        item.id === knownSuccess.id ? { ...item, top1Correct: false } : item,
      ),
    },
    {
      ...report,
      categories: { ...report.categories, typo: { ...report.categories['typo'], cases: 0 } },
    },
  ];
  for (const value of corrupt)
    assert.throws(() => evaluateChildReport(JSON.stringify(value), 0, 'quality-offline'));
  const liveFailure = { ...report, embeddingBackend: 'ollama', ok: false };
  assert.equal(evaluateChildReport(JSON.stringify(liveFailure), 0, 'quality-ollama').passed, false);
  assert.throws(() =>
    evaluateChildReport(JSON.stringify({ ...liveFailure, ok: true }), 0, 'quality-ollama'),
  );
});

await test('native evidence preserves coverage and recomputes the latency policy', () => {
  const report = {
    schemaVersion: 2,
    ok: true,
    layer: 'native-dsh-registry',
    catalogSize: 431,
    liveSemanticCases: 0,
    externalToolEffects: false,
    elapsedMs: 100,
    checks: [
      'standard-base-tools-visible',
      'native-plugin-mcp-discovery-and-call',
      'original-schemas-preserved',
      'discovery-does-not-execute',
      'agent-isolation',
      'bounded-lru',
      'unload-restores-base-and-instructions',
      'no-match-does-not-activate',
      'embedding-outage-bm25-fallback',
      'explicit-reference-before-limit',
      'explicit-reference-fallback',
    ],
    overhead: {
      passed: true,
      iterations: 20,
      coldNativeMs: 3,
      directP95Ms: 1,
      nativeP95Ms: 4,
      allowedP95Ms: 51.2,
    },
  };
  assert.equal(evaluateChildReport(JSON.stringify(report), 0, 'native').passed, true);
  const corrupt = [
    { ...report, checks: report.checks.slice(1) },
    { ...report, overhead: { ...report.overhead, nativeP95Ms: 60 } },
    { ...report, overhead: { ...report.overhead, allowedP95Ms: 100 } },
    { ...report, externalToolEffects: true },
  ];
  for (const value of corrupt)
    assert.throws(() => evaluateChildReport(JSON.stringify(value), 0, 'native'));
  assert.throws(() => evaluateChildReport(JSON.stringify(report), 0, 'native', true));
});
