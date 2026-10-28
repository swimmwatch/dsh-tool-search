import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { valid } from 'semver';
import { z } from 'zod';
import { PACKAGE_NAME } from '../src/constants.js';

export const REPOSITORY = 'swimmwatch/dsh-tool-search';
export const RELEASE_WORKFLOW = '.github/workflows/release.yml';
export const SHA_PATTERN = /^[a-f\d]{40}$/u;
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u;

export function verifyPrepareRun(value: unknown, commit: string): void {
  z.object({
    head_sha: z.literal(commit),
    head_branch: z.literal('main'),
    event: z.literal('workflow_dispatch'),
    status: z.literal('completed'),
    conclusion: z.literal('success'),
    path: z.literal(RELEASE_WORKFLOW),
    repository: z.object({ full_name: z.literal(REPOSITORY) }),
  }).parse(value);
}

export function releaseVersion(value: string): string {
  assert.ok(
    valid(value) === value && VERSION_PATTERN.test(value),
    'Expected a stable or rc.N SemVer version',
  );
  return value;
}

export function releaseChannel(version: string): 'next' | 'latest' {
  return releaseVersion(version).includes('-rc.') ? 'next' : 'latest';
}

export function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function releaseNotes(changelog: string, version: string): string {
  releaseVersion(version);
  const sections = changelog.split(/^## /mu);
  const section = sections.find((text) => text.startsWith(`[${version}] - `));
  assert.ok(section, 'The release needs a dated Keep a Changelog entry');
  assert.match(section, /^\[[^\]]+\] - \d{4}-\d{2}-\d{2}\n/u);
  const notes = section
    .slice(section.indexOf('\n') + 1)
    .split(/^\[Unreleased\]:/mu)[0]
    ?.trim();
  assert.ok(
    notes && /^### (?:Added|Changed|Deprecated|Removed|Fixed|Security)$/mu.test(notes),
    'The release needs categorized notes',
  );
  return notes;
}

export const releaseMetadataSchema = z
  .object({
    name: z.literal(PACKAGE_NAME),
    version: z.string().refine((value) => valid(value) === value && VERSION_PATTERN.test(value)),
    repository: z.literal(REPOSITORY),
    commit: z.string().regex(SHA_PATTERN),
    runId: z.string().regex(/^\d+$/u),
    filename: z.string().regex(/^swimmwatch-dsh-tool-search-[\d.rc-]+\.tgz$/u),
    sha256: z.string().regex(/^[a-f\d]{64}$/u),
    notesSha256: z.string().regex(/^[a-f\d]{64}$/u),
  })
  .strict();

export type ReleaseMetadata = z.output<typeof releaseMetadataSchema>;

export function verifyRelease(
  metadata: ReleaseMetadata,
  archive: Uint8Array,
  notes: Uint8Array,
  commit: string,
  runId: string,
): void {
  assert.equal(
    metadata.commit,
    commit,
    'The prepared commit must still be the selected main commit',
  );
  assert.equal(metadata.runId, runId, 'The artifact belongs to a different prepare run');
  assert.equal(metadata.filename, `swimmwatch-dsh-tool-search-${metadata.version}.tgz`);
  assert.equal(digest(archive), metadata.sha256, 'Archive checksum mismatch');
  assert.equal(digest(notes), metadata.notesSha256, 'Release notes checksum mismatch');
}
