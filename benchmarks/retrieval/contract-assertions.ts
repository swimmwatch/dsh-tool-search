import assert from 'node:assert/strict';
import type { DiscoveryResult, SearchTool } from '../../src/types.js';
import type { RetrievalContractCase } from './contract-cases.js';

export function assertSearchContract(
  scenario: RetrievalContractCase,
  result: DiscoveryResult<SearchTool>,
  catalog: readonly SearchTool[],
  embeddingCalls: number,
): void {
  assert.equal(result.authorityGranted, false, 'Discovery must not grant execution authority');
  assert.ok(result.matches.length <= scenario.limit, 'Result limit was exceeded');
  assert.equal(new Set(result.matches.map((tool) => tool.name)).size, result.matches.length);
  for (const tool of result.matches) {
    assert.deepEqual(
      catalog.find((entry) => entry.name === tool.name),
      tool,
    );
  }
  if (scenario.target) {
    assert.equal(result.matches[0]?.name, scenario.target, 'Expected tool must rank first');
    if (scenario.kind === 'exact') assert.equal(result.matches.length, 1);
  } else {
    assert.deepEqual(result.matches, [], 'Empty/no-match query must not invent a candidate');
  }
  const needsFallback =
    scenario.profile === 'outage' && scenario.kind !== 'empty' && scenario.kind !== 'exact';
  assert.equal(result.degraded, needsFallback, 'Unexpected provider degradation');
  assert.equal(embeddingCalls, needsFallback ? 1 : 0, 'Unexpected embedding operation');
  const expectedMode =
    scenario.kind === 'exact'
      ? 'pattern'
      : scenario.profile === 'disabled'
        ? 'bm25'
        : scenario.profile === 'outage'
          ? 'hybrid'
          : scenario.profile;
  assert.equal(result.mode, expectedMode, 'Unexpected effective search mode');
}
