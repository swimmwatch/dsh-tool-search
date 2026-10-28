import { randomBytes } from 'node:crypto';

import { ToolCatalog } from '../catalog/tool-catalog.js';
import type { EmbeddingCache } from '../embeddings/definition-vector-cache.js';
import type { EmbeddingAdapter, PolicyProfile, ToolMetadata } from '../shared/types.js';
import { SCHEMA_VERSION } from '../shared/types.js';
import { ToolSearchService } from '../retrieval/tool-search-service.js';
import { ToolSearchError } from '../shared/errors.js';
import { ExpiringLruStore } from './expiring-lru-store.js';

export const CATALOG_TTL_MS = 30 * 60 * 1_000;
export const MAX_ACTIVE_CATALOGS = 32;
export const MAX_CATALOG_TOOLS = 5_000;
export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;

export interface CatalogRegistryDependencies {
  readonly now?: () => number;
  readonly randomHandle?: () => string;
  readonly embeddingClient?: EmbeddingAdapter;
  readonly embeddingCacheFactory?: (model: string) => EmbeddingCache;
}

export interface CatalogSyncResult {
  readonly catalogHandle: string;
  readonly catalogDigest: string;
  readonly catalogSize: number;
  readonly expiresAt: string;
  readonly schemaVersion: typeof SCHEMA_VERSION;
}

export class CatalogSession {
  private readonly services = new Map<PolicyProfile, ToolSearchService>();

  public constructor(
    public readonly handle: string,
    public readonly metadata: readonly ToolMetadata[],
    public readonly digest: string,
    public readonly createdAtMs: number,
    public readonly expiresAtMs: number,
    private readonly embeddingClient?: EmbeddingAdapter,
    private readonly embeddingCacheFactory?: (model: string) => EmbeddingCache,
  ) {}

  public service(policyProfile: PolicyProfile): ToolSearchService {
    const existing = this.services.get(policyProfile);
    if (existing) return existing;
    const model = this.embeddingClient?.model;
    const service = new ToolSearchService(this.metadata, {
      catalogDigest: this.digest,
      policyProfile,
      ...(model ? { model } : {}),
      ...(this.embeddingClient ? { embeddingClient: this.embeddingClient } : {}),
      ...(model && this.embeddingCacheFactory
        ? {
            embeddingCache: this.embeddingCacheFactory(
              this.embeddingClient?.cacheIdentity ?? model,
            ),
          }
        : {}),
    });
    this.services.set(policyProfile, service);
    return service;
  }
}

function defaultRandomHandle(): string {
  return randomBytes(24).toString('base64url');
}

function validateMetadata(metadata: readonly ToolMetadata[]): void {
  if (metadata.length > MAX_CATALOG_TOOLS) {
    throw new ToolSearchError(
      'catalog_too_large',
      `Catalog exceeds the ${MAX_CATALOG_TOOLS} tool limit.`,
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  if (bytes > MAX_CATALOG_BYTES) {
    throw new ToolSearchError(
      'catalog_too_large',
      `Catalog exceeds the ${MAX_CATALOG_BYTES} byte limit.`,
    );
  }
}

export class CatalogRegistry {
  private readonly sessions: ExpiringLruStore<CatalogSession>;
  private readonly embeddingClient: EmbeddingAdapter | undefined;
  private readonly embeddingCacheFactory: ((model: string) => EmbeddingCache) | undefined;

  public constructor(dependencies: CatalogRegistryDependencies = {}) {
    this.embeddingClient = dependencies.embeddingClient;
    this.embeddingCacheFactory = dependencies.embeddingCacheFactory;
    this.sessions = new ExpiringLruStore(
      CATALOG_TTL_MS,
      MAX_ACTIVE_CATALOGS,
      dependencies.now ?? Date.now,
      dependencies.randomHandle ?? defaultRandomHandle,
    );
  }

  public sync(schemaVersion: number, metadata: readonly ToolMetadata[]): CatalogSyncResult {
    if (schemaVersion !== SCHEMA_VERSION) {
      throw new ToolSearchError('invalid_input', `Unsupported schema version: ${schemaVersion}.`);
    }
    validateMetadata(metadata);
    const catalog = new ToolCatalog(metadata, { policyProfile: 'all' });
    const immutableMetadata = metadata.map(({ name, description }) => ({
      name,
      description,
    }));
    const entry = this.sessions.create(
      (handle, createdAtMs, expiresAtMs) =>
        new CatalogSession(
          handle,
          immutableMetadata,
          catalog.digest,
          createdAtMs,
          expiresAtMs,
          this.embeddingClient,
          this.embeddingCacheFactory,
        ),
    );
    return {
      catalogHandle: entry.id,
      catalogDigest: catalog.digest,
      catalogSize: metadata.length,
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
      schemaVersion: SCHEMA_VERSION,
    };
  }

  public get(handle: string): CatalogSession {
    const result = this.sessions.get(handle);
    if (result.status === 'found') return result.value;
    if (result.status === 'expired') {
      throw new ToolSearchError('catalog_expired', 'Catalog handle has expired.');
    }
    throw new ToolSearchError('catalog_not_found', 'Catalog handle was not found.');
  }

  public get size(): number {
    return this.sessions.size;
  }
}
