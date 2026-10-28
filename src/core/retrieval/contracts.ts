import type { Risk } from '../shared/types.js';

export const RETRIEVAL_FIELD_NAMES = [
  'provider',
  'name',
  'schema',
  'purpose',
  'description',
] as const;

export type RetrievalFieldName = (typeof RETRIEVAL_FIELD_NAMES)[number];

export interface ToolDocument {
  readonly name: string;
  readonly description: string;
  readonly summary: string;
  readonly provider: string;
  readonly providerSignature: string;
  readonly providerTokenSequence: readonly string[];
  readonly providerTokens: readonly string[];
  readonly actionTokens: readonly string[];
  readonly entityTokens: readonly string[];
  readonly callableNameTokens: readonly string[];
  readonly exactNameTokens: readonly string[];
  readonly nameTokens: readonly string[];
  readonly schemaTokens: readonly string[];
  readonly normalizedName: string;
  readonly deprecated: boolean;
  readonly risk: Risk;
  readonly toolDigest: string;
  readonly declarationAvailable: boolean;
  readonly fields: Readonly<Record<RetrievalFieldName, readonly string[]>>;
  readonly embeddingText: string;
}

export interface LexicalScore {
  readonly document: ToolDocument;
  readonly score: number;
}

export interface HybridScore extends LexicalScore {
  readonly semantic: number;
  readonly lexical: number;
  readonly provider: number;
  readonly actionEntity: number;
  readonly schema: number;
  readonly scope: number;
  readonly exactName: number;
}

export interface ConfidenceDecision {
  readonly matched: boolean;
  readonly reason: string;
}

export interface RankResult {
  readonly ranked: readonly HybridScore[];
  readonly confidence: ConfidenceDecision;
  readonly queryCoverage: number;
  readonly scoreMargin: number;
  readonly requiresRerank: boolean;
}
