import { Button, Input, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import { EMBEDDING } from '../constants.js';
import type { EmbeddingSettings } from '../embedding-settings.js';
import { type CredentialActions, CredentialField } from './credential-field.js';
import { SETTINGS_TEXT } from './messages.js';
import type { SettingsSelection } from './selection.js';

const PROVIDER_ID = 'dsh-tool-search-provider';
const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI-compatible' },
] as const;

export function EmbeddingFields({
  selection,
  disabled,
  edit,
  credentials,
}: {
  selection: EmbeddingSettings;
  disabled: boolean;
  edit: (changes: SettingsSelection) => void;
  credentials?: CredentialActions | undefined;
}) {
  return (
    <>
      <Switch
        label={SETTINGS_TEXT.embeddingEnabled}
        checked={selection.embeddingEnabled}
        disabled={disabled}
        onChange={(checked) => edit({ embeddingEnabled: checked })}
      />
      <small>{SETTINGS_TEXT.disabledHelp}</small>
      <fieldset
        disabled={disabled || !selection.embeddingEnabled}
        style={{ display: 'grid', gap: 12 }}
      >
        <legend>{SETTINGS_TEXT.provider}</legend>
        <SegmentedControl
          id={PROVIDER_ID}
          label={SETTINGS_TEXT.provider}
          value={selection.embeddingProvider}
          disabled={disabled || !selection.embeddingEnabled}
          options={PROVIDER_OPTIONS}
          onChange={(embeddingProvider) => edit({ embeddingProvider })}
        />
        <div
          role="tabpanel"
          style={{ display: 'grid', gap: 12 }}
          id={`${PROVIDER_ID}-${selection.embeddingProvider}-panel`}
          aria-labelledby={`${PROVIDER_ID}-${selection.embeddingProvider}`}
        >
          {selection.embeddingProvider === 'ollama' ? (
            <>
              <label htmlFor="dsh-tool-search-embedding-model">
                {SETTINGS_TEXT.embeddingTitle}
              </label>
              <p>{SETTINGS_TEXT.embeddingDescription}</p>
              <Input
                id="dsh-tool-search-embedding-model"
                type="text"
                disabled={disabled || !selection.embeddingEnabled}
                value={selection.embeddingModel}
                onChange={(event) => edit({ embeddingModel: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="button" onClick={() => edit({ embeddingModel: EMBEDDING.model })}>
                {SETTINGS_TEXT.embeddingDefault}
              </Button>
            </>
          ) : (
            <>
              <label>
                {SETTINGS_TEXT.openaiModel}
                <Input
                  type="text"
                  value={selection.openaiEmbeddingModel}
                  onChange={(event) => edit({ openaiEmbeddingModel: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                {SETTINGS_TEXT.baseUrl}
                <Input
                  type="url"
                  value={selection.openaiBaseUrl}
                  onChange={(event) => edit({ openaiBaseUrl: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <small>{SETTINGS_TEXT.remoteDisclosure}</small>
              <label>
                {SETTINGS_TEXT.keyRef}
                <Input
                  type="text"
                  value={selection.openaiApiKeyRef}
                  onChange={(event) => edit({ openaiApiKeyRef: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <CredentialField
                key={selection.openaiApiKeyRef}
                reference={selection.openaiApiKeyRef}
                disabled={disabled || !selection.embeddingEnabled}
                credentials={credentials}
              />
            </>
          )}
        </div>
        <small>{SETTINGS_TEXT.embeddingFallback}</small>
      </fieldset>
    </>
  );
}
