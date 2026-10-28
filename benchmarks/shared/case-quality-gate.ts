import { z } from 'zod';
import type { SearchResult } from '../../src/core/shared/types.js';
import type { QualityCase, QualityCaseScore } from './quality-types.js';

export const caseScoreSchema = z
  .object({
    id: z.string().min(1),
    top1Correct: z.boolean(),
    recallAt5: z.boolean().nullable(),
    reciprocalRank: z.number().min(0).max(1).nullable(),
    noMatchCorrect: z.boolean().nullable(),
    forbiddenTop1: z.boolean().nullable(),
    forbiddenAt5: z.boolean().nullable(),
  })
  .strict();

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const caseBaselineSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasetDigest: digestSchema,
    embeddingModel: z.literal('deterministic-semantic-v2'),
    mode: z.literal('hybrid'),
    provenance: z.object({
      sourceArchiveSha256: digestSchema,
      productionSourceSha256: digestSchema,
      benchmarkSourceSha256: digestSchema,
    }),
    cases: z.array(caseScoreSchema).min(1),
  })
  .strict();

export type CaseQualityBaseline = z.infer<typeof caseBaselineSchema>;

export function scoreQualityCase(item: QualityCase, result: SearchResult): QualityCaseScore {
  const expected = new Set(item.expected.acceptableTools);
  const forbidden = new Set(item.expected.forbiddenTools ?? []);
  const names = result.candidates.slice(0, 5).map(({ name }) => name);
  const selected = result.matched ? names[0] : undefined;
  const rank = names.findIndex((name) => expected.has(name));
  return {
    id: item.id,
    top1Correct: item.expected.matched
      ? selected !== undefined && expected.has(selected)
      : !result.matched,
    recallAt5: item.expected.matched ? rank >= 0 : null,
    reciprocalRank: item.expected.matched ? (rank >= 0 ? 1 / (rank + 1) : 0) : null,
    noMatchCorrect: item.expected.matched ? null : !result.matched,
    forbiddenTop1: forbidden.size === 0 ? null : selected !== undefined && forbidden.has(selected),
    forbiddenAt5: forbidden.size === 0 ? null : names.some((name) => forbidden.has(name)),
  };
}

export function validateCaseCoverage(
  scores: readonly QualityCaseScore[],
  expectedIds: readonly string[],
): ReadonlyMap<string, QualityCaseScore> {
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) throw new Error('Duplicate expected case ID.');
  const byId = new Map<string, QualityCaseScore>();
  for (const score of z.array(caseScoreSchema).parse(scores)) {
    if (!expected.has(score.id)) throw new Error(`Unknown case ID: ${score.id}`);
    if (byId.has(score.id)) throw new Error(`Duplicate case ID: ${score.id}`);
    byId.set(score.id, score);
  }
  if (byId.size !== expected.size) throw new Error('Missing case evaluations.');
  return byId;
}

export function meetsCaseFloor(current: QualityCaseScore, floor: QualityCaseScore): boolean {
  const preserveSuccess = (now: boolean | null, before: boolean | null): boolean =>
    before === null ? now === null : now !== null && (!before || now);
  const preserveExclusion = (now: boolean | null, before: boolean | null): boolean =>
    before === null ? now === null : now !== null && (before || !now);
  return (
    current.id === floor.id &&
    preserveSuccess(current.top1Correct, floor.top1Correct) &&
    preserveSuccess(current.recallAt5, floor.recallAt5) &&
    preserveSuccess(current.noMatchCorrect, floor.noMatchCorrect) &&
    preserveExclusion(current.forbiddenTop1, floor.forbiddenTop1) &&
    preserveExclusion(current.forbiddenAt5, floor.forbiddenAt5) &&
    (floor.reciprocalRank === null
      ? current.reciprocalRank === null
      : current.reciprocalRank !== null && current.reciprocalRank >= floor.reciprocalRank)
  );
}

export function caseRegressionIds(
  scores: readonly QualityCaseScore[],
  baseline: CaseQualityBaseline,
  expectedIds: readonly string[],
): readonly string[] {
  const current = validateCaseCoverage(scores, expectedIds);
  const floors = validateCaseCoverage(baseline.cases, expectedIds);
  return expectedIds.filter((id) => {
    const score = current.get(id);
    const floor = floors.get(id);
    return !score || !floor || !meetsCaseFloor(score, floor);
  });
}

export function preservesMetamorphicOutcome(
  item: QualityCase,
  before: SearchResult,
  after: SearchResult,
  floor: QualityCaseScore,
  fullShortlist: boolean,
): boolean {
  if (before.degraded || after.degraded) return false;
  const beforeScore = scoreQualityCase(item, before);
  const afterScore = scoreQualityCase(item, after);
  if (fullShortlist) {
    // Public search omits rejected candidates. Diagnostic recall and rank from
    // the quality corpus are comparable only when search exposes a shortlist.
    const visibleFloor = (result: SearchResult, score: QualityCaseScore): QualityCaseScore => ({
      ...floor,
      recallAt5: result.matched ? floor.recallAt5 : score.recallAt5,
      reciprocalRank: result.matched ? floor.reciprocalRank : score.reciprocalRank,
    });
    if (
      !meetsCaseFloor(beforeScore, visibleFloor(before, beforeScore)) ||
      !meetsCaseFloor(afterScore, visibleFloor(after, afterScore))
    )
      return false;
  } else if (floor.top1Correct && (!beforeScore.top1Correct || !afterScore.top1Correct)) {
    return false;
  }
  if (before.matched !== after.matched) return false;
  const names = (result: SearchResult): readonly string[] =>
    fullShortlist
      ? result.candidates.map(({ name }) => name)
      : result.matched
        ? result.candidates.slice(0, 1).map(({ name }) => name)
        : [];
  return JSON.stringify(names(before)) === JSON.stringify(names(after));
}
