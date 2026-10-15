import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
// WI-OI-120ak (S3b, Security review M1): every tracked app and module is scanned, so a new module cannot be missed. The
// list comes from git (untracked folders, such as an owner's work in progress, are not part of the product); the
// retired app keeps its own check below.
const trackedRoots = execFileSync('git', ['ls-files', '-z', '--', 'apps', 'modules'], { cwd: repositoryRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map((file) => file.split('/').slice(0, 2).join('/'));
const roots = [
  ...[...new Set(trackedRoots)].filter((root) => root !== 'apps/playground-web').sort(),
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
  // WI-OI-120ah: business records kept in memory on a screen. The demo Time & Attendance screen (PlantOperationsHub)
  // held INITIAL_SHIFTS, INITIAL_INSPECTIONS and INITIAL_HANDOVER: invented people and plants, changed only in the browser.
  // WI-OI-120ak (S1): every module, and maps of records (`= {`) as well as lists.
  {
    code: 'IN_MEMORY_BUSINESS_FIXTURE',
    // S3: the type may contain ";" (object types), and PRESET_ joins the prefixes (the workflows runner's presets).
    pattern: /\b(?:const|let)\s+(?:INITIAL|DEMO|SAMPLE|SEED|FAKE|DUMMY|PRESET)_[A-Z0-9_]+\s*(?::[^=]+?)?=\s*[[{]\s*[{'"A-Za-z]/g,
  },
  // WI-OI-120ak (S1): business data kept in the web app's memory behind its API or screens (lost on restart, not shared
  // between instances): store classes with record maps or lists, and the methods that seed them with invented data.
  {
    code: 'IN_MEMORY_BUSINESS_STORE',
    // S3b (review L1): any field modifier, `readonly`, `#private` and untyped `new Map<…>()` fields (a field ends with ";",
    // a constructor parameter with ","), and `initialize…Default…` set-up methods. Module-level maps are left out:
    // in the web app they are token and handler caches.
    pattern:
      /\b(?:private|protected|public|static|readonly)\s+(?:(?:static|readonly)\s+)*#?\w+\s*(?::[^=;]+)?=\s*(?:new Map(?:<[^>]*>)?\(\)|\[\])\s*;|^\s*#\w+\s*(?::[^=;]+)?=\s*(?:new Map(?:<[^>]*>)?\(\)|\[\])\s*;|\b(?:seed(?:Defaults|Initial\w*|Test\w*|Platform\w*)|initialize\w*Default\w*)\s*\(/gm,
    paths: ['apps/workflow-platform/'],
  },
  // WI-OI-120ak (S1): a screen that pretends an action succeeded, or waits to look busy instead of calling a service.
  {
    code: 'SIMULATED_RESULT',
    pattern:
      /\bsimulat(?:e|es|ed|ing)\s+(?:a\s+|the\s+)?(?:success|response|result|delivery|send|save)\b|\bnew Promise\(\(?\w*\)?\s*=>\s*setTimeout\(\w+,\s*\d+\)\)/gi,
    paths: ['apps/workflow-platform/app/', 'apps/workflow-platform/components/'],
  },
  // WI-OI-120ak (S1): a file that says it must not run in production.
  { code: 'DEV_SEED_SOURCE', pattern: /DEV SEED ONLY|Do NOT use in production/gi },
  // WI-OI-120ak (S1): a screen that starts with invented records instead of loading them (empty editable rows pass).
  {
    code: 'IN_MEMORY_SCREEN_RECORDS',
    pattern: /\buseState(?:<[^>]+>)?\(\[\s*\{\s*\w+:\s*(?:'[^']+'|"[^"]+"|\d)/g,
    paths: ['apps/workflow-platform/app/', 'apps/workflow-platform/components/'],
  },
  // WI-OI-120ak (S1): placeholder people and companies from the seed data (an input's placeholder hint passes).
  {
    code: 'PLACEHOLDER_PEOPLE_OR_COMPANIES',
    pattern:
      /(?<!placeholder[=:]\s*['"])\b(?:Acme Corp(?:oration)?|Jane Doe|John Doe|Sarah Jenkins|Apex Tactical Logistics)\b|\b(?:sarah\.connor|evelyn\.reed)@/g,
  },
  {
    code: 'FABRICATED_PEOPLE_OR_PLACES',
    pattern: /Samalkot|Ramana Rao|Suresh Kumar|Prakash Naidu|Anil Varma/g,
  },
  {
    code: 'HARDCODED_COMPANY_OR_BANK_PROFILE',
    pattern:
      /Warner Bros Discovery Operations LLC|US-EIN-95-1298412|4000 Warner Blvd|JPMorgan Chase Commercial Banking/gi,
  },
];

// WI-OI-120ak (S1): the known items of the newer rules, removed slice by slice. Each entry names its card, slice and
// reason, and the exact number of matches in its file: more fails as new mock, fewer fails until the entry is lowered
// or removed, so the list only shrinks. The older rules cannot be baselined.
const BASELINE_PATH = 'config/runtime-data-baseline.json';
const BASELINE_CODES = new Set([
  'IN_MEMORY_BUSINESS_FIXTURE',
  'IN_MEMORY_BUSINESS_STORE',
  'SIMULATED_RESULT',
  'DEV_SEED_SOURCE',
  'IN_MEMORY_SCREEN_RECORDS',
  'PLACEHOLDER_PEOPLE_OR_COMPANIES',
]);
const runtimeBaseline = existsSync(join(repositoryRoot, BASELINE_PATH))
  ? JSON.parse(readFileSync(join(repositoryRoot, BASELINE_PATH), 'utf8'))
  : { schemaVersion: 2, entries: [] };
// S3b (review L2): each tolerated match is fingerprinted by its rule, file and line text, so one match cannot be traded
// for another; `--baseline-since <git ref>` (CI: the pull request's base, or the previous commit of a push) fails when
// the baseline holds a fingerprint the ref did not.
const fingerprint = (code, file, excerpt) => createHash('sha256').update(`${code}\u0000${file}\u0000${excerpt}`).digest('hex').slice(0, 16);
const sinceArgument = process.argv.indexOf('--baseline-since');
const baselineSince = sinceArgument >= 0 ? process.argv[sinceArgument + 1] : null;

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

// S3b (review L3): a folder named like a test inside a route tree (`app/…/test/route.ts`) is a live route, and generated
// code ships too, so both are scanned; elsewhere test folders are skipped as before.
function skipDirectory(entry, path) {
  if (entry === 'generated') return false;
  if (!ignoredDirectories.has(entry)) return false;
  return !(['test', 'tests', 'e2e'].includes(entry) && /(?:^|\/)app\//.test(`${relative(repositoryRoot, path)}/`));
}

function walk(path) {
  if (quarantinedPaths.has(relative(repositoryRoot, path))) return;
  for (const entry of readdirSync(path)) {
    if (skipDirectory(entry, path)) continue;
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
      if (rule.paths && !rule.paths.some((prefix) => repoPath.startsWith(prefix))) continue;
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
    // Security review L1: the registry records each package's name (`packageNames`), so imports of and dependencies on
    // it are still refused while the root is absent, and a present root must carry that name.
    const recordedName = quarantineRegistry.packageNames?.[configuredRoot];
    if (!existsSync(join(repositoryRoot, configuredRoot))) {
      absentQuarantinedRoots.push(configuredRoot);
      if (typeof recordedName !== 'string' || !recordedName) {
        violations.push({
          code: 'QUARANTINED_PACKAGE_NAME_UNRECORDED',
          file: 'config/runtime-quarantine.json',
          line: 1,
          excerpt: `${configuredRoot} is absent and has no entry in packageNames.`,
        });
      } else if (packageNames.has(recordedName)) {
        violations.push({ code: 'QUARANTINED_PACKAGE_NAME_DUPLICATE', file: 'config/runtime-quarantine.json', line: 1, excerpt: recordedName });
      } else {
        packageNames.set(recordedName, configuredRoot);
      }
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
    if (recordedName && recordedName !== manifest.name) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_NAME_MISMATCH',
        file: relative(repositoryRoot, manifestPath),
        line: 1,
        excerpt: `${manifest.name} differs from the recorded ${recordedName}`,
      });
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
    // Security review L1: a package outside the registered path may not take a quarantined name (a renamed copy).
    if (typeof manifest.name === 'string' && packageNames.has(manifest.name)) {
      violations.push({
        code: 'QUARANTINED_PACKAGE_NAME_REUSED',
        file: repoManifestPath,
        line: 1,
        excerpt: `${manifest.name} is quarantined at ${packageNames.get(manifest.name)}`,
      });
    }
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

const baselined = applyRuntimeBaseline();

function applyRuntimeBaseline() {
  const problem = (excerpt) => ({ code: 'RUNTIME_BASELINE_INVALID', file: BASELINE_PATH, line: 1, excerpt });
  if (runtimeBaseline.schemaVersion !== 2) {
    violations.push(problem(`Expected schemaVersion 2, received ${String(runtimeBaseline.schemaVersion)}`));
    return 0;
  }
  const key = (code, file) => `${code}\u0000${file}`;
  const entries = new Map();
  for (const entry of runtimeBaseline.entries ?? []) {
    const valid =
      BASELINE_CODES.has(entry.code) &&
      typeof entry.file === 'string' &&
      Array.isArray(entry.fingerprints) &&
      entry.fingerprints.length > 0 &&
      entry.fingerprints.every((value) => /^[0-9a-f]{16}$/.test(value)) &&
      /^WI-OI-[0-9a-z]+$/.test(entry.card ?? '') &&
      typeof entry.slice === 'string' &&
      typeof entry.reason === 'string' &&
      entry.reason.length > 10;
    if (!valid || entries.has(key(entry.code, entry.file))) {
      violations.push(problem(`invalid or repeated entry: ${entry.code} ${entry.file}`));
      continue;
    }
    entries.set(key(entry.code, entry.file), entry);
  }
  if (baselineSince) checkBaselineGrowth(entries, key);
  let tolerated = 0;
  for (const [id, entry] of entries) {
    // An entry for a file this scope does not scan (packages/ outside --all-runtime) is judged only in the scope that does.
    if (!roots.some((root) => entry.file.startsWith(`${root}/`))) continue;
    const open = [...entry.fingerprints];
    for (const violation of violations.filter((item) => key(item.code, item.file) === id)) {
      const at = open.indexOf(fingerprint(violation.code, violation.file, violation.excerpt));
      if (at < 0) continue; // not in the baseline: stays reported as new mock
      open.splice(at, 1);
      violations.splice(violations.indexOf(violation), 1);
      tolerated += 1;
    }
    if (open.length > 0) {
      violations.push({
        code: 'RUNTIME_BASELINE_STALE',
        file: BASELINE_PATH,
        line: 1,
        excerpt: `${entry.code} ${entry.file}: ${open.length} fingerprint(s) no longer match; remove them (${entry.card} ${entry.slice})`,
      });
    }
  }
  return tolerated;
}

function checkBaselineGrowth(entries, key) {
  if (/^0+$/.test(baselineSince)) return; // a new branch has no earlier baseline
  const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git('rev-parse', '--verify', `${baselineSince}^{commit}`);
  } catch {
    violations.push({ code: 'RUNTIME_BASELINE_REF_UNKNOWN', file: BASELINE_PATH, line: 1, excerpt: `cannot read ${baselineSince}` });
    return;
  }
  let earlier = { entries: [] };
  try {
    earlier = JSON.parse(git('show', `${baselineSince}:${BASELINE_PATH}`));
  } catch {
    // the ref has no baseline: every tolerated match must be a line that already existed there
  }
  const allowedBefore = new Map((earlier.entries ?? []).map((entry) => [key(entry.code, entry.file), [...(entry.fingerprints ?? [])]]));
  const sourceAt = new Map();
  const existedAt = (file, excerpt) => {
    if (!sourceAt.has(file)) {
      try {
        sourceAt.set(file, git('show', `${baselineSince}:${file}`));
      } catch {
        sourceAt.set(file, '');
      }
    }
    return excerpt.length > 0 && sourceAt.get(file).includes(excerpt);
  };
  // A fingerprint is new only if neither the earlier baseline held it nor its line already existed at the ref: a widened
  // rule may baseline mock that was already there, but no pull request or push may add a mock line and baseline it.
  for (const [id, entry] of entries) {
    const open = [...(allowedBefore.get(id) ?? [])];
    const current = violations.filter((item) => key(item.code, item.file) === id);
    for (const value of entry.fingerprints) {
      const at = open.indexOf(value);
      if (at >= 0) {
        open.splice(at, 1);
        continue;
      }
      const match = current.find((item) => fingerprint(item.code, item.file, item.excerpt) === value);
      if (match && existedAt(entry.file, match.excerpt)) continue;
      violations.push({
        code: 'RUNTIME_BASELINE_GREW',
        file: BASELINE_PATH,
        line: 1,
        excerpt: `${entry.code} ${entry.file}: a tolerated line that is not in ${baselineSince}${match ? ` (${match.file}:${match.line})` : ''}`,
      });
    }
  }
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
        baseline: { file: BASELINE_PATH, entries: (runtimeBaseline.entries ?? []).length, toleratedMatches: baselined },
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
