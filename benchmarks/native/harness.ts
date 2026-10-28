import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { createScope } from '@deepseek-ai/dsh-scope';
import { type ToolDefinition, type ToolExecutionInput, ToolRuntime } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import * as plugin from '../../src/index.js';
import { BASE_TOOLS, DISCOVERY_TOOLS, TOOL_NAMES } from '../../src/constants.js';
import type { CallingAgent, Discovery, SearchInput } from '../../src/types.js';
import type { Config } from '../../src/config.js';

export const NATIVE_FIXTURE = Object.freeze({
  plugin: 'sentinel_list',
  mcp: 'mcp__benchmark__runtime_info',
  records: 390,
  prefix: 'benchmark_record_',
});
const searchSchema = z.object({
  matches: z.array(z.object({ name: z.string(), loaded: z.boolean() })),
  loadedTools: z.array(z.string()),
  evictedTools: z.array(z.string()),
  degraded: z.boolean(),
  maxLoadedTools: z.number(),
});
const unloadSchema = z.object({
  unloadedTools: z.array(z.string()),
  loadedTools: z.array(z.string()),
});

export class NativeBenchmarkHarness {
  readonly ctx = new Context();
  readonly agent = this.newAgent();
  readonly definitions: ToolDefinition[] = [];
  executedTools = 0;
  #sequence = 0;
  #ptcAgents = new WeakSet<CallingAgent>();
  #disableSearch: (() => Promise<void>) | undefined;

  static async create(discovery?: Discovery, config?: Config): Promise<NativeBenchmarkHarness> {
    const harness = new NativeBenchmarkHarness();
    try {
      await harness.ctx.plugin(SystemPrompt);
      await harness.ctx.plugin(ToolRuntime);
      harness.registerFixtures();
      const fiber =
        discovery || config
          ? await harness.ctx.plugin({
              name: 'benchmark-native-search',
              inject: plugin.inject,
              apply: (ctx: Context) =>
                new plugin.NativeToolSearch(ctx, discovery, config).install(),
            })
          : await harness.ctx.plugin(plugin);
      harness.#disableSearch = () => fiber.dispose();
      return harness;
    } catch (error) {
      await harness.close();
      throw error;
    }
  }

  newAgent(): CallingAgent {
    return {} as CallingAgent;
  }

  async enablePtc(agent = this.agent, parent?: CallingAgent) {
    if (!this.ctx.get('ptcRuntime'))
      this.ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' });
    const scope = createScope(this.ctx, agent, parent === undefined ? {} : { parent });
    const binding: { tools?: ToolRuntime } = {};
    await scope.ctx.inject(['tools'], (ctx) => {
      ctx.tools.presentAs('ptc');
      binding.tools = ctx.tools;
    });
    assert.ok(binding.tools);
    this.#ptcAgents.add(agent);
    return binding.tools;
  }

  private register(name: string, description: string): void {
    const definition: ToolDefinition = {
      name,
      description,
      parameters: { type: 'object', additionalProperties: false },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: () => {
        this.executedTools++;
        return Promise.resolve(name);
      },
    };
    this.definitions.push(definition);
    this.ctx.tools.register(definition);
  }

  private registerFixtures(): void {
    for (const name of BASE_TOOLS)
      if (!DISCOVERY_TOOLS.has(name)) this.register(name, `Standard DSH ${name} capability.`);
    this.register(NATIVE_FIXTURE.plugin, 'List sentinel watches and their health probes.');
    this.register(NATIVE_FIXTURE.mcp, 'Read runtime version and serving build identity.');
    for (let i = 0; i < NATIVE_FIXTURE.records; i++)
      this.register(`${NATIVE_FIXTURE.prefix}${i}`, `Read fixture record ${i}.`);
    this.ctx.systemPrompt.section({
      name: 'mcp:benchmark',
      order: 100,
      text: 'Benchmark MCP instructions.',
    });
  }

  async call(
    name: string,
    args: unknown = {},
    agent = this.agent,
    nested = false,
    signal = new AbortController().signal,
  ) {
    return this.ctx.tools.execute({
      callId: `benchmark-${++this.#sequence}` as ToolExecutionInput['callId'],
      name,
      arguments: args,
      agent,
      ...(nested ? { parent: {} as NonNullable<ToolExecutionInput['parent']> } : {}),
      signal,
    });
  }

  async search(query: string, agent = this.agent, mode: SearchInput['mode'] = 'bm25') {
    const result = await this.call(
      TOOL_NAMES.search,
      { query, limit: 1, mode },
      agent,
      this.#ptcAgents.has(agent),
    );
    assert.ok(!result.isError, result.error?.message);
    return searchSchema.parse(result.value);
  }

  async unload(agent = this.agent) {
    const result = await this.call(TOOL_NAMES.unload, {}, agent, this.#ptcAgents.has(agent));
    assert.ok(!result.isError, result.error?.message);
    return unloadSchema.parse(result.value);
  }

  assemble(agent = this.agent) {
    return this.ctx.systemPrompt.assemble({ scope: agent, agent });
  }
  async disableSearch(): Promise<void> {
    await this.#disableSearch?.();
  }
  async close(): Promise<void> {
    await this.ctx.fiber.dispose();
  }
}
