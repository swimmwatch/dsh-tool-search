import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { CONTRACT_CASE_IDS } from '../native/contracts-cases.js';
import { RETRIEVAL_CONTRACT_CASES } from '../retrieval/contract-cases.js';
import { QUALITY_CASES } from '../retrieval/cases/quality-cases.js';
import {
  BENCHMARK_RANDOM_SEED,
  BENCHMARK_SCHEMA_VERSION,
  PERFORMANCE_POLICY,
  QUALITY_THRESHOLDS,
  SCALE_CATALOG_SIZE,
  SCALE_SEARCH_BUDGET_MS,
} from './benchmark-policy.js';
import {
  caseBaselineSchema,
  caseRegressionIds,
  caseScoreSchema,
  validateCaseCoverage,
} from './case-quality-gate.js';
import { QUALITY_CATEGORIES, type QualityCaseScore } from './quality-types.js';
import { isDeterministicallyStable, stabilityBaselineSchema } from './stability-gate.js';

export type BenchmarkSuite =
  | 'quality-offline'
  | 'quality-ollama'
  | 'metamorphic'
  | 'scale'
  | 'native'
  | 'ptc'
  | 'native-contracts'
  | 'retrieval-contracts';

export const benchmarkReportSchema = z.object({ ok: z.boolean() }).catchall(z.unknown());
export type BenchmarkReport = z.infer<typeof benchmarkReportSchema>;

const nonnegative = z.number().nonnegative();
const count = nonnegative.int();
const ratio = z.number().min(0).max(1);
const baseSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
  ok: z.boolean(),
  elapsedMs: nonnegative,
});
const metricsSchema = z.object({
  cases: count,
  positiveCases: count,
  noMatchCases: count,
  top1Accuracy: ratio,
  recallAt5: ratio.nullable(),
  meanReciprocalRank: ratio.nullable(),
  noMatchAccuracy: ratio.nullable(),
  forbiddenToolRate: ratio.nullable(),
  forbiddenAt5Rate: ratio.nullable(),
});
const qualitySchema = baseSchema.extend({
  ...metricsSchema.shape,
  layer: z.literal('retrieval-core'),
  embeddingBackend: z.enum(['deterministic', 'ollama']),
  datasetDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  mode: z.literal('hybrid'),
  embeddingModel: z.string().min(1),
  fixtures: z.literal(17),
  degradedCases: count,
  categories: z.record(z.enum(QUALITY_CATEGORIES), metricsSchema),
  caseEvaluations: z.array(caseScoreSchema),
});
const baseline = stabilityBaselineSchema.parse(
  JSON.parse(
    readFileSync(new URL('../baselines/deterministic-dsh-public-v1.json', import.meta.url), 'utf8'),
  ),
);

const caseBaseline = caseBaselineSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../baselines/deterministic-dsh-case-floor-v1.json', import.meta.url),
      'utf8',
    ),
  ),
);
const qualityCaseIds = QUALITY_CASES.map(({ id }) => id);

function unique(values: readonly string[], label: string): void {
  assert.equal(new Set(values).size, values.length, `Duplicate ${label}`);
}

function validateMetrics(
  metrics: z.infer<typeof metricsSchema>,
  scores: readonly QualityCaseScore[],
): void {
  assert.equal(metrics.cases, scores.length);
  assert.equal(metrics.positiveCases, scores.filter((item) => item.recallAt5 !== null).length);
  assert.equal(metrics.noMatchCases, scores.filter((item) => item.noMatchCorrect !== null).length);
  const fields = {
    top1Accuracy: 'top1Correct',
    recallAt5: 'recallAt5',
    meanReciprocalRank: 'reciprocalRank',
    noMatchAccuracy: 'noMatchCorrect',
    forbiddenToolRate: 'forbiddenTop1',
    forbiddenAt5Rate: 'forbiddenAt5',
  } as const;
  for (const [metric, score] of Object.entries(fields)) {
    const values = scores.map((item) => item[score]).filter((value) => value !== null);
    const expected = values.length
      ? Number(
          (values.reduce<number>((sum, value) => sum + Number(value), 0) / values.length).toFixed(
            4,
          ),
        )
      : null;
    assert.equal(metrics[metric as keyof typeof fields], expected, `Inconsistent ${metric}`);
  }
}

function strictQualityPassed(quality: z.infer<typeof qualitySchema>): boolean {
  return (
    quality.degradedCases === 0 &&
    quality.top1Accuracy >= QUALITY_THRESHOLDS.top1Accuracy &&
    (quality.recallAt5 ?? 0) >= QUALITY_THRESHOLDS.recallAt5 &&
    (quality.meanReciprocalRank ?? 0) >= QUALITY_THRESHOLDS.meanReciprocalRank &&
    (quality.noMatchAccuracy ?? 0) >= QUALITY_THRESHOLDS.noMatchAccuracy &&
    (quality.forbiddenToolRate ?? 0) <= QUALITY_THRESHOLDS.forbiddenToolRate &&
    Object.values(quality.categories).every(
      (item) => item.top1Accuracy >= QUALITY_THRESHOLDS.categoryAccuracy,
    )
  );
}

function validateQuality(report: BenchmarkReport, suite: BenchmarkSuite): void {
  const quality = qualitySchema.parse(report);
  assert.equal(quality.cases, baseline.cases, 'Unexpected quality corpus size');
  assert.equal(quality.datasetDigest, baseline.datasetDigest, 'Unexpected quality corpus digest');
  assert.equal(quality.positiveCases + quality.noMatchCases, quality.cases);
  assert.equal(quality.caseEvaluations.length, quality.cases);
  validateCaseCoverage(quality.caseEvaluations, qualityCaseIds);
  validateMetrics(quality, quality.caseEvaluations);
  assert.ok(quality.degradedCases <= quality.cases);
  const categories = Object.values(quality.categories);
  for (const category of categories) {
    assert.ok(category.cases > 0, 'Empty quality category');
    assert.equal(category.positiveCases + category.noMatchCases, category.cases);
  }
  for (const category of QUALITY_CATEGORIES) {
    const ids = new Set(
      QUALITY_CASES.filter((item) => item.category === category).map(({ id }) => id),
    );
    validateMetrics(
      quality.categories[category],
      quality.caseEvaluations.filter(({ id }) => ids.has(id)),
    );
  }
  for (const key of ['cases', 'positiveCases', 'noMatchCases'] as const) {
    assert.equal(
      categories.reduce((sum, item) => sum + item[key], 0),
      quality[key],
    );
  }
  if (suite === 'quality-offline') {
    assert.equal(quality.embeddingBackend, 'deterministic');
    const gate = z
      .object({
        gate: z.literal('deterministic_stability'),
        qualityGatePassed: z.boolean(),
        aggregateGatePassed: z.boolean(),
        caseGatePassed: z.boolean(),
        caseRegressionIds: z.array(z.string()),
      })
      .parse(report);
    const aggregate = isDeterministicallyStable(quality, baseline);
    assert.equal(gate.aggregateGatePassed, aggregate);
    const regressions = caseRegressionIds(quality.caseEvaluations, caseBaseline, qualityCaseIds);
    assert.deepEqual(gate.caseRegressionIds, regressions);
    const casesPassed =
      quality.embeddingModel === caseBaseline.embeddingModel &&
      quality.degradedCases === 0 &&
      regressions.length === 0;
    assert.equal(gate.caseGatePassed, casesPassed);
    assert.equal(gate.qualityGatePassed, strictQualityPassed(quality));
    assert.equal(report.ok, aggregate && gate.caseGatePassed, 'Contradictory quality success');
  } else {
    assert.equal(quality.embeddingBackend, 'ollama');
    assert.equal(report.ok, strictQualityPassed(quality), 'Contradictory live quality success');
  }
}

const NATIVE_CHECKS = [
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
];
const PTC_CHECKS = [
  'initial-sdk-base-only',
  'discovery-available-inside-ptc',
  'hidden-mcp-instructions-absent',
  'native-plugin-mcp-discovery-and-nested-call',
  'original-input-output-declarations-preserved',
  'native-direct-calls-rejected',
  'child-discovery-is-independent',
  'unload-restores-exact-sdk',
  'existing-permission-guards-preserved',
  'bounded-lru-removes-sdk-and-invocation',
  'no-match-preserves-sdk',
  'standard-and-ptc-coexist-with-independent-state',
  'ptc-embedding-outage-bm25-fallback',
];

function validateRegistry(report: BenchmarkReport, suite: 'native' | 'ptc', live: boolean): void {
  const registry = baseSchema
    .extend({
      layer: z.literal(suite === 'native' ? 'native-dsh-registry' : 'ptc-dsh-registry'),
      catalogSize: count.min(431),
      liveSemanticCases: z.literal(live ? 2 : 0),
      checks: z.array(z.string()),
      externalToolEffects: z.literal(false),
    })
    .parse(report);
  unique(registry.checks, 'registry checks');
  for (const name of suite === 'native' ? NATIVE_CHECKS : PTC_CHECKS) {
    assert.ok(registry.checks.includes(name), `Missing ${suite} check: ${name}`);
  }
  if (suite === 'native') {
    const { overhead } = z
      .object({
        overhead: z.object({
          passed: z.boolean(),
          iterations: z.literal(PERFORMANCE_POLICY.iterations),
          coldNativeMs: nonnegative,
          directP95Ms: nonnegative,
          nativeP95Ms: nonnegative,
          allowedP95Ms: nonnegative,
        }),
      })
      .parse(report);
    const allowed =
      overhead.directP95Ms * PERFORMANCE_POLICY.relativeTolerance +
      PERFORMANCE_POLICY.absoluteToleranceMs;
    assert.ok(Math.abs(allowed - overhead.allowedP95Ms) < 0.001, 'Changed native latency policy');
    assert.equal(overhead.passed, overhead.nativeP95Ms <= allowed);
    assert.equal(report.ok, overhead.passed);
  } else {
    const { sdkCharacters } = z
      .object({
        sdkCharacters: z.object({
          fullCatalog: count.positive(),
          initial: count.positive(),
          discovered: count.positive(),
          unloaded: count.positive(),
        }),
        assembly: z.object({
          iterations: z.literal(PERFORMANCE_POLICY.iterations),
          p95Ms: nonnegative,
          informationalOnly: z.literal(true),
        }),
      })
      .parse(report);
    assert.equal(sdkCharacters.initial, sdkCharacters.unloaded);
    assert.ok(sdkCharacters.discovered > sdkCharacters.initial);
    assert.ok(sdkCharacters.fullCatalog > sdkCharacters.discovered);
  }
}

function validateMetamorphic(report: BenchmarkReport): void {
  const parsed = baseSchema
    .extend({
      seed: z.literal(BENCHMARK_RANDOM_SEED),
      transformations: z.literal(701),
      sourceCases: z.literal(201),
      categories: z.literal(25),
      degradedCases: count,
      failedTransformationIds: z.array(z.string().min(1)),
    })
    .parse(report);
  unique(parsed.failedTransformationIds, 'failed transformation IDs');
  assert.ok(parsed.failedTransformationIds.length <= parsed.transformations);
  assert.equal(
    report.ok,
    parsed.failedTransformationIds.length === 0 && parsed.degradedCases === 0,
  );
}

function validateScale(report: BenchmarkReport): void {
  const scale = baseSchema
    .extend({
      catalogSize: z.literal(SCALE_CATALOG_SIZE),
      selectedToolName: z.string().nullable(),
      matched: z.boolean(),
      constructionMs: nonnegative,
      firstQueryMs: nonnegative,
      warm: z.object({
        iterations: z.literal(PERFORMANCE_POLICY.iterations),
        p95Ms: nonnegative,
        correct: z.boolean(),
        informationalOnly: z.literal(true),
      }),
      searchBudgetMs: z.literal(SCALE_SEARCH_BUDGET_MS),
    })
    .parse(report);
  assert.equal(scale.elapsedMs, scale.firstQueryMs, 'Legacy scale measurement changed');
  assert.equal(
    report.ok,
    scale.matched &&
      scale.selectedToolName === 'mcp__knowledge__find_security_exception' &&
      scale.warm.correct &&
      scale.firstQueryMs <= SCALE_SEARCH_BUDGET_MS,
  );
}

function validateContracts(report: BenchmarkReport, suite: BenchmarkSuite): void {
  const contract = baseSchema
    .extend({
      suite: z.literal(suite),
      cases: count.positive(),
      passedCases: count,
      results: z.array(z.object({ id: z.string().min(1), passed: z.boolean() })),
      failures: z.array(z.object({ id: z.string().min(1), error: z.string().min(1) })),
    })
    .parse(report);
  const passed = contract.results.filter((result) => result.passed).length;
  const failures = contract.results
    .filter((result) => !result.passed)
    .map(({ id }) => id)
    .sort();
  unique(
    contract.results.map(({ id }) => id),
    'contract case IDs',
  );
  assert.equal(contract.results.length, contract.cases);
  const expectedIds =
    suite === 'native-contracts' ? CONTRACT_CASE_IDS : RETRIEVAL_CONTRACT_CASES.map(({ id }) => id);
  assert.deepEqual(
    contract.results.map(({ id }) => id).sort(),
    [...expectedIds].sort(),
    'Incomplete contract coverage',
  );
  assert.equal(contract.passedCases, passed);
  assert.deepEqual(contract.failures.map(({ id }) => id).sort(), failures);
  assert.equal(report.ok, passed === contract.cases, 'Contradictory contract success');
}

export function evaluateChildReport(
  stdout: string,
  exitCode: number | null,
  suite: BenchmarkSuite,
  live = false,
) {
  const report = benchmarkReportSchema.parse(JSON.parse(stdout));
  if (suite === 'quality-offline' || suite === 'quality-ollama') validateQuality(report, suite);
  else if (suite === 'native' || suite === 'ptc') validateRegistry(report, suite, live);
  else if (suite === 'metamorphic') validateMetamorphic(report);
  else if (suite === 'scale') validateScale(report);
  else validateContracts(report, suite);
  return { passed: exitCode === 0 && report.ok, report };
}
