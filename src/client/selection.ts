import { BASE_TOOLS, DISCOVERY_TOOLS, EMBEDDING } from '../constants.js';
import { SETTINGS_TEXT } from './messages.js';
import {
  CREDENTIAL_REF_PATTERN,
  type EmbeddingSettings,
  normalizeOpenAIBaseUrl,
  OLLAMA_MODEL_NAME_PATTERN,
  OPENAI_DEFAULTS,
  OPENAI_MODEL_PATTERN,
} from '../embedding-settings.js';

export interface SettingsSelection extends Partial<EmbeddingSettings> {
  text?: string;
}

const FIELD_PARSERS = {
  alwaysAvailableTools: parseToolSelection,
  embeddingModel: (text: string) => {
    const model = parseEmbeddingModel(text);
    if (!model) throw new Error(SETTINGS_TEXT.embeddingInvalid);
    return model;
  },
  embeddingEnabled: (text: string) => text === 'true',
  embeddingProvider: (text: string) => {
    if (text !== 'ollama' && text !== 'openai') throw new Error(SETTINGS_TEXT.providerInvalid);
    return text;
  },
  openaiEmbeddingModel: (text: string) => {
    const model = text.trim();
    if (!OPENAI_MODEL_PATTERN.test(model)) throw new Error(SETTINGS_TEXT.openaiModelInvalid);
    return model;
  },
  openaiBaseUrl: (text: string) => normalizeOpenAIBaseUrl(text.trim()),
  openaiApiKeyRef: (text: string) => {
    const reference = text.trim();
    if (!CREDENTIAL_REF_PATTERN.test(reference)) throw new Error(SETTINGS_TEXT.keyRefInvalid);
    return reference;
  },
};

type SettingsField = keyof typeof FIELD_PARSERS;
const SETTINGS_FIELDS = Object.keys(FIELD_PARSERS) as SettingsField[];

export function parseSettingsField(field: SettingsField, text: string) {
  return FIELD_PARSERS[field](text);
}

function selectionFieldText(
  selection: SettingsSelection,
  field: SettingsField,
): string | undefined {
  if (field === 'alwaysAvailableTools') return selection.text;
  if (field === 'embeddingEnabled') {
    return selection.embeddingEnabled === undefined
      ? undefined
      : String(selection.embeddingEnabled);
  }
  return selection[field];
}

export function settingsMutations(selection: SettingsSelection) {
  const changes: { op: 'set'; path: string[]; value: string | string[] | boolean }[] = [];
  for (const field of SETTINGS_FIELDS) {
    const text = selectionFieldText(selection, field);
    if (text !== undefined)
      changes.push({ op: 'set', path: [field], value: parseSettingsField(field, text) });
  }
  return changes;
}

export function embeddingSelection(value: unknown): EmbeddingSettings {
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<EmbeddingSettings>;
  return {
    embeddingEnabled: saved.embeddingEnabled ?? true,
    embeddingProvider: saved.embeddingProvider ?? 'ollama',
    embeddingModel: embeddingModelText(value),
    openaiEmbeddingModel: saved.openaiEmbeddingModel ?? OPENAI_DEFAULTS.model,
    openaiBaseUrl: saved.openaiBaseUrl ?? OPENAI_DEFAULTS.baseUrl,
    openaiApiKeyRef: saved.openaiApiKeyRef ?? OPENAI_DEFAULTS.apiKeyRef,
  };
}

export function selectionError(selection: SettingsSelection | undefined): string | undefined {
  if (!selection) return undefined;
  try {
    for (const field of SETTINGS_FIELDS) {
      const text = selectionFieldText(selection, field);
      if (text !== undefined) parseSettingsField(field, text);
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : SETTINGS_TEXT.failed;
  }
}

export function parseEmbeddingModel(text: string): string | undefined {
  const model = text.trim();
  return OLLAMA_MODEL_NAME_PATTERN.test(model) ? model : undefined;
}

export function embeddingModelText(value: unknown): string {
  return typeof value === 'object' &&
    value !== null &&
    'embeddingModel' in value &&
    typeof value.embeddingModel === 'string'
    ? value.embeddingModel
    : EMBEDDING.model;
}

export function parseToolSelection(text: string): string[] {
  return [...new Set([...text.split(/[\s,]+/u).filter(Boolean), ...DISCOVERY_TOOLS])];
}

export function toolSelectionText(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'alwaysAvailableTools' in value &&
    Array.isArray(value.alwaysAvailableTools) &&
    value.alwaysAvailableTools.every((name: unknown) => typeof name === 'string')
  ) {
    return parseToolSelection(value.alwaysAvailableTools.join('\n')).join('\n');
  }
  return BASE_TOOLS.join('\n');
}
