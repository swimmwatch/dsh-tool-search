import { z } from 'zod';
import type { QualityBenchmarkReport } from './quality-types.js';

export const stabilityBaselineSchema = z.object({
  schemaVersion: z.literal(2),
  datasetDigest: z.string().regex(/^[a-f0-9]{64}$/),
  embeddingModel: z.string(),
  cases: z.number().int().positive(),
  top1Accuracy: z.number().min(0).max(1),
  recallAt5: z.number().min(0).max(1),
  meanReciprocalRank: z.number().min(0).max(1),
  noMatchAccuracy: z.number().min(0).max(1),
  forbiddenToolRate: z.number().min(0).max(1),
});
export type StabilityBaseline = z.infer<typeof stabilityBaselineSchema>;
type StabilityInput = Pick<QualityBenchmarkReport, keyof StabilityBaseline | 'degradedCases'>;

export function isDeterministicallyStable(
  report: StabilityInput,
  baseline: StabilityBaseline,
): boolean {
  return (
    report.schemaVersion === baseline.schemaVersion &&
    report.datasetDigest === baseline.datasetDigest &&
    report.embeddingModel === baseline.embeddingModel &&
    report.cases === baseline.cases &&
    report.degradedCases === 0 &&
    report.top1Accuracy >= baseline.top1Accuracy &&
    (report.recallAt5 ?? 0) >= baseline.recallAt5 &&
    (report.meanReciprocalRank ?? 0) >= baseline.meanReciprocalRank &&
    (report.noMatchAccuracy ?? 0) >= baseline.noMatchAccuracy &&
    (report.forbiddenToolRate ?? 1) <= baseline.forbiddenToolRate
  );
}
