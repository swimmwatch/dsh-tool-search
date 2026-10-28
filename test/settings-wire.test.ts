import assert from 'node:assert/strict';
import test from 'node:test';
import Schema from '@deepseek-ai/schemastery';
import { Config } from '../src/config.js';

await test('settings schema survives wire serialization without executable callbacks', () => {
  const wire = JSON.parse(JSON.stringify(Config.toJSON())) as Partial<Schema<unknown>>;
  assert.ok(!JSON.stringify(wire).includes('"callback"'), 'Browser CSP forbids dynamic callbacks');
  const schema = new Schema(wire);
  const values = {
    embeddingEnabled: true,
    embeddingProvider: 'openai' as const,
    embeddingModel: 'qwen3-embedding:4b',
    openaiEmbeddingModel: 'text-embedding-3-small',
    openaiBaseUrl: 'http://127.0.0.1:8080/v1',
    openaiApiKeyRef: 'DSH_TOOL_SEARCH_OPENAI_API_KEY',
    alwaysAvailableTools: ['tool_search', 'tool_unload'],
  };
  assert.doesNotThrow(() => schema(values));
  for (const openaiBaseUrl of [
    'http://remote.example/v1',
    'http://localhost.evil/v1',
    'https://user:password@example.com/v1',
    'https://example.com/v1?key=secret',
    'https://example.com/v1#fragment',
  ]) {
    assert.throws(() => schema({ ...values, openaiBaseUrl }));
  }
});
