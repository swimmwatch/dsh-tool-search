import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { PACKAGE_NAME } from '../src/constants.js';
import {
  digest,
  releaseChannel,
  releaseMetadataSchema,
  REPOSITORY,
  verifyPrepareRun,
  verifyRelease,
} from './release-policy.js';
import { registryArchive, waitForPublication } from './release-registry.js';

function github(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}
const runId = z.string().regex(/^\d+$/u).parse(process.env['PREPARE_RUN_ID']);
assert.equal(process.env['GITHUB_REPOSITORY'], REPOSITORY);
assert.equal(process.env['GITHUB_REF'], 'refs/heads/main');
const commit = z
  .string()
  .regex(/^[a-f\d]{40}$/u)
  .parse(process.env['GITHUB_SHA']);
const main = z
  .object({ sha: z.string() })
  .parse(JSON.parse(github(['api', `repos/${REPOSITORY}/commits/main`])));
assert.equal(main.sha, commit, 'Publish must use the current reviewed main commit');
verifyPrepareRun(JSON.parse(github(['api', `repos/${REPOSITORY}/actions/runs/${runId}`])), commit);
const directory = await mkdtemp(join(tmpdir(), 'dsh-release-publish-'));
async function createRelease(version: string, sha: string, paths: string[]): Promise<void> {
  const tag = `v${version}`;
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    github([
      'release',
      'create',
      tag,
      ...paths,
      '--repo',
      REPOSITORY,
      '--target',
      sha,
      '--title',
      tag,
      '--notes-file',
      join(directory, 'RELEASE_NOTES.md'),
      ...(releaseChannel(version) === 'next' ? ['--prerelease', '--latest=false'] : ['--latest']),
    ]);
  } else {
    assert.ok(response.ok, `GitHub release request failed: ${response.status}`);
    const existing = z
      .object({ draft: z.literal(false), prerelease: z.boolean(), target_commitish: z.string() })
      .parse(await response.json());
    assert.equal(existing.target_commitish, sha, 'Existing release refers to another commit');
    assert.equal(existing.prerelease, releaseChannel(version) === 'next');
    // Existing public releases are immutable here; missing assets need an explicit repair.
    const assets = z
      .object({ assets: z.array(z.object({ name: z.string(), digest: z.string().nullable() })) })
      .parse(
        await (
          await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`, {
            signal: AbortSignal.timeout(30_000),
          })
        ).json(),
      );
    for (const path of paths) {
      const name = path.split('/').at(-1);
      const asset = assets.assets.find((item) => item.name === name);
      assert.ok(asset, `Missing release asset: ${name}`);
      assert.equal(asset.digest, `sha256:${digest(await readFile(path))}`);
    }
  }
}

try {
  github([
    'run',
    'download',
    runId,
    '--repo',
    REPOSITORY,
    '--name',
    `release-${runId}`,
    '--dir',
    directory,
  ]);
  const metadata = releaseMetadataSchema.parse(
    JSON.parse(await readFile(join(directory, 'release.json'), 'utf8')),
  );
  const archive = join(directory, metadata.filename);
  verifyRelease(
    metadata,
    await readFile(archive),
    await readFile(join(directory, 'RELEASE_NOTES.md')),
    commit,
    runId,
  );
  const manifest = z.object({
    name: z.literal(PACKAGE_NAME),
    version: z.literal(metadata.version),
  });
  manifest.parse(JSON.parse(await readFile('package.json', 'utf8')));
  assert.equal(
    await readFile(join(directory, 'SHA256SUMS'), 'utf8'),
    `${metadata.sha256}  ${metadata.filename}\n`,
  );
  const tagResponse = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/git/ref/tags/v${metadata.version}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (tagResponse.status !== 404) {
    assert.ok(tagResponse.ok, `Git tag request failed: ${tagResponse.status}`);
    z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(commit) }) }).parse(
      await tagResponse.json(),
    );
  }
  const existing = await registryArchive(metadata.version);
  if (existing) {
    assert.equal(
      digest(existing),
      metadata.sha256,
      'This npm version already contains a different archive',
    );
  } else {
    execFileSync(
      'npm',
      [
        'publish',
        archive,
        '--ignore-scripts',
        '--access',
        'public',
        '--tag',
        releaseChannel(metadata.version),
      ],
      { stdio: 'inherit' },
    );
  }
  await waitForPublication(metadata.version, metadata.sha256);
  await createRelease(metadata.version, commit, [
    archive,
    join(directory, 'SHA256SUMS'),
    join(directory, 'release.json'),
    join(directory, 'RELEASE_NOTES.md'),
  ]);
  process.stdout.write(`Published and verified ${PACKAGE_NAME}@${metadata.version}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
