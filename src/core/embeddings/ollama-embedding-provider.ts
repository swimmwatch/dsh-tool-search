import { isFiniteVector } from '../embeddings/vector.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  DEFAULT_OLLAMA_URL,
  OLLAMA_MODEL_NAME_PATTERN,
} from '../../embedding-settings.js';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  embeddingIdentity,
  type EmbeddingProvider,
  QUERY_INSTRUCTION,
  validateVectors,
} from './provider.js';

export {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  DEFAULT_OLLAMA_URL,
  OLLAMA_MODEL_NAME_PATTERN,
} from '../../embedding-settings.js';
export { DEFAULT_EMBEDDING_BATCH_SIZE } from './provider.js';

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function validateModelName(model: string): string {
  if (!OLLAMA_MODEL_NAME_PATTERN.test(model)) {
    throw new Error('Invalid Ollama model name.');
  }
  return model;
}

export function resolveEmbeddingUrl(
  value: string,
  { allowRemote = false }: { readonly allowRemote?: boolean } = {},
): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Embedding URL must use HTTP or HTTPS.');
  }
  const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
  if (!loopbackHosts.has(url.hostname) && !allowRemote) {
    throw new Error('Remote embeddings are disabled; use a loopback URL or explicitly opt in.');
  }
  return url.toString();
}

interface OllamaEmbeddingResponse {
  readonly embeddings?: unknown;
}

export interface OllamaEmbeddingClientOptions {
  readonly model?: string;
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly batchSize?: number;
  readonly allowRemote?: boolean;
  readonly fetchImplementation?: typeof fetch;
}

export class OllamaEmbeddingClient implements EmbeddingProvider {
  public readonly cacheIdentity: string;
  public readonly model: string;
  public readonly url: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly fetchImplementation: typeof fetch;

  public constructor(options: OllamaEmbeddingClientOptions = {}) {
    this.model = validateModelName(
      options.model ?? process.env.TOOL_SEARCH_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    );
    this.url = resolveEmbeddingUrl(
      options.url ?? process.env.TOOL_SEARCH_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
      {
        allowRemote: options.allowRemote ?? process.env.TOOL_SEARCH_ALLOW_REMOTE_EMBEDDINGS === '1',
      },
    );
    this.cacheIdentity = embeddingIdentity('ollama', this.url, this.model);
    this.timeoutMs = positiveInteger(
      options.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS,
      'Embedding timeout',
    );
    this.batchSize = positiveInteger(
      options.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE,
      'Embedding batch size',
    );
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async embed(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    signal?.throwIfAborted();
    if (inputs.length === 0) return [];
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetchImplementation(this.url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: inputs, keep_alive: '30m' }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    signal?.throwIfAborted();
    if (!response.ok) {
      throw new Error(`Ollama embedding request failed with HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as OllamaEmbeddingResponse;
    signal?.throwIfAborted();
    if (
      !Array.isArray(payload.embeddings) ||
      payload.embeddings.length !== inputs.length ||
      !payload.embeddings.every(isFiniteVector)
    ) {
      throw new Error('Ollama returned invalid embedding vectors.');
    }
    validateVectors(payload.embeddings, inputs.length);
    return payload.embeddings;
  }

  public async embedQueries(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    return this.embedBatches(
      inputs.map((query) => `${QUERY_INSTRUCTION}${query}`),
      signal,
    );
  }

  public async embedBatches(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    signal?.throwIfAborted();
    const vectors: (readonly number[])[] = [];
    for (let offset = 0; offset < inputs.length; offset += this.batchSize) {
      vectors.push(...(await this.embed(inputs.slice(offset, offset + this.batchSize), signal)));
    }
    validateVectors(vectors, inputs.length);
    return vectors;
  }
}
