import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { availableToolNames, Config, configuredEmbeddings } from '../src/config.js';
import { BASE_TOOLS, EMBEDDING } from '../src/constants.js';
import {
  embeddingModelText,
  embeddingSelection,
  parseEmbeddingModel,
  parseSettingsField,
  parseToolSelection,
  selectionError,
  settingsMutations,
  toolSelectionText,
} from '../src/client/selection.js';
import { ToolSearchSettings } from '../src/client/settings.js';
import { SETTINGS_TEXT } from '../src/client/messages.js';
import { OPENAI_DEFAULTS } from '../src/embedding-settings.js';

await test('provider defaults preserve Ollama and validate remote configuration', () => {
  const defaults = Config({});
  assert.equal(defaults.embeddingEnabled.get(), true);
  assert.equal(defaults.embeddingProvider.get(), 'ollama');
  assert.equal(defaults.openaiEmbeddingModel.get(), OPENAI_DEFAULTS.model);
  assert.equal(defaults.openaiApiKeyRef.get(), OPENAI_DEFAULTS.apiKeyRef);
  assert.equal(
    configuredEmbeddings(Config({ openaiBaseUrl: 'https://EXAMPLE.com/v1/' })).openaiBaseUrl,
    'https://example.com/v1',
  );
  for (const openaiBaseUrl of [
    'http://remote.example/v1',
    'https://u:p@example.com',
    'https://example.com?key=private',
  ]) {
    assert.throws(() => Config({ openaiBaseUrl }));
  }
  assert.throws(() => Config({ embeddingProvider: 'unknown' } as never));
  assert.throws(() => Config({ openaiApiKeyRef: 'not a reference' }));
});

await test('provider mutations retain inactive models and never store credential literals', () => {
  assert.deepEqual(settingsMutations({ embeddingEnabled: false }), [
    { op: 'set', path: ['embeddingEnabled'], value: false },
  ]);
  assert.deepEqual(settingsMutations({ embeddingProvider: 'openai' }), [
    { op: 'set', path: ['embeddingProvider'], value: 'openai' },
  ]);
  const changes = settingsMutations({
    openaiBaseUrl: ' https://example.com/v1/ ',
    openaiEmbeddingModel: ' custom-model ',
    openaiApiKeyRef: ' CUSTOM_KEY ',
  });
  assert.deepEqual(
    changes.map(({ value }) => value),
    ['custom-model', 'https://example.com/v1', 'CUSTOM_KEY'],
  );
  assert.equal(embeddingSelection(undefined).embeddingProvider, 'ollama');
  assert.equal(
    selectionError({ openaiBaseUrl: 'http://remote.example/v1' })?.includes('HTTPS'),
    true,
  );
  assert.equal(selectionError({ embeddingEnabled: false }), undefined);
});

await test('settings expose OpenAI controls and disabled embeddings without rendering a secret', () => {
  const markup = renderToStaticMarkup(
    createElement(ToolSearchSettings, {
      view: 'page',
      form: {
        state: {
          status: 'ready',
          writable: true,
          revision: 7,
          base: {},
          user: {},
          value: {
            embeddingEnabled: false,
            embeddingProvider: 'openai',
            openaiEmbeddingModel: 'custom',
            openaiBaseUrl: 'https://example.com/v1',
            openaiApiKeyRef: 'CUSTOM_KEY',
          },
        },
        mutate: async () => false,
      },
    }),
  );
  assert.match(markup, /Use embeddings/);
  assert.match(markup, /OpenAI-compatible/);
  assert.match(markup, /fieldset disabled/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /CUSTOM_KEY/);
  assert.match(markup, /prepared tool descriptions/);
  assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
});

await test('live configuration defaults to the agreed 39 tool names', () => {
  const config = Config({});
  assert.equal(config.alwaysAvailableTools.get().length, 39);
  assert.deepEqual(config.alwaysAvailableTools.get(), BASE_TOOLS);
  assert.equal(Config.dict?.alwaysAvailableTools?.meta.volatile, true);
});

await test('embedding model defaults preserve existing profiles and support live changes', () => {
  assert.equal(Config({}).embeddingModel.get(), EMBEDDING.model);
  assert.equal(Config({ alwaysAvailableTools: ['read'] }).embeddingModel.get(), EMBEDDING.model);
  assert.equal(
    Config({ embeddingModel: 'local/custom-embedding:v2' }).embeddingModel.get(),
    'local/custom-embedding:v2',
  );
  assert.equal(Config.dict?.embeddingModel?.meta.volatile, true);
  assert.equal(Config({ embeddingModel: null }).embeddingModel.get(), EMBEDDING.model);
  for (const value of ['', ' ', 'model with spaces', ' model', 'model\n', 42])
    assert.throws(() => Config({ embeddingModel: value } as never));
});

await test('model editor trims input and restores defaults for profiles without the field', () => {
  assert.equal(embeddingModelText(undefined), EMBEDDING.model);
  assert.equal(embeddingModelText({ alwaysAvailableTools: ['read'] }), EMBEDDING.model);
  assert.equal(embeddingModelText({ embeddingModel: 'custom:v2' }), 'custom:v2');
  assert.equal(parseEmbeddingModel(' local/embedding:v2 '), 'local/embedding:v2');
  assert.equal(parseEmbeddingModel(''), undefined);
  assert.equal(parseEmbeddingModel('two models'), undefined);
});

await test('saving one setting does not overwrite the other setting', () => {
  assert.deepEqual(settingsMutations({ embeddingModel: ' local/model:v2 ' }), [
    { op: 'set', path: ['embeddingModel'], value: 'local/model:v2' },
  ]);
  assert.deepEqual(settingsMutations({ text: 'read' }), [
    { op: 'set', path: ['alwaysAvailableTools'], value: ['read', 'tool_search', 'tool_unload'] },
  ]);
  assert.deepEqual(
    settingsMutations({ text: 'read', embeddingModel: EMBEDDING.model }).map(
      (change) => change.path,
    ),
    [['alwaysAvailableTools'], ['embeddingModel']],
  );
  assert.throws(() => settingsMutations({ embeddingModel: 'two models' }), /valid Ollama model/);
  assert.deepEqual(settingsMutations({}), []);
});

await test('custom selection cannot remove discovery or register missing tools', () => {
  const config = Config({ alwaysAvailableTools: ['read', 'future_plugin_tool', 'read'] });
  assert.deepEqual(
    [...availableToolNames(config)],
    ['read', 'future_plugin_tool', 'tool_search', 'tool_unload'],
  );
  assert.deepEqual(
    [...availableToolNames(Config({ alwaysAvailableTools: [] }))],
    ['tool_search', 'tool_unload'],
  );
});

await test('configuration rejects malformed tool selections', () => {
  for (const value of ['read', [42], [''], ['read write'], [' read'], [null]]) {
    assert.throws(() => Config({ alwaysAvailableTools: value } as never));
  }
});

await test('editor accepts lines or separators and preserves required discovery names', () => {
  assert.deepEqual(parseToolSelection('read\nworkflow, read\tjob_list'), [
    'read',
    'workflow',
    'job_list',
    'tool_search',
    'tool_unload',
  ]);
  assert.equal(toolSelectionText({ alwaysAvailableTools: [] }), 'tool_search\ntool_unload');
  assert.equal(toolSelectionText(undefined), BASE_TOOLS.join('\n'));
});

await test('settings render the saved selection and disable edits without a writable form', () => {
  const markup = renderToStaticMarkup(
    createElement(ToolSearchSettings, {
      view: 'page',
      form: {
        state: {
          status: 'ready',
          value: { alwaysAvailableTools: ['read', 'workflow'], embeddingModel: 'local/custom:v2' },
          base: {},
          user: {},
          revision: 1,
          writable: false,
        },
        mutate: async () => false,
      },
    }),
  );
  assert.match(markup, /read\nworkflow\ntool_search\ntool_unload/);
  assert.match(markup, /settings read-only/);
  assert.match(markup, /textarea[^>]*disabled/);
  assert.match(markup, /4 tools selected/);
  assert.match(markup, /Embedding model/);
  assert.match(markup, /input[^>]*disabled[^>]*value="local\/custom:v2"/);
});

await test('native field parsers and partial mutations preserve normalized values and write order', () => {
  const cases = [
    [
      'alwaysAvailableTools',
      'text',
      'read, read workflow',
      ['read', 'workflow', 'tool_search', 'tool_unload'],
    ],
    ['embeddingModel', 'embeddingModel', ' local/model:v2 ', 'local/model:v2'],
    ['embeddingEnabled', 'embeddingEnabled', false, false],
    ['embeddingProvider', 'embeddingProvider', 'openai', 'openai'],
    ['openaiEmbeddingModel', 'openaiEmbeddingModel', ' remote-model ', 'remote-model'],
    ['openaiBaseUrl', 'openaiBaseUrl', ' https://EXAMPLE.com/v1/ ', 'https://example.com/v1'],
    ['openaiApiKeyRef', 'openaiApiKeyRef', ' CUSTOM_KEY ', 'CUSTOM_KEY'],
  ] as const;
  for (const [field, selectionKey, input, expected] of cases) {
    assert.deepEqual(parseSettingsField(field, String(input)), expected);
    assert.deepEqual(settingsMutations({ [selectionKey]: input }), [
      { op: 'set', path: [field], value: expected },
    ]);
  }
  const reverseSelection = Object.fromEntries(
    [...cases].reverse().map(([, key, input]) => [key, input]),
  );
  assert.deepEqual(
    settingsMutations(reverseSelection),
    cases.map(([field, , , value]) => ({
      op: 'set',
      path: [field],
      value,
    })),
  );
});

await test('field validation retains messages and reports the first invalid setting in write order', () => {
  const cases = [
    ['embeddingModel', 'two models', SETTINGS_TEXT.embeddingInvalid],
    ['embeddingProvider', 'unknown', SETTINGS_TEXT.providerInvalid],
    ['openaiEmbeddingModel', '', SETTINGS_TEXT.openaiModelInvalid],
    ['openaiApiKeyRef', 'invalid reference', SETTINGS_TEXT.keyRefInvalid],
  ] as const;
  for (const [field, input, message] of cases) {
    assert.throws(() => parseSettingsField(field, input), { message });
    assert.equal(selectionError({ [field]: input }), message);
  }
  assert.equal(
    selectionError({ openaiApiKeyRef: 'invalid reference', embeddingModel: 'two models' }),
    SETTINGS_TEXT.embeddingInvalid,
  );
  assert.throws(() => parseSettingsField('openaiBaseUrl', 'http://remote.example/v1'), /HTTPS/);
});

await test('legacy model-only profiles keep provider defaults and the saved Ollama model', () => {
  assert.deepEqual(embeddingSelection({ embeddingModel: 'local/previous:v1' }), {
    embeddingEnabled: true,
    embeddingProvider: 'ollama',
    embeddingModel: 'local/previous:v1',
    openaiEmbeddingModel: OPENAI_DEFAULTS.model,
    openaiBaseUrl: OPENAI_DEFAULTS.baseUrl,
    openaiApiKeyRef: OPENAI_DEFAULTS.apiKeyRef,
  });
});
