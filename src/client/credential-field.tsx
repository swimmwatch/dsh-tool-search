import { Button, SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useRef, useState } from 'react';
import { CREDENTIAL_REF_PATTERN } from '../embedding-settings.js';
import { SETTINGS_TEXT } from './messages.js';

export interface CredentialActions {
  describe(ref: string): Promise<{ configured: boolean; writable: boolean }>;
  set(ref: string, value: string): Promise<void>;
}
export function CredentialField({
  reference,
  disabled,
  credentials,
}: {
  reference: string;
  disabled: boolean;
  credentials?: CredentialActions | undefined;
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<{ configured: boolean; writable: boolean }>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setValue('');
    setStatus(undefined);
    setFailed(false);
    setSaving(false);
    if (credentials && CREDENTIAL_REF_PATTERN.test(reference)) {
      void credentials
        .describe(reference)
        .then((next) => {
          if (generation.current === current) setStatus(next);
          return undefined;
        })
        .catch(() => {
          if (generation.current === current) setFailed(true);
        });
    }
    return () => {
      generation.current += 1;
    };
  }, [reference, credentials]);
  async function saveKey() {
    if (!credentials || disabled || saving || !status?.writable || !value.trim()) return;
    const current = generation.current;
    setSaving(true);
    setFailed(false);
    try {
      await credentials.set(reference, value.trim());
      const next = await credentials.describe(reference);
      if (generation.current === current) {
        setStatus(next);
        setValue('');
      }
    } catch {
      if (generation.current === current) setFailed(true);
    } finally {
      if (generation.current === current) setSaving(false);
    }
  }
  return (
    <fieldset disabled={disabled || saving || !status?.writable}>
      <SettingsSecretField
        id="dsh-tool-search-api-key"
        label={SETTINGS_TEXT.apiKey}
        hint={SETTINGS_TEXT.keyHelp}
        text={value}
        onEdit={setValue}
        disabled={disabled || saving || !status?.writable}
        configured={status?.configured ?? false}
        stateLabel={
          status
            ? status.configured
              ? SETTINGS_TEXT.keyConfigured
              : SETTINGS_TEXT.keyMissing
            : SETTINGS_TEXT.keyUnavailable
        }
      />
      <Button
        type="button"
        disabled={disabled || saving || !status?.writable || !value.trim()}
        onClick={() => {
          void saveKey();
        }}
      >
        {SETTINGS_TEXT.keySave}
      </Button>
      {failed && <p role="alert">{SETTINGS_TEXT.keyFailed}</p>}
    </fieldset>
  );
}
