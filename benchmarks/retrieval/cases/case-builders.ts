import type { PolicyProfile } from '../../../src/core/shared/types.js';
import type { QualityCase, QualityCategory, QualitySource } from '../../shared/quality-types.js';

interface CaseInput {
  readonly id: string;
  readonly category: QualityCategory;
  readonly query: string;
  readonly fixtureId: string;
  readonly forbiddenTools?: readonly string[];
  readonly source: QualitySource;
  readonly policyProfile?: PolicyProfile;
}

export interface PositiveCaseInput extends CaseInput {
  readonly acceptableTools: readonly string[];
}

export function positive(input: PositiveCaseInput): QualityCase {
  return {
    id: input.id,
    category: input.category,
    query: input.query,
    fixtureId: input.fixtureId,
    policyProfile: input.policyProfile ?? 'all',
    expected: {
      matched: true,
      acceptableTools: input.acceptableTools,
      ...(input.forbiddenTools ? { forbiddenTools: input.forbiddenTools } : {}),
    },
    source: input.source,
  };
}

export function negative(input: CaseInput): QualityCase {
  return {
    id: input.id,
    category: input.category,
    query: input.query,
    fixtureId: input.fixtureId,
    policyProfile: input.policyProfile ?? 'all',
    expected: {
      matched: false,
      acceptableTools: [],
      ...(input.forbiddenTools ? { forbiddenTools: input.forbiddenTools } : {}),
    },
    source: input.source,
  };
}
