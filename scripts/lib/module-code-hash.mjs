// WI-OI-085d: the fingerprint of a generated module's code under test (API source and database files). A conformance
// record is valid only for the fingerprint it was made against; `pnpm audit:module-manifests` recomputes it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') yield* files(path);
    } else yield path;
  }
}

export function moduleCodeSha256(root, name) {
  const moduleRoot = join(root, 'modules', name);
  const hash = createHash('sha256');
  // The conformance record covers the declared contract as well as its implementation. In particular,
  // changing permissions, routes, runtime wiring or database declarations in module.yaml must invalidate a
  // previously passing record even when the TypeScript sources did not change.
  for (const part of ['module.yaml', 'apps/api', 'db']) {
    const path = join(moduleRoot, part);
    if (!existsSync(path)) continue;
    const list = part.includes('.') ? [path] : [...files(path)];
    for (const file of list) {
      hash.update(relative(moduleRoot, file)).update('\0').update(readFileSync(file)).update('\0');
    }
  }
  return hash.digest('hex');
}
