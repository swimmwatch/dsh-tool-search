export type ToolSearchErrorCode =
  | 'invalid_input'
  | 'catalog_too_large'
  | 'duplicate_tool'
  | 'catalog_expired'
  | 'catalog_not_found'
  | 'catalog_digest_mismatch'
  | 'receipt_expired'
  | 'receipt_invalid'
  | 'tool_not_in_results'
  | 'declaration_missing'
  | 'internal_error';

export class ToolSearchError extends Error {
  public constructor(
    public readonly code: ToolSearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ToolSearchError';
  }
}

export function normalizeError(error: unknown): ToolSearchError {
  if (error instanceof ToolSearchError) return error;
  return new ToolSearchError('internal_error', 'Tool search failed safely.');
}
