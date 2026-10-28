import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ToolDiscovery } from '../../src/discovery.js';
import { EmbeddingCache } from '../../src/core/embeddings/definition-vector-cache.js';
import { OllamaEmbeddingClient } from '../../src/core/embeddings/ollama-embedding-provider.js';
import { OpenAIEmbeddingClient } from '../../src/core/embeddings/openai-embedding-provider.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import { readTool } from './support/tool-fixtures.js';

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => {
    throw new Error('Promise has not been initialized');
  };
  let rejectPromise: (reason: unknown) => void = () => {
    throw new Error('Promise has not been initialized');
  };
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function blockedRequest() {
  const started = deferred<AbortSignal>();
  const completed = deferred<Response>();
  let calls = 0;
  const fetchImplementation: typeof fetch = async (_input, init) => {
    calls++;
    const signal = init?.signal;
    assert.ok(signal);
    signal.throwIfAborted();
    started.resolve(signal);
    const cancelled = deferred<never>();
    const abort = () => cancelled.reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    try {
      return (await Promise.race([completed.promise, cancelled.promise])).clone();
    } finally {
      signal.removeEventListener('abort', abort);
    }
  };
  return { started: started.promise, completed, fetchImplementation, calls: () => calls };
}

for (const providerName of ['ollama', 'openai'] as const) {
  await test(`${providerName} cancels an in-flight batch and starts no later batches`, async () => {
    const request = blockedRequest();
    const provider =
      providerName === 'ollama'
        ? new OllamaEmbeddingClient({
            batchSize: 1,
            fetchImplementation: request.fetchImplementation,
          })
        : new OpenAIEmbeddingClient({
            baseUrl: 'https://embedding.example/v1',
            batchSize: 1,
            fetchImplementation: request.fetchImplementation,
          });
    const controller = new AbortController();
    const reason = new Error('Search cancelled');
    const pending = provider.embedBatches(['first', 'second'], controller.signal);
    const rejection = assert.rejects(pending, (error: unknown) => error === reason);
    const signal = await request.started;
    try {
      controller.abort(reason);
      assert.equal(signal.aborted, true);
      await rejection;
      assert.equal(request.calls(), 1);
      await assert.rejects(
        provider.embedQueries(['query'], controller.signal),
        (error: unknown) => error === reason,
      );
      assert.equal(request.calls(), 1);
    } finally {
      request.completed.resolve(
        Response.json(
          providerName === 'ollama'
            ? { embeddings: [[1, 0]] }
            : { data: [{ index: 0, embedding: [1, 0] }] },
        ),
      );
      await rejection.catch(() => {});
    }
  });
}

await test('hybrid cancellation reaches HTTP without BM25 fallback or cache poisoning', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = blockedRequest();
  const provider = new OllamaEmbeddingClient({ fetchImplementation: request.fetchImplementation });
  const service = new ToolSearchService([readTool], {
    policyProfile: 'all',
    embeddingClient: provider,
    embeddingCache: new EmbeddingCache(provider.cacheIdentity, { root }),
  });
  const controller = new AbortController();
  const reason = new Error('Search cancelled');
  const pending = service.search('Fetch GitHub issue', 'hybrid', controller.signal);
  const rejection = assert.rejects(pending, (error: unknown) => error === reason);
  const signal = await request.started;
  try {
    controller.abort(reason);
    assert.equal(signal.aborted, true);
    await rejection;
    assert.equal(request.calls(), 1);
  } finally {
    request.completed.resolve(Response.json({ embeddings: [[1, 0]] }));
    await rejection.catch(() => {});
  }
  const fresh = await service.search('Fetch GitHub issue', 'hybrid');
  assert.equal(fresh.degraded, false);
  assert.equal(request.calls(), 3);
});

await test('native discovery forwards cancellation through its controller to the provider', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-discovery-cancel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = blockedRequest();
  const discovery = new ToolDiscovery({
    embeddingClient: new OllamaEmbeddingClient({
      fetchImplementation: request.fetchImplementation,
    }),
    cacheRoot: root,
  });
  const controller = new AbortController();
  const reason = new Error('Native search cancelled');
  const pending = discovery.search(
    {},
    [{ name: 'fetch_issue', description: 'Fetch a GitHub issue.', parameters: { type: 'object' } }],
    { query: 'Inspect GitHub issue', mode: 'hybrid' },
    controller.signal,
  );
  const rejection = assert.rejects(pending, (error: unknown) => error === reason);
  const signal = await request.started;
  try {
    controller.abort(reason);
    assert.equal(signal.aborted, true);
    await rejection;
    assert.equal(request.calls(), 1);
  } finally {
    request.completed.resolve(Response.json({ embeddings: [[1, 0]] }));
    await rejection.catch(() => {});
  }
});

await test('cancelling one search leaves a concurrent search on the same service running', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-search-concurrent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = blockedRequest();
  const second = blockedRequest();
  let calls = 0;
  const provider = new OllamaEmbeddingClient({
    fetchImplementation: (input, init) => {
      calls++;
      if (calls === 1) return first.fetchImplementation(input, init);
      if (calls === 2) return second.fetchImplementation(input, init);
      return Promise.resolve(Response.json({ embeddings: [[1, 0]] }));
    },
  });
  const service = new ToolSearchService([readTool], {
    policyProfile: 'all',
    embeddingClient: provider,
    embeddingCache: new EmbeddingCache(provider.cacheIdentity, { root }),
  });
  const controller = new AbortController();
  const reason = new Error('First search cancelled');
  const firstSearch = service.search('Fetch GitHub issue', 'hybrid', controller.signal);
  const rejection = assert.rejects(firstSearch, (error: unknown) => error === reason);
  const firstSignal = await first.started;
  const secondSearch = service.search('Fetch GitHub issue', 'hybrid');
  const secondSignal = await second.started;
  try {
    controller.abort(reason);
    assert.equal(firstSignal.aborted, true);
    assert.equal(secondSignal.aborted, false);
    second.completed.resolve(Response.json({ embeddings: [[1, 0]] }));
    await rejection;
    assert.equal((await secondSearch).degraded, false);
  } finally {
    first.completed.resolve(Response.json({ embeddings: [[1, 0]] }));
    second.completed.resolve(Response.json({ embeddings: [[1, 0]] }));
    await Promise.allSettled([rejection, secondSearch]);
  }
});
