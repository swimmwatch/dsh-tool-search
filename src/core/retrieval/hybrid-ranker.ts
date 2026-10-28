import { RESULT_LIMIT } from '../shared/types.js';
import type { HybridScore, RankResult, ToolDocument } from './contracts.js';
import type { Bm25FieldIndex } from './bm25-index.js';
import { ConfidencePolicy } from './confidence-policy.js';
import {
  codeCallPathCapabilityScore,
  isLocalImageInspectionTool,
  queryRequestsCollection,
  queryRequiresCodeCallPath,
  queryRequiresLocalImageInspection,
  requiresCurrentPublicInformation,
  StructuredCandidateReranker,
} from './structured-candidate-reranker.js';
import { editDistance, possibleExplicitProviders } from './query-intent.js';
import {
  AMBIGUOUS_PROVIDER_TOKENS,
  BATCH_SCOPE_TOKENS,
  DESCRIPTION_SCORE_WEIGHTS,
  GUARDED_CAPABILITY_ACTIONS,
  SCORE_WEIGHTS,
  VAGUE_QUERY_TOKENS,
} from './ranking-policy.js';
import {
  ACTION_TOKENS,
  compactIdentifier,
  GENERIC_PROVIDER_TOKENS,
  isStopWord,
  meaningfulQueryTokens,
  stripNegatedClauses,
  tokenize,
  uniqueTokens,
} from './text-normalization.js';

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue: number | undefined = (left as readonly number[])[index];
    const rightValue: number | undefined = (right as readonly number[])[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += (leftValue ?? 0) * (rightValue ?? 0);
    leftNorm += (leftValue ?? 0) * (leftValue ?? 0);
    rightNorm += (rightValue ?? 0) * (rightValue ?? 0);
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function overlapRatio(queryTokens: readonly string[], candidateTokens: readonly string[]): number {
  if (queryTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  return queryTokens.filter((token) => candidateSet.has(token)).length / queryTokens.length;
}

function balancedOverlap(leftTokens: readonly string[], rightTokens: readonly string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  return 0.5 * overlapRatio(leftTokens, rightTokens) + 0.5 * overlapRatio(rightTokens, leftTokens);
}

function actionEntityCompatibility(queryTokens: readonly string[], document: ToolDocument): number {
  const queryActionTokens = uniqueTokens(queryTokens.filter((token) => ACTION_TOKENS.has(token)));
  const queryEntityTokens = uniqueTokens(
    queryTokens.filter(
      (token) => !ACTION_TOKENS.has(token) && !document.providerTokens.includes(token),
    ),
  );
  const actionScore =
    queryActionTokens.length === 0
      ? 0.5
      : balancedOverlap(queryActionTokens, document.actionTokens);
  const entityScore = balancedOverlap(queryEntityTokens, document.entityTokens);
  return 0.7 * actionScore + 0.3 * entityScore;
}

function referencesCallableName(query: string, document: ToolDocument): boolean {
  const names = new Set(
    [document.name, document.name.split('__').at(-1) ?? document.name].map((name) =>
      name.toLowerCase(),
    ),
  );
  // Foreign identifiers must not contribute fragments to an exact name.
  const references = query.replace(/\b[\w-]+\b/g, (word) =>
    word.includes('_') && !names.has(word.toLowerCase()) ? ' ' : word,
  );
  const queryTokens = tokenize(references).filter((token) => !isStopWord(token));
  const compactQuery = queryTokens.join('');
  if (document.exactNameTokens.length >= 2) {
    return compactQuery.includes(document.exactNameTokens.join(''));
  }
  const [singleToken] = document.exactNameTokens;
  return Boolean(singleToken && singleToken.length >= 8 && queryTokens.includes(singleToken));
}

function scopeCompatibility(queryTokens: readonly string[], document: ToolDocument): number {
  const queryRequestsBatch = queryTokens.some((token) => BATCH_SCOPE_TOKENS.has(token));
  const documentIsBatch = document.nameTokens.some((token) => BATCH_SCOPE_TOKENS.has(token));
  if (queryRequestsBatch === documentIsBatch) return 1;
  return documentIsBatch ? 0 : 0.4;
}

export class HybridRanker {
  public constructor(
    private readonly index: Bm25FieldIndex,
    private readonly confidencePolicy = new ConfidencePolicy(),
    private readonly structuredReranker = new StructuredCandidateReranker(),
  ) {}

  public rank(
    query: string,
    queryEmbedding: readonly number[],
    documentEmbeddings: readonly (readonly number[])[],
  ): RankResult {
    const rankingQuery = stripNegatedClauses(query)
      .replace(/\bread[- ]only\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const queryTokens = uniqueTokens(meaningfulQueryTokens(rankingQuery));
    const weights =
      queryTokens.length >= 8 || rankingQuery.length >= 80
        ? DESCRIPTION_SCORE_WEIGHTS
        : SCORE_WEIGHTS;
    const lexicalResults = this.index.search(rankingQuery);
    const maxLexical = Math.max(...lexicalResults.map(({ score }) => score), 0);
    const knownProviderTokenGroups = [
      ...new Map(
        this.index.documents.map(({ providerTokens }) => [
          providerTokens.join('\u0000'),
          providerTokens,
        ]),
      ).values(),
    ];
    const providerTokenOwners = new Map<string, Set<string>>();
    for (const document of this.index.documents) {
      for (const token of document.providerTokens) {
        const owners = providerTokenOwners.get(token) ?? new Set<string>();
        owners.add(document.providerSignature);
        providerTokenOwners.set(token, owners);
      }
    }
    const providerAliasOwners = new Map<string, Set<string>>();
    for (const document of this.index.documents) {
      const aliasCandidates = document.providerTokenSequence.flatMap(
        (token, index, providerTokens) => [
          token,
          index < providerTokens.length - 1 ? `${token}${providerTokens[index + 1]}` : '',
        ],
      );
      for (const alias of aliasCandidates) {
        if (
          alias.length < 5 ||
          (document.providerTokens.includes(alias) && AMBIGUOUS_PROVIDER_TOKENS.has(alias))
        )
          continue;
        const owners = providerAliasOwners.get(alias) ?? new Set<string>();
        owners.add(document.providerSignature);
        providerAliasOwners.set(alias, owners);
      }
    }
    const distinctiveProviderTokens = new Set(
      [...providerTokenOwners.entries()]
        .filter(
          ([token, owners]) =>
            token.length >= 5 && owners.size === 1 && !AMBIGUOUS_PROVIDER_TOKENS.has(token),
        )
        .map(([token]) => token),
    );
    const knownProviderSignatures = uniqueTokens(
      this.index.documents.map(({ providerSignature }) => providerSignature),
    ).filter((signature) => signature.length >= 3);
    const requestedProviderTokenGroups = knownProviderTokenGroups.filter(
      (providerTokens) =>
        providerTokens.length > 0 &&
        providerTokens.some((token) => !AMBIGUOUS_PROVIDER_TOKENS.has(token)) &&
        providerTokens.every((token) => queryTokens.includes(token)),
    );
    const compactQuery = compactIdentifier(rankingQuery);
    const requestedProviderAliases = [...providerAliasOwners.entries()]
      .filter(([alias, owners]) => owners.size === 1 && compactQuery.includes(alias))
      .map(([alias]) => alias);
    const requestedDistinctiveProviderTokens = [...distinctiveProviderTokens].filter(
      (token) => queryTokens.includes(token) || compactQuery.includes(token),
    );
    const requestedProviderTokens = uniqueTokens([
      ...requestedProviderTokenGroups.flat(),
      ...requestedDistinctiveProviderTokens,
    ]);
    const requestedProviderSignatures = knownProviderSignatures.filter(
      (signature) => !AMBIGUOUS_PROVIDER_TOKENS.has(signature) && compactQuery.includes(signature),
    );
    const hasExplicitProvider =
      requestedProviderTokens.length > 0 ||
      requestedProviderAliases.length > 0 ||
      requestedProviderSignatures.length > 0;
    const unknownProperProviders = possibleExplicitProviders(rankingQuery).filter(
      (candidate) =>
        candidate.length >= 3 &&
        !knownProviderSignatures.some(
          (signature) =>
            signature === candidate ||
            signature.startsWith(candidate) ||
            candidate.includes(signature) ||
            editDistance(candidate, signature) <= 2,
        ),
    );
    const preferCurrentCapability = /\b(?:current|supported|not deprecated)\b/i.test(rankingQuery);
    const requestedActionTokens = uniqueTokens(
      queryTokens.filter((token) => ACTION_TOKENS.has(token)),
    );
    const knownProviderTokens = new Set(knownProviderTokenGroups.flat());
    const requestedEntityTokens = uniqueTokens(
      queryTokens.filter(
        (token) =>
          !ACTION_TOKENS.has(token) &&
          !knownProviderTokens.has(token) &&
          !GENERIC_PROVIDER_TOKENS.has(token) &&
          !VAGUE_QUERY_TOKENS.has(token),
      ),
    );
    const requestsCollection = queryRequestsCollection(queryTokens);
    const requiresCodeCallPath = queryRequiresCodeCallPath(rankingQuery);
    const requiresLocalImageInspection = queryRequiresLocalImageInspection(rankingQuery);
    const requiresPublicWeb = requiresCurrentPublicInformation(rankingQuery);
    const ranked = this.structuredReranker.rerank(
      lexicalResults.map(({ document, score: rawLexical }, index): HybridScore => {
        const semantic = Math.max(
          0,
          cosineSimilarity(queryEmbedding, documentEmbeddings[index] ?? []),
        );
        const lexical = maxLexical > 0 ? rawLexical / maxLexical : 0;
        const provider =
          requestedProviderTokens.length === 0 && requestedProviderAliases.length === 0
            ? requestedProviderSignatures.length === 0
              ? 0.5
              : requestedProviderSignatures.includes(document.providerSignature)
                ? 1
                : 0
            : requestedProviderAliases.some((alias) =>
                  providerAliasOwners.get(alias)?.has(document.providerSignature),
                ) ||
                requestedDistinctiveProviderTokens.some((token) =>
                  document.providerTokens.includes(token),
                ) ||
                requestedProviderTokenGroups.some((providerTokens) =>
                  providerTokens.every((token) => document.providerTokens.includes(token)),
                )
              ? 1
              : 0;
        const actionEntity = actionEntityCompatibility(queryTokens, document);
        const schema = overlapRatio(queryTokens, document.schemaTokens);
        const scope = scopeCompatibility(queryTokens, document);
        const exactName = referencesCallableName(rankingQuery, document) ? 1 : 0;
        const deprecationPenalty = document.deprecated && preferCurrentCapability ? 0.3 : 0;
        const score =
          weights.semantic * semantic +
          weights.lexical * lexical +
          weights.provider * provider +
          weights.actionEntity * actionEntity +
          weights.schema * schema +
          weights.scope * scope +
          weights.exactName * exactName -
          deprecationPenalty;
        return {
          document,
          score,
          semantic,
          lexical,
          provider,
          actionEntity,
          schema,
          scope,
          exactName,
        };
      }),
      {
        hasExplicitProvider,
        allowEntityTieBreak: hasExplicitProvider && rankingQuery.length <= 96,
        requestedActionTokens,
        requestedEntityTokens,
        queryTokens,
        requestsCollection,
        requiresCodeCallPath,
        requiresLocalImageInspection,
        requiresPublicWeb,
      },
    );
    const top = ranked[0];
    const topFieldTokens = new Set(top ? Object.values(top.document.fields).flat() : []);
    const unmatchedProperProviders = unknownProperProviders.filter(
      (token) => !topFieldTokens.has(token),
    );
    const explicitProviderMismatch =
      requestedProviderTokens.length === 0 &&
      requestedProviderAliases.length === 0 &&
      requestedProviderSignatures.length === 0 &&
      unknownProperProviders.length > 0 &&
      unknownProperProviders.length <= 2 &&
      unmatchedProperProviders.length > 0;
    const availableActionTokens = new Set(
      this.index.documents.flatMap(({ actionTokens }) => actionTokens),
    );
    const requestedGuardedActions = requestedActionTokens.filter((token) =>
      GUARDED_CAPABILITY_ACTIONS.has(token),
    );
    const explicitCapabilityMismatch =
      requestedGuardedActions.length > 0 &&
      !requestedGuardedActions.some((token) => availableActionTokens.has(token));
    const intentDetailTokens = queryTokens.filter(
      (token) =>
        !ACTION_TOKENS.has(token) &&
        !knownProviderTokens.has(token) &&
        !GENERIC_PROVIDER_TOKENS.has(token) &&
        !VAGUE_QUERY_TOKENS.has(token),
    );
    const queryCoverage = top
      ? overlapRatio(queryTokens, Object.values(top.document.fields).flat())
      : 0;
    const confidence = this.confidencePolicy.decide({
      ...(top ? { top } : {}),
      ...(ranked[1] ? { second: ranked[1] } : {}),
      queryCoverage,
      explicitProviderMismatch,
      explicitCapabilityMismatch,
      hasRecognizedAction: requestedActionTokens.length > 0,
      hasIntentDetail: intentDetailTokens.length > 0,
      hasStructuredIntentMatch:
        (requiresCodeCallPath && top !== undefined && codeCallPathCapabilityScore(top) >= 6) ||
        (requiresPublicWeb && top?.document.providerTokens.includes('web') === true) ||
        (requiresLocalImageInspection && top !== undefined && isLocalImageInspectionTool(top)),
    });
    const scoreMargin = (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0);
    return {
      ranked,
      confidence,
      queryCoverage,
      scoreMargin,
      requiresRerank: confidence.matched && scoreMargin < 0.04,
    };
  }
}

export { RESULT_LIMIT };
