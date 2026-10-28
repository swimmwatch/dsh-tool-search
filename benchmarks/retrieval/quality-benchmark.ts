import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { QUALITY_CASES } from './cases/quality-cases.js';
import { QUALITY_FIXTURE_BY_ID, QUALITY_FIXTURES } from './cases/quality-fixtures.js';
import {
  BENCHMARK_SCHEMA_VERSION,
  MAX_CONFUSION_PAIRS,
  MAX_REPORTED_FAILURES,
  QUALITY_THRESHOLDS,
} from '../shared/benchmark-policy.js';
import { DeterministicEmbeddingAdapter } from '../shared/deterministic-embedding-adapter.js';
import {
  type CategoryMetrics,
  type ConfusionPair,
  QUALITY_CATEGORIES,
  type QualityBenchmarkReport,
  type QualityCase,
  type QualityCaseScore,
  type QualityCategory,
  type QualityEmbeddingBackend,
  type QualityFailure,
  type QualitySearchMode,
} from '../shared/quality-types.js';
import { EmbeddingCache } from '../../src/core/embeddings/definition-vector-cache.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  OllamaEmbeddingClient,
} from '../../src/core/embeddings/ollama-embedding-provider.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import type { EmbeddingAdapter, SearchResult } from '../../src/core/shared/types.js';
import { EMBEDDING } from '../../src/constants.js';
import { isDeterministicallyStable, stabilityBaselineSchema } from '../shared/stability-gate.js';
import {
  caseBaselineSchema,
  caseRegressionIds,
  scoreQualityCase,
} from '../shared/case-quality-gate.js';

const EXACT_CATEGORY_GATES = new Set<QualityCategory>([
  'policy_exclusion',
  'prompt_injection',
  'safety_negation',
]);

function datasetDigest(): string {
  return createHash('sha256')
    .update(JSON.stringify({ cases: QUALITY_CASES, fixtures: QUALITY_FIXTURES }), 'utf8')
    .digest('hex');
}

interface CaseEvaluation extends QualityCaseScore {
  readonly benchmarkCase: QualityCase;
  readonly expectedLabel: string;
  readonly actualLabel: string;
  readonly failure: QualityFailure;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

class MetricsAccumulator {
  public summarize(evaluations: readonly CaseEvaluation[]): CategoryMetrics {
    const positives = evaluations.filter(({ benchmarkCase }) => benchmarkCase.expected.matched);
    const negatives = evaluations.filter(({ benchmarkCase }) => !benchmarkCase.expected.matched);
    const forbidden = evaluations.filter(({ forbiddenTop1 }) => forbiddenTop1 !== null);
    return {
      cases: evaluations.length,
      positiveCases: positives.length,
      noMatchCases: negatives.length,
      top1Accuracy:
        ratio(evaluations.filter(({ top1Correct }) => top1Correct).length, evaluations.length) ?? 0,
      recallAt5: ratio(positives.filter(({ recallAt5 }) => recallAt5).length, positives.length),
      meanReciprocalRank:
        positives.length === 0
          ? null
          : Number(
              (
                positives.reduce((total, { reciprocalRank }) => total + (reciprocalRank ?? 0), 0) /
                positives.length
              ).toFixed(4),
            ),
      noMatchAccuracy: ratio(
        negatives.filter(({ noMatchCorrect }) => noMatchCorrect).length,
        negatives.length,
      ),
      forbiddenToolRate: ratio(
        forbidden.filter(({ forbiddenTop1 }) => forbiddenTop1).length,
        forbidden.length,
      ),
      forbiddenAt5Rate: ratio(
        forbidden.filter(({ forbiddenAt5 }) => forbiddenAt5).length,
        forbidden.length,
      ),
    };
  }

  public confusionPairs(evaluations: readonly CaseEvaluation[]): readonly ConfusionPair[] {
    const counts = new Map<string, number>();
    for (const evaluation of evaluations.filter(({ top1Correct }) => !top1Correct)) {
      const key = `${evaluation.expectedLabel}\u0000${evaluation.actualLabel}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const [expected = '', actual = ''] = key.split('\u0000');
        return { expected, actual, count };
      })
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.expected.localeCompare(right.expected) ||
          left.actual.localeCompare(right.actual),
      )
      .slice(0, MAX_CONFUSION_PAIRS);
  }
}

class ToolSearchQualityBenchmark {
  private readonly metrics = new MetricsAccumulator();
  private readonly embeddingClient: EmbeddingAdapter | undefined;

  public constructor(
    private readonly mode: QualitySearchMode,
    private readonly embeddingBackend: QualityEmbeddingBackend,
    private readonly cacheRoot: string,
  ) {
    this.embeddingClient =
      mode === 'bm25'
        ? undefined
        : embeddingBackend === 'ollama'
          ? new OllamaEmbeddingClient(EMBEDDING)
          : new DeterministicEmbeddingAdapter();
  }

  private groupCases(): ReadonlyMap<string, readonly QualityCase[]> {
    const groups = new Map<string, QualityCase[]>();
    for (const benchmarkCase of QUALITY_CASES) {
      const key = `${benchmarkCase.fixtureId}\u0000${benchmarkCase.policyProfile}`;
      const cases = groups.get(key) ?? [];
      cases.push(benchmarkCase);
      groups.set(key, cases);
    }
    return groups;
  }

  private async searchGroup(cases: readonly QualityCase[]): Promise<readonly SearchResult[]> {
    const first = cases[0];
    if (!first) return [];
    const fixture = QUALITY_FIXTURE_BY_ID.get(first.fixtureId);
    if (!fixture) throw new Error(`Unknown quality fixture: ${first.fixtureId}.`);
    const service = new ToolSearchService(fixture.tools, {
      policyProfile: first.policyProfile,
      ...(this.embeddingClient
        ? {
            model: this.embeddingClient.model,
            embeddingClient: this.embeddingClient,
            embeddingCache: new EmbeddingCache(
              this.embeddingClient.cacheIdentity ?? this.embeddingClient.model,
              {
                root: this.cacheRoot,
              },
            ),
          }
        : {}),
    });
    if (this.mode === 'hybrid') {
      return service.hybridMany(
        cases.map(({ query }) => query),
        { includeRejectedCandidates: true },
      );
    }
    return cases.map(({ query }) => service.lexical(query, 'bm25'));
  }

  private evaluateCase(benchmarkCase: QualityCase, result: SearchResult): CaseEvaluation {
    const expected = new Set(benchmarkCase.expected.acceptableTools);
    const rankedNames = result.candidates.map(({ name }) => name);
    const selectedName = result.matched ? rankedNames[0] : undefined;
    const expectedLabel = benchmarkCase.expected.matched
      ? [...expected].sort().join('|')
      : 'no_match';
    const actualLabel = selectedName ?? 'no_match';
    return {
      benchmarkCase,
      ...scoreQualityCase(benchmarkCase, result),
      expectedLabel,
      actualLabel,
      failure: {
        id: benchmarkCase.id,
        category: benchmarkCase.category,
        expected: expectedLabel,
        actual: actualLabel,
        reason: result.reason,
        queryCoverage: result.queryCoverage ?? null,
        scoreMargin: result.scoreMargin ?? null,
        candidates: result.candidates.map((candidate) => ({
          name: candidate.name,
          score: candidate.score,
          semanticScore: candidate.semanticScore ?? null,
          lexicalScore: candidate.lexicalScore ?? null,
        })),
      },
    };
  }

  public async run(): Promise<QualityBenchmarkReport> {
    const startedAt = performance.now();
    const evaluations: CaseEvaluation[] = [];
    let degradedCases = 0;
    for (const cases of this.groupCases().values()) {
      const results = await this.searchGroup(cases);
      degradedCases += results.filter((result) => result.degraded).length;
      if (results.length !== cases.length) {
        throw new Error('Quality search returned an unexpected result count.');
      }
      cases.forEach((benchmarkCase, index) => {
        const result = results[index];
        if (!result) throw new Error('Quality search result is missing.');
        evaluations.push(this.evaluateCase(benchmarkCase, result));
      });
    }
    const failed = evaluations.filter(
      ({ top1Correct, forbiddenTop1 }) => !top1Correct || forbiddenTop1 === true,
    );
    const categoryEntries = QUALITY_CATEGORIES.map(
      (category) =>
        [
          category,
          this.metrics.summarize(
            evaluations.filter(({ benchmarkCase }) => benchmarkCase.category === category),
          ),
        ] as const,
    );
    const metrics = this.metrics.summarize(evaluations);
    const categories = Object.fromEntries(categoryEntries) as Readonly<
      Record<QualityCategory, CategoryMetrics>
    >;
    const categoryGatePassed = Object.entries(categories).every(
      ([category, categoryMetrics]) =>
        categoryMetrics.cases > 0 &&
        categoryMetrics.top1Accuracy >=
          (EXACT_CATEGORY_GATES.has(category as QualityCategory)
            ? 1
            : QUALITY_THRESHOLDS.categoryAccuracy),
    );
    const ok =
      degradedCases === 0 &&
      metrics.top1Accuracy >= QUALITY_THRESHOLDS.top1Accuracy &&
      (metrics.recallAt5 ?? 0) >= QUALITY_THRESHOLDS.recallAt5 &&
      (metrics.meanReciprocalRank ?? 0) >= QUALITY_THRESHOLDS.meanReciprocalRank &&
      (metrics.noMatchAccuracy ?? 0) >= QUALITY_THRESHOLDS.noMatchAccuracy &&
      (metrics.forbiddenToolRate ?? 0) <= QUALITY_THRESHOLDS.forbiddenToolRate &&
      categoryGatePassed;
    return {
      layer: 'retrieval-core',
      degradedCases,
      embeddingBackend: this.embeddingBackend,
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      ok,
      datasetDigest: datasetDigest(),
      mode: this.mode,
      embeddingModel: this.embeddingClient?.model ?? null,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      fixtures: QUALITY_FIXTURES.length,
      caseEvaluations: evaluations.map(
        ({
          benchmarkCase: _case,
          expectedLabel: _expected,
          actualLabel: _actual,
          failure: _failure,
          ...score
        }) => score,
      ),
      ...metrics,
      categories,
      confusionPairs: this.metrics.confusionPairs(evaluations),
      failedCaseIds: failed
        .map(({ benchmarkCase }) => benchmarkCase.id)
        .slice(0, MAX_REPORTED_FAILURES),
      failures: failed.map(({ failure }) => failure).slice(0, MAX_REPORTED_FAILURES),
    };
  }
}

function parseMode(argumentsList: readonly string[]): QualitySearchMode {
  const modeArgument = argumentsList.find((argument) => argument.startsWith('--mode='));
  const value = modeArgument?.slice('--mode='.length) ?? 'hybrid';
  if (value !== 'hybrid' && value !== 'bm25') {
    throw new Error('Quality benchmark mode must be hybrid or bm25.');
  }
  return value;
}

function parseEmbeddingBackend(argumentsList: readonly string[]): QualityEmbeddingBackend {
  const argument = argumentsList.find((value) => value.startsWith('--embedding='));
  const backend = argument?.slice('--embedding='.length) ?? 'ollama';
  if (backend !== 'deterministic' && backend !== 'ollama') {
    throw new Error('Embedding backend must be deterministic or ollama.');
  }
  return backend;
}

async function applyDeterministicStabilityGate(report: QualityBenchmarkReport): Promise<
  QualityBenchmarkReport & {
    readonly gate: 'deterministic_stability';
    readonly qualityGatePassed: boolean;
    readonly aggregateGatePassed: boolean;
    readonly caseGatePassed: boolean;
    readonly caseRegressionIds: readonly string[];
  }
> {
  const baseline = stabilityBaselineSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../baselines/deterministic-dsh-public-v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const aggregateGatePassed = isDeterministicallyStable(report, baseline);
  const caseBaseline = caseBaselineSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../baselines/deterministic-dsh-case-floor-v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const regressions = caseRegressionIds(
    report.caseEvaluations,
    caseBaseline,
    QUALITY_CASES.map(({ id }) => id),
  );
  const caseGatePassed =
    report.datasetDigest === caseBaseline.datasetDigest &&
    report.embeddingModel === caseBaseline.embeddingModel &&
    report.mode === caseBaseline.mode &&
    report.degradedCases === 0 &&
    regressions.length === 0;
  return {
    ...report,
    ok: aggregateGatePassed && caseGatePassed,
    gate: 'deterministic_stability',
    qualityGatePassed: report.ok,
    aggregateGatePassed,
    caseGatePassed,
    caseRegressionIds: regressions,
  };
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const mode = parseMode(argumentsList);
  const embeddingBackend = parseEmbeddingBackend(argumentsList);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'tool-search-quality-'));
  try {
    const qualityReport = await new ToolSearchQualityBenchmark(
      mode,
      embeddingBackend,
      temporaryRoot,
    ).run();
    const report = argumentsList.includes('--gate=stability')
      ? await applyDeterministicStabilityGate(qualityReport)
      : qualityReport;
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Quality benchmark failed.',
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    })}\n`,
  );
  process.exitCode = 1;
});
