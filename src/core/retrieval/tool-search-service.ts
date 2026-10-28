import { ToolCatalog } from '../catalog/tool-catalog.js';
import { EmbeddingCache } from '../embeddings/definition-vector-cache.js';
import { EmbeddingCredentialError, validateVectors } from '../embeddings/provider.js';
import { type Bm25FieldIndex, buildIndex, searchBm25, searchPattern } from './bm25-index.js';
import { HybridRanker, RESULT_LIMIT } from './hybrid-ranker.js';
import { explicitToolReference } from './explicit-tool-reference.js';
import type { HybridScore } from './contracts.js';
import type {
  EmbeddingAdapter,
  InspectionResult,
  PolicyProfile,
  SearchMode,
  SearchResult,
  ToolMetadata,
} from '../shared/types.js';

export { QUERY_INSTRUCTION } from '../embeddings/provider.js';
export interface ToolSearchServiceOptions {
  readonly catalogDigest?: string;
  readonly model?: string;
  readonly policyProfile?: PolicyProfile;
  readonly embeddingClient?: EmbeddingAdapter;
  readonly embeddingCache?: EmbeddingCache;
}

export class ToolSearchService {
  public readonly catalog: ToolCatalog;
  public readonly index: Bm25FieldIndex;
  public readonly model: string;
  public readonly policyProfile: PolicyProfile;
  private documentEmbeddings: readonly (readonly number[])[] | null = null;
  private embeddingCacheHit: boolean | null = null;
  private embeddingCacheStats: NonNullable<SearchResult['embeddingCache']> | null = null;
  private embeddingCacheWriteFailed = false;
  private readonly embeddingClient: EmbeddingAdapter | undefined;
  private readonly embeddingCache: EmbeddingCache | undefined;

  public constructor(metadata: readonly ToolMetadata[], options: ToolSearchServiceOptions = {}) {
    this.policyProfile = options.policyProfile ?? 'read-only';
    this.catalog = new ToolCatalog(metadata, {
      policyProfile: this.policyProfile,
    });
    if (options.catalogDigest && options.catalogDigest !== this.catalog.digest) {
      throw new Error('Catalog digest does not match metadata.');
    }
    const searchableMetadata = this.catalog.searchableEntries().map((entry) => ({
      name: entry.name,
      description: entry.rawDescription,
    }));
    this.index = buildIndex(searchableMetadata, this.catalog.digest);
    this.model = options.model ?? options.embeddingClient?.model ?? 'disabled';
    this.embeddingClient = options.embeddingClient;
    this.embeddingCache = options.embeddingCache;
  }

  public lexical(query: string, mode: Exclude<SearchMode, 'hybrid'>): SearchResult {
    const explicitName =
      mode === 'bm25' ? explicitToolReference(query, this.index.documents) : undefined;
    const results =
      mode === 'pattern' ? searchPattern(this.index, query) : searchBm25(this.index, query);
    const ranked = results
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          // Resolve a literal callable name before the first candidate limit is applied.
          Number(right.document.name === query) - Number(left.document.name === query) ||
          Number(right.document.name === explicitName) -
            Number(left.document.name === explicitName) ||
          right.score - left.score ||
          left.document.name.localeCompare(right.document.name),
      );
    return {
      matched: ranked.length > 0,
      reason: ranked.length > 0 ? 'lexical_match' : 'no_lexical_match',
      degraded: false,
      requiresRerank: ranked.length > 1,
      candidates: ranked.slice(0, RESULT_LIMIT).map(({ document, score }) => ({
        name: document.name,
        description: document.summary,
        score: Number(score.toFixed(4)),
        risk: document.risk,
        declarationAvailable: document.declarationAvailable,
        toolDigest: document.toolDigest,
      })),
    };
  }

  private async ensureDocumentEmbeddings(
    client: EmbeddingAdapter,
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]> {
    signal?.throwIfAborted();
    if (this.documentEmbeddings) return this.documentEmbeddings;
    const cache = this.embeddingCache ?? new EmbeddingCache(client.cacheIdentity ?? client.model);
    const cached = await cache.load(this.index.documents);
    signal?.throwIfAborted();
    const vectors = [...cached.vectors];
    if (cached.missIndexes.length > 0) {
      const generated = await client.embedBatches(
        cached.missIndexes.map((index) => this.index.documents[index]?.embeddingText ?? ''),
        signal,
      );
      signal?.throwIfAborted();
      if (generated.length !== cached.missIndexes.length) {
        throw new Error('Embedding adapter returned an unexpected vector count.');
      }
      validateVectors(
        generated,
        cached.missIndexes.length,
        vectors.find((vector) => vector !== null)?.length,
      );
      cached.missIndexes.forEach((documentIndex, generatedIndex) => {
        vectors[documentIndex] = generated[generatedIndex] ?? null;
      });
      try {
        await cache.save(this.index.documents, vectors);
      } catch {
        this.embeddingCacheWriteFailed = true;
      }
      signal?.throwIfAborted();
    }
    if (vectors.some((vector) => vector === null)) {
      throw new Error('Document embedding set is incomplete.');
    }
    validateVectors(vectors, this.index.documents.length);
    this.documentEmbeddings = vectors;
    this.embeddingCacheHit = cached.missIndexes.length === 0;
    this.embeddingCacheStats = {
      hits: cached.hitCount,
      misses: cached.missIndexes.length,
      ...(this.embeddingCacheWriteFailed ? { writeFailed: true as const } : {}),
    };
    return this.documentEmbeddings;
  }

  private formatHybridResult(
    query: string,
    queryEmbedding: readonly number[],
    documentEmbeddings: readonly (readonly number[])[],
    includeRejectedCandidates: boolean,
  ): SearchResult {
    const { ranked, confidence, queryCoverage, requiresRerank, scoreMargin } = new HybridRanker(
      this.index,
    ).rank(query, queryEmbedding, documentEmbeddings);
    return {
      matched: confidence.matched,
      reason: confidence.reason,
      degraded: false,
      requiresRerank,
      embeddingModel: this.model,
      embeddingCacheHit: this.embeddingCacheHit,
      embeddingCache: this.embeddingCacheStats,
      queryCoverage: Number(queryCoverage.toFixed(4)),
      scoreMargin: Number(scoreMargin.toFixed(4)),
      candidates:
        confidence.matched || includeRejectedCandidates
          ? ranked.slice(0, RESULT_LIMIT).map((result) => this.toCandidate(result))
          : [],
    };
  }

  private toCandidate(result: HybridScore): SearchResult['candidates'][number] {
    return {
      name: result.document.name,
      description: result.document.summary,
      score: Number(result.score.toFixed(4)),
      semanticScore: Number(result.semantic.toFixed(4)),
      lexicalScore: Number(result.lexical.toFixed(4)),
      providerScore: Number(result.provider.toFixed(4)),
      actionEntityScore: Number(result.actionEntity.toFixed(4)),
      schemaScore: Number(result.schema.toFixed(4)),
      scopeScore: Number(result.scope.toFixed(4)),
      exactNameScore: result.exactName,
      risk: result.document.risk,
      declarationAvailable: result.document.declarationAvailable,
      toolDigest: result.document.toolDigest,
    };
  }

  public async hybridMany(
    queries: readonly string[],
    {
      includeRejectedCandidates = false,
      signal,
    }: { readonly includeRejectedCandidates?: boolean; readonly signal?: AbortSignal } = {},
  ): Promise<readonly SearchResult[]> {
    signal?.throwIfAborted();
    if (!this.embeddingClient) return queries.map((query) => this.lexical(query, 'bm25'));
    const client = (await this.embeddingClient.forOperation?.(signal)) ?? this.embeddingClient;
    signal?.throwIfAborted();
    const documentEmbeddings = await this.ensureDocumentEmbeddings(client, signal);
    const queryEmbeddings = await (client.embedQueries?.(queries, signal) ??
      client.embedBatches(queries, signal));
    signal?.throwIfAborted();
    validateVectors(queryEmbeddings, queries.length, documentEmbeddings[0]?.length);
    if (queryEmbeddings.length !== queries.length) {
      throw new Error('Embedding adapter returned an unexpected query vector count.');
    }
    return queries.map((query, index) =>
      this.formatHybridResult(
        query,
        queryEmbeddings[index] ?? [],
        documentEmbeddings,
        includeRejectedCandidates,
      ),
    );
  }

  public async hybrid(
    query: string,
    {
      includeRejectedCandidates = false,
      signal,
    }: { readonly includeRejectedCandidates?: boolean; readonly signal?: AbortSignal } = {},
  ): Promise<SearchResult> {
    try {
      const [result] = await this.hybridMany([query], {
        includeRejectedCandidates,
        ...(signal ? { signal } : {}),
      });
      if (!result) throw new Error('Search did not return a result.');
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      const lexical = this.lexical(query, 'bm25');
      return {
        ...lexical,
        degraded: true,
        reason:
          error instanceof EmbeddingCredentialError
            ? 'embedding_credentials_missing_lexical_fallback'
            : lexical.matched
              ? 'embedding_unavailable_lexical_fallback'
              : 'embedding_unavailable_no_lexical_match',
        embeddingModel: this.model,
        degradedDetail: error instanceof Error ? error.name : 'EmbeddingUnavailable',
      };
    }
  }

  public async search(
    query: string,
    mode: SearchMode,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    signal?.throwIfAborted();
    return mode === 'hybrid'
      ? this.hybrid(query, signal ? { signal } : {})
      : this.lexical(query, mode);
  }

  public async searchForResolution(query: string, mode: SearchMode): Promise<SearchResult> {
    return mode === 'hybrid'
      ? this.hybrid(query, { includeRejectedCandidates: true })
      : this.lexical(query, mode);
  }

  public inspect(name: string, expectedCatalogDigest: string): InspectionResult {
    return this.catalog.inspect(name, expectedCatalogDigest);
  }
}
