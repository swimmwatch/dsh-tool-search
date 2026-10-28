import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { dshCachePath } from '@deepseek-ai/dsh-home-paths';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { type ToolExecutionInput, ToolRuntime } from '@deepseek-ai/dsh-tools';
import { Config } from '../../src/config.js';
import { EMBEDDING, PLUGIN_NAME } from '../../src/constants.js';
import { type EmbeddingSettings, OPENAI_DEFAULTS } from '../../src/embedding-settings.js';
import { NativeToolSearch } from '../../src/index.js';
import { z } from 'zod';
import type { CallingAgent } from '../../src/types.js';

const resultSchema = z.object({
  degraded: z.boolean(),
  mode: z.enum(['hybrid', 'bm25', 'pattern']),
  matches: z.array(z.object({ name: z.string() })),
  loadedTools: z.array(z.string()),
});

const SENTINEL = 'sentinel_list';
const RUNTIME = 'mcp__example__runtime_info';
const QUERY = 'List active sentinel watches and status';
const ENDPOINT_A = 'https://provider-a.example/v1';
const ENDPOINT_B = 'https://provider-b.example/v1';
let selected: EmbeddingSettings = {
  embeddingEnabled: true,
  embeddingProvider: 'ollama',
  embeddingModel: EMBEDDING.model,
  openaiEmbeddingModel: 'shared-model',
  openaiBaseUrl: ENDPOINT_A,
  openaiApiKeyRef: OPENAI_DEFAULTS.apiKeyRef,
};
let key = 'test-key-one';
let executions = 0;
let resolutions = 0;
let sequence = 0;
let fail = false;
const calls: { endpoint: string; query: boolean; authorization: string | null }[] = [];
let release: (() => void) | undefined;
let started: (() => void) | undefined;
let gate: Promise<void> | undefined;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(typeof url, 'string');
  const endpoint = url as string;
  assert.equal(typeof init?.body, 'string');
  const body = JSON.parse(init?.body as string) as { model: string; input: string[] };
  const query = body.input.some((value) => value === QUERY || value.startsWith('Instruct:'));
  const authorization = new Headers(init?.headers).get('authorization');
  calls.push({ endpoint, query, authorization });
  if (gate && endpoint === `${ENDPOINT_A}/embeddings` && query) {
    started?.();
    await gate;
  }
  if (fail) return new Response('private error', { status: 429 });
  const embeddings = body.input.map((value) => {
    const vector = value.toLowerCase().includes('sentinel') ? [1, 0] : [0, 1];
    return endpoint === EMBEDDING.url
      ? vector
      : endpoint.startsWith(ENDPOINT_A)
        ? [...vector, 0]
        : [...vector, 0, 0];
  });
  return endpoint === EMBEDDING.url
    ? Response.json({ embeddings })
    : Response.json({
        data: embeddings.map((embedding, index) => ({ index, embedding })).reverse(),
      });
};
const ctx = new Context();
const parent = {} as CallingAgent;
const child = {} as CallingAgent;
async function search(
  query = QUERY,
  mode: 'hybrid' | 'bm25' | 'pattern' = 'hybrid',
  agent = parent,
): Promise<z.infer<typeof resultSchema>> {
  const result = await ctx.tools.execute({
    name: 'tool_search',
    arguments: { query, mode, limit: 1 },
    agent,
    signal: new AbortController().signal,
    callId: `providers-${++sequence}` as ToolExecutionInput['callId'],
  });
  assert.equal(result.isError, false, result.error?.message);
  return resultSchema.parse(result.value);
}
try {
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  ctx.provide('credentials');
  ctx.set('credentials', {
    resolve: async (ref: string) => {
      assert.equal(ref, OPENAI_DEFAULTS.apiKeyRef);
      resolutions++;
      return { value: key, source: 'test' };
    },
  } as unknown as CredentialProvider);
  for (const [name, description] of [
    [SENTINEL, 'List active sentinel watches and status.'],
    [RUNTIME, 'Report runtime version and identity.'],
  ]) {
    assert.ok(name && description);
    ctx.tools.register({
      name,
      description,
      parameters: { type: 'object', additionalProperties: false },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [
          { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
        ],
      },
      execute: async () => {
        executions++;
        return name;
      },
    });
  }
  const config: Config = {
    ...Config({}),
    embeddingEnabled: { get: () => selected.embeddingEnabled },
    embeddingProvider: { get: () => selected.embeddingProvider },
    embeddingModel: { get: () => selected.embeddingModel },
    openaiEmbeddingModel: { get: () => selected.openaiEmbeddingModel },
    openaiBaseUrl: { get: () => selected.openaiBaseUrl },
    openaiApiKeyRef: { get: () => selected.openaiApiKeyRef },
  };
  await ctx.plugin({
    name: 'provider-probe',
    inject: ['tools', 'systemPrompt'],
    apply: (scope) => new NativeToolSearch(scope, undefined, config).install(),
  });
  const registration = ctx.tools.get('tool_search');
  await search(RUNTIME);
  assert.equal(calls.length, 0);
  assert.equal((await search()).matches[0]?.name, SENTINEL);
  selected = { ...selected, embeddingProvider: 'openai' };
  await search('');
  await search(RUNTIME);
  await search(QUERY, 'bm25');
  await search('sentinel.*', 'pattern');
  assert.equal(resolutions, 0);
  const a = await search();
  assert.equal(a.degraded, false);
  assert.equal(a.matches[0]?.name, SENTINEL);
  assert.equal(resolutions, 1);
  assert.deepEqual(
    calls.slice(-2).map(({ authorization }) => authorization),
    ['Bearer test-key-one', 'Bearer test-key-one'],
  );
  key = 'test-key-two';
  await search();
  assert.equal(resolutions, 2);
  assert.equal(calls.at(-1)?.authorization, 'Bearer test-key-two');
  selected = { ...selected, openaiBaseUrl: ENDPOINT_B };
  assert.equal((await search()).degraded, false);
  selected = { ...selected, embeddingEnabled: false };
  const beforeOff = calls.length;
  const disabled = await search();
  assert.equal(disabled.mode, 'bm25');
  assert.equal(disabled.degraded, false);
  assert.equal(calls.length, beforeOff);
  assert.ok(disabled.loadedTools.includes(RUNTIME));
  assert.deepEqual((await search('', 'hybrid', child)).loadedTools, []);
  selected = { ...selected, embeddingEnabled: true, embeddingProvider: 'ollama' };
  const beforeReturn = calls.length;
  await search();
  assert.deepEqual(
    calls.slice(beforeReturn).map(({ query }) => query),
    [true],
  );
  selected = { ...selected, embeddingProvider: 'openai', openaiBaseUrl: ENDPOINT_A };
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = search();
  await waiting;
  selected = { ...selected, embeddingEnabled: false };
  const duringOff = calls.length;
  assert.equal((await search()).degraded, false);
  assert.equal(calls.length, duringOff);
  release?.();
  assert.equal((await pending).degraded, false);
  gate = undefined;
  selected = { ...selected, embeddingEnabled: true };
  fail = true;
  const fallback = await search();
  assert.equal(fallback.degraded, true);
  assert.equal(fallback.matches[0]?.name, SENTINEL);
  assert.equal(ctx.tools.get('tool_search'), registration);
  assert.equal(executions, 0);
  const invoked = await ctx.tools.execute({
    name: RUNTIME,
    arguments: {},
    agent: parent,
    signal: new AbortController().signal,
    callId: `providers-${++sequence}` as ToolExecutionInput['callId'],
  });
  assert.equal(invoked.isError, false);
  assert.equal(executions, 1);
  for (const file of await readdir(dshCachePath(PLUGIN_NAME))) {
    const raw = await readFile(`${dshCachePath(PLUGIN_NAME)}/${file}`, 'utf8');
    assert.doesNotMatch(raw, /test-key|List active|sentinel_list|runtime_info/);
  }
  process.stdout.write('provider-switch-probe: passed\n');
} finally {
  globalThis.fetch = originalFetch;
  await ctx.fiber.dispose();
}
