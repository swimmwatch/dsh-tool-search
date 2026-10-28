import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { PACKAGE_NAME } from '../src/constants.js';
import {
  digest,
  releaseMetadataSchema,
  releaseNotes,
  releaseVersion,
  REPOSITORY,
} from './release-policy.js';

assert.equal(process.env['GITHUB_REPOSITORY'], REPOSITORY);
assert.equal(process.env['GITHUB_REF'], 'refs/heads/main');
const manifest = z
  .object({ name: z.literal(PACKAGE_NAME), version: z.string() })
  .parse(JSON.parse(await readFile('package.json', 'utf8')));
const version = releaseVersion(manifest.version);
const notes = releaseNotes(await readFile('CHANGELOG.md', 'utf8'), version);
const directory = 'artifacts/release';
await mkdir(directory, { recursive: true });
const packed = z
  .array(z.object({ filename: z.string() }))
  .length(1)
  .parse(
    JSON.parse(
      execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], {
        encoding: 'utf8',
      }),
    ),
  )[0];
assert.ok(packed);
const archive = join(directory, packed.filename);
execFileSync(
  'npx',
  [
    '--no-install',
    'tsx',
    '--import',
    './scripts/register-ui-sdk.ts',
    'scripts/verify-package.ts',
    archive,
  ],
  { stdio: 'inherit' },
);
execFileSync('npx', ['--no-install', 'tsx', 'scripts/smoke-package.ts', archive], {
  stdio: 'inherit',
});
const metadata = releaseMetadataSchema.parse({
  ...manifest,
  repository: REPOSITORY,
  commit: process.env['GITHUB_SHA'],
  runId: process.env['GITHUB_RUN_ID'],
  filename: packed.filename,
  sha256: digest(await readFile(archive)),
  notesSha256: digest(Buffer.from(notes)),
});
await writeFile(join(directory, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(join(directory, 'SHA256SUMS'), `${metadata.sha256}  ${packed.filename}\n`);
await writeFile(join(directory, 'RELEASE_NOTES.md'), notes);
process.stdout.write(`Prepared ${PACKAGE_NAME}@${version}: ${metadata.sha256}\n`);
