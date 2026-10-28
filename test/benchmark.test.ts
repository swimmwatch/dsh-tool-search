import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { z } from 'zod';
import { QUALITY_CASES } from '../benchmarks/retrieval/cases/quality-cases.js';
import {
  QUALITY_FIXTURE_BY_ID,
  QUALITY_FIXTURES,
} from '../benchmarks/retrieval/cases/quality-fixtures.js';
import { MINIMUM_QUALITY_CASES } from '../benchmarks/shared/benchmark-policy.js';
import { evaluateChildReport } from '../benchmarks/shared/report.js';
import {
  isDeterministicallyStable,
  stabilityBaselineSchema,
} from '../benchmarks/shared/stability-gate.js';

await test('the migrated benchmark corpus retains all source cases and valid fixture references', () => {
  assert.ok(QUALITY_CASES.length >= MINIMUM_QUALITY_CASES);
  assert.equal(QUALITY_CASES.length, 201);
  assert.equal(new Set(QUALITY_CASES.map((item) => item.id)).size, QUALITY_CASES.length);
  assert.equal(QUALITY_FIXTURES.length, 17);
  for (const item of QUALITY_CASES)
    assert.ok(QUALITY_FIXTURE_BY_ID.has(item.fixtureId), item.fixtureId);
});

await test('benchmark child acceptance requires both a successful exit and an explicit success report', () => {
  const report = JSON.stringify({
    schemaVersion: 2,
    ok: true,
    catalogSize: 5_000,
    selectedToolName: 'mcp__knowledge__find_security_exception',
    matched: true,
    constructionMs: 10,
    elapsedMs: 2,
    firstQueryMs: 2,
    searchBudgetMs: 2_000,
    warm: { iterations: 20, p95Ms: 1, correct: true, informationalOnly: true },
  });
  assert.equal(evaluateChildReport(report, 0, 'scale').passed, true);
  assert.equal(evaluateChildReport(report, 1, 'scale').passed, false);
  assert.equal(evaluateChildReport(report, null, 'scale').passed, false);
  assert.throws(() => evaluateChildReport('{"ok":true}', 0, 'scale'));
  assert.throws(() => evaluateChildReport('{"cases":200}', 0, 'scale'));
  assert.throws(() => evaluateChildReport('not json', 0, 'scale'));
});

await test('the migrated corpus still matches its immutable deterministic baseline digest', async () => {
  const baseline = z
    .object({ datasetDigest: z.string() })
    .parse(
      JSON.parse(
        await readFile(
          new URL('../benchmarks/baselines/deterministic-dsh-public-v1.json', import.meta.url),
          'utf8',
        ),
      ),
    );
  const digest = createHash('sha256')
    .update(JSON.stringify({ cases: QUALITY_CASES, fixtures: QUALITY_FIXTURES }))
    .digest('hex');
  assert.equal(digest, baseline.datasetDigest);
});

await test('stability acceptance rejects quality regressions, fallback and mismatched corpus identity', async () => {
  const baseline = stabilityBaselineSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../benchmarks/baselines/deterministic-dsh-public-v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const current = { ...baseline, degradedCases: 0 };
  assert.ok(isDeterministicallyStable(current, baseline));
  assert.equal(
    isDeterministicallyStable({ ...current, datasetDigest: '0'.repeat(64) }, baseline),
    false,
  );
  assert.equal(
    isDeterministicallyStable({ ...current, cases: current.cases + 1 }, baseline),
    false,
  );
  assert.equal(
    isDeterministicallyStable({ ...current, embeddingModel: 'other-model' }, baseline),
    false,
  );
  assert.equal(isDeterministicallyStable({ ...current, degradedCases: 1 }, baseline), false);
  assert.equal(isDeterministicallyStable({ ...current, forbiddenToolRate: 1 }, baseline), false);
  for (const key of [
    'top1Accuracy',
    'recallAt5',
    'meanReciprocalRank',
    'noMatchAccuracy',
  ] as const) {
    assert.equal(isDeterministicallyStable({ ...current, [key]: 0 }, baseline), false);
  }
});
