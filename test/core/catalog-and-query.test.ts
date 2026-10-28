import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSchemaFields,
  splitToolDescription,
  ToolDefinitionParser,
} from '../../src/core/catalog/declaration-parser.js';
import { ToolRiskClassifier } from '../../src/core/catalog/risk-policy.js';
import { ToolCatalog } from '../../src/core/catalog/tool-catalog.js';
import { buildIndex } from '../../src/core/retrieval/bm25-index.js';
import { HybridRanker } from '../../src/core/retrieval/hybrid-ranker.js';
import {
  meaningfulQueryTokens,
  meaningfulTokens,
  stripNegatedClauses,
  tokenize,
} from '../../src/core/retrieval/text-normalization.js';
import { digest } from '../../src/core/retrieval/tool-document-factory.js';
import {
  destructiveTool,
  executionTool,
  readTool,
  toolDefinition,
  writeTool,
} from './support/tool-fixtures.js';

await test('splits human text and a TypeScript declaration', () => {
  const result = splitToolDescription(readTool.description);
  assert.equal(result.humanDescription, 'Fetch one GitHub issue.');
  assert.match(result.declaration, /^declare const tools:/);
});

await test('parses top-level schema fields', () => {
  const parsed = new ToolDefinitionParser().parse(readTool);
  assert.deepEqual(
    parsed.schemaFields.map(({ name, optional, type }) => ({ name, optional, type })),
    [
      { name: 'owner', optional: false, type: 'string' },
      { name: 'repository', optional: false, type: 'string' },
      { name: 'issue_number', optional: false, type: 'number' },
    ],
  );
});

await test('does not expose nested or return fields as arguments', () => {
  const declaration =
    'declare const tools: { search(args: {\n' +
    '  groups?: Array<{ query: string; }>;\n' +
    '  limit?: number;\n' +
    '}): Promise<{ content: string }>; };';
  assert.deepEqual(
    extractSchemaFields(declaration).map(({ name }) => name),
    ['groups', 'limit'],
  );
});

await test('rejects an empty tool name', () => {
  assert.throws(
    () => new ToolDefinitionParser().parse({ name: '', description: 'x' }),
    /non-empty/,
  );
});

await test('catalog digest is stable across input order', () => {
  const first = new ToolCatalog([readTool, writeTool], { policyProfile: 'mutation' });
  const second = new ToolCatalog([writeTool, readTool], { policyProfile: 'mutation' });
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});

await test('catalog rejects duplicate names', () => {
  assert.throws(() => new ToolCatalog([readTool, readTool]), /Duplicate tool/);
});

await test('inspection is bound to a catalog digest', () => {
  const catalog = new ToolCatalog([readTool]);
  assert.equal(catalog.inspect(readTool.name, catalog.digest).name, readTool.name);
  assert.throws(() => catalog.inspect(readTool.name, '0'.repeat(64)), /digest mismatch/);
});

await test('inspection requires a callable declaration', () => {
  const catalog = new ToolCatalog([
    { name: 'mcp__github__fetch_issue', description: 'Fetch one issue.' },
  ]);
  assert.throws(
    () => catalog.inspect('mcp__github__fetch_issue', catalog.digest),
    /no callable declaration/,
  );
});

await test('read-only policy excludes writes and unknown operations', () => {
  const unknown = toolDefinition('mcp__example__mystery_operation', 'Mystery.');
  const catalog = new ToolCatalog([readTool, writeTool, unknown]);
  assert.deepEqual(
    catalog.searchableEntries().map(({ name }) => name),
    [readTool.name],
  );
});

await test('mutation policy includes reads and writes', () => {
  const catalog = new ToolCatalog([readTool, writeTool], { policyProfile: 'mutation' });
  assert.deepEqual(
    catalog.searchableEntries().map(({ name }) => name),
    [readTool.name, writeTool.name],
  );
});

await test('execution policy excludes destructive tools', () => {
  const catalog = new ToolCatalog([executionTool, destructiveTool], {
    policyProfile: 'execution',
  });
  assert.deepEqual(
    catalog.searchableEntries().map(({ name }) => name),
    [executionTool.name],
  );
});

await test('all policy includes every risk class', () => {
  const catalog = new ToolCatalog([readTool, writeTool, executionTool, destructiveTool], {
    policyProfile: 'all',
  });
  assert.equal(catalog.searchableEntries().length, 4);
});

await test('risk classifier distinguishes read, write, execution and destructive', () => {
  const classifier = new ToolRiskClassifier();
  assert.equal(classifier.classify(readTool), 'read');
  assert.equal(classifier.classify(writeTool), 'write');
  assert.equal(classifier.classify(executionTool), 'execution');
  assert.equal(classifier.classify(destructiveTool), 'destructive');
  assert.equal(classifier.classify({ name: 'mcp__github__list_pull_request_reviews' }), 'read');
  assert.equal(classifier.classify({ name: 'mcp__github__create_pull_request' }), 'write');
});

await test('tokenizer expands stable technical aliases', () => {
  assert.deepEqual(tokenize('Find docs'), ['find', 'docs']);
  const tokens = meaningfulTokens('Find docs for JS PR');
  assert.ok(tokens.includes('javascript'));
  assert.ok(tokens.includes('pull'));
  assert.ok(meaningfulTokens('GITHUB CODEGRAPH TICKTICK').includes('hub'));
  assert.ok(meaningfulTokens('Count projects').includes('list'));
  assert.ok(meaningfulQueryTokens('Retrieve file').includes('get'));
  assert.ok(meaningfulQueryTokens('Return event').includes('read'));
  assert.equal(meaningfulTokens('Return result').includes('get'), false);
});

await test('query normalization expands action aliases and inflected verbs', () => {
  const tokens = meaningfulTokens('updating serach results for GH PRs');
  assert.ok(tokens.includes('update'));
  assert.ok(tokens.includes('search'));
  assert.ok(tokens.includes('github'));
  assert.ok(tokens.includes('pull'));
  assert.ok(tokens.includes('request'));
  const russianTokens = meaningfulTokens('показать цепочку, прочитать и посчитать проекты');
  assert.ok(russianTokens.includes('explore'));
  assert.ok(russianTokens.includes('path'));
  assert.ok(russianTokens.includes('count'));
  assert.ok(russianTokens.includes('read'));
  assert.ok(russianTokens.includes('project'));
  assert.ok(meaningfulTokens('проектов').includes('project'));
});

await test('query normalization excludes explicitly negated clauses', () => {
  const normalized = stripNegatedClauses(
    'Do not search Google Drive, and do not list folders. Retrieve the Dropbox file.',
  );
  assert.doesNotMatch(normalized, /Google Drive|list folders/);
  assert.match(normalized, /Retrieve the Dropbox file/);
  assert.equal(stripNegatedClauses('DO   NOT create anything.'), '.');

  const russian = stripNegatedClauses(
    'Посчитать проекты; не выводить названия и ничего не изменять.',
  );
  assert.doesNotMatch(russian, /не выводить|не изменять/);
  assert.match(russian, /Посчитать проекты/);
});

await test('hybrid confidence rejects an unavailable explicit provider', () => {
  const teams = toolDefinition(
    'mcp__teams__search_messages',
    'Search messages in Microsoft Teams.',
  );
  const result = new HybridRanker(buildIndex([teams], digest('provider'))).rank(
    'Search Slack for the incident thread.',
    [1, 0],
    [[1, 0]],
  );
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'provider_not_available',
  });
});

await test('hybrid confidence rejects an unavailable provider after an article', () => {
  const promptDeleteInterview = toolDefinition(
    'mcp__prompt_mcp__delete_interview',
    'Delete one stored Prompt MCP interview.',
  );
  const result = new HybridRanker(
    buildIndex([promptDeleteInterview], digest('provider-article')),
  ).rank('Delete an Ollama model.', [1, 0], [[1, 0]]);
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'provider_not_available',
  });
});

await test('hybrid confidence does not treat a PascalCase target as a provider', () => {
  const explore = toolDefinition(
    'mcp__codegraph__codegraph_explore',
    'Explore indexed code and return relevant symbols with their call paths.',
  );
  const result = new HybridRanker(buildIndex([explore], digest('pascal-case-target'))).rank(
    'Read-only trace the call path leading to the WatchAttemptWaiter class.',
    [1, 0],
    [[1, 0]],
  );

  assert.notEqual(result.confidence.reason, 'provider_not_available');
});

await test('hybrid confidence rejects unavailable providers for update-like actions', () => {
  const parentalControl = toolDefinition(
    'mcp__safety_settings__update_parental_control',
    'Update parental-control settings for a home account.',
  );
  const result = new HybridRanker(buildIndex([parentalControl], digest('provider-change'))).rank(
    'Change a Home Assistant thermostat.',
    [1, 0],
    [[1, 0]],
  );
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'provider_not_available',
  });
});

await test('hybrid confidence detects an unavailable provider in Russian', () => {
  const teams = toolDefinition('mcp__teams__send_message', 'Send a message to Microsoft Teams.');
  const result = new HybridRanker(buildIndex([teams], digest('provider-ru'))).rank(
    'Отправь сообщение в Slack для команды релиза.',
    [1, 0],
    [[1, 0]],
  );
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'provider_not_available',
  });
});

await test('hybrid confidence rejects a capability excluded from the catalog', () => {
  const readFile = toolDefinition('mcp__google_drive__get_file', 'Get one Google Drive file.');
  const result = new HybridRanker(buildIndex([readFile], digest('capability'))).rank(
    'Upload this report to Google Drive.',
    [1, 0],
    [[1, 0]],
  );
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'capability_not_available',
  });
});

await test('hybrid confidence rejects an actionless ambiguous request', () => {
  const getEvent = toolDefinition(
    'mcp__google_calendar__get_event',
    'Get one Google Calendar event.',
  );
  const deleteEvent = toolDefinition(
    'mcp__google_calendar__delete_event',
    'Delete one Google Calendar event.',
  );
  const result = new HybridRanker(buildIndex([getEvent, deleteEvent], digest('ambiguous'))).rank(
    'Take care of my Google Calendar event.',
    [1, 0],
    [
      [1, 0],
      [1, 0],
    ],
  );
  assert.deepEqual(result.confidence, {
    matched: false,
    reason: 'ambiguous_intent',
  });
});
