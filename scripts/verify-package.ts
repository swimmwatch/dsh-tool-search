import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { z } from 'zod';
import { PACKAGE_NAME, PLUGIN_NAME } from '../src/constants.js';
import { releaseVersion } from './release-policy.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packageName = PACKAGE_NAME;
const expectedManifest = z
  .object({ version: z.string() })
  .parse(JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')));
const packSchema = z
  .array(z.object({ filename: z.string(), files: z.array(z.object({ path: z.string() })) }))
  .length(1);
const manifestSchema = z.object({
  name: z.literal(packageName),
  version: z.literal(releaseVersion(expectedManifest.version)),
  license: z.literal('Apache-2.0'),
  icon: z.literal('assets/logo.png'),
  main: z.string(),
  types: z.string(),
  engines: z.object({ node: z.literal('>=24 <25'), dsh: z.literal('0.2.1-rc.2') }),
  exports: z.record(
    z.string(),
    z.union([z.string(), z.object({ types: z.string(), default: z.string() })]),
  ),
  dsh: z.object({
    bundle: z.object({ patch: z.string() }),
    client: z.object({ platform: z.literal('web'), inject: z.array(z.string()) }),
  }),
  peerDependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
  scripts: z.object({ prepare: z.literal('npm run build') }),
});

function verifyFiles(files: readonly string[]): void {
  for (const required of [
    'package.json',
    'dist/src/index.js',
    'dist/src/index.d.ts',
    'dist/src/config.js',
    'dist/client.js',
    'dist/src/client/settings.css',
    'dist/src/client/index.d.ts',
    'dist/src/core/mcp/tool-search-controller.js',
    'cordis.patch.yml',
    'NOTICE',
    'LICENSE',
    'assets/logo.png',
  ]) {
    assert.ok(files.includes(required), `Missing package file: ${required}`);
  }
  assert.ok(
    !files.some((file) =>
      /^(?:src|test|scripts|benchmarks|node_modules|docs|licenses|\.local)\//u.test(file),
    ),
    'Development files leaked into runtime archive',
  );
  assert.ok(!files.some((file) => file.endsWith('.map')), 'Source maps without sources in archive');
  assert.ok(
    !files.some((file) => file.startsWith('dist/vendor/')),
    'Obsolete vendor layout in archive',
  );
}

function verifyManifest(manifest: z.output<typeof manifestSchema>, files: readonly string[]): void {
  for (const path of [manifest.main, manifest.types, manifest.dsh.bundle.patch]) {
    assert.ok(files.includes(path.replace(/^\.\//u, '')), `Missing declared artifact: ${path}`);
  }
  for (const [name, version] of Object.entries(manifest.peerDependencies)) {
    assert.equal(manifest.devDependencies[name], version, `Peer/dev version mismatch: ${name}`);
    assert.ok(
      name !== 'react' && !name.includes('/dsh-client-') && name !== '@deepseek-ai/dsh-api-remotes',
      `Browser-only dependency must stay in devDependencies: ${name}`,
    );
  }
  for (const target of Object.values(manifest.exports)) {
    for (const path of typeof target === 'string' ? [target] : [target.types, target.default]) {
      const relativePath = path.replace(/^\.\//u, '');
      const parts = relativePath.split('*');
      assert.ok(
        files.some((file) =>
          parts.length === 1
            ? file === relativePath
            : file.startsWith(parts[0] ?? '') && file.endsWith(parts.at(-1) ?? ''),
        ),
        `Export has no packed file: ${path}`,
      );
    }
  }
}

async function verifyEntrypoints(require: NodeJS.Require, installedRoot: string): Promise<void> {
  const entry = require.resolve(packageName);
  assert.ok(entry.startsWith(`${installedRoot}/`), 'Host entry resolved outside the packed plugin');
  const plugin: unknown = await import(pathToFileURL(entry).href);
  const hostPlugin = z
    .object({
      name: z.literal(PLUGIN_NAME),
      inject: z.array(z.string()),
      apply: z.custom<(ctx: unknown) => unknown>((value) => typeof value === 'function'),
    })
    .parse(plugin);
  assert.ok(hostPlugin.inject.includes('tools'));
  assert.ok(hostPlugin.inject.includes('systemPrompt'));

  const clientEntry = require.resolve(`${packageName}/client`);
  assert.ok(
    clientEntry.startsWith(`${installedRoot}/`),
    'Client entry resolved outside the packed plugin',
  );
  let clientRegistration: unknown;
  runInNewContext(await readFile(clientEntry, 'utf8'), {
    window: {
      __ModuleLoader__: {
        load(value: unknown) {
          clientRegistration = value;
        },
      },
    },
  });
  const registration = z
    .object({
      id: z.literal(packageName),
      factory: z.custom<(require: NodeJS.Require) => unknown>(
        (value) => typeof value === 'function',
      ),
    })
    .parse(clientRegistration);
  const browserPlugin = z
    .object({
      inject: z.array(z.string()),
      apply: z.custom<(ctx: unknown) => void>((value) => typeof value === 'function'),
    })
    .parse(registration.factory(require));
  assert.deepEqual(browserPlugin.inject, ['slots', 'remote.credentials']);
  let registeredKey: string | undefined;
  browserPlugin.apply({
    remote: { credentials: {} },
    effect: (callback: () => void) => callback(),
    slots: {
      inject: (_slot: string, callback: () => void) => callback(),
      register: (descriptor: { key: string }) => {
        registeredKey = descriptor.key;
      },
    },
  });
  assert.equal(
    registeredKey,
    `${packageName}#${PLUGIN_NAME}`,
    'Settings must target the scoped bundle and preserved row',
  );
}

await mkdir(join(projectRoot, '.local'), { recursive: true });
const temporaryRoot = await mkdtemp(join(projectRoot, '.local/package-verify-'));
try {
  const provided = process.argv[2];
  const archive = provided ? resolve(provided) : packRuntime();
  const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((path) => {
      assert.ok(
        path.startsWith('package/') && !path.split('/').includes('..'),
        'Invalid archive member',
      );
      return path.slice('package/'.length);
    });
  verifyFiles(files);
  const installedRoot = join(temporaryRoot, 'node_modules', packageName);
  await mkdir(installedRoot, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', installedRoot, '--strip-components=1']);
  for (const path of files.filter((file) => file.endsWith('.js'))) {
    const source = await readFile(join(installedRoot, path), 'utf8');
    assert.ok(
      !source.includes('sourceMappingURL='),
      `Source map reference in runtime artifact: ${path}`,
    );
  }
  // The packed plugin uses the existing test host dependencies, never checkout entrypoints.
  await writeFile(
    join(temporaryRoot, 'package.json'),
    JSON.stringify({ name: 'package-verification', private: true }),
  );
  const require = createRequire(join(temporaryRoot, 'consumer.cjs'));
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const icon = await readFile(join(installedRoot, manifest.icon));
  assert.ok(icon.byteLength <= 256 * 1024, 'Icon exceeds the DSH manifest limit');
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Icon must be PNG');
  verifyManifest(manifest, files);
  assert.equal(
    require.resolve(`${packageName}/cordis.patch.yml`),
    join(installedRoot, 'cordis.patch.yml'),
  );
  await verifyEntrypoints(require, installedRoot);
  process.stdout.write(`Packed artifact verified: ${files.length} runtime files.\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function packRuntime(): string {
  const raw = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryRoot],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  const [packed] = packSchema.parse(JSON.parse(raw));
  assert.ok(packed);
  return join(temporaryRoot, packed.filename);
}
