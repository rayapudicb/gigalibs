import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(
  root,
  'docs/audits/2026-09-09-readiness/iam-containment-manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const write = process.argv.includes('--write');
const drift = [];

for (const entry of manifest.entries) {
  const file = resolve(root, entry.file);
  const target = resolve(
    root,
    entry.kind === 'api'
      ? 'apps/workflow-platform/lib/unavailable-capability'
      : 'apps/workflow-platform/components/UnavailableCapability',
  );
  let importPath = relative(dirname(file), target).split(sep).join('/');
  if (!importPath.startsWith('.')) importPath = `./${importPath}`;

  const expected =
    entry.kind === 'api'
      ? [
          '// WI-OI-013: disabled until this suite capability has a verified business contract.',
          `import { unavailableCapability } from '${importPath}';`,
          '',
          "export const runtime = 'nodejs';",
          ...entry.methods.map((method) => `export const ${method} = unavailableCapability;`),
          '',
        ].join('\n')
      : [
          '// WI-OI-013: restore only with tenant-scoped persistence and outcome evidence.',
          `export { default } from '${importPath}';`,
          '',
        ].join('\n');

  const current = await readFile(file, 'utf8');
  if (current === expected) continue;
  drift.push(entry.file);
  if (write) await writeFile(file, expected);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: drift.length === 0 ? 'passed' : write ? 'restored' : 'failed',
      manifest: manifestPath,
      checked: manifest.entries.length,
      drift,
    },
    null,
    2,
  )}\n`,
);

if (!write && drift.length > 0) process.exitCode = 1;
