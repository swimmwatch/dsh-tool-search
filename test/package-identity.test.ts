import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { z } from 'zod';
import { name } from '../src/index.js';

await test('the public package has a scoped identity and preserves the installed plugin row', async () => {
  const manifest = z
    .object({ name: z.string() })
    .parse(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')));
  assert.equal(manifest.name, '@swimmwatch/dsh-tool-search');
  assert.equal(name, 'dsh-tool-search');
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /id: dsh-tool-search/u);
  assert.match(patch, /name: '@swimmwatch\/dsh-tool-search'/u);
});
