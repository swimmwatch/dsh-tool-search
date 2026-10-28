import assert from 'node:assert/strict';
import { z } from 'zod';
import { OllamaEmbeddingClient } from '../../src/core/embeddings/ollama-embedding-provider.js';
import { OpenAIEmbeddingClient } from '../../src/core/embeddings/openai-embedding-provider.js';
import type { EmbeddingProvider } from '../../src/core/embeddings/provider.js';
import { ToolDiscovery } from '../../src/discovery.js';
import { EMBEDDING } from '../../src/constants.js';
import { PROVIDER_CONTRACTS } from './contracts-cases.js';
import { assertVisible, deferred, search, withHarness, within } from './contracts-harness.js';
import { NATIVE_FIXTURE } from './harness.js';

type ProviderName = 'ollama' | 'openai';
type ProviderContract = (typeof PROVIDER_CONTRACTS)[number];
const QUERY = 'List sentinel watches and health probes';
const OPENAI_URL = 'https://benchmark-embeddings.example/v1';
const requestSchema = z.object({ model: z.string(), input: z.array(z.string()) });

function provider(name: ProviderName, fetchImplementation: typeof fetch): EmbeddingProvider {
  return name === 'ollama'
    ? new OllamaEmbeddingClient({ fetchImplementation, batchSize: 64 })
    : new OpenAIEmbeddingClient({
        baseUrl: OPENAI_URL,
        model: 'benchmark-vectors',
        resolveApiKey: () => Promise.resolve('benchmark-key'),
        fetchImplementation,
        batchSize: 64,
      });
}

function requestResponse(
  name: ProviderName,
  url: string | URL | Request,
  init?: RequestInit,
): Response {
  assert.ok(typeof url === 'string');
  assert.equal(url, name === 'ollama' ? EMBEDDING.url : `${OPENAI_URL}/embeddings`);
  assert.ok(init);
  assert.equal(init?.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
  if (name === 'openai')
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer benchmark-key');
  assert.ok(typeof init.body === 'string');
  const body = requestSchema.parse(JSON.parse(init.body));
  assert.equal(body.model, name === 'ollama' ? EMBEDDING.model : 'benchmark-vectors');
  const vectors = body.input.map((input) =>
    input.toLowerCase().includes('sentinel') ? [1, 0] : [0, 1],
  );
  return name === 'ollama'
    ? Response.json({ embeddings: vectors })
    : Response.json({ data: vectors.map((embedding, index) => ({ embedding, index })).reverse() });
}

async function cancellationIsolation(name: ProviderName, cacheRoot: string): Promise<void> {
  const firstStarted = deferred<AbortSignal>();
  const finishFirst = deferred<void>();
  const secondStarted = deferred<AbortSignal>();
  const finishSecond = deferred<void>();
  const controller = new AbortController();
  let requests = 0;
  const fetchImplementation: typeof fetch = async (url, init) => {
    const index = requests++;
    const signal = init?.signal;
    assert.ok(signal);
    if (index === 0) {
      firstStarted.resolve(signal);
      await new Promise<void>((resolve, reject) => {
        const abort = () =>
          reject(
            signal.reason instanceof Error ? signal.reason : new Error('HTTP request aborted'),
          );
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        void finishFirst.promise.then(resolve);
      });
      return requestResponse(name, url, init);
    }
    if (index === 1) {
      secondStarted.resolve(signal);
      await finishSecond.promise;
    }
    return requestResponse(name, url, init);
  };
  const discovery = new ToolDiscovery({
    embeddingClient: provider(name, fetchImplementation),
    cacheRoot,
  });
  await withHarness(
    'native',
    cacheRoot,
    async (harness) => {
      const first = harness.call(
        'tool_search',
        { query: QUERY, mode: 'hybrid', limit: 1 },
        harness.agent,
        false,
        controller.signal,
      );
      const firstSignal = await within(firstStarted.promise, 'first HTTP request');
      const other = harness.newAgent();
      const second = search(harness, 'native', { query: QUERY, mode: 'hybrid', limit: 1 }, other);
      try {
        const secondSignal = await within(secondStarted.promise, 'parallel HTTP request');
        controller.abort();
        assert.equal(firstSignal.aborted, true);
        assert.equal(secondSignal.aborted, false);
        finishSecond.resolve();
        assert.equal((await within(first, 'cancelled registry call')).isError, true);
        const result = await within(second, 'independent search completion');
        assert.equal(result.degraded, false);
        assert.deepEqual(
          result.matches.map((item) => item.name),
          [NATIVE_FIXTURE.plugin],
        );
        await assertVisible(harness, 'native', NATIVE_FIXTURE.plugin, false);
        await assertVisible(harness, 'native', NATIVE_FIXTURE.plugin, true, other);
        assert.equal(harness.executedTools, 0);
      } finally {
        controller.abort();
        finishFirst.resolve();
        finishSecond.resolve();
        await Promise.allSettled([first, second]);
      }
    },
    { discovery },
  );
}

export async function runProviderContract(
  name: ProviderName,
  contract: ProviderContract,
  cacheRoot: string,
): Promise<void> {
  if (contract === 'cancellation-isolation') {
    await cancellationIsolation(name, cacheRoot);
    return;
  }
  let calls = 0;
  const fetchImplementation: typeof fetch = (url, init) => {
    calls++;
    if (contract === 'outage-fallback') return Promise.resolve(new Response(null, { status: 429 }));
    if (contract === 'malformed-response') {
      return Promise.resolve(
        Response.json(
          name === 'ollama'
            ? { embeddings: [[Number.NaN]] }
            : { data: [{ index: 999, embedding: [1, 0] }] },
        ),
      );
    }
    return Promise.resolve(requestResponse(name, url, init));
  };
  const discovery = new ToolDiscovery({
    embeddingClient: provider(name, fetchImplementation),
    cacheRoot,
  });
  await withHarness(
    'native',
    cacheRoot,
    async (harness) => {
      if (contract === 'network-bypass') {
        for (const args of [
          { query: NATIVE_FIXTURE.plugin, mode: 'hybrid' },
          { query: QUERY, mode: 'bm25' },
          { query: 'sentinel', mode: 'pattern' },
          { query: '', mode: 'hybrid' },
        ])
          await search(harness, 'native', args);
        assert.equal(calls, 0);
      } else {
        const result = await search(harness, 'native', { query: QUERY, mode: 'hybrid', limit: 1 });
        assert.deepEqual(
          result.matches.map((item) => item.name),
          [NATIVE_FIXTURE.plugin],
        );
        assert.equal(result.degraded, contract !== 'semantic-http');
        assert.ok(calls > 0);
        if (contract === 'semantic-http')
          assert.ok(calls >= 3, 'Catalog did not exercise batching');
        await assertVisible(harness, 'native', NATIVE_FIXTURE.plugin, true);
      }
      assert.equal(harness.executedTools, 0);
    },
    { discovery },
  );
}

export async function runDisabledContract(cacheRoot: string): Promise<void> {
  let calls = 0;
  const discovery = new ToolDiscovery({
    embeddingEnabled: false,
    embeddingClient: provider('ollama', () => {
      calls++;
      throw new Error('Disabled embeddings attempted HTTP');
    }),
    cacheRoot,
  });
  await withHarness(
    'native',
    cacheRoot,
    async (harness) => {
      const result = await search(harness, 'native', { query: QUERY, mode: 'hybrid', limit: 1 });
      assert.equal(result.mode, 'bm25');
      assert.equal(result.degraded, false);
      assert.deepEqual(
        result.matches.map((item) => item.name),
        [NATIVE_FIXTURE.plugin],
      );
      assert.equal(calls, 0);
      assert.equal(harness.executedTools, 0);
    },
    { discovery },
  );
}

export async function runMissingKeyContract(cacheRoot: string): Promise<void> {
  let calls = 0;
  const discovery = new ToolDiscovery({
    embeddingClient: new OpenAIEmbeddingClient({
      baseUrl: 'https://api.openai.com/v1',
      resolveApiKey: () => Promise.resolve(undefined),
      fetchImplementation: () => {
        calls++;
        throw new Error('Missing credentials attempted HTTP');
      },
    }),
    cacheRoot,
  });
  await withHarness(
    'native',
    cacheRoot,
    async (harness) => {
      const result = await search(harness, 'native', { query: QUERY, mode: 'hybrid', limit: 1 });
      assert.equal(result.degraded, true);
      assert.deepEqual(
        result.matches.map((item) => item.name),
        [NATIVE_FIXTURE.plugin],
      );
      assert.equal(calls, 0);
    },
    { discovery },
  );
}
