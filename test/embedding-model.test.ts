import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

await test('live model changes isolate vectors, preserve loading and retain BM25 fallback', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-tool-search-models-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const child = spawnSync(
    process.execPath,
    ['--import=tsx', fileURLToPath(new URL('./fixtures/model-switch-probe.ts', import.meta.url))],
    {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, DSH_HOME: home },
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  assert.match(child.stdout, /model-switch-probe: passed/);
});
