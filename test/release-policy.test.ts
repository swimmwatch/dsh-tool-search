import assert from 'node:assert/strict';
import test from 'node:test';
import {
  digest,
  RELEASE_WORKFLOW,
  releaseChannel,
  releaseMetadataSchema,
  releaseNotes,
  releaseVersion,
  REPOSITORY,
  verifyPrepareRun,
  verifyRelease,
} from '../scripts/release-policy.js';

await test('publication accepts only a successful release run for the reviewed main commit', () => {
  const commit = 'a'.repeat(40);
  const run = {
    head_sha: commit,
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    path: RELEASE_WORKFLOW,
    repository: { full_name: REPOSITORY },
  };
  assert.doesNotThrow(() => verifyPrepareRun(run, commit));
  for (const changes of [
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { path: '.github/workflows/ci.yml' },
    { repository: { full_name: 'someone/else' } },
  ]) {
    assert.throws(() => verifyPrepareRun({ ...run, ...changes }, commit));
  }
});

await test('release versions separate prereleases from stable without accepting arbitrary tags', () => {
  assert.equal(releaseChannel('1.0.0-rc.1'), 'next');
  assert.equal(releaseChannel('1.0.0'), 'latest');
  for (const input of [
    'v1.0.0',
    '01.0.0',
    '1.0.0-rc.01',
    '1.0.0-beta.1',
    '1.0.0+build',
    'main',
    '../release',
  ]) {
    assert.throws(() => releaseVersion(input));
  }
});

await test('release notes are taken only from the dated and categorized version section', () => {
  const changelog =
    '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Future.\n\n## [1.0.0] - 2026-10-28\n\n### Added\n\n- Released.\n\n## [1.0.0-rc.1] - 2026-10-27\n\n### Added\n\n- Candidate.\n';
  assert.equal(releaseNotes(changelog, '1.0.0'), '### Added\n\n- Released.');
  assert.throws(() => releaseNotes(changelog, '1.0.1'));
  assert.throws(() => releaseNotes('## [1.0.0] - tomorrow\n', '1.0.0'));
});

await test('publishing rejects substituted artifacts, metadata and prepare runs', () => {
  const archive = Buffer.from('test archive'),
    notes = Buffer.from('test notes'),
    commit = 'a'.repeat(40);
  const metadata = releaseMetadataSchema.parse({
    name: '@swimmwatch/dsh-tool-search',
    version: '1.0.0-rc.1',
    repository: REPOSITORY,
    commit,
    runId: '123',
    filename: 'swimmwatch-dsh-tool-search-1.0.0-rc.1.tgz',
    sha256: digest(archive),
    notesSha256: digest(notes),
  });
  verifyRelease(metadata, archive, notes, commit, '123');
  assert.throws(() => verifyRelease(metadata, Buffer.from('replaced'), notes, commit, '123'));
  assert.throws(() => verifyRelease(metadata, archive, Buffer.from('replaced'), commit, '123'));
  assert.throws(() => verifyRelease(metadata, archive, notes, 'b'.repeat(40), '123'));
  assert.throws(() => verifyRelease(metadata, archive, notes, commit, '124'));
  assert.throws(() => releaseMetadataSchema.parse({ ...metadata, filename: '../package.tgz' }));
  assert.throws(() => releaseMetadataSchema.parse({ ...metadata, repository: 'someone/else' }));
  assert.equal(RELEASE_WORKFLOW, '.github/workflows/release.yml');
});
