import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { isFiniteVector } from '../embeddings/vector.js';
export interface DefinitionVectorDocument {
  readonly toolDigest: string;
}

export const EMBEDDING_CACHE_VERSION = 8;

interface CachePayload {
  readonly version: number;
  readonly model: string;
  readonly entries: Readonly<Record<string, readonly number[]>>;
}

export interface CacheLoadResult {
  readonly vectors: readonly (readonly number[] | null)[];
  readonly hitCount: number;
  readonly missIndexes: readonly number[];
}

function safeModelKey(model: string): string {
  return createHash('sha256').update(model).digest('hex');
}

export function defaultEmbeddingCacheRoot(): string {
  return (
    process.env.TOOL_SEARCH_CACHE_ROOT ??
    join(homedir(), '.codex', 'cache', 'tool-search-embeddings')
  );
}

export class EmbeddingCache {
  public readonly path: string;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    public readonly model: string,
    { root = defaultEmbeddingCacheRoot() }: { readonly root?: string } = {},
  ) {
    this.path = join(root, `v${EMBEDDING_CACHE_VERSION}-${safeModelKey(model)}.json`);
  }

  private async readPayload(): Promise<CachePayload | null> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as Partial<CachePayload>;
      if (
        value.version !== EMBEDDING_CACHE_VERSION ||
        value.model !== this.model ||
        !value.entries ||
        typeof value.entries !== 'object'
      ) {
        return null;
      }
      return value as CachePayload;
    } catch {
      return null;
    }
  }

  public async load(documents: readonly DefinitionVectorDocument[]): Promise<CacheLoadResult> {
    await this.writeQueue;
    const payload = await this.readPayload();
    const vectors = documents.map(({ toolDigest }) => {
      const vector = payload?.entries[toolDigest];
      return isFiniteVector(vector) ? vector : null;
    });
    return {
      vectors,
      hitCount: vectors.filter((vector) => vector !== null).length,
      missIndexes: vectors.flatMap((vector, index) => (vector === null ? [index] : [])),
    };
  }

  public async save(
    documents: readonly DefinitionVectorDocument[],
    vectors: readonly (readonly number[] | null)[],
  ): Promise<void> {
    const operation = async (): Promise<void> => {
      const current = await this.readPayload();
      const entries: Record<string, readonly number[]> = {
        ...(current?.entries ?? {}),
      };
      documents.forEach((document, index) => {
        const vector = vectors[index];
        if (isFiniteVector(vector)) entries[document.toolDigest] = vector;
      });
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(
        temporaryPath,
        `${JSON.stringify({
          version: EMBEDDING_CACHE_VERSION,
          model: this.model,
          entries,
        })}\n`,
        { mode: 0o600 },
      );
      await rename(temporaryPath, this.path);
    };
    const queued = this.writeQueue.then(operation, operation);
    this.writeQueue = queued.catch(() => undefined);
    await queued;
  }
}
