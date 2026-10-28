import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EmbeddingCache } from '../../src/core/embeddings/definition-vector-cache.js';
import {
  OllamaEmbeddingClient,
  resolveEmbeddingUrl,
  validateModelName,
} from '../../src/core/embeddings/ollama-embedding-provider.js';
import { ToolDocumentFactory } from '../../src/core/retrieval/tool-document-factory.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import type { EmbeddingAdapter } from '../../src/core/shared/types.js';
import {
  DeterministicEmbeddingAdapter,
  readTool,
  toolDefinition,
  writeTool,
} from './support/tool-fixtures.js';

await test('hybrid service returns at most five candidates', async () => {
  const tools = Array.from({ length: 8 }, (_, index) =>
    toolDefinition(`mcp__github__fetch_issue_${index}`, 'Fetch GitHub issue.'),
  );
  const service = new ToolSearchService(tools, {
    policyProfile: 'read-only',
    embeddingClient: new DeterministicEmbeddingAdapter(),
  });
  const result = await service.hybrid('fetch GitHub issue');
  assert.ok(result.candidates.length <= 5);
});

await test('hybrid service degrades to BM25 when embeddings fail', async () => {
  const failing: EmbeddingAdapter = {
    model: 'failing',
    async embedBatches() {
      throw new Error('offline');
    },
  };
  const service = new ToolSearchService([readTool], { embeddingClient: failing });
  const result = await service.hybrid('fetch GitHub issue');
  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'embedding_unavailable_lexical_fallback');
});

await test('remote embedding URLs are disabled by default', () => {
  assert.throws(() => resolveEmbeddingUrl('https://example.com/api/embed'), /disabled/);
  assert.equal(
    resolveEmbeddingUrl('https://example.com/api/embed', { allowRemote: true }),
    'https://example.com/api/embed',
  );
});

await test('Ollama client validates model names and response vectors', async () => {
  assert.throws(() => validateModelName('bad model'), /Invalid/);
  const client = new OllamaEmbeddingClient({
    model: 'qwen3-embedding:4b',
    fetchImplementation: async () =>
      new Response(JSON.stringify({ embeddings: [[1, 2]] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
  assert.deepEqual(await client.embedBatches(['query']), [[1, 2]]);
});

await test('embedding cache stores definitions only by tool digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tool-search-cache-'));
  try {
    const cache = new EmbeddingCache('test-model', { root });
    const documents = [new ToolDocumentFactory().create(readTool)];
    await cache.save(documents, [[1, 2, 3]]);
    const loaded = await cache.load(documents);
    assert.deepEqual(loaded.vectors, [[1, 2, 3]]);
    const persisted = await readFile(cache.path, 'utf8');
    assert.doesNotMatch(persisted, /Fetch one GitHub issue/);
    assert.doesNotMatch(persisted, /issue_number/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test('embedding cache reports incremental misses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tool-search-cache-'));
  try {
    const cache = new EmbeddingCache('test-model', { root });
    const documents = [
      new ToolDocumentFactory().create(readTool),
      new ToolDocumentFactory().create(writeTool),
    ];
    const firstDocument = documents[0];
    assert.ok(firstDocument);
    await cache.save([firstDocument], [[1, 0]]);
    const loaded = await cache.load(documents);
    assert.equal(loaded.hitCount, 1);
    assert.deepEqual(loaded.missIndexes, [1]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
