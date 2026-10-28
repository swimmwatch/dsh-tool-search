import assert from 'node:assert/strict';
import test from 'node:test';
import { searchBm25 } from '../../src/core/retrieval/bm25-index.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import { toolDefinition } from './support/tool-fixtures.js';

const NAMES = ['workflow', 'sentinel_list', 'mcp__example__runtime_info'] as const;
const QUERIES = [
  (name: string) => `Call ${name} task_id`,
  (name: string) => `INVOKE ${name}, task_id`,
  (name: string) => `Use the tool ${name} with task_id`,
  (name: string) => `Call \`${name}\` with task_id`,
  (name: string) => `Use "${name}", task_id`,
  (name: string) => `Find '${name}' for task_id`,
  (name: string) => `Вызови ${name} с task_id`,
  (name: string) => `Запусти инструмент ${name}, task_id`,
  (name: string) => `Используй «${name}» с task_id`,
];

for (const name of NAMES) {
  await test(`BM25 prioritizes an explicit ${name} reference before truncating a large catalog`, () => {
    const target = toolDefinition(name, 'Execute the selected operation.');
    const distractors = Array.from({ length: 400 }, (_, i) =>
      toolDefinition(`a_${name}_${i}`, `${name} ${name} task_id task_id`),
    );
    for (const catalog of [
      [...distractors, target],
      [target, ...distractors],
    ]) {
      const service = new ToolSearchService(catalog, { policyProfile: 'all' });
      for (const query of QUERIES) {
        const result = service.lexical(query(name), 'bm25');
        assert.equal(result.candidates[0]?.name, name, query(name));
        assert.equal(result.candidates.length, 5);
        assert.equal(result.degraded, false);
      }
    }
  });
}

const NEGATIVE_QUERIES = [
  'read code from GitHub',
  'Do not use workflow; search code on GitHub',
  'Do not use `workflow`; search code on GitHub',
  "Don't call workflow; search code on GitHub",
  'Never invoke workflow; search code on GitHub',
  'Не вызывай workflow; найди код в GitHub',
  'Не используй «workflow»; найди код в GitHub',
  'Нельзя использовать "workflow"; найди код в GitHub',
  'Avoid "workflow"; search code on GitHub',
  'Use any tool except "workflow"',
  'Используй любой инструмент кроме «workflow»',
  'Call specification_review_prepare_workflow task_id',
  'Call workflow_extra task_id',
  'Call workflow-extra task_id',
  'Call missing_tool task_id',
  'Call workflow via GitHub',
  'Call workflow via github',
  'GitHub: use workflow',
  'Use `mcp__github__search_code` through GitLab',
  'Use `mcp__github__search_code` on MissingProvider',
  'Call workflow and invoke read',
  'Call workflow and read',
  'Use workflow, read',
  'Вызови workflow или read',
  'Use "workflow" or "read"',
];

await test('ambiguous, negated and provider-conflicting references retain ordinary BM25 ordering', () => {
  const service = new ToolSearchService(
    [
      toolDefinition('workflow', 'Run a local workflow.'),
      toolDefinition('read', 'Read a local file.'),
      toolDefinition('mcp__github__search_code', 'Search code on GitHub.'),
      toolDefinition('mcp__gitlab__search_code', 'Search code on GitLab.'),
      toolDefinition('a_workflow_task', 'workflow workflow task_id task_id'),
    ],
    { policyProfile: 'all' },
  );
  for (const query of NEGATIVE_QUERIES) {
    const expected = searchBm25(service.index, query)
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.document.name.localeCompare(b.document.name))
      .slice(0, 5)
      .map(({ document }) => document.name);
    assert.deepEqual(
      service.lexical(query, 'bm25').candidates.map(({ name }) => name),
      expected,
      query,
    );
  }
});

await test('matching provider qualifiers preserve the explicit-reference priority', () => {
  const name = 'mcp__github__search_code';
  const service = new ToolSearchService(
    [
      toolDefinition(name, 'Execute selected operation.'),
      toolDefinition(`a_${name}_task`, `${name} ${name} task_id task_id`),
    ],
    { policyProfile: 'all' },
  );
  for (const query of [
    `Call ${name} via GitHub with task_id`,
    `Call ${name} via github with task_id`,
    `GitHub: use ${name} task_id`,
    `Do not use workflow on GitLab; call ${name} task_id`,
  ])
    assert.equal(service.lexical(query, 'bm25').candidates[0]?.name, name, query);
});

await test('explicit references after a separate negative clause remain eligible', () => {
  const service = new ToolSearchService(
    [
      toolDefinition('workflow', 'Execute selected operation.'),
      toolDefinition('read', 'Read local files.'),
      toolDefinition('a_workflow_task', 'workflow workflow task_id task_id'),
    ],
    { policyProfile: 'all' },
  );
  for (const query of [
    'Do not use read; call workflow task_id',
    'Не используй read; вызови workflow task_id',
    'Call workflow in parallel with task_id',
  ])
    assert.equal(service.lexical(query, 'bm25').candidates[0]?.name, 'workflow', query);
});

await test('embedding failure uses the same explicit-reference priority and reports degradation', async () => {
  let requests = 0;
  const service = new ToolSearchService(
    [
      toolDefinition('workflow', 'Execute the selected operation.'),
      toolDefinition(
        'mcp__engineer_agent__workflow_task',
        'Call workflow task_id workflow task_id.',
      ),
    ],
    {
      policyProfile: 'all',
      embeddingClient: {
        model: 'explicit-reference-offline',
        embedBatches: async () => {
          requests++;
          throw new Error('Offline');
        },
      },
    },
  );
  assert.equal(service.lexical('Call workflow task_id', 'bm25').candidates[0]?.name, 'workflow');
  assert.equal(requests, 0);
  const result = await service.hybrid('Call workflow task_id');
  assert.equal(result.candidates[0]?.name, 'workflow');
  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'embedding_unavailable_lexical_fallback');
  assert.equal(requests, 1);
});
