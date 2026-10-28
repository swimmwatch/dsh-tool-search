import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIndex, searchPattern } from '../../src/core/retrieval/bm25-index.js';
import { ConfidencePolicy } from '../../src/core/retrieval/confidence-policy.js';
import type { HybridScore } from '../../src/core/retrieval/contracts.js';
import { cosineSimilarity, HybridRanker } from '../../src/core/retrieval/hybrid-ranker.js';
import { digest, ToolDocumentFactory } from '../../src/core/retrieval/tool-document-factory.js';
import { ToolSearchService } from '../../src/core/retrieval/tool-search-service.js';
import { readTool, toolDefinition, writeTool } from './support/tool-fixtures.js';

await test('explicit provider qualification survives a shared raw callable identifier', () => {
  const enterprise = toolDefinition(
    'mcp__github-enterprise__get_issue',
    'Read a GitHub Enterprise issue.',
  );
  const gitlab = toolDefinition('mcp__gitlab__get_issue', 'Read a GitLab issue.');
  const index = buildIndex([enterprise, gitlab], digest('qualified-raw-callable'));
  for (const embeddings of [
    [
      [1, 0],
      [0, 1],
    ],
    [
      [0, 1],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 0],
    ],
  ]) {
    const result = new HybridRanker(index).rank('GitLab get_issue', [1, 0], embeddings);
    assert.equal(result.ranked[0]?.document.name, gitlab.name);
    assert.equal(result.ranked[0]?.exactName, 1);
    assert.equal(
      result.ranked.find((entry) => entry.document.name === enterprise.name)?.exactName,
      0,
    );
  }
});

await test('argument identifiers do not suppress a separate explicit tool reference', () => {
  const workflow = toolDefinition('workflow', 'Run a JavaScript workflow script.');
  const task = toolDefinition('mcp__example__lookup_task', 'Find task metadata by task_id.');
  const index = buildIndex([workflow, task], digest('tool-reference-with-argument'));
  for (const query of ['Call workflow with task_id', 'Use workflow and return item_index']) {
    const result = new HybridRanker(index).rank(
      query,
      [1, 0],
      [
        [0, 1],
        [1, 0],
      ],
    );
    assert.equal(result.ranked[0]?.document.name, workflow.name);
    assert.equal(result.ranked[0]?.exactName, 1);
    assert.equal(result.confidence.reason, 'exact_name');
  }
});

await test('a different explicit identifier does not reference a built-in name fragment', () => {
  const workflow = toolDefinition('workflow', 'Run a JavaScript workflow script.');
  const index = buildIndex([workflow], digest('explicit-identifier-fragment'));
  const result = new HybridRanker(index).rank('specification_review_prepare_workflow', [1], [[1]]);
  assert.equal(result.ranked[0]?.exactName, 0);
  assert.notEqual(result.confidence.reason, 'exact_name');
});

await test('document embedding text includes schema semantics', () => {
  const document = new ToolDocumentFactory().create(readTool);
  assert.match(document.embeddingText, /issue_number/);
  assert.match(document.embeddingText, /GitHub issue/);
});

await test('BM25 uses argument names to distinguish similar tools', () => {
  const byTitle = toolDefinition('mcp__github__find_issue', 'Find one issue.', [
    { name: 'title_query', type: 'string' },
  ]);
  const byNumber = toolDefinition('mcp__github__lookup_issue', 'Find one issue.', [
    { name: 'issue_number', type: 'number' },
  ]);
  const service = new ToolSearchService([byTitle, byNumber]);
  const result = service.lexical('find issue by issue number', 'bm25');
  assert.equal(result.candidates[0]?.name, byNumber.name);
});

for (const mode of ['pattern', 'bm25'] as const) {
  for (const name of ['workflow', 'sentinel_list', 'mcp__example__runtime_info']) {
    await test(`${mode} keeps exact name ${name} ahead of 400 substring matches before truncation`, () => {
      const exact = toolDefinition(name, 'Execute the selected operation.');
      const distractors = Array.from({ length: 400 }, (_, index) =>
        toolDefinition(`a_${name}_${index}`, `${name} ${name} ${name}`),
      );
      for (const tools of [
        [...distractors, exact],
        [exact, ...distractors],
      ]) {
        const service = new ToolSearchService(tools, { policyProfile: 'all' });
        const result = service.lexical(name, mode);
        assert.equal(result.candidates[0]?.name, name);
        assert.equal(result.candidates.length, 5);
      }
    });
  }
}

await test('pattern mode accepts literal alternatives and bounded wildcards', () => {
  const index = buildIndex([readTool, writeTool], digest('pattern'));
  const names = searchPattern(index, 'fetch.*issue|nonexistent')
    .filter(({ score }) => score > 0)
    .map(({ document }) => document.name);
  assert.deepEqual(names, [readTool.name]);
});

await test('pattern mode rejects arbitrary regular expressions', () => {
  const index = buildIndex([readTool], digest('pattern'));
  assert.throws(() => searchPattern(index, 'fetch(issue)+'), /unsupported/);
});

await test('cosine similarity handles valid and invalid vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

await test('confidence policy accepts an exact tool name', () => {
  const index = buildIndex([readTool], digest('confidence'));
  const ranked = new HybridRanker(index).rank('github fetch issue', [1], [[1]]);
  assert.deepEqual(ranked.confidence, { matched: true, reason: 'exact_name' });
});

await test('exact matching accepts a distinctive single-token callable', () => {
  const imagegen = toolDefinition('image_gen__imagegen', 'Generate or edit an image.');
  const index = buildIndex([imagegen], digest('single-token-callable'));
  const result = new HybridRanker(index).rank('image gen imagegen', [1], [[1]]);

  assert.equal(result.ranked[0]?.document.name, imagegen.name);
  assert.equal(result.ranked[0]?.exactName, 1);
  assert.equal(result.confidence.reason, 'exact_name');
});

await test('exact matching prefers the most specific referenced callable', () => {
  const genericFetch = toolDefinition(
    'mcp__codex_apps__github_fetch',
    'Fetch a generic GitHub URL.',
  );
  const workflowRuns = toolDefinition(
    'mcp__codex_apps__github_fetch_workflow_run_jobs',
    'Fetch jobs for one GitHub workflow run.',
  );
  const index = buildIndex([genericFetch, workflowRuns], digest('exact-name-specificity'));
  const result = new HybridRanker(index).rank(
    'mcp codex apps github fetch workflow run jobs',
    [1, 0],
    [
      [1, 0],
      [0.8, 0.2],
    ],
  );

  assert.equal(result.ranked[0]?.document.name, workflowRuns.name);
  assert.equal(result.ranked[0]?.exactName, 1);
});

await test('structured reranking preserves an explicitly referenced callable name', () => {
  const stats = toolDefinition(
    'mcp__headroom__headroom_stats',
    'Return current Headroom token-saving statistics.',
  );
  const compress = toolDefinition(
    'mcp__headroom__headroom_compress',
    'Compress supplied content into a Headroom reference.',
  );
  const index = buildIndex([stats, compress], digest('explicit-name'));
  const embeddings = index.documents.map(({ name }) => (name === compress.name ? [1, 0] : [0, 1]));
  const result = new HybridRanker(index).rank(
    'Call headroom_stats and report only the aggregate saving percentage.',
    [1, 0],
    embeddings,
  );

  assert.equal(result.ranked[0]?.document.name, stats.name);
  assert.equal(result.ranked[0]?.exactName, 1);
  assert.deepEqual(result.confidence, { matched: true, reason: 'exact_name' });
});

await test('exact callable matching preserves repeated name tokens', () => {
  const execute = toolDefinition(
    'mcp__codex_apps__codex_document_control_execute_document_command',
    'Execute one document command. This tool is part of plugin `Spreadsheets`.',
  );
  const sessions = toolDefinition(
    'mcp__codex_apps__codex_document_control_list_document_sessions',
    'List connected document sessions. This tool is part of plugin `Spreadsheets`.',
  );
  const index = buildIndex([execute, sessions], digest('repeated-callable-token'));
  const result = new HybridRanker(index).rank(
    'mcp codex apps codex document control execute document command',
    [1, 0],
    [
      [0.7, 0.3],
      [1, 0],
    ],
  );

  assert.equal(result.ranked[0]?.document.name, execute.name);
  assert.equal(result.ranked[0]?.exactName, 1);
  assert.deepEqual(result.confidence, { matched: true, reason: 'exact_name' });
});

await test('exact callable matching does not cross provider boundaries', () => {
  const youTrackProject = toolDefinition('mcp__youtrack__get_project', 'Get one YouTrack project.');
  const tickTickProject = toolDefinition(
    'mcp__codex_apps__ticktick_to_do_list___calendar__ticktick_to_do_list_calendar_get_project_by_id',
    'Get one TickTick project by identifier.',
  );
  const index = buildIndex([youTrackProject, tickTickProject], digest('provider-aware-exact-name'));
  const result = new HybridRanker(index).rank(
    'mcp codex apps ticktick to do list calendar ticktick to do list calendar get project by id',
    [1, 0],
    [
      [1, 0],
      [0.8, 0.2],
    ],
  );

  assert.equal(result.ranked[0]?.document.name, tickTickProject.name);
  assert.equal(result.ranked[0]?.exactName, 1);
});

await test('exact callable matching requires the full provider name', () => {
  const repl = toolDefinition(
    'mcp__node_repl__js',
    'Evaluate JavaScript in the persistent Node.js REPL.',
  );
  const web = toolDefinition('web__run', 'Search current public web information.');
  const index = buildIndex([repl, web], digest('full-provider-exact-name'));
  const result = new HybridRanker(index).rank(
    'Find the latest Node.js 24 release on the public web.',
    [1, 0],
    [
      [1, 0],
      [0.8, 0.2],
    ],
  );

  const replScore = result.ranked.find(({ document }) => document.name === repl.name);
  assert.equal(replScore?.exactName, 0);
  assert.equal(result.ranked[0]?.document.name, web.name);
});

await test('exact callable matching selects a generic provider operation', () => {
  const fetch = toolDefinition(
    'mcp__codex_apps__github_fetch',
    'Fetch a generic GitHub resource. This tool is part of plugin `GitHub`.',
  );
  const repository = toolDefinition(
    'mcp__codex_apps__github_get_repo',
    'Get one GitHub repository.',
  );
  const index = buildIndex([fetch, repository], digest('generic-provider-operation'));
  const result = new HybridRanker(index).rank(
    'mcp codex apps github fetch',
    [1, 0],
    [
      [0.7, 0.3],
      [1, 0],
    ],
  );

  assert.equal(result.ranked[0]?.document.name, fetch.name);
  assert.equal(result.ranked[0]?.exactName, 1);
});

await test('structured reranking prefers repository PR search over recent user PRs', () => {
  const repositorySearch = toolDefinition(
    'mcp__codex_apps__github_search_prs',
    'Search pull requests across one GitHub repository.',
  );
  const recentUserPullRequests = toolDefinition(
    'mcp__codex_apps__github_get_users_recent_prs_in_repo',
    'Get recent pull requests authored by one GitHub user in a repository.',
  );
  const index = buildIndex([repositorySearch, recentUserPullRequests], digest('github-pr-scope'));
  const embeddings = index.documents.map(({ name }) =>
    name === recentUserPullRequests.name ? [1, 0] : [0.8, 0.2],
  );
  const result = new HybridRanker(index).rank(
    'Check GH PRs in swimmwatch/gpt-voice and count all currently open pull requests.',
    [1, 0],
    embeddings,
  );

  assert.equal(result.ranked[0]?.document.name, repositorySearch.name);
});

await test('structured reranking prefers pull-request collection over review subresource', () => {
  const repositorySearch = toolDefinition(
    'mcp__codex_apps__github_search_prs',
    'Search pull requests across one GitHub repository.',
  );
  const pullRequestReviews = toolDefinition(
    'mcp__codex_apps__github_list_pull_request_reviews',
    'List review submissions on a pull request.',
  );
  const index = buildIndex(
    [repositorySearch, pullRequestReviews],
    digest('github-pr-review-scope'),
  );
  const embeddings = index.documents.map(({ name }) =>
    name === pullRequestReviews.name ? [1, 0] : [0.85, 0.15],
  );
  const result = new HybridRanker(index).rank(
    'GitHub: list pull requests for repository swimmwatch/gpt-voice, read-only.',
    [1, 0],
    embeddings,
  );

  assert.equal(result.ranked[0]?.document.name, repositorySearch.name);
});

await test('structured reranking keeps requested provider entity ahead of semantic distractor', () => {
  const projects = toolDefinition(
    'mcp__logfire__project_list',
    'List projects accessible to the current Logfire account.',
  );
  const exceptions = toolDefinition(
    'mcp__logfire__query_find_exceptions_in_file',
    'Query Logfire exceptions observed in one source file.',
  );
  const index = buildIndex([projects, exceptions], digest('logfire-project-entity'));
  const embeddings = index.documents.map(({ name }) =>
    name === exceptions.name ? [1, 0] : [0.72, 0.28],
  );
  const result = new HybridRanker(index).rank(
    'Ask Logfire for the number of accessible projects.',
    [1, 0],
    embeddings,
  );

  assert.equal(result.ranked[0]?.document.name, projects.name);
});

await test('structured reranking prefers a call-path tool over graph metrics', () => {
  const explore = toolDefinition(
    'mcp__codegraph__codegraph_explore',
    'Return verbatim source for relevant symbols plus the call path among them.',
  );
  const dependencyDepth = toolDefinition(
    'mcp__tokensave__tokensave_dependency_depth',
    'Show the longest file-level dependency chains and fragile upstream files.',
  );
  const distribution = toolDefinition(
    'mcp__tokensave__tokensave_distribution',
    'Show node kind distribution per file or directory.',
  );
  const callChain = toolDefinition(
    'mcp__tokensave__tokensave_call_chain',
    'Find a call chain between two resolved code graph node identifiers.',
    [
      { name: 'from_id', type: 'number' },
      { name: 'to_id', type: 'number' },
    ],
  );
  const symbolSearch = toolDefinition(
    'mcp__codegraph__codegraph_search',
    'Search symbol locations only without source code. Use codegraph_explore for call paths.',
    [{ name: 'query', type: 'string' }],
  );
  const index = buildIndex(
    [explore, dependencyDepth, distribution, callChain, symbolSearch],
    digest('code-call-path'),
  );
  const embeddings = index.documents.map(({ name }) =>
    [dependencyDepth.name, callChain.name, symbolSearch.name].includes(name)
      ? [1, 0]
      : [0.72, 0.28],
  );
  const result = new HybridRanker(index).rank(
    'Show the call path leading to the ProcessWatchTerminalWaiter class.',
    [1, 0],
    embeddings,
  );

  assert.equal(result.ranked[0]?.document.name, explore.name);
});

await test('confidence policy rejects an empty candidate set', () => {
  const decision = new ConfidencePolicy().decide({
    queryCoverage: 0,
    explicitProviderMismatch: false,
  });
  assert.deepEqual(decision, { matched: false, reason: 'no_candidates' });
});

await test('confidence policy accepts a low-coverage candidate with a decisive margin', () => {
  const document = new ToolDocumentFactory().create(readTool);
  const score = (value: number, semantic: number): HybridScore => ({
    document,
    score: value,
    semantic,
    lexical: 1,
    provider: 0,
    actionEntity: 0,
    schema: 0,
    scope: 0,
    exactName: 0,
  });
  const decision = new ConfidencePolicy().decide({
    top: score(0.69, 0.76),
    second: score(0.48, 0.61),
    queryCoverage: 0.28,
    explicitProviderMismatch: false,
  });
  assert.deepEqual(decision, {
    matched: true,
    reason: 'strong_semantic_match',
  });
});
