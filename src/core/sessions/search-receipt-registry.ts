import { randomBytes } from 'node:crypto';

import { ToolSearchError } from '../shared/errors.js';
import type { PolicyProfile } from '../shared/types.js';
import { ExpiringLruStore } from './expiring-lru-store.js';

export const SEARCH_RECEIPT_TTL_MS = 5 * 60 * 1_000;
export const MAX_SEARCH_RECEIPTS = 256;

export interface SearchReceipt {
  readonly receipt: string;
  readonly catalogHandle: string;
  readonly catalogDigest: string;
  readonly policyProfile: PolicyProfile;
  readonly candidateNames: ReadonlySet<string>;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

function defaultRandomReceipt(): string {
  return randomBytes(24).toString('base64url');
}

export class SearchReceiptRegistry {
  private readonly receipts: ExpiringLruStore<SearchReceipt>;

  public constructor(
    now: () => number = Date.now,
    randomReceipt: () => string = defaultRandomReceipt,
  ) {
    this.receipts = new ExpiringLruStore(
      SEARCH_RECEIPT_TTL_MS,
      MAX_SEARCH_RECEIPTS,
      now,
      randomReceipt,
    );
  }

  public issue(input: {
    readonly catalogHandle: string;
    readonly catalogDigest: string;
    readonly policyProfile: PolicyProfile;
    readonly candidateNames: readonly string[];
  }): SearchReceipt {
    return this.receipts.create((receipt, createdAtMs, expiresAtMs) => ({
      receipt,
      ...input,
      candidateNames: new Set(input.candidateNames),
      createdAtMs,
      expiresAtMs,
    })).value;
  }

  public get(receipt: string): SearchReceipt {
    const result = this.receipts.get(receipt);
    if (result.status === 'found') return result.value;
    if (result.status === 'expired') {
      throw new ToolSearchError('receipt_expired', 'Search receipt has expired.');
    }
    throw new ToolSearchError('receipt_invalid', 'Search receipt is invalid.');
  }

  public get size(): number {
    return this.receipts.size;
  }
}
