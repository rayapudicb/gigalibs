import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const repositoryRoot = new URL('../', import.meta.url).pathname;
const includeLegacy = process.argv.includes('--all-runtime');
const quarantineRegistryPath = join(repositoryRoot, 'config/runtime-quarantine.json');
const quarantineRegistry = JSON.parse(readFileSync(quarantineRegistryPath, 'utf8'));
const quarantineCategories = [
  'unimplementedStubs',
  'fabricatedAdapters',
  'showcaseOnlyPackages',
  'incompleteApplications',
  'unpersistedRuntimeServices',
  'unsafeFinancialRuntime',
  'uncertifiedRuntimePackages',
];
const quarantinedPackages = quarantineCategories.flatMap((category) =>
  (quarantineRegistry[category] ?? []).map((path) => ({ category, path })),
);
const quarantinedPaths = new Set(quarantinedPackages.map(({ path }) => path));
const roots = [
  'apps/workflow-platform',
  'apps/playground-api',
  'apps/workflow-api',
  'modules/accounts-receivable',
  'modules/spend-management',
  'modules/tax-configuration',
  'modules/multi-currency',
  'modules/universal-data-studio',
  'modules/universal-rule-pro',
  'modules/workflow-studio',
  'modules/universal-connector-hub',
  'modules/autonomous-recovery-studio',
  'modules/analytics-studio',
  'modules/esignature',
  'modules/physical-operations-cmms',
  'modules/gigaops',
  'modules/geospatial',
  ...(includeLegacy ? ['packages'] : []),
];
const retiredApplications = ['apps/playground-web'];

const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'coverage',
  'dist',
  'e2e',
  'node_modules',
  'test',
  'tests',
  '__tests__',
  'generated',
]);
const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.json',
  '.sql',
  '.prisma',
]);
const forbiddenContent = [
  { code: 'DEMO_CREDENTIAL', pattern: /admin@demo\.com|demo1234/g },
  {
    code: 'MOCK_RUNTIME_VALUE',
    pattern: /mock_(?:presigned|download|token|response|success|failure|data)/gi,
  },
  {
    code: 'MOCK_RUNTIME_COLLECTION',
    pattern: /(?:INITIAL|MASTER|DEFAULT)_[A-Z0-9_]*MOCK|MOCK_[A-Z0-9_]+/g,
  },
  { code: 'FABRICATED_AI_STREAM', pattern: /mockTokens|Mock streaming generator/g },
  { code: 'PUBLIC_DUMMY_SOURCE', pattern: /dummyjson\.com/gi },
  { code: 'FORCED_SIMULATION', pattern: /FORCE_SYNC_ERROR|isMockFailure/g },
  {
    code: 'HARDCODED_TENANT_DEFAULT',
    pattern:
      /tenantId\s*=\s*['"](?:acme|warner-bros|tenant_acme)[^'"]*['"]|tenantId\s*\|\|\s*['"][^'"]+['"]/g,
  },
  {
    code: 'SILENT_FIXTURE_FALLBACK',
    pattern: /\.catch\([^\n]*(?:INITIAL|MASTER|DEFAULT)_[A-Z0-9_]+/g,
  },
  {
    code: 'UNIMPLEMENTED_RUNTIME_PACKAGE',
    pattern: /TODO:\s*Implement module exports/gi,
  },
  {
    code: 'FABRICATED_PROVIDER_ADAPTER',
    pattern:
      /(?:cs_test_|sentry_(?:event|msg)_|order_|resend_)\$\{Date\.now\(\)\}|sid:\s*`SM\$\{Date\.now\(\)\}`|multi-model response routed through GigaLibs/gi,
  },
  {
    code: 'DEFERRED_PROVIDER_IMPLEMENTATION',
    pattern: /In production, (?:delegate|instantiate)/gi,
  },
  {
    code: 'FABRICATED_PAYMENT_SUCCESS',
    pattern: /pm_card_visa_default|transactionId:\s*`txn_\$\{generateId\(\)\}`/g,
  },
  {
    code: 'INSECURE_RUNTIME_RANDOMNESS',
    pattern: /Math\.random\s*\(/g,
  },
  {
    code: 'HARDCODED_LOCAL_RUNTIME_ENDPOINT',
    pattern:
      /(?:\?\?|\|\||(?<![=!<>])=(?!=))\s*['"](?:https?:\/\/|redis:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?['"]/g,
  },
  {
    code: 'SUSPICIOUS_RUNTIME_FIXTURE',
    pattern:
      /\b(?:mock(?:ed|ing)?|fake|dummy|canned)\b|\bsample\s+(?:content|data|invoice|response)\b/gi,
  },
  {
    code: 'UNVERIFIED_DELIVERY_SUCCESS_CLAIM',
    pattern:
      /Project created successfully|Modules configured and ready to use|Platform is 100% READY for production deployment|Certified GigaLibs Plug-and-Play Modules/gi,
  },
  {
    code: 'FABRICATED_DOCUMENT_EVIDENCE',
    pattern: /RFC 3161 PKI Certified|digestSha256\s*\|\|\s*['"]inv_verified['"]/gi,
  },
  {
    code: 'HARDCODED_COMPANY_OR_BANK_PROFILE',
    pattern:
      /Warner Bros Discovery Operations LLC|US-EIN-95-1298412|4000 Warner Blvd|JPMorgan Chase Commercial Banking/gi,
  },
];

const violations = [];
const absentQuarantinedRoots = [];
const quarantinedPackageNames = verifyQuarantineBoundary();
for (const retiredApplication of retiredApplications) {
  verifyRetiredApplication(retiredApplication);
}
for (const configuredRoot of roots) {
  const absoluteRoot = join(repositoryRoot, configuredRoot);
  if (!existsSync(absoluteRoot)) continue;
  walk(absoluteRoot);
}

function verifyRetiredApplication(configuredRoot) {
  // A retired application that has been removed entirely (WI-OI-102f) is stronger than one carrying a retired marker.
  if (!existsSync(join(repositoryRoot, configuredRoot))) return;
  const packagePath = join(repositoryRoot, configuredRoot, 'package.json');
  const entryPath = join(repositoryRoot, configuredRoot, 'index.html');
  if (!existsSync(packagePath)) {
    violations.push({
      code: 'RETIRED_APP_MARKER_MISSING',
      file: relative(repositoryRoot, packagePath),
      line: 1,
      excerpt: 'Retired application package marker is missing.',
    });
    return;
  }
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  const executableScripts = ['dev', 'build', 'start', 'preview'].filter(
    (script) => typeof manifest.scripts?.[script] === 'string',
  );
  if (manifest.gigalibs?.lifecycle !== 'RETIRED' || executableScripts.length > 0) {
    violations.push({
      code: 'RETIRED_APP_EXECUTABLE',
      file: relative(repositoryRoot, packagePath),
      line: 1,
      excerpt: `Retired application exposes runtime scripts: ${executableScripts.join(', ')}`,
    });
  }
  if (existsSync(entryPath)) {
    violations.push({
      code: 'RETIRED_APP_ENTRYPOINT',
      file: relative(repositoryRoot, entryPath),
      line: 1,
      excerpt: 'Retired application still has a browser entry point.',
    });
  }
}

function walk(path) {
  if (quarantinedPaths.has(relative(repositoryRoot, path))) return;
  for (const entry of readdirSync(path)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(path, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      walk(absolute);
      continue;
    }
    const extension = extname(entry);
    if (!sourceExtensions.has(extension)) continue;
    if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(entry)) continue;
    const source = readFileSync(absolute, 'utf8');
    const repoPath = relative(repositoryRoot, absolute);
    if (extension === '.js' && existsSync(absolute.replace(/\.js$/, '.ts'))) {
      violations.push({ code: 'SHADOW_COMPILED_SOURCE', file: repoPath, line: 1, excerpt: entry });
    }
    if (extension === '.js' && existsSync(absolute.replace(/\.js$/, '.tsx'))) {
      violations.push({ code: 'SHADOW_COMPILED_SOURCE', file: repoPath, line: 1, excerpt: entry });
    }
    for (const [packageName, packagePath] of quarantinedPackageNames) {
      if (source.includes(packageName)) {
        violations.push({
          code: 'QUARANTINED_PACKAGE_IMPORT',
          file: repoPath,
          line: source.slice(0, source.indexOf(packageName)).split('\n').length,
          excerpt: `${packageName} is quarantined at ${packagePath}`,
        });
      }
    }
    for (const rule of forbiddenContent) {
      rule.pattern.lastIndex = 0;
      for (const match of source.matchAll(rule.pattern)) {
        const before = source.slice(0, match.index);
        const line = before.split('\n').length;
        violations.push({
          code: rule.code,
          file: repoPath,
          line,
          excerpt: source.split('\n')[line - 1]?.trim().slice(0, 240) ?? '',
        });
      }
    }
  }
}

function verifyQuarantineBoundary() {
  const packageNames = new Map();
  const workspaceConfig = readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
  const seenPaths = new Set();

  if (quarantineRegistry.schemaVersion !== 1) {
    violations.push({
      code: 'QUARANTINE_SCHEMA_UNSUPPORTED',
      file: 'config/runtime-quarantine.json',
      line: 1,
      excerpt: `Expected schemaVersion 1, received ${String(quarantineRegistry.schemaVersion)}`,
    });
  }

  for (const { category, path: configuredRoot } of quarantinedPackages) {
    if (
      typeof configuredRoot !== 'string' ||
      (!configuredRoot.startsWith('packages/') &&
        !configuredRoot.startsWith('apps/') &&
        !configuredRoot.startsWith('modules/')) ||
      configuredRoot.includes('..') ||
      seenPaths.has(configuredRoot)
    ) {
      violations.push({
        code: 'QUARANTINE_PATH_INVALID',
        file: 'config/runtime-quarantine.json',
        line: 1,
        excerpt: `${category}: ${String(configuredRoot)}`,
      });
      continue;
    }
    seenPaths.add(configuredRoot);

    const expectedExclusion = `- "!${configuredRoot}"`;
    // WI-OI-120aj (owner decision E3a, 2026-10-14): a quarantined root that is not in the checkout at all has nothing to
    // contain; the TextFly apps live in the owner's untracked folder. It keeps its workspace exclusion, so it stays out
    // of the build if it appears. A root that is present must still have a named package manifest.
    if (!existsSync(join(repositoryRoot, configuredRoot))) {
      absentQuarantinedRoots.push(configuredRoot);
      if (!workspaceConfig.split('\n').some((line) => line.trim() === expectedExclusion)) {
        violations.push({
          code: 'QUARANTINED_PACKAGE_STILL_IN_WORKSPACE',
          file: 'pnpm-workspace.yaml',
          line: 1,
          excerpt: `Missing exact exclusion ${expectedExclusion}`,
        });
      }
      continue;
    }

    const manifestPath = join(repositoryRoot, configuredRoot, 'package.json');
    if (!existsSync(manifestPath)) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_MISSING',
        file: relative(repositoryRoot, manifestPath),
        line: 1,
        excerpt: `${configuredRoot} has no package manifest.`,
      });
      continue;
    }
    if (!workspaceConfig.split('\n').some((line) => line.trim() === expectedExclusion)) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_STILL_IN_WORKSPACE',
        file: 'pnpm-workspace.yaml',
        line: 1,
        excerpt: `Missing exact exclusion ${expectedExclusion}`,
      });
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name !== 'string' || !manifest.name) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_NAME_MISSING',
        file: relative(repositoryRoot, manifestPath),
        line: 1,
        excerpt: 'Package name is required for dependency-boundary verification.',
      });
      continue;
    }
    if (packageNames.has(manifest.name)) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_NAME_DUPLICATE',
        file: relative(repositoryRoot, manifestPath),
        line: 1,
        excerpt: manifest.name,
      });
    }
    packageNames.set(manifest.name, configuredRoot);
  }

  for (const manifestPath of collectPackageManifests(repositoryRoot)) {
    const repoManifestPath = relative(repositoryRoot, manifestPath);
    const packageRoot = repoManifestPath.replace(/\/package\.json$/, '');
    if (quarantinedPaths.has(packageRoot) || retiredApplications.includes(packageRoot)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        const quarantinePath = packageNames.get(dependency);
        if (!quarantinePath) continue;
        violations.push({
          code: 'ACTIVE_PACKAGE_DEPENDS_ON_QUARANTINE',
          file: repoManifestPath,
          line: 1,
          excerpt: `${section}.${dependency} resolves to ${quarantinePath}`,
        });
      }
    }
  }
  return packageNames;
}

function collectPackageManifests(root) {
  const manifests = [];
  for (const entry of readdirSync(root)) {
    if (ignoredDirectories.has(entry) || entry.startsWith('.')) continue;
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      manifests.push(...collectPackageManifests(absolute));
    } else if (entry === 'package.json') {
      manifests.push(absolute);
    }
  }
  return manifests;
}

if (violations.length > 0) {
  console.error(
    JSON.stringify(
      { status: 'failed', scope: includeLegacy ? 'all-runtime' : 'production', violations },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        scope: includeLegacy ? 'all-runtime' : 'production',
        scannedRoots: roots,
        retiredApplications,
        quarantinedPackages: {
          count: quarantinedPackages.length,
          absent: absentQuarantinedRoots,
          registry: 'config/runtime-quarantine.json',
        },
      },
      null,
      2,
    ),
  );
}
