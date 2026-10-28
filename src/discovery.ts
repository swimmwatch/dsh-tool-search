import { createHash } from 'node:crypto';
import { jsonSchemaToTs } from '@deepseek-ai/dsh-tools';
import { dshCachePath } from '@deepseek-ai/dsh-home-paths';
import { z } from 'zod';
import { ToolSearchController } from './core/mcp/tool-search-controller.js';
import { CatalogRegistry } from './core/sessions/catalog-registry.js';
import { EmbeddingCache } from './core/embeddings/definition-vector-cache.js';
import { createEmbeddingProvider } from './embedding-provider.js';
import { type EmbeddingSettings, OPENAI_DEFAULTS } from './embedding-settings.js';
import { SafeDiagnosticLogger } from './core/mcp/safe-diagnostic-logger.js';
import { type EmbeddingAdapter, SCHEMA_VERSION, type ToolMetadata } from './core/shared/types.js';
import type { ToolCallResponse } from './core/mcp/tool-call-response.js';
import { EMBEDDING, PLUGIN_NAME } from './constants.js';
import { searchInputSchema } from './schemas.js';
import { exactToolNames } from './mcp-names.js';
import type { DiscoveryResult, SearchTool } from './types.js';

const catalogResponseSchema = z.object({ catalogHandle: z.string() });
const searchResponseSchema = z.object({
  searchReceipt: z.string(),
  catalogDigest: z.string(),
  degraded: z.boolean(),
  reason: z.string(),
  candidates: z.array(z.object({ name: z.string(), toolDigest: z.string() })),
});
const inspectionResponseSchema = z.object({ name: z.string(), toolDigest: z.string() });
const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export function metadataFor(tool: SearchTool): ToolMetadata {
  const type = jsonSchemaToTs(tool.parameters).replace(/^(\s*)\/\*\* (.*) \*\/$/gm, '$1// $2');
  const declaration =
    'type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };\n' +
    `declare const tools: {\n  ${JSON.stringify(tool.name)}(args: ${type}): Promise<unknown>;\n};`;
  return {
    name: tool.name,
    description: `${tool.description}\nexec tool declaration:\n\x60\x60\x60ts\n${declaration}\n\x60\x60\x60`,
  };
}

export function signatureFor(tool: SearchTool): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        output: tool.definition?.output.schema,
      }),
    )
    .digest('hex');
}

export const validateSearch = (input: unknown) => searchInputSchema.parse(input);

class DiscoveryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function unwrap<S extends z.ZodType>(response: ToolCallResponse, schema: S): z.output<S> {
  const result = response.structuredContent;
  if (response.isError || result.ok !== true) {
    const failure = errorResponseSchema.safeParse(result);
    throw new DiscoveryError(
      failure.success ? failure.data.error.message : 'Tool discovery failed',
      failure.success ? failure.data.error.code : undefined,
    );
  }
  return schema.parse(result);
}

interface DiscoveryOptions {
  readonly embeddingEnabled?: boolean;
  readonly embeddingSettings?: EmbeddingSettings;
  readonly resolveApiKey?: () => Promise<string | undefined>;
  readonly embeddingModel?: string;
  readonly controller?: ToolSearchController;
  readonly embeddingClient?: EmbeddingAdapter;
  readonly cacheRoot?: string;
}
interface CatalogSession {
  readonly catalogHandle: string;
  readonly fingerprint: string;
}

export class ToolDiscovery {
  readonly #embeddingEnabled: boolean;
  readonly #controller: ToolSearchController;
  readonly #sessions = new WeakMap<object, CatalogSession>();

  constructor({
    controller,
    embeddingClient,
    embeddingEnabled = true,
    embeddingSettings,
    resolveApiKey,
    embeddingModel = EMBEDDING.model,
    cacheRoot = dshCachePath(PLUGIN_NAME),
  }: DiscoveryOptions = {}) {
    const settings: EmbeddingSettings = embeddingSettings ?? {
      embeddingEnabled,
      embeddingProvider: 'ollama',
      embeddingModel,
      openaiEmbeddingModel: OPENAI_DEFAULTS.model,
      openaiBaseUrl: OPENAI_DEFAULTS.baseUrl,
      openaiApiKeyRef: OPENAI_DEFAULTS.apiKeyRef,
    };
    this.#embeddingEnabled = settings.embeddingEnabled;
    const client = this.#embeddingEnabled
      ? (embeddingClient ?? createEmbeddingProvider(settings, resolveApiKey))
      : undefined;
    const caches = new Map<string, EmbeddingCache>();
    this.#controller =
      controller ??
      new ToolSearchController({
        catalogs: new CatalogRegistry({
          ...(client ? { embeddingClient: client } : {}),
          embeddingCacheFactory: (model) => {
            let cache = caches.get(model);
            if (!cache) {
              cache = new EmbeddingCache(model, { root: cacheRoot });
              caches.set(model, cache);
            }
            return cache;
          },
        }),
        logger: new SafeDiagnosticLogger(() => {}),
      });
  }

  async search<T extends SearchTool>(
    agent: object,
    tools: readonly T[],
    args: unknown,
    signal?: AbortSignal,
  ): Promise<DiscoveryResult<T>> {
    signal?.throwIfAborted();
    const { query, limit, mode } = validateSearch(args);
    const selectedMode = this.#embeddingEnabled || mode !== 'hybrid' ? mode : 'bm25';
    if (!query)
      return { matches: [], mode: selectedMode, degraded: false, authorityGranted: false };
    const metadata = tools.map(metadataFor);
    const fingerprint = createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
    const sync = (): CatalogSession => {
      const session = {
        ...unwrap(this.#controller.syncCatalog(SCHEMA_VERSION, metadata), catalogResponseSchema),
        fingerprint,
      };
      this.#sessions.set(agent, session);
      return session;
    };
    let session = this.#sessions.get(agent);
    if (session?.fingerprint !== fingerprint) session = sync();
    const exactNames = exactToolNames(tools, query);
    const effectiveMode = exactNames.length > 0 ? 'pattern' : selectedMode;
    const queries = exactNames.length > 0 ? exactNames.slice(0, limit) : [query];
    let degraded = false;
    let reason = 'no_lexical_match';
    const matches: T[] = [];
    for (const searchQuery of queries) {
      let result: z.output<typeof searchResponseSchema>;
      try {
        result = unwrap(
          await this.#controller.searchTools(
            session.catalogHandle,
            searchQuery,
            effectiveMode,
            'all',
            signal,
          ),
          searchResponseSchema,
        );
      } catch (error) {
        if (
          !(error instanceof DiscoveryError) ||
          !['catalog_expired', 'catalog_not_found'].includes(error.code ?? '')
        )
          throw error;
        signal?.throwIfAborted();
        session = sync();
        result = unwrap(
          await this.#controller.searchTools(
            session.catalogHandle,
            searchQuery,
            effectiveMode,
            'all',
            signal,
          ),
          searchResponseSchema,
        );
      }
      signal?.throwIfAborted();
      degraded ||= result.degraded;
      reason = result.reason;
      const candidates =
        exactNames.length > 0
          ? result.candidates.filter((candidate) => candidate.name === searchQuery)
          : result.candidates.slice(0, limit);
      for (const candidate of candidates) {
        const inspected = unwrap(
          this.#controller.inspectTool(result.searchReceipt, candidate.name, result.catalogDigest),
          inspectionResponseSchema,
        );
        const tool = tools.find((tool) => tool.name === inspected.name);
        if (!tool || inspected.toolDigest !== candidate.toolDigest)
          throw new Error('Tool discovery catalog changed');
        matches.push(tool);
      }
    }
    return {
      matches,
      mode: effectiveMode,
      degraded,
      reason: exactNames.length > 0 ? 'exact_name' : reason,
      authorityGranted: false,
    };
  }
}
