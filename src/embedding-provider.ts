import { EMBEDDING } from './constants.js';
import type { EmbeddingSettings } from './embedding-settings.js';
import { OllamaEmbeddingClient } from './core/embeddings/ollama-embedding-provider.js';
import { OpenAIEmbeddingClient } from './core/embeddings/openai-embedding-provider.js';
import type { EmbeddingProvider } from './core/embeddings/provider.js';

export function createEmbeddingProvider(
  settings: EmbeddingSettings,
  resolveApiKey?: () => Promise<string | undefined>,
): EmbeddingProvider | undefined {
  if (!settings.embeddingEnabled) return undefined;
  if (settings.embeddingProvider === 'ollama')
    return new OllamaEmbeddingClient({ ...EMBEDDING, model: settings.embeddingModel });
  return new OpenAIEmbeddingClient({
    model: settings.openaiEmbeddingModel,
    baseUrl: settings.openaiBaseUrl,
    timeoutMs: EMBEDDING.timeoutMs,
    ...(resolveApiKey ? { resolveApiKey } : {}),
  });
}
