import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { BASE_TOOLS, DISCOVERY_TOOLS, EMBEDDING } from './constants.js';
import { CONFIG_DESCRIPTIONS } from './messages.js';
import {
  CREDENTIAL_REF_PATTERN,
  EMBEDDING_PROVIDERS,
  type EmbeddingSettings,
  normalizeOpenAIBaseUrl,
  OLLAMA_MODEL_NAME_PATTERN,
  OPENAI_BASE_URL_PATTERN,
  OPENAI_DEFAULTS,
  OPENAI_MODEL_PATTERN,
} from './embedding-settings.js';

export interface Config {
  alwaysAvailableTools: Volatile<string[]>;
  embeddingModel: Volatile<string>;
  embeddingEnabled: Volatile<boolean>;
  embeddingProvider: Volatile<EmbeddingSettings['embeddingProvider']>;
  openaiEmbeddingModel: Volatile<string>;
  openaiBaseUrl: Volatile<string>;
  openaiApiKeyRef: Volatile<string>;
}

export const Config = z.object({
  embeddingEnabled: z
    .boolean()
    .description(CONFIG_DESCRIPTIONS.embeddingEnabled)
    .default(true)
    .volatile(),
  embeddingProvider: z
    .union(EMBEDDING_PROVIDERS)
    .description(CONFIG_DESCRIPTIONS.embeddingProvider)
    .default('ollama')
    .volatile(),
  openaiEmbeddingModel: z
    .string()
    .pattern(OPENAI_MODEL_PATTERN)
    .description(CONFIG_DESCRIPTIONS.openaiEmbeddingModel)
    .default(OPENAI_DEFAULTS.model)
    .volatile(),
  openaiBaseUrl: z
    .string()
    .pattern(OPENAI_BASE_URL_PATTERN)
    .default(OPENAI_DEFAULTS.baseUrl)
    .volatile(),
  openaiApiKeyRef: z
    .string()
    .pattern(CREDENTIAL_REF_PATTERN)
    .description(CONFIG_DESCRIPTIONS.openaiApiKeyRef)
    .default(OPENAI_DEFAULTS.apiKeyRef)
    .volatile(),
  embeddingModel: z
    .string()
    .pattern(OLLAMA_MODEL_NAME_PATTERN)
    .description(CONFIG_DESCRIPTIONS.embeddingModel)
    .default(EMBEDDING.model)
    .volatile(),
  alwaysAvailableTools: z
    .array(z.string().pattern(/^\S+$/u).required())
    .description(CONFIG_DESCRIPTIONS.alwaysAvailableTools)
    .default([...BASE_TOOLS])
    .volatile(),
});

export function configuredEmbeddings(config: Config): EmbeddingSettings {
  return {
    embeddingEnabled: config.embeddingEnabled.get(),
    embeddingProvider: config.embeddingProvider.get(),
    embeddingModel: config.embeddingModel.get(),
    openaiEmbeddingModel: config.openaiEmbeddingModel.get(),
    openaiBaseUrl: normalizeOpenAIBaseUrl(config.openaiBaseUrl.get()),
    openaiApiKeyRef: config.openaiApiKeyRef.get(),
  };
}

export function availableToolNames(config: Config): ReadonlySet<string> {
  return new Set([...config.alwaysAvailableTools.get(), ...DISCOVERY_TOOLS]);
}
