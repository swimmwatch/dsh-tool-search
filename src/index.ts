import type { Context } from '@deepseek-ai/cordis';
import {
  renderToolsSdk,
  renderToolsSdkPy,
  RUN_CODE_NAME,
  type ToolDefinition,
  type ToolExecution,
} from '@deepseek-ai/dsh-tools';
import type { AssembleContext, PromptAssembly } from '@deepseek-ai/dsh-system-prompt';
import { signatureFor, ToolDiscovery, validateSearch } from './discovery.js';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { availableToolNames, Config, configuredEmbeddings } from './config.js';
import {
  DESCRIPTION_LIMIT,
  DISCOVERY_TOOLS,
  GUIDANCE_SECTION,
  MAX_LOADED,
  MCP_SECTION_PREFIX,
  PLUGIN_NAME,
  TOOL_NAMES,
} from './constants.js';
import {
  conflictMessage,
  DESCRIPTIONS,
  DISCOVERY_GUIDANCE,
  ERRORS,
  PTC_DISCOVERY_GUIDANCE,
} from './messages.js';
import { JSON_OUTPUT, SEARCH_PARAMETERS, UNLOAD_PARAMETERS, unloadInputSchema } from './schemas.js';
import type {
  CallingAgent,
  CallingContext,
  CatalogTool,
  Discovery,
  SearchResponse,
  UnloadResponse,
} from './types.js';

export { BASE_TOOLS, MAX_LOADED } from './constants.js';
export { Config } from './config.js';
export const name = PLUGIN_NAME;
export const inject = ['tools', 'systemPrompt'];

export function serverOf(toolName: string): string | undefined {
  return /^mcp__(.+?)__/.exec(toolName)?.[1];
}

export class NativeToolSearch {
  #states = new WeakMap<CallingAgent, Map<string, CatalogTool>>();
  #definitions = new WeakMap<CallingAgent, Map<string, ToolDefinition>>();
  #globalDefinitions = new Map<string, ToolDefinition>();
  #disposed = false;
  readonly #lifetime = new AbortController();

  readonly #ctx: Context;
  readonly #discovery: Discovery | undefined;
  #configuredDiscovery: { signature: string; discovery: ToolDiscovery } | undefined;
  readonly #config: Config;
  constructor(
    ctx: Context,
    discovery: Discovery | undefined = undefined,
    config: Config = Config({}),
  ) {
    this.#ctx = ctx;
    this.#discovery = discovery;
    this.#config = config;
  }

  #searchDiscovery(): Discovery {
    if (this.#discovery) return this.#discovery;
    const settings = configuredEmbeddings(this.#config);
    const signature = JSON.stringify(settings);
    if (this.#configuredDiscovery?.signature !== signature) {
      // Each search captures its engine; a later model change cannot mix vectors or receipts.
      this.#configuredDiscovery = {
        signature,
        discovery: new ToolDiscovery({
          embeddingSettings: settings,
          resolveApiKey: async () =>
            (await this.#ctx.get('credentials')?.resolve(credentialRef(settings.openaiApiKeyRef)))
              ?.value,
        }),
      };
    }
    return this.#configuredDiscovery.discovery;
  }

  #assertLive(
    agent: CallingAgent | undefined,
    signal?: AbortSignal,
  ): asserts agent is CallingAgent {
    if (this.#disposed) throw new Error(ERRORS.disposed);
    if (!agent || typeof agent !== 'object') throw new Error(ERRORS.agentRequired);
    signal?.throwIfAborted();
  }

  #catalog(agent?: CallingAgent): CatalogTool[] {
    let definitions = agent ? this.#definitions.get(agent) : this.#globalDefinitions;
    if (!definitions) {
      definitions = new Map();
      if (agent) this.#definitions.set(agent, definitions);
    }
    // Registry lookups rebuild the full scope view. Cache identities until tools/change,
    // while re-reading scoped schemas and hashing mutable schema contents on every pass.
    const currentDefinitions = definitions;
    return this.#ctx.tools
      .schemas(agent)
      .filter((tool) => !DISCOVERY_TOOLS.has(tool.name) && tool.name !== RUN_CODE_NAME)
      .map((tool) => {
        let definition = currentDefinitions.get(tool.name);
        if (!definition) {
          definition = this.#ctx.tools.get(tool.name, agent);
          if (definition) currentDefinitions.set(tool.name, definition);
        }
        if (!definition) throw new Error(ERRORS.catalogChanged);
        const entry = { ...tool, definition };
        return { ...entry, signature: signatureFor(entry) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  #state(
    agent: CallingAgent,
    catalog: readonly CatalogTool[],
    baseTools: ReadonlySet<string>,
  ): Map<string, CatalogTool> {
    let loaded = this.#states.get(agent);
    if (!loaded) {
      loaded = new Map();
      this.#states.set(agent, loaded);
    }
    const current = new Map(catalog.map((tool) => [tool.name, tool]));
    for (const [name, entry] of loaded) {
      const tool = current.get(name);
      if (
        baseTools.has(name) ||
        !tool ||
        tool.definition !== entry.definition ||
        tool.signature !== entry.signature
      )
        loaded.delete(name);
    }
    return loaded;
  }

  async search(args: unknown, exec: CallingContext): Promise<SearchResponse> {
    const agent = exec.agent;
    const signal = exec.signal
      ? AbortSignal.any([exec.signal, this.#lifetime.signal])
      : this.#lifetime.signal;
    this.#assertLive(agent, signal);
    const input = validateSearch(args);
    const catalog = this.#catalog(agent);
    const result = await this.#searchDiscovery().search(agent, catalog, input, signal);
    this.#assertLive(agent, signal);
    const current = this.#catalog(agent);
    if (
      current.length !== catalog.length ||
      current.some((tool, i) => {
        const previous = catalog[i];
        return (
          !previous ||
          tool.name !== previous.name ||
          tool.definition !== previous.definition ||
          tool.signature !== previous.signature
        );
      })
    )
      throw new Error(ERRORS.catalogChangedDuringSearch);
    const baseTools = availableToolNames(this.#config);
    const loaded = this.#state(agent, current, baseTools);
    for (const tool of result.matches) {
      if (baseTools.has(tool.name)) continue;
      loaded.delete(tool.name);
      loaded.set(tool.name, tool);
    }
    const evictedTools: string[] = [];
    while (loaded.size > MAX_LOADED) {
      const oldest = loaded.keys().next().value;
      if (oldest === undefined) break;
      loaded.delete(oldest);
      evictedTools.push(oldest);
    }
    return {
      mode: result.mode,
      degraded: result.degraded,
      authorityGranted: false,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
      matches: result.matches.map((tool) => ({
        name: tool.name,
        description: tool.description.slice(0, DESCRIPTION_LIMIT),
        loaded: true,
      })),
      loadedTools: [...loaded.keys()],
      evictedTools,
      maxLoadedTools: MAX_LOADED,
      ...(input.query
        ? {}
        : {
            inventory: {
              total: current.length,
              harness: current.filter((tool) => !serverOf(tool.name)).length,
              mcp: current.filter((tool) => serverOf(tool.name)).length,
              alwaysAvailable: this.#ctx.tools
                .schemas(agent)
                .filter((tool) => baseTools.has(tool.name))
                .map((tool) => tool.name),
            },
          }),
    };
  }

  unload(args: unknown, exec: CallingContext): UnloadResponse {
    const agent = exec.agent;
    this.#assertLive(agent, exec.signal);
    const { names } = unloadInputSchema.parse(args);
    const loaded = this.#state(agent, this.#catalog(agent), availableToolNames(this.#config));
    const selected = names === undefined ? [...loaded.keys()] : [...new Set(names)];
    return {
      unloadedTools: selected.filter((name) => loaded.delete(name)),
      loadedTools: [...loaded.keys()],
      authorityGranted: false,
    };
  }

  #filterPrompt(assembled: PromptAssembly, context: AssembleContext): PromptAssembly {
    const catalog = this.#catalog(context.agent);
    const baseTools = availableToolNames(this.#config);
    const loaded = context.agent
      ? this.#state(context.agent, catalog, baseTools)
      : new Map<string, CatalogTool>();
    const visible = new Set([...baseTools, ...loaded.keys()]);
    const ptc = this.#ctx.tools.get(RUN_CODE_NAME, context.scope) !== undefined;
    const tools = assembled.tools.filter(
      (tool) => visible.has(tool.name) || (ptc && tool.name === RUN_CODE_NAME),
    );
    const capabilities = ptc
      ? this.#ctx.tools.schemas(context.scope).filter((tool) => visible.has(tool.name))
      : tools;
    const servers = new Set(
      capabilities.map((tool) => serverOf(tool.name)).filter((server) => server !== undefined),
    );
    let sdk: string | undefined;
    if (ptc) {
      const schemas: Parameters<typeof renderToolsSdk>[0] = capabilities.map((tool) => {
        const definition = this.#ctx.tools.get(tool.name, context.scope);
        if (!definition) throw new Error(ERRORS.catalogChanged);
        return { ...tool, output: structuredClone(definition.output.schema) };
      });
      const runtime = this.#ctx.get('ptcRuntime');
      sdk =
        runtime?.language === 'python'
          ? renderToolsSdkPy(schemas)
          : renderToolsSdk(schemas, runtime?.programFormat);
    }
    return {
      ...assembled,
      tools,
      sections: assembled.sections
        .filter(
          (section) =>
            !section.name.startsWith(MCP_SECTION_PREFIX) ||
            servers.has(section.name.slice(MCP_SECTION_PREFIX.length)),
        )
        .map((section) => {
          if (ptc && section.name === 'tools:sdk') return { ...section, text: sdk ?? '' };
          if (ptc && section.name === GUIDANCE_SECTION)
            return { ...section, text: PTC_DISCOVERY_GUIDANCE };
          return section;
        }),
    };
  }

  #guard(exec: ToolExecution): string | undefined {
    if (exec.name === RUN_CODE_NAME && this.#ctx.tools.get(RUN_CODE_NAME, exec.agent)) return;
    const baseTools = availableToolNames(this.#config);
    if (!exec.agent || baseTools.has(exec.name)) return;
    if (this.#disposed) return ERRORS.disposed;
    const loaded = this.#state(exec.agent, this.#catalog(exec.agent), baseTools);
    const entry = loaded.get(exec.name);
    if (!entry) return ERRORS.notLoaded;
    loaded.delete(exec.name);
    loaded.set(exec.name, entry);
  }

  install(): () => Promise<void> {
    for (const tool of DISCOVERY_TOOLS) {
      if (this.#ctx.tools.get(tool)) throw new Error(conflictMessage(tool));
    }
    return this.#ctx.effect(() => {
      const disposers: (() => void)[] = [];
      const stop = () => {
        if (this.#disposed) return;
        this.#disposed = true;
        this.#lifetime.abort(new Error(ERRORS.disposed));
        this.#configuredDiscovery = undefined;
        this.#states = new WeakMap();
        this.#definitions = new WeakMap();
        this.#globalDefinitions.clear();
        for (const dispose of disposers.reverse()) dispose();
      };
      try {
        disposers.push(
          this.#ctx.on('tools/change', () => {
            this.#definitions = new WeakMap();
            this.#globalDefinitions.clear();
          }),
        );
        disposers.push(
          this.#ctx.systemPrompt.section({
            name: GUIDANCE_SECTION,
            order: this.#ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
            interpolate: false,
            text: DISCOVERY_GUIDANCE,
          }),
        );
        disposers.push(
          this.#ctx.on(
            'system-prompt/assemble',
            async (_assembly, context, next) => {
              return this.#filterPrompt(await next(), context);
            },
            { prepend: true },
          ),
        );
        disposers.push(this.#ctx.tools.guard((exec) => this.#guard(exec)));
        disposers.push(
          this.#ctx.tools.register({
            name: TOOL_NAMES.search,
            description: DESCRIPTIONS.search,
            parameters: SEARCH_PARAMETERS,
            output: JSON_OUTPUT,
            execute: (args, exec) => this.search(args, exec),
          }),
        );
        disposers.push(
          this.#ctx.tools.register({
            name: TOOL_NAMES.unload,
            description: DESCRIPTIONS.unload,
            parameters: UNLOAD_PARAMETERS,
            output: JSON_OUTPUT,
            execute: (args, exec) => Promise.resolve(this.unload(args, exec)),
          }),
        );
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    });
  }
}

export function apply(ctx: Context, config: Config = Config({})): () => Promise<void> {
  return new NativeToolSearch(ctx, undefined, config).install();
}
