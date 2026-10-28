import type { HybridScore } from './contracts.js';

const COLLECTION_ACTION_TOKENS = new Set(['explore', 'find', 'list', 'lookup', 'query', 'search']);
const COLLECTION_ENTITY_TOKENS = new Set([
  'events',
  'files',
  'issues',
  'jobs',
  'messages',
  'projects',
  'prs',
  'releases',
  'requests',
  'runs',
  'tasks',
]);
const RESTRICTIVE_SCOPE_TOKENS = new Set([
  'assigned',
  'authored',
  'mine',
  'recent',
  'review',
  'reviews',
  'user',
  'users',
]);
interface StructuredRerankContext {
  readonly hasExplicitProvider: boolean;
  readonly allowEntityTieBreak: boolean;
  readonly requestedActionTokens: readonly string[];
  readonly requestedEntityTokens: readonly string[];
  readonly queryTokens: readonly string[];
  readonly requestsCollection: boolean;
  readonly requiresCodeCallPath: boolean;
  readonly requiresLocalImageInspection: boolean;
  readonly requiresPublicWeb: boolean;
}

function matchesRequestedAction(
  candidate: HybridScore,
  requestedActionTokens: readonly string[],
): boolean {
  return requestedActionTokens.some((token) => candidate.document.actionTokens.includes(token));
}

function requestedEntityMatchCount(
  candidate: HybridScore,
  requestedEntityTokens: readonly string[],
): number {
  const candidateEntities = new Set(candidate.document.entityTokens);
  return requestedEntityTokens.filter((token) => candidateEntities.has(token)).length;
}

export function requiresCurrentPublicInformation(query: string): boolean {
  const temporal =
    /\b(?:current|currently|latest|newest|today|released|version)\b/i.test(query) ||
    /сейчас|последн\p{L}*|актуальн\p{L}*|выпущен\p{L}*|верси\p{L}*/iu.test(query);
  const externalEvidence =
    /\b(?:internet|web|source link|citation)\b/i.test(query) ||
    /\bofficial\b.{1,32}\bsource\b/i.test(query) ||
    /интернет\p{L}*|официальн\p{L}* источник\p{L}*|ссылк\p{L}*/iu.test(query);
  return temporal && externalEvidence;
}

export function queryRequiresCodeCallPath(query: string): boolean {
  return (
    /\b(?:call(?:er)?\s+(?:path|chain|flow)|trace\s+(?:calls?|flow))\b/i.test(query) ||
    /цепочк\p{L}*\s+вызов\p{L}*|путь\s+вызов\p{L}*/iu.test(query)
  );
}

export function codeCallPathCapabilityScore(candidate: HybridScore): number {
  const tokens = new Set([
    ...candidate.document.nameTokens,
    ...candidate.document.schemaTokens,
    ...candidate.document.fields.purpose,
  ]);
  const hasCall = ['call', 'caller', 'callers', 'calls'].some((token) => tokens.has(token));
  const hasPath = ['flow', 'path', 'trace'].some((token) => tokens.has(token));
  const returnsSource = ['code', 'source', 'symbol', 'symbols', 'verbatim'].some((token) =>
    tokens.has(token),
  );
  const explores = candidate.document.actionTokens.includes('explore');
  const isAggregateMetric = ['depth', 'diff', 'distribution'].some((token) =>
    candidate.document.nameTokens.includes(token),
  );
  const requiresEndpointIdentifiers =
    candidate.document.schemaTokens.filter((token) => token === 'id').length >= 2 &&
    candidate.document.nameTokens.includes('call') &&
    candidate.document.nameTokens.includes('chain');
  const narrowLookupPenalty = candidate.document.nameTokens.includes('search')
    ? 4
    : candidate.document.nameTokens.includes('node')
      ? 3
      : candidate.document.nameTokens.includes('callers')
        ? 2
        : 0;
  return (
    Number(hasCall) * 3 +
    Number(hasPath) * 2 +
    Number(returnsSource) +
    Number(explores) * 2 -
    Number(isAggregateMetric) * 2 -
    Number(requiresEndpointIdentifiers) * 3 -
    narrowLookupPenalty
  );
}

export function queryRequestsCollection(queryTokens: readonly string[]): boolean {
  return queryTokens.some((token) => COLLECTION_ENTITY_TOKENS.has(token));
}

function collectionCapabilityScore(candidate: HybridScore, queryTokens: readonly string[]): number {
  const supportsCollectionAction = candidate.document.actionTokens.some((token) =>
    COLLECTION_ACTION_TOKENS.has(token),
  );
  return (
    Number(supportsCollectionAction) * 2 - unrequestedCollectionScopeCount(candidate, queryTokens)
  );
}

function unrequestedCollectionScopeCount(
  candidate: HybridScore,
  queryTokens: readonly string[],
): number {
  const queryTokenSet = new Set(queryTokens);
  const documentTokens = new Set(candidate.document.nameTokens);
  return [...RESTRICTIVE_SCOPE_TOKENS].filter(
    (token) =>
      documentTokens.has(token) &&
      !queryTokenSet.has(token) &&
      !(token === 'user' && queryTokenSet.has('my')),
  ).length;
}

export function queryRequiresLocalImageInspection(query: string): boolean {
  const hasImagePath =
    /(?:^|[\s(`'"])(?:[./~]|[A-Z]:[\\/])[^\s`'"]+\.(?:avif|bmp|gif|jpe?g|png|webp)\b/i.test(query);
  const requestsInspection =
    /\b(?:check|inspect|read|transparent|view)\b/i.test(query) ||
    /проверь|посмотри|прочитай|прозрачн\p{L}*/iu.test(query);
  return hasImagePath && requestsInspection;
}

export function isLocalImageInspectionTool(candidate: HybridScore): boolean {
  return (
    candidate.document.schemaTokens.includes('path') &&
    candidate.document.entityTokens.includes('image') &&
    candidate.document.actionTokens.some(
      (token) => token === 'inspect' || token === 'read' || token === 'view',
    )
  );
}

export class StructuredCandidateReranker {
  public rerank(
    candidates: readonly HybridScore[],
    context: StructuredRerankContext,
  ): readonly HybridScore[] {
    return [...candidates].sort((left, right) => {
      const exactNameOrder = right.exactName - left.exactName;
      if (exactNameOrder !== 0) return exactNameOrder;
      if (left.exactName === 1 && right.exactName === 1) {
        const exactNameSpecificityOrder =
          right.document.exactNameTokens.length - left.document.exactNameTokens.length;
        if (exactNameSpecificityOrder !== 0) return exactNameSpecificityOrder;
      }
      if (context.hasExplicitProvider) {
        const providerOrder = right.provider - left.provider;
        if (providerOrder !== 0) return providerOrder;
      }
      if (context.requiresPublicWeb) {
        const webOrder =
          Number(right.document.providerTokens.includes('web')) -
          Number(left.document.providerTokens.includes('web'));
        if (webOrder !== 0) return webOrder;
      }
      if (context.requiresLocalImageInspection) {
        const imageInspectionOrder =
          Number(isLocalImageInspectionTool(right)) - Number(isLocalImageInspectionTool(left));
        if (imageInspectionOrder !== 0) return imageInspectionOrder;
      }
      if (context.requiresCodeCallPath) {
        const callPathOrder =
          codeCallPathCapabilityScore(right) - codeCallPathCapabilityScore(left);
        if (callPathOrder !== 0) return callPathOrder;
      }
      if (context.requestsCollection) {
        const scopeOrder =
          unrequestedCollectionScopeCount(left, context.queryTokens) -
          unrequestedCollectionScopeCount(right, context.queryTokens);
        if (scopeOrder !== 0) return scopeOrder;
      }
      if (context.requestedActionTokens.length > 0) {
        const actionOrder =
          Number(matchesRequestedAction(right, context.requestedActionTokens)) -
          Number(matchesRequestedAction(left, context.requestedActionTokens));
        if (actionOrder !== 0) return actionOrder;
      }
      if (context.requestsCollection) {
        const collectionOrder =
          collectionCapabilityScore(right, context.queryTokens) -
          collectionCapabilityScore(left, context.queryTokens);
        if (collectionOrder !== 0) return collectionOrder;
      }
      if (context.allowEntityTieBreak && context.requestedEntityTokens.length > 0) {
        const entityOrder =
          requestedEntityMatchCount(right, context.requestedEntityTokens) -
          requestedEntityMatchCount(left, context.requestedEntityTokens);
        if (entityOrder !== 0) return entityOrder;
      }
      return right.score - left.score || left.document.name.localeCompare(right.document.name);
    });
  }
}
