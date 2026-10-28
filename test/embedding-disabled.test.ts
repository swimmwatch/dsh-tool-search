import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolDiscovery } from '../src/discovery.js';

await test('disabled embeddings force BM25 without calling an injected provider', async () => {
  let calls = 0;
  const discovery = new ToolDiscovery({
    embeddingEnabled: false,
    embeddingClient: {
      model: 'must-not-run',
      async embedBatches() {
        calls += 1;
        throw new Error('Embedding provider must stay idle');
      },
    },
  });
  const tools = [
    {
      name: 'workflow',
      description: 'Run a workflow task.',
      parameters: { type: 'object' as const, properties: {} },
    },
  ];
  const result = await discovery.search({}, tools, {
    query: 'Call workflow task_id',
    mode: 'hybrid',
    limit: 1,
  });
  assert.equal(calls, 0);
  assert.equal(result.mode, 'bm25');
  assert.equal(result.degraded, false);
  assert.equal(result.matches[0]?.name, 'workflow');
});
