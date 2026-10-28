import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const ruleSchema = z.object({
  id: z.string(),
  properties: z.object({ 'security-severity': z.string().optional() }).optional(),
});
const toolSchema = z.object({ rules: z.array(ruleSchema).default([]) });
const sarifSchema = z.object({
  runs: z.array(
    z.object({
      tool: z.object({ driver: toolSchema, extensions: z.array(toolSchema).default([]) }),
      results: z.array(z.object({ ruleId: z.string() })).default([]),
    }),
  ),
});

export function highSecurityFindings(value: unknown): string[] {
  return sarifSchema.parse(value).runs.flatMap((run) => {
    const rules = [run.tool.driver, ...run.tool.extensions].flatMap((tool) => tool.rules);
    for (const result of run.results) {
      assert.ok(
        rules.some((rule) => rule.id === result.ruleId),
        'CodeQL result references an unknown rule',
      );
    }
    return run.results
      .filter((result) =>
        rules.some(
          (rule) =>
            rule.id === result.ruleId && Number(rule.properties?.['security-severity']) >= 7,
        ),
      )
      .map((result) => result.ruleId);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  assert.ok(directory, 'Pass a SARIF directory');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sarif'));
  assert.ok(files.length, 'CodeQL produced no SARIF reports');
  for (const file of files) {
    const findings = highSecurityFindings(
      JSON.parse(await readFile(join(directory, file), 'utf8')),
    );
    assert.deepEqual(findings, [], `High/Critical CodeQL alerts in ${file}`);
  }
}
