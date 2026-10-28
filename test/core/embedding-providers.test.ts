import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  DEFAULT_OLLAMA_URL,
  EMBEDDING_TIMEOUT_MS,
  normalizeOpenAIBaseUrl,
  OLLAMA_MODEL_NAME_PATTERN,
} from '../../src/embedding-settings.js';
import { EMBEDDING } from '../../src/constants.js';
import { EmbeddingCache } from '../../src/core/embeddings/definition-vector-cache.js';
import { OpenAIEmbeddingClient } from '../../src/core/embeddings/openai-embedding-provider.js';
import {
  DEFAULT_EMBEDDING_MODEL as LEGACY_MODEL,
  OLLAMA_MODEL_NAME_PATTERN as LEGACY_PATTERN,
  DEFAULT_EMBEDDING_TIMEOUT_MS as LEGACY_TIMEOUT,
  DEFAULT_OLLAMA_URL as LEGACY_URL,
  OllamaEmbeddingClient,
} from '../../src/core/embeddings/ollama-embedding-provider.js';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE as LEGACY_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS as LEGACY_NATIVE_TIMEOUT,
} from '../../src/core/embeddings/provider.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import { readTool } from './support/tool-fixtures.js';

const BASE_URL = 'https://embedding.example/v1';
const MODEL = 'test-model';

await test('shared embedding defaults preserve provider exports and distinct native timeouts', async (t) => {
  assert.equal(LEGACY_MODEL, DEFAULT_EMBEDDING_MODEL);
  assert.equal(LEGACY_URL, DEFAULT_OLLAMA_URL);
  assert.equal(LEGACY_TIMEOUT, DEFAULT_EMBEDDING_TIMEOUT_MS);
  assert.equal(LEGACY_BATCH_SIZE, DEFAULT_EMBEDDING_BATCH_SIZE);
  assert.equal(LEGACY_NATIVE_TIMEOUT, EMBEDDING_TIMEOUT_MS);
  assert.equal(LEGACY_PATTERN, OLLAMA_MODEL_NAME_PATTERN);
  assert.equal(DEFAULT_EMBEDDING_BATCH_SIZE, 24);
  assert.equal(DEFAULT_EMBEDDING_MODEL, 'qwen3-embedding:4b');
  assert.equal(DEFAULT_OLLAMA_URL, 'http://127.0.0.1:11434/api/embed');
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (duration: number) => {
    timeouts.push(duration);
    return new AbortController().signal;
  });
  const fetchImplementation: typeof fetch = async () => Response.json({ embeddings: [[1]] });
  await new OllamaEmbeddingClient({
    model: DEFAULT_EMBEDDING_MODEL,
    url: DEFAULT_OLLAMA_URL,
    fetchImplementation,
  }).embed(['document']);
  await new OllamaEmbeddingClient({ ...EMBEDDING, fetchImplementation }).embed(['document']);
  assert.deepEqual(timeouts, [120_000, 8000]);
});

function response(vectors: readonly (readonly number[])[]): Response {
  return Response.json({
    data: vectors.map((embedding, index) => ({ embedding, index })).reverse(),
  });
}
await test('OpenAI preserves input order, batches requests and sends plain queries', async () => {
  const bodies: { model: string; input: string[]; encoding_format: string }[] = [];
  const provider = new OpenAIEmbeddingClient({
    baseUrl: `${BASE_URL}/`,
    model: MODEL,
    batchSize: 2,
    resolveApiKey: async () => 'test-credential',
    fetchImplementation: async (url, init) => {
      assert.equal(url, `${BASE_URL}/embeddings`);
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-credential');
      assert.equal(typeof init?.body, 'string');
      const body = JSON.parse(init?.body as string) as (typeof bodies)[number];
      bodies.push(body);
      assert.equal(body.model, MODEL);
      assert.equal(body.encoding_format, 'float');
      return response(body.input.map((input) => [Number(input), 1]));
    },
  });
  assert.deepEqual(await provider.embedBatches(['1', '2', '3']), [
    [1, 1],
    [2, 1],
    [3, 1],
  ]);
  await provider.embedQueries(['4']);
  assert.deepEqual(
    bodies.map((body) => body.input),
    [['1', '2'], ['3'], ['4']],
  );
  assert.deepEqual(await provider.embedBatches([]), []);
  assert.equal(bodies.length, 3);
});
await test('OpenAI resolves credentials per operation and freezes an in-flight credential', async () => {
  let key = 'first-test-credential';
  let resolutions = 0;
  const headers: (string | null)[] = [];
  const provider = new OpenAIEmbeddingClient({
    baseUrl: BASE_URL,
    resolveApiKey: async () => {
      resolutions++;
      return key;
    },
    fetchImplementation: async (_url, init) => {
      headers.push(new Headers(init?.headers).get('authorization'));
      return response([[1]]);
    },
  });
  const first = await provider.forOperation();
  key = 'second-test-credential';
  await first.embedBatches(['document']);
  await first.embedQueries(['query']);
  const second = await provider.forOperation();
  await second.embedQueries(['query']);
  assert.equal(resolutions, 2);
  assert.deepEqual(headers, [
    'Bearer first-test-credential',
    'Bearer first-test-credential',
    'Bearer second-test-credential',
  ]);
  assert.equal(first.cacheIdentity, second.cacheIdentity);
  assert.doesNotMatch(first.cacheIdentity, /credential/);
});
await test('official OpenAI needs a key without HTTP, while compatible servers can be anonymous', async () => {
  let calls = 0;
  const fetchImplementation: typeof fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return response([[1]]);
  };
  const official = new OpenAIEmbeddingClient({ fetchImplementation });
  await assert.rejects(official.embedBatches(['x']), /not configured/);
  const result = await new ToolSearchService([readTool], { embeddingClient: official }).hybrid(
    'fetch GitHub issue',
  );
  assert.equal(result.degraded, true);
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(result), /Authorization|Bearer/);
  await new OpenAIEmbeddingClient({ baseUrl: BASE_URL, fetchImplementation }).embedQueries(['x']);
  assert.equal(calls, 1);
});
await test('unsafe base URLs are rejected and paths are normalized', () => {
  for (const url of [
    'ftp://example.com',
    'http://example.com/v1',
    'https://u:p@example.com/v1',
    'https://example.com/v1?q=1',
    'https://example.com/v1#x',
    'https://example.com/v1?',
    'https://example.com/v1#',
    'not-a-url',
  ]) {
    assert.throws(() => normalizeOpenAIBaseUrl(url));
  }
  assert.equal(
    normalizeOpenAIBaseUrl('https://EXAMPLE.com:443/custom/v1/'),
    'https://example.com/custom/v1',
  );
  assert.equal(normalizeOpenAIBaseUrl('http://127.0.0.1:9000/v1/'), 'http://127.0.0.1:9000/v1');
});
await test('OpenAI failures use BM25 without retries or response body disclosure', async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    let calls = 0;
    const provider = new OpenAIEmbeddingClient({
      baseUrl: BASE_URL,
      fetchImplementation: async () => {
        calls++;
        return new Response('private provider error body', { status });
      },
    });
    const result = await new ToolSearchService([readTool], { embeddingClient: provider }).hybrid(
      'fetch GitHub issue',
    );
    assert.equal(result.degraded, true);
    assert.equal(calls, 1);
    assert.equal(result.candidates[0]?.name, readTool.name);
    assert.doesNotMatch(JSON.stringify(result), /private provider/);
  }
});
await test('OpenAI rejects incomplete indices, duplicate indices and malformed vectors', async () => {
  const invalid = [
    null,
    {},
    { data: [] },
    { data: [null, null] },
    {
      data: [
        { index: 0, embedding: [1] },
        { index: 0, embedding: [2] },
      ],
    },
    {
      data: [
        { index: 1, embedding: [1] },
        { index: 2, embedding: [2] },
      ],
    },
    {
      data: [
        { index: 0, embedding: [] },
        { index: 1, embedding: [2] },
      ],
    },
    {
      data: [
        { index: 0, embedding: [null] },
        { index: 1, embedding: [2] },
      ],
    },
    {
      data: [
        { index: 0, embedding: [1] },
        { index: 1, embedding: [2, 3] },
      ],
    },
  ];
  for (const payload of invalid) {
    const provider = new OpenAIEmbeddingClient({
      baseUrl: BASE_URL,
      fetchImplementation: async () => Response.json(payload),
    });
    await assert.rejects(provider.embedBatches(['a', 'b']));
  }
});
await test('both providers reject inconsistent dimensions across batches', async () => {
  for (const kind of ['openai', 'ollama']) {
    let calls = 0;
    const fetchImplementation: typeof fetch = async () => {
      const vectors = [calls++ === 0 ? [1] : [1, 2]];
      return kind === 'openai' ? response(vectors) : Response.json({ embeddings: vectors });
    };
    const provider =
      kind === 'openai'
        ? new OpenAIEmbeddingClient({ baseUrl: BASE_URL, batchSize: 1, fetchImplementation })
        : new OllamaEmbeddingClient({ batchSize: 1, fetchImplementation });
    await assert.rejects(provider.embedBatches(['a', 'b']), /dimensions/);
  }
});
await test('request timeout aborts the request and falls back without retries', async () => {
  let calls = 0;
  const provider = new OpenAIEmbeddingClient({
    baseUrl: BASE_URL,
    timeoutMs: 5,
    fetchImplementation: (_url, init) =>
      new Promise((_resolve, reject) => {
        calls++;
        const timer = setTimeout(() => reject(new Error('Test deadline exceeded')), 1000);
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Timed out', 'TimeoutError'));
          },
          { once: true },
        );
      }),
  });
  assert.equal(
    (
      await new ToolSearchService([readTool], { embeddingClient: provider }).hybrid(
        'fetch GitHub issue',
      )
    ).degraded,
    true,
  );
  assert.equal(calls, 1);
});
await test('cache identity separates providers and endpoints without storing text or secrets', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provider-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identities = [
    new OpenAIEmbeddingClient({ baseUrl: BASE_URL, model: MODEL }).cacheIdentity,
    new OpenAIEmbeddingClient({ baseUrl: 'https://other.example/v1', model: MODEL }).cacheIdentity,
    new OllamaEmbeddingClient({ model: MODEL }).cacheIdentity,
  ];
  const caches = identities.map((identity) => new EmbeddingCache(identity, { root }));
  const first = caches[0];
  assert.ok(first);
  await first.save([{ toolDigest: 'digest' }], [[1, 2]]);
  assert.equal(new Set(caches.map((cache) => cache.path)).size, 3);
  for (const cache of caches.slice(1))
    assert.equal((await cache.load([{ toolDigest: 'digest' }])).hitCount, 0);
  const raw = await readFile(first.path, 'utf8');
  assert.doesNotMatch(raw, /test-credential|Search query|Tool description/);
});
await test('search core without an adapter does not construct Ollama', async () => {
  const result = await new ToolSearchService([readTool]).hybrid('fetch GitHub issue');
  assert.equal(result.degraded, false);
  assert.equal(result.candidates[0]?.name, readTool.name);
});
