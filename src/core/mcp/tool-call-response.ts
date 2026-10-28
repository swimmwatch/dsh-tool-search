import { normalizeError } from '../shared/errors.js';

export interface ToolCallResponse {
  readonly [key: string]: unknown;
  readonly content: { readonly type: 'text'; readonly text: string }[];
  readonly structuredContent: Record<string, unknown>;
  readonly isError?: true;
}

export function success(payload: Record<string, unknown>): ToolCallResponse {
  const result = { ok: true, ...payload };
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

export function failure(error: unknown): ToolCallResponse {
  const normalized = normalizeError(error);
  const result = {
    ok: false,
    error: { code: normalized.code, message: normalized.message },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: true,
  };
}
