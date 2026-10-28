import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import { BASE_TOOLS, EMBEDDING } from '../constants.js';

export const SETTINGS_TEXT = Object.freeze({
  embeddingEnabled: 'Use embeddings',
  disabledHelp: 'When disabled, hybrid searches use BM25 without embedding requests.',
  provider: 'Embedding provider',
  providerInvalid: 'Select Ollama or OpenAI-compatible.',
  openaiModel: 'OpenAI embedding model',
  openaiModelInvalid: 'Enter a valid OpenAI embedding model name.',
  baseUrl: 'API base URL (including /v1)',
  remoteDisclosure:
    'Search queries and prepared tool descriptions are sent to this server. Saving settings does not send embedding requests.',
  keyRef: 'API key reference',
  keyRefInvalid: 'Enter a valid credential reference name.',
  apiKey: 'API key',
  keySave: 'Save API key',
  keyConfigured: 'Configured',
  keyMissing: 'Not configured',
  keyUnavailable: 'Credential status unavailable',
  keyFailed: 'The credential operation failed. Check the DSH credential service.',
  keyHelp:
    'Stored through DSH credentials, separately from these settings. Required for OpenAI; optional for compatible servers. The saved value is never displayed.',

  title: 'Always available tools',
  summary: 'Choose an embedding provider, disable embeddings, and select always-available tools.',
  embeddingTitle: 'Embedding model',
  embeddingDescription: `Enter the name and tag of an embedding model installed in local Ollama. Default: ${EMBEDDING.model}. Changes apply to the next search; loaded tools remain available.`,
  embeddingFallback:
    'Provider failures fall back to BM25 with degraded status. Models are not downloaded automatically.',
  embeddingDefault: 'Use the default model',
  embeddingInvalid: `Enter a valid Ollama model name, for example ${EMBEDDING.model}.`,
  description:
    'Enter one tool name per line. Other installed tools remain discoverable through Tool Search. Changes apply on the next agent step and are saved in this DSH profile.',
  required: 'tool_search and tool_unload always remain available.',
  scope: 'This list does not enable missing tools or change agent permissions.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Settings saved.',
  defaults: `Use the default ${BASE_TOOLS.length} tools`,
  unavailable: 'Enable this plugin to configure its tools and embedding model.',
  readOnly: 'This deployment stores settings read-only.',
  failed: 'The settings could not be saved. Reload the page if another editor changed them.',
  count: (count: number): string => `${count} tools selected`,
});

export const SETTINGS_FORM_LABELS: SettingsFormLabels = Object.freeze({
  unavailable: SETTINGS_TEXT.unavailable,
  readOnly: SETTINGS_TEXT.readOnly,
  saveFailed: SETTINGS_TEXT.failed,
  save: SETTINGS_TEXT.save,
  saving: SETTINGS_TEXT.saving,
});
