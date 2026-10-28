import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

await test('the default cache stays under DSH_HOME and persists only hashed definition vectors', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-tool-search-cache-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = new URL('./fixtures/cache-probe.ts', import.meta.url);
  const child = spawnSync(process.execPath, ['--import=tsx', fileURLToPath(fixture)], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const root = join(home, 'cache', 'dsh-tool-search');
  const files = await readdir(root);
  assert.equal(files.length, 1);
  const file = files[0];
  assert.ok(file);
  const raw = await readFile(join(root, file), 'utf8');
  assert.ok(!raw.includes('query-marker-never-persist'));
  assert.ok(!raw.includes('Private definition text'));
  assert.ok(!raw.includes('custom_probe'));
  const cache = JSON.parse(raw) as { entries: Record<string, number[]> };
  assert.deepEqual(Object.values(cache.entries), [[1, 0]]);
  const key = Object.keys(cache.entries)[0];
  assert.ok(key);
  assert.match(key, /^[a-f0-9]{64}$/);
});
