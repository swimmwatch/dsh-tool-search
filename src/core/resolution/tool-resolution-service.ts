import type { CatalogRegistry } from '../sessions/catalog-registry.js';
import { type CandidateSelection, ToolCandidateSelector } from './tool-candidate-selector.js';
import type { PolicyProfile, SearchMode, ToolMetadata } from '../shared/types.js';

export const MAX_RESOLUTION_ATTEMPTS = 2;

const NON_RETRYABLE_REASONS = new Set(['capability_not_available', 'provider_not_available']);

export interface ToolResolutionInput {
  readonly schemaVersion: number;
  readonly tools: readonly ToolMetadata[];
  readonly query: string;
  readonly retryQuery?: string;
  readonly mode: SearchMode;
  readonly policyProfile: PolicyProfile;
}

export interface ToolResolutionResult {
  readonly matched: boolean;
  readonly reason: string;
  readonly degraded: boolean;
  readonly attemptCount: number;
  readonly retryUsed: boolean;
  readonly catalogHandle: string;
  readonly catalogDigest: string;
  readonly policyProfile: PolicyProfile;
  readonly selection?: CandidateSelection;
}

function distinctQueries(query: string, retryQuery?: string): readonly string[] {
  const primary = query.trim();
  const retry = retryQuery?.trim();
  if (!retry || retry === primary) return [primary];
  return [primary, retry].slice(0, MAX_RESOLUTION_ATTEMPTS);
}

export class ToolResolutionService {
  public constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly candidateSelector = new ToolCandidateSelector(),
  ) {}

  public async resolve(input: ToolResolutionInput): Promise<ToolResolutionResult> {
    const synchronized = this.catalogs.sync(input.schemaVersion, input.tools);
    const session = this.catalogs.get(synchronized.catalogHandle);
    const service = session.service(input.policyProfile);
    const queries = distinctQueries(input.query, input.retryQuery);
    let degraded = false;
    let reason = 'no_candidates';
    let attemptCount = 0;

    for (const query of queries) {
      attemptCount += 1;
      const result = await service.searchForResolution(query, input.mode);
      degraded ||= result.degraded;
      reason = result.reason;
      const selected = this.candidateSelector.select(query, result, service, session.digest);
      if (selected) {
        return {
          matched: true,
          reason: selected.reason,
          degraded,
          attemptCount,
          retryUsed: attemptCount > 1,
          catalogHandle: synchronized.catalogHandle,
          catalogDigest: synchronized.catalogDigest,
          policyProfile: input.policyProfile,
          selection: selected,
        };
      }
      if (NON_RETRYABLE_REASONS.has(reason)) break;
    }

    return {
      matched: false,
      reason,
      degraded,
      attemptCount,
      retryUsed: attemptCount > 1,
      catalogHandle: synchronized.catalogHandle,
      catalogDigest: synchronized.catalogDigest,
      policyProfile: input.policyProfile,
    };
  }
}
