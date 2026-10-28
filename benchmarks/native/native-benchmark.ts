import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { BASE_TOOLS, EMBEDDING, MAX_LOADED } from '../../src/constants.js';
import { ToolDiscovery } from '../../src/discovery.js';
import { BENCHMARK_SCHEMA_VERSION, PERFORMANCE_POLICY } from '../shared/benchmark-policy.js';
import { NATIVE_FIXTURE, NativeBenchmarkHarness } from './harness.js';

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function checkLifecycle(harness: NativeBenchmarkHarness): Promise<string[]> {
  const checks: string[] = [];
  const initial = await harness.assemble();
  assert.deepEqual(initial.tools.map((tool) => tool.name).sort(), [...BASE_TOOLS].sort());
  checks.push('standard-base-tools-visible');
  for (const name of ['working_directory', NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp]) {
    const result = await harness.search(name);
    assert.equal(result.matches[0]?.name, name);
    if (name === 'working_directory') assert.equal(result.loadedTools.length, 0);
    const assembly = await harness.assemble();
    assert.deepEqual(
      assembly.tools.find((tool) => tool.name === name),
      harness.ctx.tools.schemas(harness.agent).find((tool) => tool.name === name),
    );
  }
  assert.equal(harness.executedTools, 0, 'Discovery executed a tool');
  for (const name of ['working_directory', NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp]) {
    const result = await harness.call(name);
    assert.ok(!result.isError, result.error?.message);
    assert.equal(result.value, name);
  }
  checks.push(
    'native-plugin-mcp-discovery-and-call',
    'original-schemas-preserved',
    'discovery-does-not-execute',
  );
  const second = harness.newAgent();
  assert.equal((await harness.call(NATIVE_FIXTURE.mcp, {}, second)).isError, true);
  assert.ok(
    !(await harness.assemble(second)).tools.some((tool) => tool.name === NATIVE_FIXTURE.mcp),
  );
  checks.push('agent-isolation');
  await harness.unload();
  for (let i = 0; i <= MAX_LOADED; i++) {
    const loaded = await harness.search(`${NATIVE_FIXTURE.prefix}${i}`);
    assert.ok(loaded.loadedTools.length <= MAX_LOADED);
    if (i === MAX_LOADED) assert.deepEqual(loaded.evictedTools, [`${NATIVE_FIXTURE.prefix}0`]);
  }
  checks.push('bounded-lru');
  assert.equal((await harness.unload()).loadedTools.length, 0);
  const final = await harness.assemble();
  assert.deepEqual(final.tools.map((tool) => tool.name).sort(), [...BASE_TOOLS].sort());
  assert.ok(!final.sections.some((section) => section.name === 'mcp:benchmark'));
  const absent = await harness.search('zzzznonexistent987987');
  assert.equal(absent.matches.length, 0);
  assert.equal(absent.loadedTools.length, 0);
  checks.push('unload-restores-base-and-instructions', 'no-match-does-not-activate');
  return checks;
}

async function checkFallback(cacheRoot: string): Promise<void> {
  const discovery = new ToolDiscovery({
    cacheRoot,
    embeddingClient: {
      model: 'benchmark-unavailable',
      embedBatches: () => Promise.reject(new Error('Simulated embedding outage')),
    },
  });
  const harness = await NativeBenchmarkHarness.create(discovery);
  try {
    const result = await harness.search(
      'runtime version serving build identity',
      harness.agent,
      'hybrid',
    );
    assert.equal(result.degraded, true);
    assert.equal(result.matches[0]?.name, NATIVE_FIXTURE.mcp);
    assert.ok((await harness.assemble()).tools.some((tool) => tool.name === NATIVE_FIXTURE.mcp));
  } finally {
    await harness.close();
  }
}

async function checkExplicitReferences(cacheRoot: string): Promise<void> {
  const harness = await NativeBenchmarkHarness.create(
    new ToolDiscovery({
      cacheRoot,
      embeddingClient: {
        model: 'benchmark-unavailable',
        embedBatches: () => Promise.reject(new Error('Embedding service unavailable')),
      },
    }),
  );
  try {
    for (const name of ['workflow', NATIVE_FIXTURE.plugin, NATIVE_FIXTURE.mcp]) {
      const target = harness.definitions.find((definition) => definition.name === name);
      assert.ok(target);
      const disposers = Array.from({ length: 400 }, (_, i) =>
        harness.ctx.tools.register({
          ...target,
          name: `a_${name}_${i}`,
          description: `${name} ${name} task_id task_id`,
        }),
      );
      try {
        for (const mode of ['bm25', 'hybrid'] as const) {
          for (const query of [`Call ${name} task_id`, `Используй «${name}» с task_id`]) {
            const result = await harness.search(query, harness.agent, mode);
            assert.deepEqual(
              result.matches.map((match) => match.name),
              [name],
            );
            assert.equal(result.degraded, mode === 'hybrid');
            assert.equal(harness.executedTools, 0);
            await harness.unload();
          }
        }
      } finally {
        for (const dispose of disposers) dispose();
      }
    }
  } finally {
    await harness.close();
  }
}

async function checkLiveSearch(harness: NativeBenchmarkHarness): Promise<void> {
  for (const [query, expected] of [
    ['sentinel watches health probes', NATIVE_FIXTURE.plugin],
    ['runtime version serving build identity', NATIVE_FIXTURE.mcp],
  ]) {
    assert.ok(query && expected);
    const result = await harness.search(query, harness.agent, 'hybrid');
    assert.equal(result.degraded, false);
    assert.equal(result.matches[0]?.name, expected);
    assert.ok((await harness.assemble()).tools.some((tool) => tool.name === expected));
  }
}

async function measureOverhead(harness: NativeBenchmarkHarness, cacheRoot: string) {
  const direct = new ToolDiscovery({ cacheRoot });
  const agent = {};
  const coldStarted = performance.now();
  await harness.search(`${NATIVE_FIXTURE.prefix}0`);
  const coldNativeMs = performance.now() - coldStarted;
  await direct.search(agent, harness.definitions, { query: `${NATIVE_FIXTURE.prefix}0`, limit: 1 });
  const directSamples: number[] = [],
    nativeSamples: number[] = [];
  for (let i = 0; i < PERFORMANCE_POLICY.iterations; i++) {
    const query = `${NATIVE_FIXTURE.prefix}${i}`;
    const started = performance.now();
    const result = await direct.search(agent, harness.definitions, { query, limit: 1 });
    directSamples.push(performance.now() - started);
    assert.equal(result.matches[0]?.name, query);
    const nativeStarted = performance.now();
    assert.equal((await harness.search(query)).matches[0]?.name, query);
    nativeSamples.push(performance.now() - nativeStarted);
  }
  const directP95Ms = percentile95(directSamples),
    nativeP95Ms = percentile95(nativeSamples);
  const allowedP95Ms =
    directP95Ms * PERFORMANCE_POLICY.relativeTolerance + PERFORMANCE_POLICY.absoluteToleranceMs;
  return {
    passed: nativeP95Ms <= allowedP95Ms,
    iterations: PERFORMANCE_POLICY.iterations,
    coldNativeMs,
    directP95Ms,
    nativeP95Ms,
    allowedP95Ms,
  };
}

async function main(): Promise<void> {
  const started = performance.now();
  const live = process.argv.slice(2).includes('--live');
  const cacheRoot = await mkdtemp(join(tmpdir(), 'dsh-native-benchmark-'));
  let harness: NativeBenchmarkHarness | undefined;
  try {
    harness = await NativeBenchmarkHarness.create(new ToolDiscovery({ cacheRoot }));
    const checks = await checkLifecycle(harness);
    await checkFallback(cacheRoot);
    checks.push('embedding-outage-bm25-fallback');
    await checkExplicitReferences(cacheRoot);
    checks.push('explicit-reference-before-limit', 'explicit-reference-fallback');
    const overhead = await measureOverhead(harness, cacheRoot);
    if (live) {
      await checkLiveSearch(harness);
      checks.push('native-live-semantic-search');
    }
    const report = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      layer: 'native-dsh-registry',
      liveSemanticCases: live ? 2 : 0,
      embeddingModel: live ? EMBEDDING.model : null,
      ok: overhead.passed,
      catalogSize: harness.definitions.length + 2,
      checks,
      overhead,
      elapsedMs: performance.now() - started,
      externalToolEffects: false,
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    try {
      await harness?.close();
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Native benchmark failed' })}\n`,
  );
  process.exitCode = 1;
});
