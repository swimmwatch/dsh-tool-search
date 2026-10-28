import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { renderToolsSdk, RUN_CODE_NAME } from '@deepseek-ai/dsh-tools';
import { BASE_TOOLS, EMBEDDING, MAX_LOADED } from '../../src/constants.js';
import { ToolDiscovery } from '../../src/discovery.js';
import { BENCHMARK_SCHEMA_VERSION, PERFORMANCE_POLICY } from '../shared/benchmark-policy.js';
import { NATIVE_FIXTURE, NativeBenchmarkHarness } from './harness.js';

async function sdk(harness: NativeBenchmarkHarness, agent = harness.agent): Promise<string> {
  const assembly = await harness.assemble(agent);
  assert.deepEqual(
    assembly.tools.map((tool) => tool.name),
    [RUN_CODE_NAME],
  );
  const section = assembly.sections.find((section) => section.name === 'tools:sdk');
  assert.ok(section, 'Missing PTC SDK');
  return section.text;
}

function originalSdk(harness: NativeBenchmarkHarness, allowed?: ReadonlySet<string>): string {
  return renderToolsSdk(
    harness.ctx.tools
      .schemas(harness.agent)
      .filter((tool) => tool.name !== RUN_CODE_NAME && (!allowed || allowed.has(tool.name)))
      .map((tool) => {
        const definition = harness.ctx.tools.get(tool.name, harness.agent);
        assert.ok(definition);
        return { ...tool, output: definition.output.schema };
      }),
  );
}

async function checkLifecycle(harness: NativeBenchmarkHarness) {
  const checks: string[] = [];
  const scopedTools = await harness.enablePtc();
  const fullSdk = originalSdk(harness);
  const initial = await sdk(harness);
  assert.equal(initial, originalSdk(harness, new Set(BASE_TOOLS)));
  assert.ok(initial.length < fullSdk.length);
  assert.ok(initial.includes('tool_search:') && initial.includes('tool_unload:'));
  assert.ok(!initial.includes(NATIVE_FIXTURE.prefix) && !initial.includes(NATIVE_FIXTURE.mcp));
  assert.ok(
    !(await harness.assemble()).sections.some((section) => section.name === 'mcp:benchmark'),
  );
  checks.push(
    'initial-sdk-base-only',
    'discovery-available-inside-ptc',
    'hidden-mcp-instructions-absent',
  );

  for (const name of ['working_directory', NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp]) {
    const result = await harness.search(name);
    assert.equal(result.matches[0]?.name, name);
    if (name === 'working_directory') assert.equal(result.loadedTools.length, 0);
    assert.equal(harness.executedTools, 0, 'Discovery executed a capability');
    assert.ok((await sdk(harness)).includes(name));
  }
  const discovered = await sdk(harness);
  assert.equal(
    discovered,
    originalSdk(harness, new Set([...BASE_TOOLS, NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp])),
  );
  assert.ok(
    (await harness.assemble()).sections.some((section) => section.name === 'mcp:benchmark'),
  );
  for (const name of ['working_directory', NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp]) {
    assert.equal(
      (await harness.call(name)).isError,
      true,
      'PTC allowed a native direct capability call',
    );
    const result = await harness.call(name, {}, harness.agent, true);
    assert.equal(result.isError, false);
    assert.equal(result.value, name);
  }
  checks.push(
    'native-plugin-mcp-discovery-and-nested-call',
    'original-input-output-declarations-preserved',
    'native-direct-calls-rejected',
  );

  const child = harness.newAgent();
  await harness.enablePtc(child, harness.agent);
  assert.ok(!(await sdk(harness, child)).includes(NATIVE_FIXTURE.mcp));
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, child, true)).isError, true);
  await harness.search(NATIVE_FIXTURE.mcp, child);
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, child, true)).isError, false);
  await harness.unload();
  assert.equal(await sdk(harness), initial);
  assert.ok((await sdk(harness, child)).includes(NATIVE_FIXTURE.mcp));
  checks.push('child-discovery-is-independent', 'unload-restores-exact-sdk');

  await harness.search(NATIVE_FIXTURE.mcp);
  const stopGuard = scopedTools.guard((exec) =>
    exec.name === NATIVE_FIXTURE.mcp ? 'Read-only benchmark policy' : undefined,
  );
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, harness.agent, true)).isError, true);
  stopGuard();
  await harness.unload();
  checks.push('existing-permission-guards-preserved');

  for (let i = 0; i <= MAX_LOADED; i++) {
    const result = await harness.search(`${NATIVE_FIXTURE.prefix}${i}`);
    assert.ok(result.loadedTools.length <= MAX_LOADED);
    if (i === MAX_LOADED) assert.deepEqual(result.evictedTools, [`${NATIVE_FIXTURE.prefix}0`]);
  }
  assert.ok(!(await sdk(harness)).includes(`${NATIVE_FIXTURE.prefix}0:`));
  assert.equal(
    (await harness.call(`${NATIVE_FIXTURE.prefix}0`, {}, harness.agent, true)).isError,
    true,
  );
  await harness.unload();
  checks.push('bounded-lru-removes-sdk-and-invocation');

  const absent = await harness.search('zzzznonexistent987987');
  assert.equal(absent.matches.length, 0);
  assert.equal(await sdk(harness), initial);
  checks.push('no-match-preserves-sdk');

  const native = harness.newAgent();
  const nativeAssembly = await harness.assemble(native);
  assert.deepEqual(nativeAssembly.tools.map((tool) => tool.name).sort(), [...BASE_TOOLS].sort());
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, native)).isError, true);
  await harness.search(NATIVE_FIXTURE.mcp, native);
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, native)).isError, false);
  assert.equal(await sdk(harness), initial);
  checks.push('standard-and-ptc-coexist-with-independent-state');

  const durations: number[] = [];
  for (let i = 0; i < PERFORMANCE_POLICY.iterations; i++) {
    const start = performance.now();
    assert.equal(await sdk(harness), initial);
    durations.push(performance.now() - start);
  }
  durations.sort((left, right) => left - right);
  return {
    checks,
    sdkCharacters: {
      fullCatalog: fullSdk.length,
      initial: initial.length,
      discovered: discovered.length,
      unloaded: initial.length,
    },
    assembly: {
      iterations: durations.length,
      p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
      informationalOnly: true,
    },
  };
}

async function checkSemanticSearch(harness: NativeBenchmarkHarness, live: boolean) {
  if (live) {
    for (const [query, expected] of [
      ['sentinel watches health probes', NATIVE_FIXTURE.plugin],
      ['runtime version serving build identity', NATIVE_FIXTURE.mcp],
    ]) {
      assert.ok(query && expected);
      const result = await harness.search(query, harness.agent, 'hybrid');
      assert.equal(result.degraded, false);
      assert.equal(result.matches[0]?.name, expected);
      assert.ok((await sdk(harness)).includes(expected));
    }
    await harness.unload();
  }
}

async function main(): Promise<void> {
  const started = performance.now();
  const live = process.argv.slice(2).includes('--live');
  const cacheRoot = await mkdtemp(join(tmpdir(), 'dsh-ptc-benchmark-'));
  const harness = await NativeBenchmarkHarness.create(new ToolDiscovery({ cacheRoot }));
  try {
    const lifecycle = await checkLifecycle(harness);
    await checkSemanticSearch(harness, live);
    const fallback = await NativeBenchmarkHarness.create(
      new ToolDiscovery({
        cacheRoot,
        embeddingClient: {
          model: 'ptc-unavailable',
          embedBatches: () => Promise.reject(new Error('Simulated embedding outage')),
        },
      }),
    );
    try {
      await fallback.enablePtc();
      const result = await fallback.search(
        'runtime version serving build identity',
        fallback.agent,
        'hybrid',
      );
      assert.equal(result.degraded, true);
      assert.equal(result.matches[0]?.name, NATIVE_FIXTURE.mcp);
      assert.ok((await sdk(fallback)).includes(NATIVE_FIXTURE.mcp));
    } finally {
      await fallback.close();
    }
    lifecycle.checks.push('ptc-embedding-outage-bm25-fallback');
    if (live) lifecycle.checks.push('ptc-live-semantic-search');
    process.stdout.write(
      `${JSON.stringify({ ok: true, schemaVersion: BENCHMARK_SCHEMA_VERSION, layer: 'ptc-dsh-registry', scope: 'real DSH registry, SDK rendering and nested fixture dispatch; not the Node sandbox', catalogSize: harness.definitions.length + 2, liveSemanticCases: live ? 2 : 0, embeddingModel: live ? EMBEDDING.model : undefined, ...lifecycle, elapsedMs: performance.now() - started, externalToolEffects: false })}\n`,
    );
  } finally {
    await harness.close();
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'PTC benchmark failed' })}\n`,
  );
  process.exitCode = 1;
});
