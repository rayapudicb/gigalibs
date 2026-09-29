// WI-OI-085e: copies each hosted module's ordered runtime migrations into the module host image, one directory per
// module (/output/host/modules/<name>/migrations), for that module's own migrations service. Only the files the
// module's runtime manifest lists are copied, and the count is verified.
//   node infra/compose/docker/copy-hosted-migrations.mjs <output directory>
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('usage: copy-hosted-migrations.mjs <output directory>');
const index = JSON.parse(readFileSync('infra/compose/generated/modules.json', 'utf8'));
const hosted = Object.entries(index).filter(([, runtime]) => runtime.hosting === 'host');
for (const [name, runtime] of hosted) {
  const manifest = join(runtime.directory, 'db/runtime-manifest.txt');
  const migrations = readFileSync(manifest, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const target = join(output, 'modules', name, 'migrations');
  mkdirSync(target, { recursive: true });
  for (const migration of migrations) {
    const source = join(runtime.directory, 'db/migrations', migration);
    if (!existsSync(source)) throw new Error(`${manifest} lists ${migration}, which does not exist.`);
    copyFileSync(source, join(target, migration));
  }
  if (readdirSync(target).length !== migrations.length) throw new Error(`${name}: migration count mismatch.`);
}
console.log(`Copied migrations for ${hosted.length} hosted module(s): ${hosted.map(([name]) => name).join(', ') || 'none'}.`);
