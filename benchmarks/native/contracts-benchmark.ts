import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  CONTRACT_CASE_IDS,
  CONTRACT_MODES,
  PROVIDER_CONTRACTS,
  REGISTRY_CONTRACTS,
} from './contracts-cases.js';
import { runRegistryContract } from './contracts-registry.js';
import {
  runDisabledContract,
  runMissingKeyContract,
  runProviderContract,
} from './contracts-providers.js';

async function main(): Promise<void> {
  const started = performance.now();
  const cacheRoot = await mkdtemp(join(tmpdir(), 'dsh-contracts-benchmark-'));
  const results: { id: string; passed: boolean }[] = [];
  const failures: { id: string; error: string }[] = [];
  const record = async (id: string, run: (cache: string) => Promise<void>) => {
    try {
      await run(join(cacheRoot, id.replaceAll('/', '-')));
      results.push({ id, passed: true });
    } catch (error) {
      results.push({ id, passed: false });
      failures.push({ id, error: error instanceof Error ? error.message : 'Contract failed' });
    }
  };
  try {
    for (const mode of CONTRACT_MODES) {
      for (const name of REGISTRY_CONTRACTS) {
        await record(`${mode}/${name}`, (cache) => runRegistryContract(name, mode, cache));
      }
    }
    for (const provider of ['ollama', 'openai'] as const) {
      for (const name of PROVIDER_CONTRACTS) {
        await record(`${provider}/${name}`, (cache) => runProviderContract(provider, name, cache));
      }
    }
    await record('disabled/no-embedding-http', runDisabledContract);
    await record('openai/missing-key-no-http', runMissingKeyContract);
    assert.deepEqual(
      results.map((item) => item.id),
      [...CONTRACT_CASE_IDS],
    );
    const report = {
      schemaVersion: 2,
      suite: 'native-contracts',
      ok: failures.length === 0,
      cases: results.length,
      passedCases: results.filter((item) => item.passed).length,
      failures,
      results,
      elapsedMs: performance.now() - started,
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Native contracts failed' })}\n`,
  );
  process.exitCode = 1;
});
