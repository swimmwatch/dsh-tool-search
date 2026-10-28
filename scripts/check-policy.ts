import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { PACKAGE_NAME, PLUGIN_NAME } from '../src/constants.js';
import { releaseVersion, REPOSITORY } from './release-policy.js';

const schema = z.object({
  name: z.literal(PACKAGE_NAME),
  version: z.string(),
  license: z.literal('Apache-2.0'),
});
const manifest = schema.parse(JSON.parse(await readFile('package.json', 'utf8')));
releaseVersion(manifest.version);
const lock = z
  .object({ name: z.string(), version: z.string(), packages: z.record(z.string(), z.unknown()) })
  .parse(JSON.parse(await readFile('package-lock.json', 'utf8')));
assert.deepEqual(
  schema.parse(lock.packages['']),
  manifest,
  'The root lockfile package must match the manifest',
);
assert.equal(lock.name, manifest.name);
assert.equal(lock.version, manifest.version);
assert.ok(
  (await readFile('cordis.patch.yml', 'utf8')).includes(
    `id: ${PLUGIN_NAME}\n      name: '${PACKAGE_NAME}'`,
  ),
);
const changelog = await readFile('CHANGELOG.md', 'utf8');
assert.match(changelog, /^## \[Unreleased\]$/mu);
assert.ok(changelog.includes('https://keepachangelog.com/en/1.1.0/'));
assert.ok(changelog.includes(`https://github.com/${REPOSITORY}/compare/`));
const message =
  process.env['PR_TITLE'] ||
  execFileSync('git', ['log', '-1', '--format=%B'], { encoding: 'utf8' });
execFileSync('node', ['node_modules/@commitlint/cli/cli.js'], {
  input: message,
  stdio: ['pipe', 'inherit', 'inherit'],
});
process.stdout.write('Package, changelog and Conventional Commit policy verified.\n');
