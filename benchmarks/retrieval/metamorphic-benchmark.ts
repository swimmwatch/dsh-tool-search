import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import type { SearchResult, ToolMetadata } from '../../src/core/shared/types.js';
import {
  BENCHMARK_RANDOM_SEED,
  BENCHMARK_SCHEMA_VERSION,
  METAMORPHIC_TRANSFORMATION_COUNT,
} from '../shared/benchmark-policy.js';
import { DeterministicEmbeddingAdapter } from '../shared/deterministic-embedding-adapter.js';
import { EmbeddingCache } from '../../src/core/embeddings/definition-vector-cache.js';
import {
  caseBaselineSchema,
  preservesMetamorphicOutcome,
  validateCaseCoverage,
} from '../shared/case-quality-gate.js';
import type { QualityCase, QualityCaseScore } from '../shared/quality-types.js';
import { QUALITY_CASES } from './cases/quality-cases.js';
import { QUALITY_FIXTURE_BY_ID, QUALITY_FIXTURES } from './cases/quality-fixtures.js';

const TRANSFORMATIONS_PER_CASE = 5;
const SOURCE_CASE_COUNT = METAMORPHIC_TRANSFORMATION_COUNT / TRANSFORMATIONS_PER_CASE;

interface Transformation {
  readonly id: string;
  readonly query: (value: string) => string;
  readonly catalog: (
    tools: readonly ToolMetadata[],
    random: FixedRandom,
  ) => readonly ToolMetadata[];
}

class FixedRandom {
  public constructor(private state: number) {}

  public next(): number {
    this.state = (Math.imul(this.state, 1_664_525) + 1_013_904_223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

function unchangedCatalog(tools: readonly ToolMetadata[]): readonly ToolMetadata[] {
  return tools;
}

function reorderCatalog(
  tools: readonly ToolMetadata[],
  random: FixedRandom,
): readonly ToolMetadata[] {
  const result = [...tools];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const replacementIndex = Math.floor(random.next() * (index + 1));
    [result[index], result[replacementIndex]] = [
      result[replacementIndex] as ToolMetadata,
      result[index] as ToolMetadata,
    ];
  }
  return result;
}

function addIrrelevantTool(tools: readonly ToolMetadata[]): readonly ToolMetadata[] {
  return [
    ...tools,
    {
      name: 'mcp__irrelevant_fixture__read_weather_archive',
      description:
        'Read an unrelated historical weather archive.\nexec tool declaration:\n' +
        '```ts\ndeclare const tools: { read_weather_archive(args: { year: number }): ' +
        'Promise<unknown>; };\n```',
    },
  ];
}

const TRANSFORMATIONS: readonly Transformation[] = [
  {
    id: 'whitespace_case',
    query: (value) => `  ${value.toUpperCase().replace(/\s+/g, '   ')}  `,
    catalog: unchangedCatalog,
  },
  {
    id: 'punctuation',
    query: (value) => `(${value.replace(/\.$/, '')})!`,
    catalog: unchangedCatalog,
  },
  {
    id: 'safe_paraphrase',
    query: (value) =>
      value
        .replace(/\bsearch\b/gi, 'find')
        .replace(/\bget\b/gi, 'fetch')
        .replace(/\blist\b/gi, 'show'),
    catalog: unchangedCatalog,
  },
  {
    id: 'catalog_reorder',
    query: (value) => value,
    catalog: reorderCatalog,
  },
  {
    id: 'irrelevant_tool_and_negative_constraint',
    query: (value) => `${value} Do not choose any unrelated provider or different action.`,
    catalog: addIrrelevantTool,
  },
];

async function search(
  benchmarkCase: QualityCase,
  tools: readonly ToolMetadata[],
  query: string,
  cacheRoot: string,
): Promise<SearchResult> {
  const embeddingClient = new DeterministicEmbeddingAdapter();
  const service = new ToolSearchService(tools, {
    policyProfile: benchmarkCase.policyProfile,
    model: embeddingClient.model,
    embeddingClient,
    embeddingCache: new EmbeddingCache(embeddingClient.model, { root: cacheRoot }),
  });
  return service.search(query, 'hybrid');
}

async function runTransformation(
  benchmarkCase: QualityCase,
  transformation: Transformation,
  random: FixedRandom,
  cacheRoot: string,
  floor: QualityCaseScore,
  fullShortlist = false,
): Promise<{ passed: boolean; degradedCases: number }> {
  const fixture = QUALITY_FIXTURE_BY_ID.get(benchmarkCase.fixtureId);
  if (!fixture) throw new Error(`Unknown fixture: ${benchmarkCase.fixtureId}.`);
  const baseline = await search(benchmarkCase, fixture.tools, benchmarkCase.query, cacheRoot);
  const transformed = await search(
    benchmarkCase,
    transformation.catalog(fixture.tools, random),
    transformation.query(benchmarkCase.query),
    cacheRoot,
  );
  return {
    passed: preservesMetamorphicOutcome(benchmarkCase, baseline, transformed, floor, fullShortlist),
    degradedCases: Number(baseline.degraded) + Number(transformed.degraded),
  };
}

async function main(): Promise<void> {
  if (!Number.isInteger(SOURCE_CASE_COUNT)) {
    throw new Error('Metamorphic transformation count must divide evenly.');
  }
  const sourceCases = QUALITY_CASES.slice(0, SOURCE_CASE_COUNT);
  if (sourceCases.length !== SOURCE_CASE_COUNT) {
    throw new Error('Insufficient quality cases for the metamorphic suite.');
  }
  const startedAt = performance.now();
  const random = new FixedRandom(BENCHMARK_RANDOM_SEED);
  const failedTransformationIds: string[] = [];
  const baseline = caseBaselineSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../baselines/deterministic-dsh-case-floor-v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const digest = createHash('sha256')
    .update(JSON.stringify({ cases: QUALITY_CASES, fixtures: QUALITY_FIXTURES }))
    .digest('hex');
  if (baseline.datasetDigest !== digest) throw new Error('Case baseline dataset mismatch.');
  const floors = validateCaseCoverage(
    baseline.cases,
    QUALITY_CASES.map(({ id }) => id),
  );
  const cacheRoot = await mkdtemp(join(tmpdir(), 'dsh-metamorphic-cache-'));
  let degradedCases = 0;
  let transformations = 0;
  const coveredCases = new Set<string>();
  const coveredCategories = new Set<string>();
  const record = (
    item: QualityCase,
    transformationId: string,
    result: { passed: boolean; degradedCases: number },
  ): void => {
    transformations++;
    coveredCases.add(item.id);
    coveredCategories.add(item.category);
    degradedCases += result.degradedCases;
    if (!result.passed) failedTransformationIds.push(`${item.id}:${transformationId}`);
  };
  try {
    for (const benchmarkCase of sourceCases) {
      const floor = floors.get(benchmarkCase.id);
      if (!floor) throw new Error('Case floor is missing.');
      for (const transformation of TRANSFORMATIONS) {
        const result = await runTransformation(
          benchmarkCase,
          transformation,
          random,
          cacheRoot,
          floor,
        );
        record(benchmarkCase, transformation.id, result);
      }
    }
    const reorder: Transformation = {
      id: 'full_catalog_reorder',
      query: (value) => value,
      catalog: reorderCatalog,
    };
    for (const benchmarkCase of QUALITY_CASES) {
      const floor = floors.get(benchmarkCase.id);
      if (!floor) throw new Error('Case floor is missing.');
      const result = await runTransformation(
        benchmarkCase,
        reorder,
        random,
        cacheRoot,
        floor,
        true,
      );
      record(benchmarkCase, reorder.id, result);
    }
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
  const report = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    ok:
      failedTransformationIds.length === 0 &&
      degradedCases === 0 &&
      transformations === METAMORPHIC_TRANSFORMATION_COUNT + QUALITY_CASES.length &&
      coveredCases.size === QUALITY_CASES.length,
    seed: BENCHMARK_RANDOM_SEED,
    transformations,
    sourceCases: coveredCases.size,
    categories: coveredCategories.size,
    degradedCases,
    failedTransformationIds,
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      ok: false,
      error: error instanceof Error ? error.name : 'UnknownError',
    })}\n`,
  );
  process.exitCode = 1;
});
