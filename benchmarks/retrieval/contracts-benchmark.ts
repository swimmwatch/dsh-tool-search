import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { metadataFor, ToolDiscovery } from '../../src/discovery.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import { explicitToolReference } from '../../src/core/retrieval/explicit-tool-reference.js';
import type { SearchTool } from '../../src/types.js';
import {
  CONTRACT_TARGETS,
  INVALID_CONTRACT_CASES,
  REFERENCE_CONTRACT_CASES,
  RETRIEVAL_CONTRACT_CASES,
  SEARCH_CONTRACT_CASES,
} from './contract-cases.js';
import { assertSearchContract } from './contract-assertions.js';

function catalogWith(distractors: number): SearchTool[] {
  const targets = CONTRACT_TARGETS.map((name) => ({
    name,
    description: 'Execute the selected operation.',
    parameters: {
      type: 'object',
      properties: { task_id: { type: 'string', enum: ['allowed-task'] } },
      required: ['task_id'],
      additionalProperties: false,
    },
  }));
  return [
    ...targets,
    ...Array.from({ length: distractors }, (_, index) => ({
      name: `a_workflow_sentinel_list_mcp__github__fetch_issue_constructor_${index}`,
      description: `${CONTRACT_TARGETS.join(' ')} task_id task_id task_id`,
      parameters: { type: 'object' },
    })),
  ];
}

async function main(): Promise<void> {
  const started = performance.now();
  const root = await mkdtemp(join(tmpdir(), 'dsh-retrieval-contracts-'));
  const results: { id: string; passed: boolean }[] = [];
  const failures: { id: string; error: string }[] = [];
  const run = async (id: string, check: () => void | Promise<void>) => {
    try {
      await check();
      results.push({ id, passed: true });
    } catch (error) {
      results.push({ id, passed: false });
      failures.push({ id, error: error instanceof Error ? error.message : 'Contract failed' });
    }
  };
  try {
    for (const scenario of SEARCH_CONTRACT_CASES) {
      await run(scenario.id, async () => {
        const catalog = scenario.emptyCatalog ? [] : catalogWith(scenario.distractors);
        if (scenario.reversed) catalog.reverse();
        let embeddingCalls = 0;
        const discovery = new ToolDiscovery({
          cacheRoot: root,
          embeddingEnabled: scenario.profile !== 'disabled',
          embeddingClient: {
            model: 'contract-provider-unavailable',
            embedBatches() {
              embeddingCalls++;
              return Promise.reject(new Error('Synthetic provider outage'));
            },
          },
        });
        const mode =
          scenario.profile === 'disabled' || scenario.profile === 'outage'
            ? 'hybrid'
            : scenario.profile;
        const result = await discovery.search({}, catalog, {
          query: scenario.query,
          mode,
          limit: scenario.limit,
        });
        assertSearchContract(scenario, result, catalog, embeddingCalls);
      });
    }
    const catalog = catalogWith(0);
    const index = new ToolSearchService(catalog.map(metadataFor), { policyProfile: 'all' }).index;
    for (const scenario of REFERENCE_CONTRACT_CASES) {
      await run(scenario.id, () => {
        assert.equal(
          explicitToolReference(scenario.query, index.documents),
          'expected' in scenario ? scenario.expected : undefined,
        );
      });
    }
    for (const scenario of INVALID_CONTRACT_CASES) {
      await run(scenario.id, async () => {
        let embeddingCalls = 0;
        const discovery = new ToolDiscovery({
          cacheRoot: root,
          embeddingClient: {
            model: 'invalid-input-must-not-embed',
            embedBatches(inputs) {
              embeddingCalls++;
              return Promise.resolve(inputs.map(() => [1, 0]));
            },
          },
        });
        await assert.rejects(discovery.search({}, catalog, scenario.input));
        assert.equal(embeddingCalls, 0);
      });
    }
    assert.deepEqual(
      results.map(({ id }) => id),
      RETRIEVAL_CONTRACT_CASES.map(({ id }) => id),
    );
    const report = {
      schemaVersion: 2,
      suite: 'retrieval-contracts',
      ok: failures.length === 0,
      cases: results.length,
      passedCases: results.filter((result) => result.passed).length,
      failures,
      results,
      elapsedMs: performance.now() - started,
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Contract suite failed'}\n`);
  process.exitCode = 1;
});
