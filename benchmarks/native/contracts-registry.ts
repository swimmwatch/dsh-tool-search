import assert from 'node:assert/strict';
import { createScope } from '@deepseek-ai/dsh-scope';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import { Config } from '../../src/config.js';
import { BASE_TOOLS, MAX_LOADED } from '../../src/constants.js';
import type { Discovery } from '../../src/types.js';
import { NATIVE_FIXTURE, type NativeBenchmarkHarness } from './harness.js';
import { type ContractMode, REGISTRY_CONTRACTS } from './contracts-cases.js';
import {
  assertVisible,
  deferred,
  fixture,
  search,
  withHarness,
  within,
} from './contracts-harness.js';

type ContractName = (typeof REGISTRY_CONTRACTS)[number];
const COMPLEX = 'benchmark_complex_contract';
const HASHED = 'mcp__engineer-agent-workflow-mcp__specification_rev_137a4fd2cdf2';
const SHORT = 'mcp__short__specification_review_submit_batch';
const RAW = 'specification_review_submit_batch';
const INPUT = { target: { id: 'alpha', mode: 'fast' }, tags: ['red'] };
const OUTPUT = { acknowledged: true, selected: { id: 'alpha', tags: ['red'] } };

function registerComplex(harness: NativeBenchmarkHarness) {
  let calls = 0;
  const definition = defineTool({
    name: COMPLEX,
    description: 'Inspect a typed target and return its selected tags.',
    parameters: {
      target: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          mode: { type: 'string', enum: ['fast', 'full'], required: true },
        },
        required: true,
      },
      tags: { type: 'array', items: { type: 'string', enum: ['red', 'blue'] }, required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          acknowledged: { type: 'boolean', required: true },
          selected: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              tags: { type: 'array', items: { type: 'string' }, required: true },
            },
            required: true,
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args) => {
      calls++;
      return Promise.resolve({
        acknowledged: true,
        selected: { id: args.target.id, tags: args.tags },
      });
    },
  });
  harness.ctx.tools.register(definition);
  return { definition, calls: () => calls };
}

async function complexSchema(
  harness: NativeBenchmarkHarness,
  mode: ContractMode,
  invalid: boolean,
) {
  const target = registerComplex(harness);
  const discovered = await search(harness, mode, { query: COMPLEX });
  assert.deepEqual(
    discovered.matches.map((item) => item.name),
    [COMPLEX],
  );
  assert.equal(target.calls(), 0);
  await assertVisible(harness, mode, COMPLEX, true);
  const schema = harness.ctx.tools.schemas(harness.agent).find((item) => item.name === COMPLEX);
  assert.ok(schema);
  assert.deepEqual(schema.parameters, target.definition.parameters);
  assert.deepEqual(
    harness.ctx.tools.get(COMPLEX, harness.agent)?.output.schema,
    target.definition.output.schema,
  );
  if (mode === 'native') {
    assert.deepEqual(
      (await harness.assemble()).tools.find((item) => item.name === COMPLEX),
      schema,
    );
  } else {
    const text = (await harness.assemble()).sections.find(
      (item) => item.name === 'tools:sdk',
    )?.text;
    assert.ok(text);
    assert.ok(text.includes('acknowledged: boolean'));
    assert.ok(text.includes('target:'));
    assert.ok(text.includes('"fast" | "full"'));
  }
  if (invalid) {
    for (const args of [
      { tags: ['red'] },
      { ...INPUT, tags: ['green'] },
      { ...INPUT, target: { ...INPUT.target, extra: true } },
    ]) {
      assert.equal(
        (await harness.call(COMPLEX, args, harness.agent, mode === 'ptc')).isError,
        true,
      );
    }
    assert.equal(target.calls(), 0, 'Invalid arguments performed a fixture effect');
  } else {
    const result = await harness.call(COMPLEX, INPUT, harness.agent, mode === 'ptc');
    assert.equal(result.isError, false, result.error?.message);
    assert.deepEqual(result.value, OUTPUT);
    assert.equal(target.calls(), 1);
  }
}

async function limits(harness: NativeBenchmarkHarness, mode: ContractMode) {
  const names = Array.from({ length: 7 }, (_, index) => `contract_result_${index}`);
  for (const name of names) harness.ctx.tools.register(fixture(name));
  for (const [limit, expected] of [
    [undefined, 3],
    [1, 1],
    [5, 5],
  ] as const) {
    await harness.unload();
    const result = await search(harness, mode, {
      query: 'contract_result_',
      mode: 'pattern',
      ...(limit === undefined ? {} : { limit }),
    });
    assert.equal(result.matches.length, expected);
    assert.equal(result.loadedTools.length, expected);
    assert.ok(result.matches.every((item) => names.includes(item.name) && item.loaded));
    for (const name of names)
      await assertVisible(harness, mode, name, result.loadedTools.includes(name));
  }
  assert.equal(harness.executedTools, 0);
}

async function invalidInputs(harness: NativeBenchmarkHarness, mode: ContractMode) {
  const before = await search(harness, mode, { query: NATIVE_FIXTURE.plugin });
  for (const args of [
    { query: 'fixture', limit: 0 },
    { query: 'fixture', limit: 6 },
    { query: 'fixture', limit: 1.5 },
    { query: 123 },
    { query: 'fixture', mode: 'unknown' },
    { query: 'x'.repeat(501) },
  ]) {
    assert.equal(
      (await harness.call('tool_search', args, harness.agent, mode === 'ptc')).isError,
      true,
    );
    assert.deepEqual((await search(harness, mode, { query: '' })).loadedTools, before.loadedTools);
  }
}

async function emptyInventory(harness: NativeBenchmarkHarness, mode: ContractMode) {
  const result = await search(harness, mode, { query: '' });
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.loadedTools, []);
  assert.ok(result.inventory);
  assert.equal(result.inventory.total, harness.definitions.length);
  assert.deepEqual(result.inventory.alwaysAvailable.sort(), [...BASE_TOOLS].sort());
  await assertVisible(harness, mode, NATIVE_FIXTURE.mcp, false);
}

async function hashedIdentities(harness: NativeBenchmarkHarness, mode: ContractMode) {
  harness.ctx.tools.register(fixture(HASHED));
  harness.ctx.tools.register(fixture(SHORT));
  for (const searchMode of ['hybrid', 'bm25', 'pattern'] as const) {
    const namespaced = await search(harness, mode, {
      query: `mcp__engineer-agent-workflow-mcp__${RAW}`,
      mode: searchMode,
      limit: 1,
    });
    assert.deepEqual(
      namespaced.matches.map((item) => item.name),
      [HASHED],
    );
    const ambiguous = await search(harness, mode, { query: RAW, mode: searchMode, limit: 5 });
    assert.deepEqual(ambiguous.matches.map((item) => item.name).sort(), [HASHED, SHORT].sort());
    const limited = await search(harness, mode, { query: RAW, mode: searchMode, limit: 1 });
    assert.deepEqual(
      limited.matches.map((item) => item.name),
      [HASHED, SHORT].sort().slice(0, 1),
    );
    assert.equal(limited.degraded, false);
  }
  assert.equal(harness.executedTools, 0);
  const result = await harness.call(HASHED, {}, harness.agent, mode === 'ptc');
  assert.equal(result.isError, false);
  assert.equal(result.value, HASHED);
}

async function lru(harness: NativeBenchmarkHarness, mode: ContractMode) {
  const name = (index: number) => `${NATIVE_FIXTURE.prefix}${index}`;
  for (let index = 0; index < MAX_LOADED; index++)
    await search(harness, mode, { query: name(index) });
  assert.equal((await harness.call(name(0), {}, harness.agent, mode === 'ptc')).isError, false);
  const first = await search(harness, mode, { query: name(16) });
  assert.deepEqual(first.evictedTools, [name(1)]);
  await search(harness, mode, { query: name(2) });
  const second = await search(harness, mode, { query: name(17) });
  assert.deepEqual(second.evictedTools, [name(3)]);
  assert.equal(second.loadedTools.length, MAX_LOADED);
  for (const index of [1, 3]) {
    await assertVisible(harness, mode, name(index), false);
    assert.equal(
      (await harness.call(name(index), {}, harness.agent, mode === 'ptc')).isError,
      true,
    );
  }
  const result = await harness.call(
    'tool_unload',
    { names: [name(0), name(0), 'read'] },
    harness.agent,
    mode === 'ptc',
  );
  assert.equal(result.isError, false);
  const unloaded = z
    .object({ unloadedTools: z.array(z.string()), loadedTools: z.array(z.string()) })
    .parse(result.value);
  assert.deepEqual(unloaded.unloadedTools, [name(0)]);
  assert.equal(unloaded.loadedTools.length, MAX_LOADED - 1);
  await assertVisible(harness, mode, name(0), false);
  await assertVisible(harness, mode, name(2), true);
  await assertVisible(harness, mode, 'read', true);
}

async function replacement(harness: NativeBenchmarkHarness, mode: ContractMode) {
  const name = 'contract_replace';
  const original = fixture(name);
  const remove = harness.ctx.tools.register(original);
  await search(harness, mode, { query: name });
  remove();
  const removeReplacement = harness.ctx.tools.register({
    ...original,
    execute: () => Promise.resolve('replacement'),
  });
  await assertVisible(harness, mode, name, false);
  assert.equal((await harness.call(name, {}, harness.agent, mode === 'ptc')).isError, true);
  await search(harness, mode, { query: name });
  const result = await harness.call(name, {}, harness.agent, mode === 'ptc');
  assert.equal(result.isError, false);
  assert.equal(result.value, 'replacement');
  removeReplacement();
  await assertVisible(harness, mode, name, false);
  assert.equal((await harness.call(name, {}, harness.agent, mode === 'ptc')).isError, true);
  assert.deepEqual((await search(harness, mode, { query: name, mode: 'pattern' })).matches, []);
}

async function restrictions(harness: NativeBenchmarkHarness, mode: ContractMode) {
  await search(harness, mode, { query: NATIVE_FIXTURE.mcp });
  const scope = createScope(harness.ctx, harness.agent);
  try {
    await scope.ctx.inject(['tools'], (ctx) => {
      ctx.tools.restrict({ deny: [NATIVE_FIXTURE.mcp, 'workflow'] });
    });
    await assertVisible(harness, mode, NATIVE_FIXTURE.mcp, false);
    await assertVisible(harness, mode, 'workflow', false);
    assert.equal(
      (await harness.call(NATIVE_FIXTURE.mcp, {}, harness.agent, mode === 'ptc')).isError,
      true,
    );
    assert.deepEqual(
      (await search(harness, mode, { query: NATIVE_FIXTURE.mcp, mode: 'pattern' })).matches,
      [],
    );
    const other = harness.newAgent();
    if (mode === 'ptc') await harness.enablePtc(other);
    await search(harness, mode, { query: NATIVE_FIXTURE.mcp }, other);
    assert.equal(
      (await harness.call(NATIVE_FIXTURE.mcp, {}, other, mode === 'ptc')).isError,
      false,
    );
  } finally {
    await scope.dispose();
  }
}

function pausedDiscovery() {
  const started = deferred<AbortSignal | undefined>();
  const finish = deferred<void>();
  const discovery: Discovery = {
    async search(_agent, catalog, input, signal) {
      started.resolve(signal);
      await finish.promise;
      const match = catalog.find((item) => item.name === input.query);
      assert.ok(match);
      return { matches: [match], mode: 'pattern', degraded: false, authorityGranted: false };
    },
  };
  return { discovery, started: started.promise, finish: () => finish.resolve() };
}

async function asynchronousCase(name: ContractName, mode: ContractMode, cacheRoot: string) {
  const paused = pausedDiscovery();
  await withHarness(
    mode,
    cacheRoot,
    async (harness) => {
      const controller = new AbortController();
      const pending = harness.call(
        'tool_search',
        { query: NATIVE_FIXTURE.plugin },
        harness.agent,
        mode === 'ptc',
        controller.signal,
      );
      const signal = await within(paused.started, 'discovery start');
      try {
        if (name === 'cancelled-search') controller.abort();
        if (name === 'catalog-change-in-flight')
          harness.ctx.tools.register(fixture('contract_new_capability'));
        if (name === 'disposal-in-flight') await harness.disableSearch();
        if (name !== 'catalog-change-in-flight') assert.equal(signal?.aborted, true);
      } finally {
        paused.finish();
      }
      assert.equal((await pending).isError, true);
      if (name === 'disposal-in-flight') {
        assert.equal(harness.ctx.tools.get('tool_search'), undefined);
        assert.equal(harness.ctx.tools.get('tool_unload'), undefined);
        assert.ok(
          !(await harness.assemble()).sections.some((item) => item.name === 'local:tool-discovery'),
        );
      } else {
        await assertVisible(harness, mode, NATIVE_FIXTURE.plugin, false);
        assert.equal(
          (await harness.call(NATIVE_FIXTURE.plugin, {}, harness.agent, mode === 'ptc')).isError,
          true,
        );
      }
    },
    { discovery: paused.discovery },
  );
}

export async function runRegistryContract(
  name: ContractName,
  mode: ContractMode,
  cacheRoot: string,
): Promise<void> {
  if (
    name === 'cancelled-search' ||
    name === 'catalog-change-in-flight' ||
    name === 'disposal-in-flight'
  ) {
    await asynchronousCase(name, mode, cacheRoot);
    return;
  }
  let base: string[] = [...BASE_TOOLS];
  const config: Config = { ...Config({}), alwaysAvailableTools: { get: () => base } };
  await withHarness(
    mode,
    cacheRoot,
    async (harness) => {
      switch (name) {
        case 'complex-schema-roundtrip':
          await complexSchema(harness, mode, false);
          break;
        case 'complex-input-validation':
          await complexSchema(harness, mode, true);
          break;
        case 'default-and-maximum-limit':
          await limits(harness, mode);
          break;
        case 'invalid-inputs-preserve-state':
          await invalidInputs(harness, mode);
          break;
        case 'empty-inventory':
          await emptyInventory(harness, mode);
          break;
        case 'hashed-mcp-identities':
          await hashedIdentities(harness, mode);
          break;
        case 'lru-refresh-and-partial-unload':
          await lru(harness, mode);
          break;
        case 'catalog-replacement-and-removal':
          await replacement(harness, mode);
          break;
        case 'scoped-restriction-after-loading':
          await restrictions(harness, mode);
          break;
        case 'live-base-promotion-and-demotion': {
          await search(harness, mode, { query: NATIVE_FIXTURE.plugin });
          await search(harness, mode, { query: NATIVE_FIXTURE.mcp });
          base = [...BASE_TOOLS, NATIVE_FIXTURE.plugin];
          assert.deepEqual((await search(harness, mode, { query: '' })).loadedTools, [
            NATIVE_FIXTURE.mcp,
          ]);
          await assertVisible(harness, mode, NATIVE_FIXTURE.plugin, true);
          base = [...BASE_TOOLS];
          await assertVisible(harness, mode, NATIVE_FIXTURE.plugin, false);
          await assertVisible(harness, mode, NATIVE_FIXTURE.mcp, true);
          assert.equal(
            (await harness.call(NATIVE_FIXTURE.plugin, {}, harness.agent, mode === 'ptc')).isError,
            true,
          );
          await search(harness, mode, { query: NATIVE_FIXTURE.plugin });
          assert.equal(
            (await harness.call(NATIVE_FIXTURE.plugin, {}, harness.agent, mode === 'ptc')).isError,
            false,
          );
          break;
        }
        default: {
          const unhandled: never = name;
          throw new Error(`Unhandled registry contract: ${String(unhandled)}`);
        }
      }
    },
    { config },
  );
}
