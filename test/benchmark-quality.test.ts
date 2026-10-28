import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  caseBaselineSchema,
  caseRegressionIds,
  meetsCaseFloor,
  preservesMetamorphicOutcome,
  scoreQualityCase,
  validateCaseCoverage,
} from '../benchmarks/shared/case-quality-gate.js';
import type { QualityCase, QualityCaseScore } from '../benchmarks/shared/quality-types.js';
import { QUALITY_CASES } from '../benchmarks/retrieval/cases/quality-cases.js';
import { QUALITY_FIXTURES } from '../benchmarks/retrieval/cases/quality-fixtures.js';
import type { SearchResult } from '../src/core/shared/types.js';

const baseline = caseBaselineSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../benchmarks/baselines/deterministic-dsh-case-floor-v1.json', import.meta.url),
      'utf8',
    ),
  ),
);
const expectedIds = QUALITY_CASES.map(({ id }) => id);

const fixture: QualityCase = {
  id: 'explicit.workflow',
  category: 'exact_capability',
  query: 'workflow',
  fixtureId: 'synthetic',
  policyProfile: 'all',
  source: 'project_specific',
  expected: { matched: true, acceptableTools: ['workflow'], forbiddenTools: ['mcp__wrong__run'] },
};

function result(names: readonly string[], degraded = false): SearchResult {
  return {
    matched: names.length > 0,
    reason: 'synthetic_result',
    degraded,
    requiresRerank: false,
    candidates: names.map((name) => ({
      name,
      description: name,
      score: 1,
      risk: 'read',
      declarationAvailable: true,
      toolDigest: 'a'.repeat(64),
    })),
  };
}

function positiveScore(id: string, correct: boolean): QualityCaseScore {
  return {
    id,
    top1Correct: correct,
    recallAt5: true,
    reciprocalRank: correct ? 1 : 0.5,
    noMatchCorrect: null,
    forbiddenTop1: false,
    forbiddenAt5: false,
  };
}

await test('case floors preserve the original corpus identity and record mistakes as mistakes', () => {
  const digest = createHash('sha256')
    .update(JSON.stringify({ cases: QUALITY_CASES, fixtures: QUALITY_FIXTURES }))
    .digest('hex');
  assert.equal(baseline.datasetDigest, digest);
  assert.equal(baseline.cases.length, 201);
  assert.equal(baseline.cases.filter(({ top1Correct }) => top1Correct).length, 169);
  assert.equal(validateCaseCoverage(baseline.cases, expectedIds).size, 201);
  assert.deepEqual(caseRegressionIds(baseline.cases, baseline, expectedIds), []);
});

await test('a fixed case cannot compensate for another case regression', () => {
  const before = [positiveScore('first', true), positiveScore('second', false)];
  const after = [positiveScore('first', false), positiveScore('second', true)];
  assert.equal(
    before.filter(({ top1Correct }) => top1Correct).length,
    after.filter(({ top1Correct }) => top1Correct).length,
  );
  assert.equal(
    before.reduce((sum, item) => sum + (item.reciprocalRank ?? 0), 0),
    after.reduce((sum, item) => sum + (item.reciprocalRank ?? 0), 0),
  );
  assert.deepEqual(caseRegressionIds(after, { ...baseline, cases: before }, ['first', 'second']), [
    'first',
  ]);
  assert.ok(meetsCaseFloor(positiveScore('second', true), positiveScore('second', false)));
});

await test('case coverage rejects unknown missing and duplicate evaluation IDs', () => {
  assert.throws(() => validateCaseCoverage(baseline.cases.slice(1), expectedIds), /Missing/);
  const first = baseline.cases[0];
  assert.ok(first);
  assert.throws(() => validateCaseCoverage([...baseline.cases, first], expectedIds), /Duplicate/);
  assert.throws(
    () =>
      validateCaseCoverage([{ ...first, id: 'unknown' }, ...baseline.cases.slice(1)], expectedIds),
    /Unknown/,
  );
  assert.throws(
    () =>
      caseRegressionIds(
        baseline.cases,
        { ...baseline, cases: baseline.cases.slice(1) },
        expectedIds,
      ),
    /Missing/,
  );
});

await test('case floors enforce recall rank no-match and forbidden tail without blessing old errors', () => {
  const floor = positiveScore('positive', true);
  for (const patch of [
    { recallAt5: false },
    { reciprocalRank: 0.5 },
    { forbiddenTop1: true },
    { forbiddenAt5: true },
    { noMatchCorrect: false },
  ]) {
    assert.equal(meetsCaseFloor({ ...floor, ...patch }, floor), false);
  }
  const negative: QualityCaseScore = {
    ...floor,
    id: 'negative',
    recallAt5: null,
    reciprocalRank: null,
    noMatchCorrect: true,
  };
  assert.equal(meetsCaseFloor({ ...negative, noMatchCorrect: false }, negative), false);
  assert.ok(meetsCaseFloor({ ...floor, forbiddenAt5: false }, { ...floor, forbiddenAt5: true }));
});

await test('metamorphic checks reject empty constant wrong and degraded mutants', () => {
  const correct = result(['workflow']);
  const floor = scoreQualityCase(fixture, correct);
  for (const mutant of [result([]), result(['mcp__wrong__run']), result(['workflow'], true)]) {
    for (const fullShortlist of [false, true]) {
      assert.equal(
        preservesMetamorphicOutcome(fixture, mutant, mutant, floor, fullShortlist),
        false,
      );
    }
  }
  assert.ok(preservesMetamorphicOutcome(fixture, correct, correct, floor, true));
});

await test('catalog reorder checks the full shortlist but not floating-point scores', () => {
  const before = result(['workflow', 'read', 'write']);
  const floor = scoreQualityCase(fixture, before);
  const reordered = result(['workflow', 'write', 'read']);
  assert.equal(preservesMetamorphicOutcome(fixture, before, reordered, floor, true), false);
  assert.equal(
    preservesMetamorphicOutcome(fixture, before, result(['workflow', 'read']), floor, true),
    false,
  );
  const rescaled: SearchResult = {
    ...before,
    candidates: before.candidates.map((candidate) => ({ ...candidate, score: 0.123 })),
  };
  assert.ok(preservesMetamorphicOutcome(fixture, before, rescaled, floor, true));
});

await test('at-five metrics do not count a sixth candidate', () => {
  const names = ['one', 'two', 'three', 'four', 'five'];
  const acceptableOutside = scoreQualityCase(fixture, result([...names, 'workflow']));
  assert.equal(acceptableOutside.recallAt5, false);
  assert.equal(acceptableOutside.reciprocalRank, 0);
  const forbiddenOutside = scoreQualityCase(fixture, result([...names, 'mcp__wrong__run']));
  assert.equal(forbiddenOutside.forbiddenAt5, false);
});

await test('public no-match outcomes do not expose diagnostic rejected-candidate ranks', () => {
  const diagnostic: SearchResult = { ...result(['workflow']), matched: false };
  const floor = scoreQualityCase(fixture, diagnostic);
  assert.equal(floor.top1Correct, false);
  assert.equal(floor.recallAt5, true);
  assert.ok(preservesMetamorphicOutcome(fixture, result([]), result([]), floor, true));
});
