import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

await test('native registry preserves schemas and agents across provider changes', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-provider-probe-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const child = spawnSync(
    process.execPath,
    [
      '--import=tsx',
      fileURLToPath(new URL('./fixtures/provider-switch-probe.ts', import.meta.url)),
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, DSH_HOME: home },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  assert.match(child.stdout, /provider-switch-probe: passed/);
});
