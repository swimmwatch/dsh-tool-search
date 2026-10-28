import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { type SettingsFieldSpec, SettingsFormModel } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { embeddingSelection, parseSettingsField, toolSelectionText } from './selection.js';

const useHostLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type ConfigForm = PluginConfigViewProps['form'];
const DEFAULTS = {
  ...embeddingSelection(undefined),
  alwaysAvailableTools: toolSelectionText(undefined),
};
type Field = keyof typeof DEFAULTS;
const FIELDS = Object.keys(DEFAULTS) as Field[];
const UNAVAILABLE = {
  status: 'unavailable' as const,
  value: undefined,
  base: {},
  user: {},
  writable: false,
  revision: undefined,
};

const SPECS: SettingsFieldSpec[] = FIELDS.map((field) => ({
  field,
  format: (value) =>
    field === 'alwaysAvailableTools'
      ? toolSelectionText(value === undefined ? undefined : { alwaysAvailableTools: value })
      : String(typeof value === 'string' || typeof value === 'boolean' ? value : DEFAULTS[field]),
  parse: (text) => {
    try {
      return { kind: 'set', value: parseSettingsField(field, text) };
    } catch {
      return undefined;
    }
  },
}));

function createEditor(initial: ConfigForm) {
  let form = initial;
  let mounts = 0;
  const listeners = new Set<() => void>();
  const model = new SettingsFormModel(
    {
      getSnapshot: () => form?.state ?? UNAVAILABLE,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      mutate: async (operations, revision) => {
        if (!form || form.state.status !== 'ready' || !form.state.writable) return false;
        const changes = operations.map((operation) => {
          const path = [...operation.path];
          if (operation.op === 'unset') return { op: 'unset' as const, path };
          const { value } = operation;
          if (
            typeof value !== 'string' &&
            typeof value !== 'boolean' &&
            !(Array.isArray(value) && value.every((item: unknown) => typeof item === 'string'))
          ) {
            throw new TypeError('Unsupported settings field value');
          }
          return { op: 'set' as const, path, value: value };
        });
        return form.mutate(changes, revision);
      },
    },
    SPECS,
  );
  const store = model.bind(() => ({
    shell: model.shell(),
    selection: {
      embeddingEnabled: model.field('embeddingEnabled').text === 'true',
      embeddingProvider:
        model.field('embeddingProvider').text === 'openai'
          ? ('openai' as const)
          : ('ollama' as const),
      embeddingModel: model.field('embeddingModel').text,
      openaiEmbeddingModel: model.field('openaiEmbeddingModel').text,
      openaiBaseUrl: model.field('openaiBaseUrl').text,
      openaiApiKeyRef: model.field('openaiApiKeyRef').text,
    },
    text: model.field('alwaysAvailableTools').text,
  }));
  return {
    actions: model.actions(),
    subscribe: store.subscribe.bind(store),
    getSnapshot: store.getSnapshot.bind(store),
    update(next: ConfigForm) {
      if (form === next) return;
      form = next;
      for (const listener of listeners) listener();
    },
    retain() {
      mounts++;
      return () => {
        mounts--;
        // React StrictMode reattaches effects synchronously; dispose only after a real unmount.
        queueMicrotask(() => {
          if (mounts === 0) model.dispose();
        });
      };
    },
  };
}

export function useSettingsEditor(form: ConfigForm) {
  const [editor] = useState(() => createEditor(form));
  useHostLayoutEffect(() => {
    editor.update(form);
  }, [editor, form]);
  useEffect(() => editor.retain(), [editor]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  return { ...state, actions: editor.actions };
}
