import { builtinModules } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const repositoryRoot = new URL('../', import.meta.url).pathname;
const quarantine = JSON.parse(
  readFileSync(join(repositoryRoot, 'config/runtime-quarantine.json'), 'utf8'),
);
const excludedRoots = new Set(
  Object.values(quarantine)
    .flat()
    .filter(
      (value) =>
        typeof value === 'string' &&
        (value.startsWith('apps/') || value.startsWith('packages/')),
    ),
);
excludedRoots.add('apps/playground-web');

const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  '__pycache__',
  'coverage',
  'dist',
  'node_modules',
]);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const violations = [];
const manifests = collectManifests();
const workspacePackageNames = new Set(
  manifests
    .map((manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8')).name)
    .filter((name) => typeof name === 'string'),
);

for (const manifestPath of manifests) {
  const packageRoot = relative(repositoryRoot, join(manifestPath, '..'));
  if (excludedRoots.has(packageRoot)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = new Set(
    Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    }),
  );
  const imports = collectImports(join(repositoryRoot, packageRoot));
  for (const [dependency, sourcePath] of imports) {
    if (dependency === manifest.name || declared.has(dependency)) continue;
    violations.push({
      code: 'UNDECLARED_PACKAGE_DEPENDENCY',
      manifest: relative(repositoryRoot, manifestPath),
      dependency,
      importedBy: relative(repositoryRoot, sourcePath),
    });
  }
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (!workspacePackageNames.has(dependency) || imports.has(dependency)) continue;
    violations.push({
      code: 'UNUSED_LOCAL_RUNTIME_DEPENDENCY',
      manifest: relative(repositoryRoot, manifestPath),
      dependency,
    });
  }
}

if (violations.length) {
  console.error(JSON.stringify({ status: 'failed', violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        activeManifests: manifests.filter(
          (path) => !excludedRoots.has(relative(repositoryRoot, join(path, '..'))),
        ).length,
        quarantineRegistry: 'config/runtime-quarantine.json',
      },
      null,
      2,
    ),
  );
}

function collectManifests() {
  const results = [];
  for (const topLevel of ['apps', 'packages']) {
    walk(join(repositoryRoot, topLevel));
  }
  return results;

  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;
      const absolute = join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (entry === 'package.json') {
        results.push(absolute);
      }
    }
  }
}

function collectImports(packageRoot) {
  const imports = new Map();
  walk(packageRoot);
  return imports;

  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;
      const absolute = join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!sourceExtensions.has(extname(entry))) continue;
      const source = readFileSync(absolute, 'utf8');
      const importPatterns = [
        /^\s*import\s+(?:type\s+)?[\w\s,*{}]+\sfrom\s*['"]([^'"./][^'"]*)['"]/gm,
        /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s*['"]([^'"./][^'"]*)['"]/gm,
        /^\s*import\s*['"]([^'"./][^'"]*)['"]/gm,
        /\b(?:import|require)\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,
      ];
      for (const importPattern of importPatterns) {
        for (const match of source.matchAll(importPattern)) {
          const dependency = normalizeDependency(match[1]);
          if (!dependency || builtins.has(dependency)) continue;
          if (!imports.has(dependency)) imports.set(dependency, absolute);
        }
      }
    }
  }
}

function normalizeDependency(specifier) {
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) return null;
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}
