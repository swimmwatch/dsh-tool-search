import assert from 'node:assert/strict';
import { z } from 'zod';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools';
import { ToolDiscovery } from '../../src/discovery.js';
import type { Config } from '../../src/config.js';
import type { CallingAgent, Discovery } from '../../src/types.js';
import type { ContractMode } from './contracts-cases.js';
import { NativeBenchmarkHarness } from './harness.js';

export const resultSchema = z.object({
  mode: z.enum(['hybrid', 'bm25', 'pattern']),
  degraded: z.boolean(),
  authorityGranted: z.literal(false),
  matches: z.array(z.object({ name: z.string(), loaded: z.boolean() })),
  loadedTools: z.array(z.string()),
  evictedTools: z.array(z.string()),
  maxLoadedTools: z.literal(16),
  inventory: z.object({ total: z.number(), alwaysAvailable: z.array(z.string()) }).optional(),
});

export function deferred<T>() {
  let resolvePromise: (value: T) => void = () => {
    throw new Error('Deferred promise has not been initialized');
  };
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

export async function within<T>(promise: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Contract stage timed out: ${stage}`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withHarness(
  mode: ContractMode,
  cacheRoot: string,
  run: (harness: NativeBenchmarkHarness) => Promise<void>,
  options: { discovery?: Discovery; config?: Config } = {},
): Promise<void> {
  const discovery = options.discovery ?? new ToolDiscovery({ embeddingEnabled: false, cacheRoot });
  const harness = await NativeBenchmarkHarness.create(discovery, options.config);
  try {
    if (mode === 'ptc') await harness.enablePtc();
    await run(harness);
  } finally {
    await harness.close();
  }
}

export async function search(
  harness: NativeBenchmarkHarness,
  mode: ContractMode,
  argumentsValue: unknown,
  agent = harness.agent,
  signal?: AbortSignal,
) {
  const result = await harness.call('tool_search', argumentsValue, agent, mode === 'ptc', signal);
  assert.equal(result.isError, false, result.error?.message);
  return resultSchema.parse(result.value);
}

export async function assertVisible(
  harness: NativeBenchmarkHarness,
  mode: ContractMode,
  name: string,
  expected: boolean,
  agent: CallingAgent = harness.agent,
): Promise<void> {
  const assembly = await harness.assemble(agent);
  if (mode === 'native') {
    assert.equal(
      assembly.tools.some((tool) => tool.name === name),
      expected,
      name,
    );
  } else {
    assert.deepEqual(
      assembly.tools.map((tool) => tool.name),
      [RUN_CODE_NAME],
    );
    const sdk = assembly.sections.find((section) => section.name === 'tools:sdk');
    assert.ok(sdk);
    assert.equal(sdk.text.includes(`${name}:`), expected, name);
  }
}

export function fixture(name: string, value = name): ToolDefinition {
  return {
    name,
    description: `Inspect ${name} fixture data.`,
    parameters: { type: 'object', additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    execute: () => Promise.resolve(value),
  };
}
