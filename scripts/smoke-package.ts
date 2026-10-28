import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { PACKAGE_NAME } from '../src/constants.js';

const target = process.argv[2];
assert.ok(target, 'Pass a prebuilt archive or an exact published package version');
const spec = target.endsWith('.tgz') ? resolve(target) : target;
assert.ok(
  spec.endsWith('.tgz') || spec.startsWith(`${PACKAGE_NAME}@`),
  'Unexpected installation target',
);
const home = await mkdtemp(join(tmpdir(), 'dsh-package-smoke-'));
const env = { ...process.env, DSH_HOME: home, CI: 'true' };
const launcher = [
  '--yes',
  '--package=@deepseek-ai/dsh@0.2.1-rc.2',
  '--package=pnpm@11.9.0',
  '--',
  'dsh',
];
function dsh(args: string[]): string {
  return execFileSync('npx', [...launcher, ...args], {
    env,
    cwd: home,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}
try {
  dsh(['--profile', 'smoke', '--from-default-profile', 'web', '--dump-config']);
  dsh(['plugin', '--profile', 'smoke', 'add', '--workspace-root', spec]);
  const manifest = z
    .object({
      dependencies: z.record(z.string(), z.string()),
      dsh: z.object({ profile: z.object({ bundles: z.array(z.string()) }) }),
    })
    .parse(JSON.parse(await readFile(join(home, 'profiles/smoke/package.json'), 'utf8')));
  assert.ok(manifest.dependencies[PACKAGE_NAME], 'Package not installed into the isolated profile');
  assert.equal(manifest.dsh.profile.bundles.filter((name) => name === PACKAGE_NAME).length, 1);
  const config = dsh(['--profile', 'smoke', '--dump-config']);
  assert.ok(config.includes(PACKAGE_NAME), 'Bundle is missing from the composed DSH profile');
  process.stdout.write('Clean DSH profile installation and composition verified.\n');
} finally {
  await rm(home, { recursive: true, force: true });
}
