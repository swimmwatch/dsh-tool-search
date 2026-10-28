import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSearchContract } from '../benchmarks/retrieval/contract-assertions.js';
import {
  RETRIEVAL_CONTRACT_CASES,
  type RetrievalContractCase,
} from '../benchmarks/retrieval/contract-cases.js';
import type { DiscoveryResult, SearchTool } from '../src/types.js';

const target: SearchTool = { name: 'workflow', description: 'Run a workflow.', parameters: {} };
const other: SearchTool = { name: 'sentinel_list', description: 'List sentinels.', parameters: {} };
const scenario: RetrievalContractCase = {
  id: 'oracle/exact',
  kind: 'exact',
  target: target.name,
  query: target.name,
  profile: 'hybrid',
  distractors: 0,
  reversed: false,
  limit: 1,
};
const valid: DiscoveryResult<SearchTool> = {
  matches: [target],
  mode: 'pattern',
  degraded: false,
  authorityGranted: false,
};

await test('retrieval contract matrix contains unique fixed scenario identities', () => {
  assert.equal(RETRIEVAL_CONTRACT_CASES.length, 340);
  assert.equal(new Set(RETRIEVAL_CONTRACT_CASES.map(({ id }) => id)).size, 340);
});

await test('retrieval oracle rejects empty, wrong, fabricated, degraded and excessive results', () => {
  assert.doesNotThrow(() => assertSearchContract(scenario, valid, [target, other], 0));
  for (const mutation of [
    { ...valid, matches: [] },
    { ...valid, matches: [other] },
    { ...valid, matches: [{ ...target, parameters: { unexpected: true } }] },
    { ...valid, matches: [target, other] },
    { ...valid, degraded: true },
    { ...valid, mode: 'hybrid' as const },
  ]) {
    assert.throws(() => assertSearchContract(scenario, mutation, [target, other], 0));
  }
  assert.throws(() => assertSearchContract(scenario, valid, [target, other], 1));
});

await test('fallback oracle requires degradation and an attempted embedding operation', () => {
  const fallbackScenario = { ...scenario, kind: 'explicit', profile: 'outage' } as const;
  const fallback = { ...valid, mode: 'hybrid', degraded: true } as const;
  assert.doesNotThrow(() => assertSearchContract(fallbackScenario, fallback, [target], 1));
  assert.throws(() => assertSearchContract(fallbackScenario, fallback, [target], 0));
  assert.throws(() =>
    assertSearchContract(fallbackScenario, { ...fallback, degraded: false }, [target], 1),
  );
});
