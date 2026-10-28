import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATALOG_TTL_MS,
  CatalogRegistry,
  MAX_ACTIVE_CATALOGS,
  MAX_CATALOG_BYTES,
  MAX_CATALOG_TOOLS,
} from '../../src/core/sessions/catalog-registry.js';
import {
  MAX_SEARCH_RECEIPTS,
  SEARCH_RECEIPT_TTL_MS,
  SearchReceiptRegistry,
} from '../../src/core/sessions/search-receipt-registry.js';

const readTool = {
  name: 'mcp__github__fetch_issue',
  description:
    'Fetch one GitHub issue.\nexec tool declaration:\n```ts\ndeclare const tools: { mcp__github__fetch_issue(args: { issue_number: number }): Promise<unknown>; };\n```',
};

function sequence(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}${String(index++).padStart(30, '0')}`;
}

await test('catalog handles are 192-bit-compatible opaque values', () => {
  const registry = new CatalogRegistry();
  const result = registry.sync(1, [readTool]);
  assert.match(result.catalogHandle, /^[\w-]{32}$/);
  assert.equal(result.catalogSize, 1);
});

await test('catalog registry rejects unsupported schema versions', () => {
  const registry = new CatalogRegistry();
  assert.throws(() => registry.sync(2, [readTool]), /Unsupported schema version/);
});

await test('catalog registry rejects excessive tool counts', () => {
  const registry = new CatalogRegistry();
  const tools = Array.from({ length: MAX_CATALOG_TOOLS + 1 }, (_, index) => ({
    name: `mcp__example__read_${index}`,
    description: 'Read value.',
  }));
  assert.throws(() => registry.sync(1, tools), /tool limit/);
});

await test('catalog registry rejects excessive serialized bytes', () => {
  const registry = new CatalogRegistry();
  assert.throws(
    () =>
      registry.sync(1, [
        {
          name: 'mcp__example__read',
          description: 'x'.repeat(MAX_CATALOG_BYTES),
        },
      ]),
    /byte limit/,
  );
});

await test('catalog registry distinguishes expired and unknown handles', () => {
  let now = 1_000;
  const registry = new CatalogRegistry({
    now: () => now,
    randomHandle: sequence('catalog-'),
  });
  const result = registry.sync(1, [readTool]);
  now += CATALOG_TTL_MS + 1;
  assert.throws(() => registry.get(result.catalogHandle), /expired/);
  assert.throws(() => registry.get('missing-handle'), /not found/);
});

await test('catalog registry uses least-recently-used eviction', () => {
  const registry = new CatalogRegistry({ randomHandle: sequence('catalog-') });
  const first = registry.sync(1, [readTool]);
  for (let index = 1; index < MAX_ACTIVE_CATALOGS; index += 1) {
    registry.sync(1, [{ name: `mcp__example__read_${index}`, description: 'Read value.' }]);
  }
  registry.get(first.catalogHandle);
  const secondHandle = 'catalog-000000000000000000000000000001';
  registry.sync(1, [{ name: 'mcp__example__read_new', description: 'Read.' }]);
  assert.equal(registry.get(first.catalogHandle).handle, first.catalogHandle);
  assert.throws(() => registry.get(secondHandle), /not found/);
});

await test('concurrent catalogs keep independent digests and services', () => {
  const registry = new CatalogRegistry({ randomHandle: sequence('catalog-') });
  const first = registry.sync(1, [readTool]);
  const second = registry.sync(1, [
    { name: 'mcp__drive__read_file', description: 'Read one Drive file.' },
  ]);
  assert.notEqual(first.catalogDigest, second.catalogDigest);
  assert.equal(registry.get(first.catalogHandle).metadata[0]?.name, readTool.name);
  assert.equal(registry.get(second.catalogHandle).metadata[0]?.name, 'mcp__drive__read_file');
});

await test('receipt binds catalog, digest, policy and candidate names', () => {
  const registry = new SearchReceiptRegistry(Date.now, sequence('receipt-'));
  const value = registry.issue({
    catalogHandle: 'catalog',
    catalogDigest: 'a'.repeat(64),
    policyProfile: 'read-only',
    candidateNames: [readTool.name],
  });
  const loaded = registry.get(value.receipt);
  assert.equal(loaded.catalogHandle, 'catalog');
  assert.equal(loaded.catalogDigest, 'a'.repeat(64));
  assert.equal(loaded.policyProfile, 'read-only');
  assert.equal(loaded.candidateNames.has(readTool.name), true);
});

await test('receipt registry distinguishes expired and forged receipts', () => {
  let now = 1_000;
  const registry = new SearchReceiptRegistry(() => now, sequence('receipt-'));
  const value = registry.issue({
    catalogHandle: 'catalog',
    catalogDigest: 'a'.repeat(64),
    policyProfile: 'read-only',
    candidateNames: [],
  });
  now += SEARCH_RECEIPT_TTL_MS + 1;
  assert.throws(() => registry.get(value.receipt), /expired/);
  assert.throws(() => registry.get('forged'), /invalid/);
});

await test('receipt registry applies bounded LRU eviction', () => {
  const registry = new SearchReceiptRegistry(Date.now, sequence('receipt-'));
  const first = registry.issue({
    catalogHandle: 'catalog',
    catalogDigest: 'a'.repeat(64),
    policyProfile: 'read-only',
    candidateNames: [],
  });
  for (let index = 1; index < MAX_SEARCH_RECEIPTS; index += 1) {
    registry.issue({
      catalogHandle: 'catalog',
      catalogDigest: 'a'.repeat(64),
      policyProfile: 'read-only',
      candidateNames: [],
    });
  }
  registry.get(first.receipt);
  const secondReceipt = 'receipt-000000000000000000000000000001';
  registry.issue({
    catalogHandle: 'catalog',
    catalogDigest: 'a'.repeat(64),
    policyProfile: 'read-only',
    candidateNames: [],
  });
  assert.equal(registry.get(first.receipt).receipt, first.receipt);
  assert.throws(() => registry.get(secondReceipt), /invalid/);
});
