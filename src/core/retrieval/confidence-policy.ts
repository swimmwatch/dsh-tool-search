import type { ConfidenceDecision, HybridScore } from './contracts.js';

export interface ConfidenceEvidence {
  readonly top?: HybridScore;
  readonly second?: HybridScore;
  readonly queryCoverage: number;
  readonly explicitProviderMismatch: boolean;
  readonly explicitCapabilityMismatch?: boolean;
  readonly hasRecognizedAction?: boolean;
  readonly hasIntentDetail?: boolean;
  readonly hasStructuredIntentMatch?: boolean;
}

export class ConfidencePolicy {
  public decide({
    top,
    second,
    queryCoverage,
    explicitProviderMismatch,
    explicitCapabilityMismatch = false,
    hasRecognizedAction = true,
    hasIntentDetail = true,
    hasStructuredIntentMatch = false,
  }: ConfidenceEvidence): ConfidenceDecision {
    if (!top) return { matched: false, reason: 'no_candidates' };
    if (top.exactName === 1) return { matched: true, reason: 'exact_name' };
    if (explicitProviderMismatch) {
      return { matched: false, reason: 'provider_not_available' };
    }
    if (explicitCapabilityMismatch) {
      return { matched: false, reason: 'capability_not_available' };
    }
    if (hasStructuredIntentMatch && (top.semantic >= 0.45 || top.lexical >= 0.5)) {
      return { matched: true, reason: 'structured_intent_match' };
    }
    const semanticMargin = top.semantic - (second?.semantic ?? 0);
    const combinedMargin = top.score - (second?.score ?? 0);
    if (!hasRecognizedAction && top.lexical >= 0.8 && combinedMargin < 0.04) {
      return { matched: false, reason: 'ambiguous_intent' };
    }
    if (!hasIntentDetail && top.semantic < 0.86) {
      return { matched: false, reason: 'underspecified_request' };
    }
    if (queryCoverage === 0 && top.lexical === 0 && semanticMargin < 0.035 && top.semantic < 0.86) {
      return { matched: false, reason: 'insufficient_evidence' };
    }
    if (top.semantic >= 0.86) {
      return { matched: true, reason: 'strong_semantic_match' };
    }
    if (
      queryCoverage < 0.3 &&
      top.semantic < 0.8 &&
      top.lexical >= 0.8 &&
      (!second || combinedMargin < 0.08)
    ) {
      return { matched: false, reason: 'low_query_coverage' };
    }
    if (top.semantic >= 0.74 && semanticMargin >= 0.035) {
      return { matched: true, reason: 'strong_semantic_match' };
    }
    if (top.lexical >= 0.65 && top.semantic >= 0.6 && queryCoverage >= 0.3) {
      return { matched: true, reason: 'strong_lexical_match' };
    }
    if (top.semantic < 0.5 && top.lexical < 0.2) {
      return { matched: false, reason: 'insufficient_relevance' };
    }
    if (top.score < 0.46) {
      return { matched: false, reason: 'low_combined_score' };
    }
    if (top.semantic < 0.6 && semanticMargin < 0.035) {
      return { matched: false, reason: 'insufficient_evidence' };
    }
    if (queryCoverage < 0.25 && top.semantic < 0.72) {
      return { matched: false, reason: 'low_query_coverage' };
    }
    return { matched: true, reason: 'confident_hybrid_match' };
  }
}
