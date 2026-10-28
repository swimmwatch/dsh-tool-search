import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type {
  ToolDefinition,
  ToolExecutionInput,
  ToolExecutionResult,
} from '@deepseek-ai/dsh-tools';
import type {
  CallingAgent,
  CatalogTool,
  Discovery,
  DiscoveryResult,
  SearchInput,
  SearchResponse,
  UnloadResponse,
} from '../src/types.js';
import { SafeDiagnosticLogger } from '../src/core/mcp/safe-diagnostic-logger.js';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { assertSupportedJsonSchema, ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';
import * as plugin from '../src/index.js';
import { BASE_TOOLS, MAX_LOADED, NativeToolSearch } from '../src/index.js';
import { ToolDiscovery, validateSearch } from '../src/discovery.js';
import { DESCRIPTIONS, DISCOVERY_GUIDANCE } from '../src/messages.js';
import { DEFAULT_LIMIT, MAX_QUERY_LENGTH, MAX_RESULTS, SEARCH_MODES } from '../src/constants.js';
import { ToolSearchController } from '../src/core/mcp/tool-search-controller.js';
import { Config } from '../src/config.js';
import { OllamaEmbeddingClient } from '../src/core/embeddings/ollama-embedding-provider.js';

const REMOTE = 'mcp__example__runtime_info';
const SPECIAL = 'sentinel_list';
let counter = 0;
const fakeAgent = () => ({}) as CallingAgent;
function required<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}
function definition(
  name: string,
  description = name,
  execute: () => Promise<string> = async () => name,
): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: 'object', additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
      ],
    },
    execute,
  };
}

async function harness(t: TestContext, discovery?: Discovery, config?: Config) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  t.after(() => ctx.fiber.dispose());
  const definitions = new Map<string, ToolDefinition>();
  const disposers = new Map<string, () => void>();
  const register = (def: ToolDefinition) => {
    definitions.set(def.name, def);
    disposers.set(def.name, ctx.tools.register(def));
  };
  for (const name of BASE_TOOLS.filter(
    (name) => !['tool_search', 'tool_unload', 'structured_output'].includes(name),
  ))
    register(definition(name));
  register(definition(REMOTE, 'Report runtime version and identity status'));
  register(definition(SPECIAL, 'List background sentinel watches'));
  register(definition('web_search', 'Search the web'));
  register(definition('present', 'Present an artifact'));
  for (let i = 0; i < 20; i++)
    register(definition(`plugin_capability_${i}`, `Specialized capability ${i}`));
  ctx.systemPrompt.section({
    name: 'mcp:example',
    order: 100,
    text: 'Example server instructions',
  });
  ctx.systemPrompt.section({
    name: 'retain:plugin',
    order: 101,
    text: 'Keep unrelated instructions',
  });
  ctx.systemPrompt.context({ name: 'retain:cwd', order: 100, text: '/workspace' });
  const fiber =
    discovery || config
      ? await ctx.plugin({
          name: 'test-tool-search',
          inject: plugin.inject,
          apply: (scoped: Context) => new NativeToolSearch(scoped, discovery, config).install(),
        })
      : await ctx.plugin(plugin);
  return {
    ctx,
    fiber,
    definitions,
    replace(name: string, def: ToolDefinition) {
      required(disposers.get(name))();
      register(def);
    },
    remove(name: string) {
      required(disposers.get(name))();
      definitions.delete(name);
    },
    register,
    call(
      name: string,
      args: unknown = {},
      agent = fakeAgent(),
      signal = new AbortController().signal,
    ) {
      return ctx.tools.execute({
        callId: `test-${++counter}` as ToolExecutionInput['callId'],
        name,
        arguments: args,
        agent,
        signal,
      });
    },
    assemble: (agent: CallingAgent) => ctx.systemPrompt.assemble({ scope: agent, agent }),
  };
}

function successful<T = SearchResponse>(result: ToolExecutionResult): T {
  assert.equal(result.isError, false, result.error?.message);
  return result.value as T;
}

await test('shortened MCP discovery loads the original schema independently for parent and child', async (t) => {
  const h = await harness(t);
  const submit = 'mcp__engineer-agent-workflow-mcp__specification_rev_137a4fd2cdf2';
  const record = 'mcp__engineer-agent-workflow-mcp__specification_rev_c67389d37a7e';
  const parameters = {
    type: 'object',
    properties: { group_ref: { type: 'string' }, source_version: { type: 'string' } },
    required: ['group_ref', 'source_version'],
  };
  h.register({ ...definition(submit, 'Save assigned verdicts.'), parameters });
  h.register(definition(record, 'Record review verdicts in a batch.'));
  const parent = fakeAgent();
  const child = fakeAgent();
  const result = successful(
    await h.call(
      'tool_search',
      {
        query: 'specification_review_submit_batch',
        mode: 'hybrid',
        limit: 1,
      },
      parent,
    ),
  );
  assert.equal(result.matches[0]?.name, submit);
  assert.deepEqual(
    (await h.assemble(parent)).tools.find((tool) => tool.name === submit)?.parameters,
    parameters,
  );
  assert.ok(!(await h.assemble(child)).tools.some((tool) => tool.name === submit));
  const childResult = successful(
    await h.call(
      'tool_search',
      {
        query: 'specification_review_submit_batch',
        mode: 'bm25',
        limit: 1,
      },
      child,
    ),
  );
  assert.equal(childResult.matches[0]?.name, submit);
  successful<UnloadResponse>(await h.call('tool_unload', {}, parent));
  assert.ok(!(await h.assemble(parent)).tools.some((tool) => tool.name === submit));
  assert.ok((await h.assemble(child)).tools.some((tool) => tool.name === submit));
});

await test('descriptions and validation share the same query and result limits', () => {
  assert.ok(DESCRIPTIONS.query.includes(String(MAX_QUERY_LENGTH)));
  assert.ok(DESCRIPTIONS.limit.includes(String(MAX_RESULTS)));
  assert.ok(DISCOVERY_GUIDANCE.includes(String(MAX_LOADED)));
  assert.deepEqual(validateSearch({ query: '  workflow  ' }), {
    query: 'workflow',
    limit: DEFAULT_LIMIT,
    mode: 'hybrid',
  });
  for (const mode of SEARCH_MODES) assert.equal(validateSearch({ query: '', mode }).mode, mode);
  assert.throws(() => validateSearch({ query: 'x'.repeat(MAX_QUERY_LENGTH + 1) }));
});

await test('exact names and empty inventory never request embeddings', async (t) => {
  let requests = 0;
  const discovery = new ToolDiscovery({
    embeddingClient: {
      model: 'test-must-not-embed',
      async embedBatches() {
        requests++;
        throw new Error('Unexpected embeddings');
      },
    },
  });
  const h = await harness(t, discovery),
    agent = fakeAgent();
  successful(await h.call('tool_search', { query: '' }, agent));
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  assert.equal(requests, 0);
});

await test('native exact-name searches select only the requested tool in every mode and a large catalog', async (t) => {
  let requests = 0;
  const discovery = new ToolDiscovery({
    embeddingClient: {
      model: 'test-exact-no-embeddings',
      async embedBatches() {
        requests++;
        throw new Error('Exact names must not request embeddings');
      },
    },
  });
  const h = await harness(t, discovery);
  const agent = fakeAgent();
  const names = ['workflow', SPECIAL, REMOTE];
  for (const name of names) {
    for (let index = 0; index < 150; index++)
      h.register(definition(`a_${name}_${index}`, `Use ${name}`));
  }
  for (const mode of SEARCH_MODES) {
    for (const name of names) {
      successful(await h.call('tool_unload', {}, agent));
      const result = successful(
        await h.call('tool_search', { query: name, mode, limit: 1 }, agent),
      );
      assert.deepEqual(
        result.matches.map((tool) => tool.name),
        [name],
      );
      assert.deepEqual(result.loadedTools, name === 'workflow' ? [] : [name]);
      assert.equal(result.degraded, false);
      const assembly = await h.assemble(agent);
      assert.deepEqual(
        assembly.tools.find((tool) => tool.name === name),
        h.ctx.tools.schemas(agent).find((tool) => tool.name === name),
      );
      assert.ok(!assembly.tools.some((tool) => tool.name.startsWith('a_')));
      successful(await h.call(name, {}, agent));
    }
  }
  assert.equal(requests, 0);
});

await test('native hybrid search falls back through the real Ollama HTTP client on service failure', async (t) => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'tool-search-http-fallback-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(503);
    response.end('Embedding service unavailable');
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const discovery = new ToolDiscovery({
    cacheRoot,
    embeddingClient: new OllamaEmbeddingClient({
      url: `http://127.0.0.1:${address.port}/api/embed`,
      timeoutMs: 1000,
    }),
  });
  const h = await harness(t, discovery);
  const agent = fakeAgent();
  for (const query of ['runtime version identity', 'zzzznonexistent987987']) {
    const result = successful(await h.call('tool_search', { query, limit: 1 }, agent));
    assert.equal(result.degraded, true);
    assert.equal(result.mode, 'hybrid');
    assert.equal(
      result.reason,
      query.startsWith('runtime')
        ? 'embedding_unavailable_lexical_fallback'
        : 'embedding_unavailable_no_lexical_match',
    );
    assert.deepEqual(
      result.matches.map((tool) => tool.name),
      query.startsWith('runtime') ? [REMOTE] : [],
    );
    if (query.startsWith('runtime')) {
      successful(await h.call(REMOTE, {}, agent));
      successful(await h.call('tool_unload', {}, agent));
    }
    assert.deepEqual(successful(await h.call('tool_search', { query: '' }, agent)).loadedTools, []);
  }
  assert.equal(requests, 2);
});

await test('explicit references load original native, plugin and MCP schemas with limit one', async (t) => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'tool-search-explicit-reference-'));
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));
  const discovery = new ToolDiscovery({
    cacheRoot,
    embeddingClient: {
      model: 'explicit-reference-offline',
      embedBatches: async () => {
        throw new Error('Offline');
      },
    },
  });
  const h = await harness(t, discovery);
  const agent = fakeAgent();
  let executions = 0;
  for (const name of ['workflow', SPECIAL, REMOTE]) {
    h.replace(
      name,
      definition(name, 'Execute selected operation.', async () => {
        executions++;
        return name;
      }),
    );
    const before = h.ctx.tools.schemas(agent).find((tool) => tool.name === name);
    for (let i = 0; i < 400; i++)
      h.register(definition(`a_${name}_${i}`, `${name} ${name} task_id task_id`));
    for (const mode of ['bm25', 'hybrid']) {
      const result = successful(
        await h.call(
          'tool_search',
          {
            query: `Call \`${name}\` with task_id`,
            limit: 1,
            mode,
          },
          agent,
        ),
      );
      assert.deepEqual(
        result.matches.map((match) => match.name),
        [name],
      );
      assert.equal(result.degraded, mode === 'hybrid');
      assert.equal(executions, 0);
      assert.deepEqual(
        (await h.assemble(agent)).tools.find((tool) => tool.name === name),
        before,
      );
      assert.deepEqual(result.loadedTools, name === 'workflow' ? [] : [name]);
      successful(await h.call('tool_unload', {}, agent));
    }
    for (let i = 0; i < 400; i++) h.remove(`a_${name}_${i}`);
  }
});

await test('partial unload ignores duplicate and base names and preserves other activations', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  for (const query of [SPECIAL, REMOTE]) successful(await h.call('tool_search', { query }, agent));
  const result = successful<UnloadResponse>(
    await h.call('tool_unload', { names: [SPECIAL, SPECIAL, 'workflow'] }, agent),
  );
  assert.deepEqual(result.unloadedTools, [SPECIAL]);
  assert.deepEqual(result.loadedTools, [REMOTE]);
  successful(await h.call(REMOTE, {}, agent));
  successful(await h.call('workflow', {}, agent));
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
});

await test('invalid unload does not change loaded state', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  for (const args of [{ names: 'all' }, { names: [42] }, { unexpected: true }]) {
    assert.equal((await h.call('tool_unload', args, agent)).isError, true);
  }
  successful(await h.call(SPECIAL, {}, agent));
});

await test('missing calling agent is rejected without activating a schema', async (t) => {
  const h = await harness(t);
  const result = await h.ctx.tools.execute({
    callId: 'no-agent' as ToolExecutionInput['callId'],
    name: 'tool_search',
    arguments: { query: SPECIAL },
    signal: new AbortController().signal,
  });
  assert.equal(result.isError, true);
  assert.match(required(result.error).message, /calling agent/);
  assert.ok(!(await h.assemble(fakeAgent())).tools.some((tool) => tool.name === SPECIAL));
});

await test('an unload-name conflict leaves no partial search registrations', async (t) => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  ctx.tools.register(definition('tool_unload'));
  const fiber = ctx.plugin(plugin);
  await assert.rejects(fiber.await(), /conflict.*tool_unload/);
  assert.equal(ctx.tools.get('tool_search'), undefined);
});

await test('malformed controller responses fail without exposing tools', async (t) => {
  class MalformedController extends ToolSearchController {
    override syncCatalog() {
      return { content: [], structuredContent: { ok: true } };
    }
  }
  const discovery = new ToolDiscovery({
    controller: new MalformedController({ logger: new SafeDiagnosticLogger(() => undefined) }),
  });
  const h = await harness(t, discovery),
    agent = fakeAgent();
  assert.equal((await h.call('tool_search', { query: SPECIAL }, agent)).isError, true);
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
});

await test('the agreed 39 defaults stay visible and other schemas stay hidden', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  const assembly = await h.assemble(agent);
  assert.equal(BASE_TOOLS.length, 39);
  assert.deepEqual(
    assembly.tools.map((tool) => tool.name).sort(),
    BASE_TOOLS.filter((name) => name !== 'structured_output').sort(),
  );
  for (const name of [
    'schedule_create',
    'schedule_list',
    'schedule_update',
    'schedule_delete',
    'workflow',
    'job_list',
    'job_output',
    'job_kill',
    'subagent',
    'create_goal',
    'todo_write',
  ]) {
    assert.ok(
      assembly.tools.some((tool) => tool.name === name),
      name,
    );
  }
  assert.ok(!assembly.sections.some((section) => section.name === 'mcp:example'));
  assert.ok(assembly.sections.some((section) => section.name === 'retain:plugin'));
  assert.ok(assembly.contexts.some((context) => context.name === 'retain:cwd'));
});

await test('live selection updates prompt visibility and execution without replacing the plugin', async (t) => {
  let selection: readonly string[] = [...BASE_TOOLS];
  const config: Config = { ...Config({}), alwaysAvailableTools: { get: () => selection } };
  const h = await harness(t, undefined, config);
  const agent = fakeAgent();
  const searchDefinition = h.ctx.tools.get('tool_search');
  assert.equal((await h.call('web_search', {}, agent)).isError, true);
  selection = ['read', 'web_search'];
  assert.deepEqual((await h.assemble(agent)).tools.map((tool) => tool.name).sort(), [
    'read',
    'tool_search',
    'tool_unload',
    'web_search',
  ]);
  const guidance = (await h.assemble(agent)).sections.find(
    (section) => section.name === 'local:tool-discovery',
  );
  assert.match(required(guidance).text, /only tools whose schemas appear in the current request/);
  assert.doesNotMatch(required(guidance).text, /standard DSH tools are immediately available/);
  successful(await h.call('web_search', {}, agent));
  assert.equal((await h.call('workflow', {}, agent)).isError, true);
  const inventory = successful(await h.call('tool_search', { query: '' }, agent)).inventory;
  assert.deepEqual(required(inventory).alwaysAvailable.toSorted(), [
    'read',
    'tool_search',
    'tool_unload',
    'web_search',
  ]);
  successful(await h.call('tool_search', { query: 'workflow' }, agent));
  successful(await h.call('workflow', {}, agent));
  selection = [...BASE_TOOLS];
  assert.equal((await h.call('web_search', {}, agent)).isError, true);
  assert.equal(h.ctx.tools.get('tool_search'), searchDefinition);
});

await test('promoted tools release loading slots and demoted tools require discovery again', async (t) => {
  let selection: readonly string[] = [...BASE_TOOLS];
  const config: Config = { ...Config({}), alwaysAvailableTools: { get: () => selection } };
  const h = await harness(t, undefined, config);
  const first = fakeAgent();
  const second = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, first));
  selection = [...BASE_TOOLS, SPECIAL, REMOTE];
  for (const agent of [first, second]) {
    const inventory = successful(await h.call('tool_search', { query: '' }, agent));
    assert.deepEqual(inventory.loadedTools, []);
    successful(await h.call(SPECIAL, {}, agent));
    assert.ok((await h.assemble(agent)).sections.some((section) => section.name === 'mcp:example'));
  }
  selection = [...BASE_TOOLS];
  for (const agent of [first, second]) {
    assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
    assert.ok(
      !(await h.assemble(agent)).sections.some((section) => section.name === 'mcp:example'),
    );
  }
});

await test('identical-schema replacement invalidates cached definitions and requires discovery', async (t) => {
  const h = await harness(t);
  const agent = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  h.replace(SPECIAL, definition(SPECIAL, 'List background sentinel watches'));
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  successful(await h.call(SPECIAL, {}, agent));
});

await test('native search and unload schemas pass the installed DSH validator', async (t) => {
  const h = await harness(t);
  for (const name of ['tool_search', 'tool_unload']) {
    const def = required(h.ctx.tools.get(name));
    assertSupportedJsonSchema(def.parameters);
    assertSupportedJsonSchema(def.output.schema);
  }
});

await test('standard tools are searchable without consuming loading slots', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  const result = successful(await h.call('tool_search', { query: 'working_directory' }, agent));
  assert.deepEqual(
    result.matches.map((tool) => tool.name),
    ['working_directory'],
  );
  assert.deepEqual(result.loadedTools, []);
  successful<UnloadResponse>(await h.call('tool_unload', { names: ['workflow', 'read'] }, agent));
  assert.ok((await h.assemble(agent)).tools.some((tool) => tool.name === 'workflow'));
});

await test('search covers plugin and MCP tools and never executes a discovered tool', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  let calls = 0;
  h.replace(
    SPECIAL,
    definition(SPECIAL, 'List sentinel watches', async () => {
      calls++;
      return 'watches';
    }),
  );
  for (const name of [SPECIAL, REMOTE]) {
    assert.equal((await h.call(name, {}, agent)).isError, true);
    const result = successful(await h.call('tool_search', { query: name, limit: 1 }, agent));
    assert.deepEqual(
      result.matches.map((tool) => tool.name),
      [name],
    );
    assert.equal(result.authorityGranted, false);
    assert.equal(calls, 0);
    assert.ok(!JSON.stringify(result).includes('parameters'));
  }
  const assembly = await h.assemble(agent);
  assert.ok(assembly.sections.some((section) => section.name === 'mcp:example'));
  const expected = h.ctx.tools.schemas(agent).find((tool) => tool.name === REMOTE);
  assert.deepEqual(
    assembly.tools.find((tool) => tool.name === REMOTE),
    expected,
  );
  assert.equal(successful(await h.call(SPECIAL, {}, agent)), 'watches');
  assert.equal(calls, 1);
});

await test('empty inventory is compact and unmatched searches activate nothing', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  const inventory = successful(await h.call('tool_search', { query: '' }, agent));
  assert.deepEqual(inventory.loadedTools, []);
  assert.equal(required(inventory.inventory).mcp, 1);
  assert.ok(!JSON.stringify(inventory).includes('Example server instructions'));
  const absent = successful(
    await h.call('tool_search', { query: 'zzzznonexistent987987', mode: 'bm25' }, agent),
  );
  assert.deepEqual(absent.matches, []);
  assert.deepEqual(absent.loadedTools, []);
});

await test('agent state is isolated and child structured output stays visible', async (t) => {
  const h = await harness(t),
    parent = fakeAgent(),
    child = fakeAgent();
  const parentScope = createScope(h.fiber.ctx, parent);
  const childScope = createScope(h.fiber.ctx, child, { parent });
  t.after(() => childScope.dispose());
  t.after(() => parentScope.dispose());
  childScope.ctx.tools.register(definition('structured_output'));
  successful(await h.call('tool_search', { query: REMOTE }, parent));
  assert.equal((await h.call(REMOTE, {}, child)).isError, true);
  assert.ok((await h.assemble(child)).tools.some((tool) => tool.name === 'structured_output'));
  assert.ok(!(await h.assemble(parent)).tools.some((tool) => tool.name === 'structured_output'));
  successful(await h.call('structured_output', {}, child));
});

await test('scope restrictions and independent permission guards cannot be overridden', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  const scope = createScope(h.fiber.ctx, agent);
  t.after(() => scope.dispose());
  scope.ctx.tools.restrict({ deny: [REMOTE, 'workflow'] });
  const absent = successful(await h.call('tool_search', { query: REMOTE, mode: 'bm25' }, agent));
  assert.ok(absent.matches.every((tool) => tool.name !== REMOTE));
  const assembly = await h.assemble(agent);
  assert.ok(!assembly.tools.some((tool) => [REMOTE, 'workflow'].includes(tool.name)));
  h.ctx.tools.guard((exec) => (exec.name === SPECIAL ? 'Existing read-only policy' : undefined));
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  const denied = await h.call(SPECIAL, {}, agent);
  assert.equal(denied.isError, true);
  assert.match(required(denied.error).message, /Existing read-only policy/);
});

await test('scoped shadowing and restrictions invalidate warm definition caches', async (t) => {
  const h = await harness(t);
  const agent = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  successful(await h.call('tool_search', { query: REMOTE }, agent));
  const scope = createScope(h.fiber.ctx, agent);
  t.after(() => scope.dispose());
  scope.ctx.tools.register(
    definition(SPECIAL, 'List background sentinel watches', async () => 'scoped'),
  );
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  assert.equal(successful<string>(await h.call(SPECIAL, {}, agent)), 'scoped');
  scope.ctx.tools.restrict({ deny: [REMOTE] });
  assert.equal((await h.call(REMOTE, {}, agent)).isError, true);
  assert.ok(!(await h.assemble(agent)).tools.some((tool) => tool.name === REMOTE));
});

await test('16-tool LRU ignores base tools and unload clears server instructions', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  for (let i = 0; i < MAX_LOADED; i++)
    successful(await h.call('tool_search', { query: `plugin_capability_${i}` }, agent));
  successful(await h.call('plugin_capability_0', {}, agent));
  const result = successful(await h.call('tool_search', { query: REMOTE }, agent));
  assert.equal(result.loadedTools.length, MAX_LOADED);
  assert.deepEqual(result.evictedTools, ['plugin_capability_1']);
  assert.ok(result.loadedTools.includes('plugin_capability_0'));
  successful(await h.call('tool_search', { query: 'workflow' }, agent));
  const cleared = successful<UnloadResponse>(await h.call('tool_unload', {}, agent));
  assert.equal(cleared.unloadedTools.length, MAX_LOADED);
  assert.equal(cleared.loadedTools.length, 0);
  assert.ok(!(await h.assemble(agent)).sections.some((section) => section.name === 'mcp:example'));
  successful(await h.call('workflow', {}, agent));
});

await test('tool replacement, mutation and removal invalidate a previous activation', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  h.replace(SPECIAL, definition(SPECIAL, 'Replacement with the same schema name'));
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  Object.defineProperty(required(h.definitions.get(SPECIAL)), 'description', {
    value: 'Mutated definition',
    configurable: true,
  });
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  h.remove(SPECIAL);
  assert.ok(!(await h.assemble(agent)).tools.some((tool) => tool.name === SPECIAL));
});

await test('parameter and output schema mutations invalidate previously loaded tools', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  const current = required(h.definitions.get(SPECIAL));
  Object.defineProperty(current, 'parameters', {
    value: {
      type: 'object',
      additionalProperties: false,
      properties: { scope: { type: 'string' } },
    },
    configurable: true,
  });
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  Object.defineProperty(current, 'output', {
    value: { ...current.output, schema: { type: 'string', enum: [SPECIAL] } },
    configurable: true,
  });
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  successful(await h.call('tool_search', { query: SPECIAL }, agent));
  successful(await h.call(SPECIAL, {}, agent));
});

function controlledDiscovery() {
  let finish: () => void = () => {
    throw new Error('Search not started');
  };
  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let signal: AbortSignal | undefined;
  return {
    ready,
    signal: () => signal,
    finish: () => finish(),
    async search(
      _agent: object,
      tools: readonly CatalogTool[],
      _input: SearchInput,
      searchSignal?: AbortSignal,
    ): Promise<DiscoveryResult> {
      signal = searchSignal;
      await new Promise<void>((resolve) => {
        finish = resolve;
        started();
      });
      return {
        matches: [required(tools.find((tool) => tool.name === SPECIAL))],
        mode: 'bm25',
        degraded: false,
        authorityGranted: false,
      };
    },
  };
}

await test('cancellation during discovery cannot activate tools', async (t) => {
  const discovery = controlledDiscovery(),
    h = await harness(t, discovery),
    agent = fakeAgent(),
    abort = new AbortController();
  const pending = h.call('tool_search', { query: SPECIAL }, agent, abort.signal);
  await discovery.ready;
  abort.abort();
  assert.equal(discovery.signal()?.aborted, true);
  discovery.finish();
  assert.equal((await pending).isError, true);
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
});

await test('catalog change during asynchronous discovery prevents activation', async (t) => {
  const discovery = controlledDiscovery(),
    h = await harness(t, discovery),
    agent = fakeAgent();
  const pending = h.call('tool_search', { query: SPECIAL }, agent);
  await discovery.ready;
  h.replace(SPECIAL, definition(SPECIAL, 'Changed during search'));
  discovery.finish();
  const result = await pending;
  assert.equal(result.isError, true);
  assert.match(required(result.error).message, /catalog changed/i);
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
});

await test('unloading the plugin removes tools, guidance, filters and guards', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
  await h.fiber.dispose();
  assert.equal(h.ctx.tools.get('tool_search'), undefined);
  assert.equal(h.ctx.tools.get('tool_unload'), undefined);
  successful(await h.call(SPECIAL, {}, agent));
  const assembly = await h.assemble(agent);
  assert.ok(assembly.tools.some((tool) => tool.name === REMOTE));
  assert.ok(!assembly.sections.some((section) => section.name === 'local:tool-discovery'));
});

await test('disposal during a pending search cannot re-activate plugin state', async (t) => {
  const discovery = controlledDiscovery(),
    h = await harness(t, discovery),
    agent = fakeAgent();
  const pending = h.call('tool_search', { query: SPECIAL }, agent);
  await discovery.ready;
  await h.fiber.dispose();
  assert.equal(discovery.signal()?.aborted, true);
  discovery.finish();
  const result = await pending;
  assert.equal(result.isError, true);
  assert.match(required(result.error).message, /disposed/);
  assert.equal(h.ctx.tools.get('tool_search'), undefined);
});

await test('duplicate discovery tools fail clearly without damaging the first plugin', async (t) => {
  const h = await harness(t);
  const duplicate = h.ctx.plugin({
    name: 'duplicate-search',
    inject: plugin.inject,
    apply: (ctx) => new NativeToolSearch(ctx).install(),
  });
  await assert.rejects(duplicate.await(), /conflict.*tool_search/);
  assert.ok(h.ctx.tools.get('tool_search'));
  assert.ok(h.ctx.tools.get('tool_unload'));
});

await test('invalid search inputs do not activate tools', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  for (const args of [
    { query: SPECIAL, limit: 0 },
    { query: SPECIAL, limit: 1.5 },
    { query: SPECIAL, limit: 6 },
    { query: 'x'.repeat(501) },
    { query: SPECIAL, mode: 'unknown' },
  ]) {
    assert.equal((await h.call('tool_search', args, agent)).isError, true);
  }
  assert.equal((await h.call(SPECIAL, {}, agent)).isError, true);
});

await test('native prompt filters cannot retain instructions for a hidden MCP tool', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  successful(await h.call('tool_search', { query: REMOTE }, agent));
  h.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next();
    return { ...assembly, tools: assembly.tools.filter((tool) => tool.name !== REMOTE) };
  });
  const assembly = await h.assemble(agent);
  assert.ok(!assembly.tools.some((tool) => tool.name === REMOTE));
  assert.ok(!assembly.sections.some((section) => section.name === 'mcp:example'));
  assert.ok(assembly.sections.some((section) => section.name === 'retain:plugin'));
});

await test('PTC keeps discovery and exposes only loaded capabilities in its SDK', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  h.ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' });
  const scope = createScope(h.fiber.ctx, agent);
  t.after(() => scope.dispose());
  scope.ctx.tools.presentAs('ptc');
  const sdk = async (caller = agent) => {
    const prompt = await h.assemble(caller);
    assert.deepEqual(
      prompt.tools.map((tool) => tool.name),
      ['run_code'],
    );
    return required(prompt.sections.find((section) => section.name === 'tools:sdk')).text;
  };
  const nestedCall = (name: string, args: unknown = {}, caller = agent) =>
    h.ctx.tools.execute({
      callId: `test-${++counter}` as ToolExecutionInput['callId'],
      name,
      arguments: args,
      agent: caller,
      parent: {} as NonNullable<ToolExecutionInput['parent']>,
      signal: new AbortController().signal,
    });
  const initial = await sdk();
  assert.ok(initial.includes('tool_search:'));
  assert.ok(initial.includes('tool_unload:'));
  assert.ok(initial.includes('read:'));
  assert.ok(!initial.includes(REMOTE));
  assert.ok(!initial.includes(SPECIAL));
  assert.ok(!initial.includes('plugin_capability_'));
  assert.equal((await nestedCall(REMOTE)).isError, true);
  successful(await nestedCall('tool_search', { query: REMOTE, limit: 1 }));
  assert.ok((await sdk()).includes(REMOTE));
  assert.equal((await nestedCall(REMOTE)).isError, false);
  const loaded = await h.assemble(agent);
  assert.ok(loaded.sections.some((section) => section.name === 'mcp:example'));
  assert.ok(
    required(
      loaded.sections.find((section) => section.name === 'local:tool-discovery'),
    ).text.includes('await tools.tool_search'),
  );
  const child = fakeAgent();
  const childScope = createScope(scope.ctx, child, { parent: agent });
  t.after(() => childScope.dispose());
  assert.ok(!(await sdk(child)).includes(REMOTE));
  assert.equal((await nestedCall(REMOTE, {}, child)).isError, true);
  successful(await nestedCall('tool_search', { query: SPECIAL, limit: 1 }, child));
  assert.ok((await sdk(child)).includes(SPECIAL));
  assert.ok(!(await sdk()).includes(SPECIAL));
  scope.ctx.tools.guard((exec) => (exec.name === REMOTE ? 'Existing read-only policy' : undefined));
  assert.equal((await nestedCall(REMOTE)).isError, true);
  successful(await nestedCall('tool_unload'));
  assert.ok(!(await sdk()).includes(REMOTE));
  const unloaded = await h.assemble(agent);
  assert.ok(!unloaded.sections.some((section) => section.name === 'mcp:example'));
  assert.ok(unloaded.sections.some((section) => section.name === 'retain:plugin'));
  assert.ok((await sdk(child)).includes(SPECIAL));
  const native = fakeAgent();
  const nativePrompt = await h.assemble(native);
  assert.ok(nativePrompt.tools.some((tool) => tool.name === 'tool_search'));
  assert.ok(!nativePrompt.tools.some((tool) => tool.name === REMOTE));
  assert.ok(!nativePrompt.tools.some((tool) => tool.name === 'run_code'));
  successful(await h.call('tool_search', { query: REMOTE }, native));
  assert.equal((await h.call(REMOTE, {}, native)).isError, false);
});

await test('PTC applies the loading limit and invalidates replaced declarations', async (t) => {
  const h = await harness(t),
    agent = fakeAgent();
  h.ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' });
  const scope = createScope(h.fiber.ctx, agent);
  t.after(() => scope.dispose());
  scope.ctx.tools.presentAs('ptc');
  const call = (name: string, args: unknown) =>
    h.ctx.tools.execute({
      callId: `test-${++counter}` as ToolExecutionInput['callId'],
      name,
      arguments: args,
      agent,
      parent: {} as NonNullable<ToolExecutionInput['parent']>,
      signal: new AbortController().signal,
    });
  for (let i = 0; i <= MAX_LOADED; i++) {
    successful(await call('tool_search', { query: `plugin_capability_${i}`, limit: 1 }));
  }
  let prompt = await h.assemble(agent);
  let sdk = required(prompt.sections.find((section) => section.name === 'tools:sdk')).text;
  assert.ok(!sdk.includes('plugin_capability_0:'));
  assert.ok(sdk.includes(`plugin_capability_${MAX_LOADED}:`));
  assert.equal((await call('plugin_capability_0', {})).isError, true);
  h.replace(
    `plugin_capability_${MAX_LOADED}`,
    definition(`plugin_capability_${MAX_LOADED}`, 'Replacement capability'),
  );
  prompt = await h.assemble(agent);
  sdk = required(prompt.sections.find((section) => section.name === 'tools:sdk')).text;
  assert.ok(!sdk.includes(`plugin_capability_${MAX_LOADED}:`));
  successful(await call('tool_search', { query: `plugin_capability_${MAX_LOADED}`, limit: 1 }));
  prompt = await h.assemble(agent);
  sdk = required(prompt.sections.find((section) => section.name === 'tools:sdk')).text;
  assert.ok(sdk.includes('Replacement capability'));
  successful(await call('tool_unload', {}));
  prompt = await h.assemble(agent);
  sdk = required(prompt.sections.find((section) => section.name === 'tools:sdk')).text;
  assert.ok(!sdk.includes('plugin_capability_'));
});

await test('the reused hybrid engine falls back to BM25 if local embeddings fail', async (t) => {
  const discovery = new ToolDiscovery({
    embeddingClient: {
      model: 'test-unavailable',
      async embedBatches() {
        throw new Error('Unavailable');
      },
    },
  });
  const h = await harness(t, discovery),
    agent = fakeAgent();
  const result = successful(
    await h.call('tool_search', { query: 'runtime version identity', limit: 1 }, agent),
  );
  assert.deepEqual(
    result.matches.map((tool) => tool.name),
    [REMOTE],
  );
  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'embedding_unavailable_lexical_fallback');
});

await test('receipt verification failure cannot expose a candidate', async (t) => {
  class MismatchedReceiptController extends ToolSearchController {
    override inspectTool(receipt: string, name: string) {
      return super.inspectTool(receipt, name, '0'.repeat(64));
    }
  }
  const discovery = new ToolDiscovery({
    controller: new MismatchedReceiptController({
      logger: new SafeDiagnosticLogger(() => undefined),
    }),
  });
  const h = await harness(t, discovery),
    agent = fakeAgent();
  const failed = await h.call('tool_search', { query: REMOTE }, agent);
  assert.equal(failed.isError, true);
  assert.match(required(failed.error).message, /digest/i);
  assert.equal((await h.call(REMOTE, {}, agent)).isError, true);
});
