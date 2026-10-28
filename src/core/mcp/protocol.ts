import { z } from 'zod';

import { ToolSearchError } from '../shared/errors.js';
import {
  MAX_QUERY_LENGTH,
  type PolicyProfile,
  SEARCH_MODES,
  type SearchMode,
} from '../shared/types.js';

const HANDLE_PATTERN = /^[\w-]{32,64}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_PROFILES = new Set<PolicyProfile>(['read-only', 'mutation', 'execution', 'all']);
const SEARCH_MODE_SET = new Set<string>(SEARCH_MODES);
export const toolSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const SYNC_CATALOG_INPUT_SCHEMA = {
  schemaVersion: z.number().int(),
  tools: z.array(toolSchema),
};

export const SEARCH_TOOLS_INPUT_SCHEMA = {
  catalogHandle: z.string(),
  query: z.string(),
  mode: z.string().default('hybrid'),
  policyProfile: z.string().default('read-only'),
};

export const INSPECT_TOOL_INPUT_SCHEMA = {
  searchReceipt: z.string(),
  selectedToolName: z.string(),
  expectedCatalogDigest: z.string(),
};

export const RESOLVE_TOOL_INPUT_SCHEMA = {
  schemaVersion: z.number().int(),
  tools: z.array(toolSchema),
  query: z.string(),
  retryQuery: z.string().optional(),
  mode: z.string().default('hybrid'),
  policyProfile: z.string().default('read-only'),
};

export function assertHandle(value: string, label: string): void {
  if (!HANDLE_PATTERN.test(value)) {
    throw new ToolSearchError('invalid_input', `${label} has an invalid format.`);
  }
}

export function assertDigest(value: string): void {
  if (!DIGEST_PATTERN.test(value)) {
    throw new ToolSearchError('invalid_input', 'expectedCatalogDigest must be a SHA-256 digest.');
  }
}

export function validateSearchInput(
  query: string,
  mode: string,
  policyProfile: string,
): { readonly mode: SearchMode; readonly policyProfile: PolicyProfile } {
  if (query.trim().length === 0 || query.length > MAX_QUERY_LENGTH) {
    throw new ToolSearchError(
      'invalid_input',
      `query must contain between 1 and ${MAX_QUERY_LENGTH} characters.`,
    );
  }
  if (!SEARCH_MODE_SET.has(mode)) {
    throw new ToolSearchError('invalid_input', 'mode is invalid.');
  }
  if (!POLICY_PROFILES.has(policyProfile as PolicyProfile)) {
    throw new ToolSearchError('invalid_input', 'policyProfile is invalid.');
  }
  return {
    mode: mode as SearchMode,
    policyProfile: policyProfile as PolicyProfile,
  };
}
