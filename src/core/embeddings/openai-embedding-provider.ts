import {
  normalizeOpenAIBaseUrl,
  OPENAI_DEFAULTS,
  OPENAI_MODEL_PATTERN,
} from '../../embedding-settings.js';
import {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS,
  EmbeddingCredentialError,
  embeddingIdentity,
  type EmbeddingProvider,
  validateVectors,
} from './provider.js';

export interface OpenAIEmbeddingOptions {
  readonly model?: string;
  readonly baseUrl?: string;
  readonly resolveApiKey?: () => Promise<string | undefined>;
  readonly timeoutMs?: number;
  readonly batchSize?: number;
  readonly fetchImplementation?: typeof fetch;
}

export class OpenAIEmbeddingClient implements EmbeddingProvider {
  public readonly model: string;
  public readonly baseUrl: string;
  public readonly cacheIdentity: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly fetchImplementation: typeof fetch;
  public constructor(private readonly options: OpenAIEmbeddingOptions = {}) {
    this.model = options.model ?? OPENAI_DEFAULTS.model;
    if (!OPENAI_MODEL_PATTERN.test(this.model))
      throw new Error('Invalid OpenAI embedding model name.');
    this.baseUrl = normalizeOpenAIBaseUrl(options.baseUrl ?? OPENAI_DEFAULTS.baseUrl);
    this.cacheIdentity = embeddingIdentity('openai', this.baseUrl, this.model);
    this.timeoutMs = options.timeoutMs ?? EMBEDDING_TIMEOUT_MS;
    this.batchSize = options.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
    for (const value of [this.timeoutMs, this.batchSize]) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error('Embedding limits must be positive integers.');
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }
  public async forOperation(signal?: AbortSignal): Promise<EmbeddingProvider> {
    signal?.throwIfAborted();
    const key = await this.options.resolveApiKey?.();
    signal?.throwIfAborted();
    if (!key && new URL(this.baseUrl).hostname === 'api.openai.com') {
      throw new EmbeddingCredentialError();
    }
    return new OpenAIEmbeddingClient({
      ...this.options,
      resolveApiKey: () => Promise.resolve(key),
    });
  }
  public async embedQueries(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    return this.embedBatches(inputs, signal);
  }
  public async embedBatches(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    signal?.throwIfAborted();
    if (inputs.length === 0) return [];
    const key = await this.options.resolveApiKey?.();
    signal?.throwIfAborted();
    if (!key && new URL(this.baseUrl).hostname === 'api.openai.com') {
      throw new EmbeddingCredentialError();
    }
    const vectors: (readonly number[])[] = [];
    for (let offset = 0; offset < inputs.length; offset += this.batchSize) {
      signal?.throwIfAborted();
      const batch = inputs.slice(offset, offset + this.batchSize);
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const response = await this.fetchImplementation(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ model: this.model, input: batch, encoding_format: 'float' }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      signal?.throwIfAborted();
      if (!response.ok)
        throw new Error(`OpenAI embedding request failed with HTTP ${response.status}.`);
      const payload = (await response.json()) as { data?: unknown };
      signal?.throwIfAborted();
      if (!Array.isArray(payload.data) || payload.data.length !== batch.length)
        throw new Error('OpenAI returned an invalid embedding response.');
      const ordered: unknown[] = Array.from({ length: batch.length });
      const seen = new Set<number>();
      for (const row of payload.data as { index?: unknown; embedding?: unknown }[]) {
        if (
          !row ||
          !Number.isInteger(row.index) ||
          typeof row.index !== 'number' ||
          row.index < 0 ||
          row.index >= batch.length ||
          seen.has(row.index)
        ) {
          throw new Error('OpenAI returned invalid embedding indices.');
        }
        seen.add(row.index);
        ordered[row.index] = row.embedding;
      }
      validateVectors(ordered, batch.length, vectors[0]?.length);
      vectors.push(...ordered);
    }
    return vectors;
  }
}
