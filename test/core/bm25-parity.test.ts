import assert from 'node:assert/strict';
import test from 'node:test';
import { B, Bm25FieldIndex, FIELD_WEIGHTS, K1 } from '../../src/core/retrieval/bm25-index.js';
import { RETRIEVAL_FIELD_NAMES, type ToolDocument } from '../../src/core/retrieval/contracts.js';
import {
  meaningfulQueryTokens,
  uniqueTokens,
} from '../../src/core/retrieval/text-normalization.js';
import { ToolDocumentFactory } from '../../src/core/retrieval/tool-document-factory.js';

function referenceScore(
  documents: readonly ToolDocument[],
  document: ToolDocument,
  queryTokens: readonly string[],
): number {
  const documentFrequency = new Map<string, number>();
  for (const entry of documents) {
    for (const token of new Set(Object.values(entry.fields).flat())) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  let score = 0;
  for (const token of queryTokens) {
    const frequency = documentFrequency.get(token) ?? 0;
    if (frequency === 0) continue;
    const inverseFrequency = Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5));
    let weightedFrequency = 0;
    for (const field of RETRIEVAL_FIELD_NAMES) {
      const tokens = document.fields[field];
      const count = tokens.filter((candidate) => candidate === token).length;
      if (count === 0) continue;
      const averageLength = Math.max(
        documents.reduce((total, entry) => total + entry.fields[field].length, 0) /
          Math.max(documents.length, 1),
        1,
      );
      const normalizedFrequency =
        count / (1 - B + (B * Math.max(tokens.length, 1)) / averageLength);
      weightedFrequency += FIELD_WEIGHTS[field] * normalizedFrequency;
    }
    if (weightedFrequency > 0) {
      score += (inverseFrequency * weightedFrequency * (K1 + 1)) / (K1 + weightedFrequency);
    }
  }
  return score;
}

const factory = new ToolDocumentFactory();
const documents = Array.from({ length: 24 }, (_, index): ToolDocument => ({
  ...factory.create({ name: `mcp__provider_${index}__read_record`, description: 'Read a record.' }),
  fields: {
    provider: index % 2 === 0 ? ['github', 'issue'] : ['local'],
    name: ['read', 'record', ...Array<string>(index % 4).fill('issue')],
    schema: index % 3 === 0 ? [] : ['record', 'id', 'workflow'],
    purpose: ['read', 'workflow', 'record', 'record'],
    description: Array.from({ length: index }, (_, offset) =>
      offset % 2 === 0 ? 'record' : 'issue',
    ),
  },
}));

await test('BM25 preserves the original formula and document order across repeated queries', () => {
  const index = new Bm25FieldIndex(documents, 'parity');
  for (const query of [
    'read record',
    'workflow issue id',
    '',
    'missing token',
    'record record record',
  ]) {
    const tokens = uniqueTokens(meaningfulQueryTokens(query));
    const expected = documents.map((document) => ({
      document,
      score: referenceScore(documents, document, tokens),
    }));
    assert.deepEqual(index.search(query), expected);
    assert.deepEqual(index.search(query), expected);
  }
  for (const document of documents) {
    for (const tokens of [[], ['read', 'read', 'record'], ['issue', 'workflow'], ['missing']]) {
      assert.equal(index.score(document, tokens), referenceScore(documents, document, tokens));
    }
  }
});

await test('BM25 preserves direct scoring of documents outside the index and an empty catalog', () => {
  const external = {
    ...documents[0],
    fields: {
      provider: [],
      name: ['record'],
      schema: ['id'],
      purpose: [],
      description: ['record', 'record'],
    },
  } as ToolDocument;
  for (const catalog of [documents, []]) {
    const index = new Bm25FieldIndex(catalog, 'external');
    for (const tokens of [[], ['record', 'id'], ['record', 'record'], ['missing']]) {
      assert.equal(index.score(external, tokens), referenceScore(catalog, external, tokens));
    }
    assert.deepEqual(
      index.search(''),
      catalog.map((document) => ({ document, score: 0 })),
    );
  }
});

await test('BM25 treats property-name tokens as ordinary terms without prototype collisions', () => {
  const special = {
    ...documents[0],
    fields: {
      provider: [],
      name: ['constructor', '__proto__', 'toString'],
      schema: [],
      purpose: [],
      description: ['constructor'],
    },
  } as ToolDocument;
  for (const catalog of [documents, [special], []]) {
    const index = new Bm25FieldIndex(catalog, 'special');
    for (const tokens of [
      ['constructor'],
      ['__proto__'],
      ['toString'],
      ['constructor', 'constructor'],
    ]) {
      assert.equal(index.score(special, tokens), referenceScore(catalog, special, tokens));
    }
  }
});
