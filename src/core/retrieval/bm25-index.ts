import type { ToolMetadata } from '../shared/types.js';
import {
  RETRIEVAL_FIELD_NAMES as FIELD_NAMES,
  type RetrievalFieldName as FieldName,
  type LexicalScore,
  type ToolDocument,
} from './contracts.js';
import { meaningfulQueryTokens, uniqueTokens } from './text-normalization.js';
import { ToolDocumentFactory } from './tool-document-factory.js';

export const K1 = 1.2;
export const B = 0.75;
export const FIELD_WEIGHTS: Readonly<Record<FieldName, number>> = {
  provider: 4,
  name: 3,
  schema: 2,
  purpose: 2,
  description: 1,
};

interface QueryTerm {
  readonly token: string;
  readonly inverseFrequency: number;
}

export class Bm25FieldIndex {
  private readonly averageFieldLengths: Record<FieldName, number>;
  private readonly documentFrequency = new Map<string, number>();
  private readonly inverseFrequencies = new Map<string, number>();
  private readonly documentTokens = new WeakMap<ToolDocument, ReadonlySet<string>>();
  private readonly weightedFrequencies = new WeakMap<ToolDocument, Map<string, number>>();
  public readonly count: number;

  public constructor(
    public readonly documents: readonly ToolDocument[],
    public readonly digest: string,
  ) {
    this.count = documents.length;
    this.averageFieldLengths = Object.fromEntries(
      FIELD_NAMES.map((field) => [
        field,
        documents.reduce((total, document) => total + document.fields[field].length, 0) /
          Math.max(documents.length, 1),
      ]),
    ) as Record<FieldName, number>;
    for (const document of documents) {
      const tokens = new Set(Object.values(document.fields).flat());
      this.documentTokens.set(document, tokens);
      for (const token of tokens) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
      }
    }
  }

  private weightedFrequency(document: ToolDocument, token: string): number {
    let weighted = 0;
    for (const field of FIELD_NAMES) {
      const tokens = document.fields[field];
      const frequency = tokens.filter((candidate) => candidate === token).length;
      if (frequency === 0) continue;
      const averageLength = Math.max(this.averageFieldLengths[field], 1);
      const normalizedFrequency =
        frequency / (1 - B + (B * Math.max(tokens.length, 1)) / averageLength);
      weighted += FIELD_WEIGHTS[field] * normalizedFrequency;
    }
    return weighted;
  }

  private queryTerms(queryTokens: readonly string[]): readonly QueryTerm[] {
    return queryTokens.flatMap((token) => {
      const frequency = this.documentFrequency.get(token);
      if (frequency === undefined) return [];
      let inverseFrequency = this.inverseFrequencies.get(token);
      if (inverseFrequency === undefined) {
        inverseFrequency = Math.log(1 + (this.count - frequency + 0.5) / (frequency + 0.5));
        this.inverseFrequencies.set(token, inverseFrequency);
      }
      return [{ token, inverseFrequency }];
    });
  }

  private scoreTerms(document: ToolDocument, terms: readonly QueryTerm[]): number {
    const tokens = this.documentTokens.get(document);
    let cached = this.weightedFrequencies.get(document);
    let score = 0;
    for (const { token, inverseFrequency } of terms) {
      if (tokens && !tokens.has(token)) continue;
      let weightedFrequency = cached?.get(token);
      if (weightedFrequency === undefined) {
        weightedFrequency = this.weightedFrequency(document, token);
        // Cache only queried terms for immutable indexed documents. External score()
        // inputs stay uncached; a catalog change creates a fresh index.
        if (tokens) {
          if (!cached) {
            cached = new Map();
            this.weightedFrequencies.set(document, cached);
          }
          cached.set(token, weightedFrequency);
        }
      }
      if (weightedFrequency > 0) {
        score += (inverseFrequency * weightedFrequency * (K1 + 1)) / (K1 + weightedFrequency);
      }
    }
    return score;
  }

  public score(document: ToolDocument, queryTokens: readonly string[]): number {
    return this.scoreTerms(document, this.queryTerms(queryTokens));
  }

  public search(query: string): readonly LexicalScore[] {
    const queryTokens = uniqueTokens(meaningfulQueryTokens(query));
    const terms = this.queryTerms(queryTokens);
    return this.documents.map((document) => ({
      document,
      score: this.scoreTerms(document, terms),
    }));
  }
}

export function buildIndex(
  metadata: readonly ToolMetadata[],
  catalogDigest: string,
): Bm25FieldIndex {
  const factory = new ToolDocumentFactory();
  return new Bm25FieldIndex(
    metadata.map((tool) => factory.create(tool)),
    catalogDigest,
  );
}

export function searchBm25(index: Bm25FieldIndex, query: string): readonly LexicalScore[] {
  return index.search(query);
}

function compileSafePattern(pattern: string): readonly (readonly string[])[] {
  if (pattern.length === 0 || pattern.length > 200) {
    throw new Error('Pattern length must be between 1 and 200 characters.');
  }
  const alternatives = pattern.toLowerCase().split('|');
  if (alternatives.some((alternative) => alternative.length === 0)) {
    throw new Error('Empty pattern alternatives are not allowed.');
  }
  return alternatives.map((alternative) => {
    const parts = alternative.split('.*');
    const residue = parts.join('');
    if (/[\\()[\]{}+?^$*]/u.test(residue)) {
      throw new Error('Pattern contains unsupported regex syntax.');
    }
    const normalized = parts.map((part) => part.trim()).filter(Boolean);
    if (normalized.length === 0) throw new Error('Pattern must contain a literal token.');
    return normalized;
  });
}

function matchesPattern(value: string, alternatives: readonly (readonly string[])[]): boolean {
  const candidate = value.toLowerCase();
  return alternatives.some((parts) => {
    let cursor = 0;
    for (const part of parts) {
      const position = candidate.indexOf(part, cursor);
      if (position < 0) return false;
      cursor = position + part.length;
    }
    return true;
  });
}

export function searchPattern(index: Bm25FieldIndex, query: string): readonly LexicalScore[] {
  const alternatives = compileSafePattern(query);
  return index.documents.map((document) => ({
    document,
    score: matchesPattern(document.name, alternatives)
      ? 100
      : matchesPattern(document.description, alternatives)
        ? 1
        : 0,
  }));
}
