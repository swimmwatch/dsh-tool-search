import type { EmbeddingAdapter } from '../shared/types.js';
import { isFiniteVector } from './vector.js';

export { DEFAULT_EMBEDDING_BATCH_SIZE, EMBEDDING_TIMEOUT_MS } from '../../embedding-settings.js';

export class EmbeddingCredentialError extends Error {
  public constructor() {
    super('OpenAI embedding API key is not configured.');
    this.name = 'EmbeddingCredentialMissing';
  }
}

export const QUERY_INSTRUCTION =
  'Instruct: Retrieve the most appropriate callable software tool. ' +
  'Distinguish provider, action, target entity, argument schema, and singular ' +
  'versus batch scope. Return no match when the requested provider or ' +
  'capability is unavailable.\nQuery: ';

export interface EmbeddingProvider extends EmbeddingAdapter {
  readonly cacheIdentity: string;
  embedQueries(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]>;
}
export function embeddingIdentity(provider: string, endpoint: string, model: string): string {
  return JSON.stringify({ provider, endpoint, model, documentFormat: 1, queryFormat: 1 });
}
export function validateVectors(
  vectors: unknown,
  count: number,
  dimensions?: number,
): asserts vectors is readonly (readonly number[])[] {
  if (!Array.isArray(vectors) || vectors.length !== count || !vectors.every(isFiniteVector)) {
    throw new Error('Embedding provider returned invalid vectors.');
  }
  const expected = dimensions ?? vectors[0]?.length;
  if (vectors.some((vector) => vector.length !== expected)) {
    throw new Error('Embedding vector dimensions do not match.');
  }
}
