export const EMBEDDING_PROVIDERS = ['ollama', 'openai'] as const;
export type EmbeddingProviderName = (typeof EMBEDDING_PROVIDERS)[number];
export const DEFAULT_EMBEDDING_MODEL = 'qwen3-embedding:4b';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/api/embed';
// Standalone Ollama compatibility default; DSH supplies the shorter request timeout below.
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 120_000;
export const DEFAULT_EMBEDDING_BATCH_SIZE = 24;
export const EMBEDDING_TIMEOUT_MS = 8000;
export const OLLAMA_MODEL_NAME_PATTERN = /^[\w.:/-]+$/;
export const OPENAI_DEFAULTS = Object.freeze({
  model: 'text-embedding-3-small',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyRef: 'DSH_TOOL_SEARCH_OPENAI_API_KEY',
});
export const CREDENTIAL_REF_PATTERN = /^[A-Z_]\w*$/i;
export const OPENAI_MODEL_PATTERN = /^[\w.:/-]+$/;
// Declarative wire validation: DSH's browser CSP forbids deserializing transform callbacks.
// URL parsing and canonicalization still run before a provider uses the endpoint.
export const OPENAI_BASE_URL_PATTERN =
  /^(?:https:\/\/[^/?#@\s]+|http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?)(?:\/[^?#\s]*)?$/i;
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
export interface EmbeddingSettings {
  readonly embeddingEnabled: boolean;
  readonly embeddingProvider: EmbeddingProviderName;
  readonly embeddingModel: string;
  readonly openaiEmbeddingModel: string;
  readonly openaiBaseUrl: string;
  readonly openaiApiKeyRef: string;
}
export function normalizeOpenAIBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid embedding API base URL.');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value.includes('?') ||
    value.includes('#')
  ) {
    throw new Error(
      'Embedding API URLs must not contain credentials, query parameters, or fragments.',
    );
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  ) {
    throw new Error('Embedding API URLs require HTTPS, except on loopback hosts.');
  }
  return url.toString().replace(/\/+$/u, '');
}
