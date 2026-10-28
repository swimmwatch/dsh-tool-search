import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { PACKAGE_NAME } from '../src/constants.js';
import { digest, releaseChannel } from './release-policy.js';

const REGISTRY_ORIGIN = 'https://registry.npmjs.org';
const REGISTRY_URL = `${REGISTRY_ORIGIN}/${encodeURIComponent(PACKAGE_NAME)}`;
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

function freshUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.set('verification', randomUUID());
  return url.href;
}

async function registryGet(url: string, request: typeof fetch): Promise<Response> {
  return request(freshUrl(url), {
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'Cache-Control': 'no-cache' },
  });
}

export async function registryArchive(
  version: string,
  request: typeof fetch = fetch,
): Promise<Uint8Array | undefined> {
  const response = await registryGet(`${REGISTRY_URL}/${version}`, request);
  if (response.status === 404) return undefined;
  assert.ok(response.ok, `Registry metadata request failed: ${response.status}`);
  const manifest = z
    .object({
      name: z.literal(PACKAGE_NAME),
      version: z.literal(version),
      dist: z.object({ tarball: z.url() }),
    })
    .parse(await response.json());
  const url = new URL(manifest.dist.tarball);
  assert.equal(url.origin, REGISTRY_ORIGIN);
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  const archive = await registryGet(url.href, request);
  if (archive.status === 404) return undefined;
  assert.ok(archive.ok, `Registry archive request failed: ${archive.status}`);
  return new Uint8Array(await archive.arrayBuffer());
}

export async function waitForPublication(
  version: string,
  expectedDigest: string,
  request: typeof fetch = fetch,
  pause: (milliseconds: number) => Promise<void> = setTimeout,
): Promise<void> {
  const channel = releaseChannel(version);
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const archive = await registryArchive(version, request);
    if (archive) {
      assert.equal(
        digest(archive),
        expectedDigest,
        'Published npm archive differs from the tested artifact',
      );
      const document = await registryGet(REGISTRY_URL, request);
      if (document.status !== 404) {
        assert.ok(document.ok, `Registry tags request failed: ${document.status}`);
        const tags = z
          .object({ 'dist-tags': z.record(z.string(), z.string()) })
          .parse(await document.json())['dist-tags'];
        if (channel === 'next') {
          assert.ok(
            !tags['latest']?.includes('-'),
            'A prerelease must not be assigned to npm latest',
          );
        }
        if (tags[channel] === version) return;
      }
    }
    if (attempt + 1 < POLL_ATTEMPTS) await pause(POLL_INTERVAL_MS);
  }
  throw new Error('Published archive and release channel did not appear in the registry');
}
