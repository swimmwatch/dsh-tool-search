interface ScoreWeights {
  readonly semantic: number;
  readonly lexical: number;
  readonly provider: number;
  readonly actionEntity: number;
  readonly schema: number;
  readonly scope: number;
  readonly exactName: number;
}
export const SCORE_WEIGHTS: ScoreWeights = {
  semantic: 0.56,
  lexical: 0.06,
  provider: 0.12,
  actionEntity: 0.14,
  schema: 0.03,
  scope: 0.08,
  exactName: 0.01,
};
export const DESCRIPTION_SCORE_WEIGHTS: ScoreWeights = {
  semantic: 0.48,
  lexical: 0.18,
  provider: 0.12,
  actionEntity: 0.14,
  schema: 0.04,
  scope: 0.03,
  exactName: 0.01,
};
export const AMBIGUOUS_PROVIDER_TOKENS = new Set([
  'assistant',
  'browser',
  'calendar',
  'document',
  'drive',
  'file',
  'image',
  'mail',
  'search',
  'web',
]);
export const BATCH_SCOPE_TOKENS = new Set(['all', 'batch', 'bulk', 'many', 'multiple', 'several']);
export const GUARDED_CAPABILITY_ACTIONS = new Set([
  'create',
  'delete',
  'execute',
  'merge',
  'publish',
  'remove',
  'run',
  'send',
  'uninstall',
  'update',
  'upload',
  'write',
]);
export const VAGUE_QUERY_TOKENS = new Set([
  'chat',
  'file',
  'it',
  'message',
  'my',
  'one',
  'person',
  'provider',
  'right',
  'some',
  'someone',
  'something',
  'that',
  'the',
  'this',
  'thing',
]);
