import { QUERY_INSTRUCTION } from '../../src/core/embeddings/provider.js';
import {
  meaningfulQueryTokens,
  meaningfulTokens,
  stripNegatedClauses,
} from '../../src/core/retrieval/text-normalization.js';
import type { EmbeddingAdapter } from '../../src/core/shared/types.js';

const VECTOR_DIMENSIONS = 2_048;
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const QUERY_MARKER = '\nQuery: ';

function tokenHash(token: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function addFeature(vector: number[], feature: string, weight: number): void {
  const hash = tokenHash(feature);
  const index = hash % VECTOR_DIMENSIONS;
  vector[index] = (vector[index] ?? 0) + (hash & 1 ? weight : -weight);
}

function characterTrigrams(token: string): readonly string[] {
  const bounded = `^${token}$`;
  return Array.from({ length: Math.max(0, bounded.length - 2) }, (_, index) =>
    bounded.slice(index, index + 3),
  );
}

function embeddingTokens(value: string): readonly string[] {
  const queryMarkerIndex = value.indexOf(QUERY_MARKER);
  if (queryMarkerIndex < 0) return meaningfulTokens(value);
  const query = stripNegatedClauses(value.slice(queryMarkerIndex + QUERY_MARKER.length));
  return meaningfulQueryTokens(query);
}

function vectorize(value: string): readonly number[] {
  const tokens = embeddingTokens(value);
  const vector = Array<number>(VECTOR_DIMENSIONS).fill(0);
  tokens.forEach((token, index) => {
    addFeature(vector, `token:${token}`, 1);
    for (const trigram of characterTrigrams(token)) {
      addFeature(vector, `trigram:${trigram}`, 0.12);
    }
    const next = tokens[index + 1];
    if (next) addFeature(vector, `bigram:${token}:${next}`, 0.25);
  });
  const magnitude = Math.sqrt(
    vector.reduce((total, component) => total + component * component, 0),
  );
  return magnitude === 0 ? vector : vector.map((component) => component / magnitude);
}

export class DeterministicEmbeddingAdapter implements EmbeddingAdapter {
  public embedQueries(inputs: readonly string[]): Promise<readonly (readonly number[])[]> {
    return this.embedBatches(inputs.map((query) => `${QUERY_INSTRUCTION}${query}`));
  }
  public readonly model = 'deterministic-semantic-v2';

  public embedBatches(inputs: readonly string[]): Promise<readonly (readonly number[])[]> {
    return Promise.resolve(inputs.map(vectorize));
  }
}
