import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { dshCachePath } from '@deepseek-ai/dsh-home-paths';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { type ToolExecutionInput, ToolRuntime } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import { Config } from '../../src/config.js';
import { EMBEDDING, PLUGIN_NAME } from '../../src/constants.js';
import { NativeToolSearch } from '../../src/index.js';
import type { CallingAgent } from '../../src/types.js';

const FIRST_MODEL = EMBEDDING.model;
const SECOND_MODEL = 'local/test-embedding:v2';
const SLOW_MODEL = 'local/slow-embedding:v1';
const MISSING_MODEL = 'missing-embedding:latest';
const UNSUPPORTED_MODEL = 'chat-only:latest';
const SENTINEL = 'sentinel_list';
const RUNTIME = 'mcp__example__runtime_info';
const QUERY = 'List active sentinel watches and their status';
const bodySchema = z.object({ model: z.string(), input: z.array(z.string()) });
const searchSchema = z.object({
  matches: z.array(z.object({ name: z.string() })),
  loadedTools: z.array(z.string()),
  degraded: z.boolean(),
});
const calls: { model: string; query: boolean }[] = [];
let notifyStarted: (() => void) | undefined;
let releaseSearch: (() => void) | undefined;
const started = new Promise<void>((resolve) => {
  notifyStarted = resolve;
});
const released = new Promise<void>((resolve) => {
  releaseSearch = resolve;
});
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  assert.equal(url, EMBEDDING.url);
  const rawBody = init?.body;
  assert.ok(typeof rawBody === 'string');
  const body = bodySchema.parse(JSON.parse(rawBody));
  const query = body.input.some((text) => text.startsWith('Instruct:'));
  calls.push({ model: body.model, query });
  if (body.model === MISSING_MODEL) return new Response('{}', { status: 404 });
  if (body.model === UNSUPPORTED_MODEL) return new Response('{}', { status: 400 });
  if (body.model === SLOW_MODEL && query) {
    notifyStarted?.();
    await released;
  }
  return Response.json({
    embeddings: body.input.map((text) => {
      const vector = text.includes('sentinel') ? [1, 0] : [0, 1];
      return body.model === FIRST_MODEL ? vector : [...vector, 0];
    }),
  });
};

const ctx = new Context();
const agent = {} as CallingAgent;
let selectedModel: string = FIRST_MODEL;
let executions = 0;
let sequence = 0;

async function call(name: string, args: unknown = {}) {
  return ctx.tools.execute({
    callId: `model-test-${++sequence}` as ToolExecutionInput['callId'],
    name,
    arguments: args,
    agent,
    signal: new AbortController().signal,
  });
}

async function search(query = QUERY, mode = 'hybrid') {
  const result = await call('tool_search', { query, mode, limit: 1 });
  assert.equal(result.isError, false, result.error?.message);
  return searchSchema.parse(result.value);
}

try {
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  for (const [name, description] of [
    [SENTINEL, 'List active sentinel watches and their status.'],
    [RUNTIME, 'Report runtime version and process information.'],
  ] as const)
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
      execute: () => {
        executions++;
        return Promise.resolve(name);
      },
    });
  const config: Config = { ...Config({}), embeddingModel: { get: () => selectedModel } };
  await ctx.plugin({
    name: 'model-settings-probe',
    inject: ['tools', 'systemPrompt'],
    apply: (scope) => new NativeToolSearch(scope, undefined, config).install(),
  });
  const registration = ctx.tools.get('tool_search');
  await search('');
  await search(RUNTIME);
  await search(QUERY, 'bm25');
  assert.equal(calls.length, 0);

  const first = await search();
  assert.equal(first.degraded, false);
  assert.equal(first.matches[0]?.name, SENTINEL);
  assert.deepEqual(calls, [
    { model: FIRST_MODEL, query: false },
    { model: FIRST_MODEL, query: true },
  ]);
  selectedModel = SECOND_MODEL;
  const second = await search();
  assert.equal(second.degraded, false);
  assert.deepEqual(calls.slice(2), [
    { model: SECOND_MODEL, query: false },
    { model: SECOND_MODEL, query: true },
  ]);
  assert.deepEqual(new Set(second.loadedTools), new Set([RUNTIME, SENTINEL]));

  selectedModel = FIRST_MODEL;
  assert.equal((await search()).degraded, false);
  assert.deepEqual(calls.slice(4), [{ model: FIRST_MODEL, query: true }]);

  selectedModel = SLOW_MODEL;
  const pending = search();
  await started;
  selectedModel = FIRST_MODEL;
  assert.equal((await search()).degraded, false);
  releaseSearch?.();
  assert.equal((await pending).degraded, false);

  for (const model of [MISSING_MODEL, UNSUPPORTED_MODEL]) {
    selectedModel = model;
    const before: number = calls.length;
    await search(RUNTIME);
    await search(QUERY, 'bm25');
    assert.equal(calls.length, before);
    const fallback = await search();
    assert.equal(fallback.degraded, true);
    assert.equal(fallback.matches[0]?.name, SENTINEL);
    assert.equal(calls.at(-1)?.model, model);
  }
  assert.equal(ctx.tools.get('tool_search'), registration);
  assert.equal(executions, 0);
  assert.equal((await call(RUNTIME)).isError, false);
  assert.equal(executions, 1);

  const cacheRoot = dshCachePath(PLUGIN_NAME);
  const cacheSchema = z.object({
    model: z.string(),
    entries: z.record(z.string(), z.array(z.number())),
  });
  const caches = await Promise.all(
    (await readdir(cacheRoot)).map(async (name) => {
      const raw = await readFile(`${cacheRoot}/${name}`, 'utf8');
      assert.ok(!raw.includes(QUERY));
      assert.ok(!raw.includes(SENTINEL));
      const cache = cacheSchema.parse(JSON.parse(raw));
      assert.ok(
        Object.values(cache.entries).every(
          (v) =>
            v.length ===
            ((JSON.parse(cache.model) as { model: string }).model === FIRST_MODEL ? 2 : 3),
        ),
      );
      return (JSON.parse(cache.model) as { model: string }).model;
    }),
  );
  assert.deepEqual(new Set(caches), new Set([FIRST_MODEL, SECOND_MODEL, SLOW_MODEL]));
  process.stdout.write('model-switch-probe: passed\n');
} finally {
  releaseSearch?.();
  globalThis.fetch = originalFetch;
  await ctx.fiber.dispose();
}
