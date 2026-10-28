import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { Button, SettingsForm } from '@deepseek-ai/dsh-client-ui-primitives';
import { useSettingsEditor } from './form-model.js';
import { BASE_TOOLS } from '../constants.js';
import { EmbeddingFields } from './embedding-fields.js';
import type { CredentialActions } from './credential-field.js';
import { SETTINGS_FORM_LABELS, SETTINGS_TEXT } from './messages.js';
import { parseToolSelection, selectionError, type SettingsSelection } from './selection.js';

const FIELD_ID = 'dsh-tool-search-always-available';

function ToolSearchSettingsEditor({
  form,
  credentials,
}: Pick<PluginConfigViewProps, 'form'> & { credentials?: CredentialActions | undefined }) {
  const { shell, selection, text, actions } = useSettingsEditor(form);
  const disabled = !shell.available || !shell.writable || shell.saving;
  const error = shell.invalid ? selectionError(selection) : undefined;
  function edit(changes: SettingsSelection) {
    if (disabled) return;
    for (const [field, value] of Object.entries(changes)) {
      actions.edit(field === 'text' ? 'alwaysAvailableTools' : field, String(value));
    }
  }

  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <SettingsForm
        labels={SETTINGS_FORM_LABELS}
        state={shell}
        onSave={() => {
          if (!disabled) actions.save();
        }}
        onDiscard={actions.discard}
      >
        <EmbeddingFields
          selection={selection}
          disabled={disabled}
          edit={edit}
          credentials={credentials}
        />
        {error && <p role="alert">{error}</p>}
        <label htmlFor={FIELD_ID}>{SETTINGS_TEXT.title}</label>
        <p id={`${FIELD_ID}-help`} style={{ margin: 0 }}>
          {SETTINGS_TEXT.description}
        </p>
        <textarea
          id={FIELD_ID}
          aria-describedby={`${FIELD_ID}-help ${FIELD_ID}-required`}
          value={text}
          disabled={disabled}
          onChange={(event) => edit({ text: event.target.value })}
          rows={18}
          spellCheck={false}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            padding: 12,
            borderRadius: 8,
            fontFamily: 'monospace',
            color: 'inherit',
            background: 'var(--dsw-alias-bg-base, transparent)',
            border: '1px solid var(--dsw-alias-border-l2, currentColor)',
            resize: 'vertical',
          }}
        />
        <small id={`${FIELD_ID}-required`}>{SETTINGS_TEXT.required}</small>
        <small>{SETTINGS_TEXT.scope}</small>
        <output>{SETTINGS_TEXT.count(parseToolSelection(text).length)}</output>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => edit({ text: BASE_TOOLS.join('\n') })}
        >
          {SETTINGS_TEXT.defaults}
        </Button>
      </SettingsForm>
    </fieldset>
  );
}

export function ToolSearchSettings(
  props: PluginConfigViewProps & { credentials?: CredentialActions | undefined },
) {
  return props.view === 'summary' ? SETTINGS_TEXT.summary : <ToolSearchSettingsEditor {...props} />;
}
