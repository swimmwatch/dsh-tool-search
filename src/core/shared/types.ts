export const SCHEMA_VERSION = 1 as const;
export const RESULT_LIMIT = 5;
export const MAX_QUERY_LENGTH = 500;
export const SEARCH_MODES = ['hybrid', 'bm25', 'pattern'] as const;

export type Risk = 'read' | 'write' | 'execution' | 'destructive' | 'unknown';
export type PolicyProfile = 'read-only' | 'mutation' | 'execution' | 'all';
export type SearchMode = (typeof SEARCH_MODES)[number];

export interface ToolMetadata {
  readonly name: string;
  readonly description: string;
}
export interface EmbeddingAdapter {
  readonly model: string;
  readonly cacheIdentity?: string;
  forOperation?(signal?: AbortSignal): Promise<EmbeddingAdapter>;
  embedQueries?(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]>;
  embedBatches(
    inputs: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (readonly number[])[]>;
}

export interface SchemaField {
  readonly name: string;
  readonly optional: boolean;
  readonly type: string;
  readonly description: string;
}

export interface ParsedToolDefinition {
  readonly name: string;
  readonly rawDescription: string;
  readonly description: string;
  readonly declaration: string;
  readonly schemaFields: readonly SchemaField[];
  readonly schemaSearchText: string;
  readonly declarationAvailable: boolean;
  readonly toolDigest: string;
}

export interface CatalogEntry extends ParsedToolDefinition {
  readonly risk: Risk;
}

export interface Candidate {
  readonly name: string;
  readonly description: string;
  readonly score: number;
  readonly semanticScore?: number;
  readonly lexicalScore?: number;
  readonly providerScore?: number;
  readonly actionEntityScore?: number;
  readonly schemaScore?: number;
  readonly scopeScore?: number;
  readonly exactNameScore?: number;
  readonly risk: Risk;
  readonly declarationAvailable: boolean;
  readonly toolDigest: string;
}

export interface SearchResult {
  readonly matched: boolean;
  readonly reason: string;
  readonly degraded: boolean;
  readonly requiresRerank: boolean;
  readonly candidates: readonly Candidate[];
  readonly embeddingModel?: string;
  readonly embeddingCacheHit?: boolean | null;
  readonly embeddingCache?: {
    readonly hits: number;
    readonly misses: number;
    readonly writeFailed?: true;
  } | null;
  readonly degradedDetail?: string;
  readonly queryCoverage?: number;
  readonly scoreMargin?: number;
}

export interface InspectionResult {
  readonly name: string;
  readonly catalogDigest: string;
  readonly toolDigest: string;
  readonly risk: Risk;
  readonly description: string;
  readonly schemaFormat: 'typescript-declaration';
  readonly schemaFields: readonly SchemaField[];
  readonly declaration: string;
  readonly executionRequiresNormalToolPermission: true;
}
