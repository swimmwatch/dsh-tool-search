import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Input,
  SegmentedControl,
  SettingsForm,
  SettingsSecretField,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { CredentialField } from '../src/client/credential-field.js';
import { ToolSearchSettings } from '../src/client/settings.js';

function change(node: ReactTestInstance, value: string) {
  const props = node.props as { onChange: (event: { target: { value: string } }) => void };
  props.onChange({ target: { value } });
}
function modelInput(renderer: ReactTestRenderer) {
  const input = renderer.root
    .findAllByType('input')
    .find((node) => (node.props as { id?: string }).id === 'dsh-tool-search-embedding-model');
  assert.ok(input);
  return input;
}
function submit(renderer: ReactTestRenderer) {
  const props = renderer.root.findByType(SettingsForm).props as { onSave: () => void };
  props.onSave();
}
function provider(renderer: ReactTestRenderer, value: 'openai' | 'ollama') {
  const props = renderer.root.findByType(SegmentedControl).props as {
    onChange: (value: string) => void;
  };
  props.onChange(value);
}
await test('settings save atomically with the original revision and preserve drafts on conflict', async () => {
  let renderer: ReactTestRenderer | undefined;
  const writes: unknown[] = [];
  const form: NonNullable<PluginConfigViewProps['form']> = {
    state: { status: 'ready', writable: true, revision: 4, value: {}, base: {}, user: {} },
    mutate: async (operations, revision) => {
      writes.push({ operations, revision });
      return false;
    },
  };
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  assert.ok(renderer);
  const mounted = renderer;
  await act(async () => {
    change(modelInput(mounted), 'custom:v2');
  });
  await act(async () => {
    mounted.update(
      createElement(ToolSearchSettings, {
        view: 'page',
        form: { ...form, state: { ...form.state, revision: 5 } },
      }),
    );
  });
  await act(async () => {
    submit(mounted);
  });
  assert.deepEqual(writes, [
    { operations: [{ op: 'set', path: ['embeddingModel'], value: 'custom:v2' }], revision: 4 },
  ]);
  assert.match(JSON.stringify(mounted.toJSON()), /settings could not be saved/);
  assert.equal(
    (
      modelInput(mounted).props as {
        value: string;
      }
    ).value,
    'custom:v2',
  );
  await act(async () => {
    mounted.unmount();
  });
});

await test('provider changes retain inactive model drafts and read-only forms reject submission', async () => {
  let renderer: ReactTestRenderer | undefined;
  let writes = 0;
  const form: NonNullable<PluginConfigViewProps['form']> = {
    state: { status: 'ready', writable: true, revision: 1, value: {}, base: {}, user: {} },
    mutate: async () => {
      writes++;
      return true;
    },
  };
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  assert.ok(renderer);
  const mounted = renderer;
  await act(async () => {
    change(modelInput(mounted), 'retained:v1');
  });
  await act(async () => {
    provider(mounted, 'openai');
  });
  assert.ok(mounted.root.findByType(SettingsSecretField));
  await act(async () => {
    provider(mounted, 'ollama');
  });
  assert.equal(
    (
      modelInput(mounted).props as {
        value: string;
      }
    ).value,
    'retained:v1',
  );
  await act(async () => {
    mounted.update(
      createElement(ToolSearchSettings, {
        view: 'page',
        form: { ...form, state: { ...form.state, writable: false } },
      }),
    );
  });
  await act(async () => {
    submit(mounted);
  });
  assert.equal(writes, 0);
  assert.equal(
    (mounted.root.findAllByType('fieldset')[0]?.props as { disabled: boolean }).disabled,
    true,
  );
  await act(async () => {
    mounted.unmount();
  });
});

await test('native form validation blocks invalid drafts until the model name is corrected', async () => {
  let renderer: ReactTestRenderer | undefined;
  let writes = 0;
  const form: NonNullable<PluginConfigViewProps['form']> = {
    state: { status: 'ready', writable: true, revision: 1, value: {}, base: {}, user: {} },
    mutate: async () => {
      writes++;
      return true;
    },
  };
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  assert.ok(renderer);
  const mounted = renderer;
  await act(async () => {
    change(modelInput(mounted), 'not a valid model');
  });
  await act(async () => {
    submit(mounted);
  });
  assert.equal(writes, 0);
  assert.match(JSON.stringify(mounted.toJSON()), /Enter a valid Ollama model name/);
  await act(async () => {
    change(modelInput(mounted), 'valid:v1');
  });
  await act(async () => {
    submit(mounted);
  });
  assert.equal(writes, 1);
  await act(async () => {
    mounted.unmount();
  });
});

await test('credential control never reads a stored value and clears the staged key after saving', async () => {
  let renderer: ReactTestRenderer | undefined;
  const writes: unknown[] = [];
  let configured = false;
  const credentials = {
    describe: async () => ({ configured, writable: true }),
    set: async (ref: string, value: string) => {
      writes.push({ ref, value });
      configured = true;
    },
  };
  await act(async () => {
    renderer = create(
      createElement(CredentialField, { reference: 'TEST_KEY', disabled: false, credentials }),
    );
  });
  assert.ok(renderer);
  const mounted = renderer;
  await act(async () => {
    change(mounted.root.findByType('input'), 'unit-test-value');
  });
  await act(async () => {
    (mounted.root.findByType('button').props as { onClick: () => void }).onClick();
  });
  assert.deepEqual(writes, [{ ref: 'TEST_KEY', value: 'unit-test-value' }]);
  assert.equal((mounted.root.findByType('input').props as { value: string }).value, '');
  assert.match(JSON.stringify(mounted.toJSON()), /Configured/);
  assert.doesNotMatch(JSON.stringify(mounted.toJSON()), /unit-test-value/);
  await act(async () => {
    mounted.unmount();
  });
});

await test('native SDK controls stage embedding changes without writing until Save', async () => {
  let renderer: ReactTestRenderer | undefined;
  const writes: unknown[] = [];
  const form: NonNullable<PluginConfigViewProps['form']> = {
    state: { status: 'ready', writable: true, revision: 7, value: {}, base: {}, user: {} },
    mutate: async (operations, revision) => {
      writes.push({ operations, revision });
      return true;
    },
  };
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  assert.ok(renderer);
  const mounted = renderer;
  assert.ok(mounted.root.findByType(SettingsForm));
  assert.ok(mounted.root.findByType(Input));
  assert.ok(mounted.root.findByType(SegmentedControl));
  await act(async () => {
    (mounted.root.findByType(Switch).props as { onChange: (checked: boolean) => void }).onChange(
      false,
    );
  });
  assert.deepEqual(writes, []);
  assert.equal(
    (mounted.root.findByType(SegmentedControl).props as { disabled: boolean }).disabled,
    true,
  );
  await act(async () => {
    submit(mounted);
  });
  assert.deepEqual(writes, [
    { operations: [{ op: 'set', path: ['embeddingEnabled'], value: false }], revision: 7 },
  ]);
  await act(async () => {
    mounted.unmount();
  });
});

await test('native form discards staged changes after unmount without persisting them', async () => {
  let renderer: ReactTestRenderer | undefined;
  let writes = 0;
  const form: NonNullable<PluginConfigViewProps['form']> = {
    state: {
      status: 'ready',
      writable: true,
      revision: 1,
      value: { embeddingModel: 'original:v1' },
      base: {},
      user: {},
    },
    mutate: async () => {
      writes++;
      return true;
    },
  };
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  assert.ok(renderer);
  const first = renderer;
  await act(async () => {
    change(first.root.findByType('input'), 'draft:v2');
  });
  await act(async () => {
    first.unmount();
  });
  await act(async () => {
    renderer = create(createElement(ToolSearchSettings, { view: 'page', form }));
  });
  const second = renderer;
  assert.equal((second.root.findByType('input').props as { value: string }).value, 'original:v1');
  assert.equal(writes, 0);
  await act(async () => {
    second.unmount();
  });
});

await test('credential errors retain the draft and changing reference clears it', async () => {
  let renderer: ReactTestRenderer | undefined;
  const credentials = {
    describe: async () => ({ configured: false, writable: true }),
    set: async () => {
      throw new Error('Credential write refused');
    },
  };
  await act(async () => {
    renderer = create(
      createElement(CredentialField, { reference: 'FIRST_KEY', disabled: false, credentials }),
    );
  });
  assert.ok(renderer);
  const mounted = renderer;
  await act(async () => {
    change(mounted.root.findByType('input'), 'draft-value');
  });
  await act(async () => {
    (mounted.root.findByType('button').props as { onClick: () => void }).onClick();
  });
  assert.equal((mounted.root.findByType('input').props as { value: string }).value, 'draft-value');
  assert.match(JSON.stringify(mounted.toJSON()), /credential operation failed/);
  await act(async () => {
    mounted.update(
      createElement(CredentialField, { reference: 'SECOND_KEY', disabled: false, credentials }),
    );
  });
  assert.equal((mounted.root.findByType('input').props as { value: string }).value, '');
  await act(async () => {
    mounted.unmount();
  });
});
