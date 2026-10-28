export const BENCHMARK_SCHEMA_VERSION = 2;
export const BENCHMARK_RANDOM_SEED = 0x5eed_2026;
export const MAX_REPORTED_FAILURES = 100;
export const MAX_CONFUSION_PAIRS = 50;
export const METAMORPHIC_TRANSFORMATION_COUNT = 500;
export const MINIMUM_QUALITY_CASES = 200;
export const SCALE_CATALOG_SIZE = 5_000;
export const SCALE_SEARCH_BUDGET_MS = 2_000;

export const QUALITY_THRESHOLDS = {
  top1Accuracy: 0.99,
  recallAt5: 0.99,
  meanReciprocalRank: 0.99,
  categoryAccuracy: 0.95,
  noMatchAccuracy: 1,
  forbiddenToolRate: 0,
} as const;

export const PERFORMANCE_POLICY = {
  iterations: 20,
  relativeTolerance: 1.2,
  absoluteToleranceMs: 50,
} as const;
