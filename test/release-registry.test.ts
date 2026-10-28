import assert from 'node:assert/strict';
import test from 'node:test';
import { PACKAGE_NAME } from '../src/constants.js';
import { digest } from '../scripts/release-policy.js';
import { registryArchive, waitForPublication } from '../scripts/release-registry.js';

const version = '1.0.0-rc.1';
const bytes = new TextEncoder().encode('prepared archive');
const tarball = 'https://registry.npmjs.org/package/-/package.tgz';
const manifest = { name: PACKAGE_NAME, version, dist: { tarball } };

await test('publication waits beyond thirty seconds for registry and tag propagation', async () => {
  let pauses = 0;
  const urls: string[] = [];
  const request: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    if (url.startsWith(tarball)) return new Response(bytes);
    if (pauses < 4) return new Response(null, { status: 404 });
    if (url.includes(`/${version}?`)) return Response.json(manifest);
    return Response.json({ 'dist-tags': { next: pauses < 5 ? '1.0.0-rc.0' : version } });
  };
  await waitForPublication(version, digest(bytes), undefined, request, async (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    pauses++;
  });
  assert.equal(pauses, 5);
  assert.ok(urls.every((url) => new URL(url).searchParams.has('verification')));
});

await test('archive propagation tolerates a missing tarball but rejects foreign origins', async () => {
  const missing: typeof fetch = async (input) =>
    (input instanceof Request ? input.url : input.toString()).startsWith(tarball)
      ? new Response(null, { status: 404 })
      : Response.json(manifest);
  assert.equal(await registryArchive(version, missing), undefined);
  let calls = 0;
  const foreign: typeof fetch = async () => {
    calls++;
    return Response.json({ ...manifest, dist: { tarball: 'https://example.com/archive.tgz' } });
  };
  await assert.rejects(registryArchive(version, foreign));
  assert.equal(calls, 1);
});

await test('publication rejects changed bytes and a candidate on latest', async () => {
  const request: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.startsWith(tarball)) return new Response(bytes);
    if (url.includes(`/${version}?`)) return Response.json(manifest);
    return Response.json({ 'dist-tags': { next: version, latest: version } });
  };
  await assert.rejects(waitForPublication(version, digest(bytes), undefined, request), /latest/);
  await assert.rejects(
    waitForPublication(version, digest(new Uint8Array()), undefined, request),
    /differs/,
  );
});

await test('candidate publication preserves the existing bootstrap or stable latest tag', async () => {
  for (const latest of ['1.0.0-rc.0', '0.9.0']) {
    const request: typeof fetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.startsWith(tarball)) return new Response(bytes);
      if (url.includes(`/${version}?`)) return Response.json(manifest);
      return Response.json({ 'dist-tags': { next: version, latest } });
    };
    await waitForPublication(version, digest(bytes), latest, request);
    await assert.rejects(waitForPublication(version, digest(bytes), '0.8.0', request), /latest/);
  }
});

await test('an already promoted candidate cannot pass by snapshotting its own latest tag', async () => {
  await assert.rejects(waitForPublication(version, digest(bytes), version), /latest/);
});

await test('registry polling is bounded and does not retry authentication failures', async () => {
  let calls = 0;
  let pauses = 0;
  const missing: typeof fetch = async () => {
    calls++;
    return new Response(null, { status: 404 });
  };
  await assert.rejects(
    waitForPublication(version, digest(bytes), undefined, missing, async () => {
      pauses++;
    }),
    /did not appear/,
  );
  assert.equal(calls, 30);
  assert.equal(pauses, 29);
  const unauthorized: typeof fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(registryArchive(version, unauthorized), /401/);
});
