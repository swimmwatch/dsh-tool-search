import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ToolDiscovery } from '../src/discovery.js';
import type { SearchTool } from '../src/types.js';

const PREPARE = 'mcp__engineer-agent-workflow-mcp__specification_rev_8f473fc148f8';
const SUBMIT = 'mcp__engineer-agent-workflow-mcp__specification_rev_137a4fd2cdf2';
const RECORD = 'mcp__engineer-agent-workflow-mcp__specification_rev_c67389d37a7e';
const NAMESPACED_PREPARE = 'mcp__qa__workflow_server_for_tests__specification_r_f4278db61aa8';
const parameters = {
  type: 'object',
  properties: { group_ref: { type: 'string' }, source_version: { type: 'string' } },
  required: ['group_ref', 'source_version'],
};
const tools: SearchTool[] = [
  { name: 'workflow', description: 'Run a JavaScript workflow script.', parameters: {} },
  { name: PREPARE, description: 'Prepare bounded native review launch.', parameters: {} },
  { name: RECORD, description: 'Record ordered review verdicts in a batch.', parameters: {} },
  { name: SUBMIT, description: 'Save assigned exact-read verdicts.', parameters },
];

for (const mode of ['hybrid', 'bm25', 'pattern'] as const) {
  await test(`${mode} resolves a shortened identity in a server namespace containing double underscores`, async () => {
    const discovery = new ToolDiscovery({
      embeddingClient: {
        model: 'namespace-no-embedding',
        embedBatches() {
          return Promise.reject(new Error('Exact identity lookup must not request embeddings.'));
        },
      },
    });
    const catalog = [{ name: NAMESPACED_PREPARE, description: 'Prepare a review.', parameters }];
    for (const query of [
      'specification_review_prepare_workflow',
      'mcp__qa__workflow_server_for_tests__specification_review_prepare_workflow',
      NAMESPACED_PREPARE,
    ]) {
      const result = await discovery.search({}, catalog, { query, mode, limit: 1 });
      assert.deepEqual(
        result.matches.map((tool) => tool.name),
        [NAMESPACED_PREPARE],
      );
      assert.strictEqual(result.matches[0]?.parameters, parameters);
      assert.equal(result.degraded, false);
    }
  });
  await test(`${mode} discovers a shortened MCP identity without confusing legacy schemas`, async (t) => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'dsh-name-discovery-'));
    t.after(() => rm(cacheRoot, { recursive: true, force: true }));
    let embeddingCalls = 0;
    const discovery = new ToolDiscovery({
      cacheRoot,
      embeddingClient: {
        model: 'name-discovery-test',
        async embedBatches(inputs) {
          embeddingCalls += 1;
          return inputs.map(() => [1, 0]);
        },
      },
    });
    for (const [query, expected] of [
      ['specification_review_prepare_workflow', PREPARE],
      ['specification_review_submit_batch', SUBMIT],
      ['+specification_review_submit_batch', SUBMIT],
      ['mcp__engineer-agent-workflow-mcp__specification_review_submit_batch', SUBMIT],
      [SUBMIT, SUBMIT],
    ]) {
      const result = await discovery.search({}, tools, { query, mode, limit: 1 });
      assert.deepEqual(
        result.matches.map((tool) => tool.name),
        [expected],
      );
      if (expected === SUBMIT) assert.strictEqual(result.matches[0]?.parameters, parameters);
      assert.equal(result.authorityGranted, false);
    }
    assert.equal(embeddingCalls, 0);
  });
}

await test('shared raw MCP names preserve all authorized identities and the requested limit', async () => {
  const submitted = tools.find((tool) => tool.name === SUBMIT);
  assert.ok(submitted);
  const other = { ...submitted, name: 'mcp__short__specification_review_submit_batch' };
  const discovery = new ToolDiscovery();
  const catalog = [...tools, other];
  const result = await discovery.search({}, catalog, {
    query: 'specification_review_submit_batch',
    mode: 'pattern',
    limit: 5,
  });
  assert.deepEqual(result.matches.map((tool) => tool.name).sort(), [SUBMIT, other.name].sort());
  const limited = await discovery.search({}, catalog, {
    query: 'specification_review_submit_batch',
    mode: 'hybrid',
    limit: 1,
  });
  assert.equal(limited.matches.length, 1);
  assert.ok([SUBMIT, other.name].includes(limited.matches[0]?.name ?? ''));
  const absent = await discovery.search(
    {},
    tools.filter((tool) => tool.name !== SUBMIT),
    {
      query: 'specification_review_submit_batch',
      mode: 'pattern',
      limit: 5,
    },
  );
  assert.deepEqual(absent.matches, []);
});
