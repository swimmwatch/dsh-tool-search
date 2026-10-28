export const CONTRACT_TARGETS = [
  'workflow',
  'sentinel_list',
  'mcp__github__fetch_issue',
  'constructor',
  '__proto__',
] as const;

export type RetrievalProfile = 'bm25' | 'disabled' | 'outage' | 'pattern' | 'hybrid';

export interface RetrievalContractCase {
  readonly id: string;
  readonly kind: 'exact' | 'explicit' | 'empty' | 'no-match';
  readonly query: string;
  readonly target?: string;
  readonly profile: RetrievalProfile;
  readonly distractors: number;
  readonly reversed: boolean;
  readonly limit: number;
  readonly emptyCatalog?: boolean;
}

const cases: RetrievalContractCase[] = [];
for (const target of CONTRACT_TARGETS) {
  for (const profile of ['bm25', 'hybrid', 'pattern'] as const) {
    for (const distractors of [0, 400]) {
      for (const reversed of [false, true]) {
        for (const limit of [1, 5]) {
          cases.push({
            id: `exact/${target}/${profile}/${distractors}/${reversed}/${limit}`,
            kind: 'exact',
            query: target,
            target,
            profile,
            distractors,
            reversed,
            limit,
          });
        }
      }
    }
  }
  for (const [wording, query] of [
    ['command', `Call ${target} task_id`],
    ['quoted', `Find "${target}" with task_id`],
    ['russian', `Используй «${target}» с task_id`],
  ]) {
    if (!wording || !query) throw new Error('Missing explicit-reference fixture');
    for (const profile of ['bm25', 'disabled', 'outage'] as const) {
      for (const reversed of [false, true]) {
        for (const limit of [1, 5]) {
          cases.push({
            id: `explicit/${target}/${wording}/${profile}/${reversed}/${limit}`,
            kind: 'explicit',
            query,
            target,
            profile,
            distractors: 400,
            reversed,
            limit,
          });
        }
      }
    }
  }
}

for (const kind of ['empty', 'no-match'] as const) {
  for (const profile of ['bm25', 'disabled', 'outage', 'pattern'] as const) {
    for (const distractors of [0, 400]) {
      cases.push({
        id: `${kind}/${profile}/${distractors}`,
        kind,
        query: kind === 'empty' ? ' \n\t ' : 'xqzvbnm8473',
        profile,
        distractors,
        reversed: false,
        limit: 5,
      });
    }
  }
}

for (const profile of ['bm25', 'disabled', 'pattern'] as const) {
  cases.push({
    id: `empty-catalog/${profile}`,
    kind: 'no-match',
    query: 'workflow',
    profile,
    distractors: 0,
    reversed: false,
    limit: 5,
    emptyCatalog: true,
  });
}
cases.push({
  id: 'exact/max-query-boundary',
  kind: 'exact',
  query: 'workflow'.padEnd(500, ' '),
  target: 'workflow',
  profile: 'hybrid',
  distractors: 400,
  reversed: true,
  limit: 1,
});

export const SEARCH_CONTRACT_CASES: readonly RetrievalContractCase[] = cases;

export const REFERENCE_CONTRACT_CASES = [
  { id: 'reference/natural-read', query: 'read code from GitHub' },
  { id: 'reference/english-negation', query: 'Do not use workflow; search code on GitHub' },
  { id: 'reference/russian-negation', query: 'Не вызывай workflow; найди код в GitHub' },
  { id: 'reference/quoted-negation', query: 'Never use "workflow"' },
  { id: 'reference/foreign-identifier', query: 'Call specification_review_prepare_workflow' },
  { id: 'reference/unknown', query: 'Call unavailable_identifier_8593' },
  { id: 'reference/unicode-lookalike', query: 'Call workflоw' },
  { id: 'reference/provider-conflict', query: 'Call workflow via GitHub task_id' },
  { id: 'reference/two-tools', query: 'Call workflow and sentinel_list' },
  { id: 'reference/two-quoted-tools', query: 'Use "workflow" or "sentinel_list"' },
  {
    id: 'reference/separate-positive-clause',
    query: 'Do not use sentinel_list; call workflow task_id',
    expected: 'workflow',
  },
  {
    id: 'reference/separate-russian-clause',
    query: 'Не используй sentinel_list; вызови workflow task_id',
    expected: 'workflow',
  },
] as const;

export const INVALID_CONTRACT_CASES = [
  { id: 'invalid/missing-query', input: {} },
  { id: 'invalid/non-string-query', input: { query: 42 } },
  { id: 'invalid/long-query', input: { query: 'x'.repeat(501) } },
  { id: 'invalid/zero-limit', input: { query: 'workflow', limit: 0 } },
  { id: 'invalid/large-limit', input: { query: 'workflow', limit: 6 } },
  { id: 'invalid/fraction-limit', input: { query: 'workflow', limit: 1.5 } },
  { id: 'invalid/unknown-mode', input: { query: 'workflow', mode: 'semantic-only' } },
  { id: 'invalid/extra-parameter', input: { query: 'workflow', execute: true } },
] as const;

export const RETRIEVAL_CONTRACT_CASES: readonly { readonly id: string }[] = [
  ...SEARCH_CONTRACT_CASES,
  ...REFERENCE_CONTRACT_CASES,
  ...INVALID_CONTRACT_CASES,
];
