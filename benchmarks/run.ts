import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { type BenchmarkReport, type BenchmarkSuite, evaluateChildReport } from './shared/report.js';

const execute = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SUITE_TIMEOUT_MS = 300_000;
interface Suite {
  readonly name: BenchmarkSuite;
  readonly path: string;
  readonly args: readonly string[];
}
interface Result {
  readonly name: string;
  readonly passed: boolean;
  readonly exitCode: number | null;
  readonly elapsedMs: number;
  readonly report: BenchmarkReport | null;
  readonly error?: string;
}
const SUITES: readonly Suite[] = [
  {
    name: 'quality-offline',
    path: 'retrieval/quality-benchmark.ts',
    args: ['--mode=hybrid', '--embedding=deterministic', '--gate=stability'],
  },
  { name: 'metamorphic', path: 'retrieval/metamorphic-benchmark.ts', args: [] },
  { name: 'scale', path: 'performance/scale-benchmark.ts', args: [] },
  { name: 'native', path: 'native/native-benchmark.ts', args: [] },
  { name: 'ptc', path: 'native/ptc-benchmark.ts', args: [] },
  { name: 'retrieval-contracts', path: 'retrieval/contracts-benchmark.ts', args: [] },
  { name: 'native-contracts', path: 'native/contracts-benchmark.ts', args: [] },
];
const LIVE_SUITE: Suite = {
  name: 'quality-ollama',
  path: 'retrieval/quality-benchmark.ts',
  args: ['--mode=hybrid', '--embedding=ollama'],
};
const executionErrorSchema = z.object({
  stdout: z.string().default(''),
  stderr: z.string().default(''),
  code: z.union([z.number(), z.string()]).optional(),
  message: z.string(),
});

async function runSuite(suite: Suite, directory: URL): Promise<Result> {
  const started = performance.now();
  process.stderr.write(`Running ${suite.name}...\n`);
  let stdout = '',
    stderr = '',
    exitCode: number | null = 0,
    processError: string | undefined;
  try {
    const output = await execute(
      process.execPath,
      ['--import=tsx', fileURLToPath(new URL(suite.path, import.meta.url)), ...suite.args],
      { cwd: PROJECT_ROOT, timeout: SUITE_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 },
    );
    stdout = output.stdout;
    stderr = output.stderr;
  } catch (error) {
    const failure = executionErrorSchema.safeParse(error);
    if (failure.success) {
      stdout = failure.data.stdout;
      stderr = failure.data.stderr;
      exitCode = typeof failure.data.code === 'number' ? failure.data.code : null;
      processError = failure.data.message;
    } else {
      exitCode = null;
      processError = 'Unable to execute benchmark child';
    }
  }
  await writeFile(new URL(`${suite.name}.stdout.json`, directory), stdout);
  if (stderr) await writeFile(new URL(`${suite.name}.stderr.log`, directory), stderr);
  try {
    const evaluated = evaluateChildReport(
      stdout,
      exitCode,
      suite.name,
      suite.args.includes('--live'),
    );
    return {
      name: suite.name,
      ...evaluated,
      exitCode,
      elapsedMs: performance.now() - started,
      ...(processError ? { error: processError } : {}),
    };
  } catch (error) {
    return {
      name: suite.name,
      passed: false,
      report: null,
      exitCode,
      elapsedMs: performance.now() - started,
      error: error instanceof Error ? error.message : 'Invalid benchmark report',
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--live')) throw new Error('Only --live is supported');
  const live = args.includes('--live');
  const root = new URL('./results/', import.meta.url);
  await mkdir(root, { recursive: true });
  const id = `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`;
  const directory = new URL(`${id}/`, root);
  await mkdir(directory);
  const results: Result[] = [];
  const suites = live
    ? [
        ...SUITES.map((suite) =>
          suite.name === 'native' || suite.name === 'ptc' ? { ...suite, args: ['--live'] } : suite,
        ),
        LIVE_SUITE,
      ]
    : SUITES;
  for (const suite of suites) results.push(await runSuite(suite, directory));
  const manifest: unknown = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const packageInfo = z
    .object({ name: z.string(), version: z.string(), engines: z.object({ dsh: z.string() }) })
    .parse(manifest);
  const report = {
    schemaVersion: 1,
    ok: results.every((result) => result.passed),
    runId: id,
    nodeVersion: process.version,
    package: packageInfo,
    live,
    results,
  };
  await writeFile(new URL('report.json', directory), `${JSON.stringify(report, null, 2)}\n`);
  const rows = results.map(
    (result) =>
      `| ${result.name} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.elapsedMs.toFixed(1)} |`,
  );
  const markdown = [
    '# DSH Tool Search benchmark',
    '',
    `Run: ${id}. Node: ${process.version}.`,
    '',
    '| Suite | Result | Wall time (ms) |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'The offline quality suite checks the original deterministic stability baseline; this is not proof of semantic quality. See qualityGatePassed and category metrics in its JSON report.',
    '',
    'The Ollama suite uses the configured local model, with an independent quality gate. degradedCases reports embedding fallback explicitly.',
    '',
    'Core quality/scale, native DSH lifecycle and per-call latency are separate measurements. No paid model calls or external discovered tools are executed. No whole-task token/cost savings are claimed.',
    '',
  ].join('\n');
  await writeFile(new URL('report.md', directory), markdown);
  process.stdout.write(
    `${JSON.stringify({ ok: report.ok, report: fileURLToPath(new URL('report.json', directory)), results: results.map(({ name, passed }) => ({ name, passed })) })}\n`,
  );
  if (!report.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Benchmark runner failed' })}\n`,
  );
  process.exitCode = 1;
});
