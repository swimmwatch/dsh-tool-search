import type { PolicyProfile, ToolMetadata } from '../../src/core/shared/types.js';

export const QUALITY_CATEGORIES = [
  'exact_capability',
  'hard_negative_action',
  'hard_negative_provider',
  'schema_disambiguation',
  'scope_single_batch',
  'equivalent_tools',
  'provider_unavailable',
  'capability_unavailable',
  'ambiguous_no_match',
  'underspecified_no_match',
  'multilingual',
  'paraphrase',
  'typo',
  'abbreviation',
  'long_noisy_query',
  'name_description_conflict',
  'description_noise',
  'near_duplicate',
  'policy_exclusion',
  'catalog_scale_distractors',
  'catalog_refresh',
  'prerequisite_discovery',
  'prompt_injection',
  'safety_negation',
  'runtime_regression',
] as const;

export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export type QualitySource =
  'bfcl' | 'github_mcp_eval' | 'toolret' | 'acebench' | 'mcp_bench' | 'etom' | 'project_specific';

export interface QualityExpectation {
  readonly matched: boolean;
  readonly acceptableTools: readonly string[];
  readonly forbiddenTools?: readonly string[];
}

export interface QualityCase {
  readonly id: string;
  readonly category: QualityCategory;
  readonly query: string;
  readonly fixtureId: string;
  readonly policyProfile: PolicyProfile;
  readonly expected: QualityExpectation;
  readonly source: QualitySource;
}

export interface QualityFixture {
  readonly id: string;
  readonly description: string;
  readonly tools: readonly ToolMetadata[];
}

export interface QualityBenchmarkOptions {
  readonly mode: QualitySearchMode;
  readonly embeddingBackend: QualityEmbeddingBackend;
}

export interface QualityCaseScore {
  readonly id: string;
  readonly top1Correct: boolean;
  readonly recallAt5: boolean | null;
  readonly reciprocalRank: number | null;
  readonly noMatchCorrect: boolean | null;
  readonly forbiddenTop1: boolean | null;
  readonly forbiddenAt5: boolean | null;
}

export type QualitySearchMode = 'hybrid' | 'bm25';
export type QualityEmbeddingBackend = 'deterministic' | 'ollama';

export interface CategoryMetrics {
  readonly cases: number;
  readonly positiveCases: number;
  readonly noMatchCases: number;
  readonly top1Accuracy: number;
  readonly recallAt5: number | null;
  readonly meanReciprocalRank: number | null;
  readonly noMatchAccuracy: number | null;
  readonly forbiddenToolRate: number | null;
  readonly forbiddenAt5Rate: number | null;
}

export interface ConfusionPair {
  readonly expected: string;
  readonly actual: string;
  readonly count: number;
}

export interface QualityFailure {
  readonly id: string;
  readonly category: QualityCategory;
  readonly expected: string;
  readonly actual: string;
  readonly reason: string;
  readonly queryCoverage: number | null;
  readonly scoreMargin: number | null;
  readonly candidates: readonly {
    readonly name: string;
    readonly score: number;
    readonly semanticScore: number | null;
    readonly lexicalScore: number | null;
  }[];
}

export interface QualityBenchmarkReport extends CategoryMetrics {
  readonly caseEvaluations: readonly QualityCaseScore[];
  readonly layer: 'retrieval-core';
  readonly degradedCases: number;
  readonly embeddingBackend: QualityEmbeddingBackend;
  readonly schemaVersion: 2;
  readonly ok: boolean;
  readonly datasetDigest: string;
  readonly mode: QualitySearchMode;
  readonly embeddingModel: string | null;
  readonly elapsedMs: number;
  readonly fixtures: number;
  readonly categories: Readonly<Record<QualityCategory, CategoryMetrics>>;
  readonly confusionPairs: readonly ConfusionPair[];
  readonly failedCaseIds: readonly string[];
  readonly failures: readonly QualityFailure[];
}
