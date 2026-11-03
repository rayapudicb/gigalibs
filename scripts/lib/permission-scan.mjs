// WI-OI-120q (R1): finds the permission codes source code checks, for the permission catalogue
// (scripts/module-manifests.mjs) and its drift test (packages/contracts/src/rbac/permission-catalogue.test.ts).
// A code counts when it sits where a permission is checked or declared:
// - inside a decorator or call whose name mentions a permission (`@RequirePermissions('x')`, `@RequireAnyPermission`,
//   `hasPermission(p, 'x')`, `holdsAnyPermission(p, ['x', 'y'])`, `hasCmmsPermission(...)`);
// - as the value of a permission key (`permission: 'x'`, `requiredPermission`, `readPermission`, `writePermission`,
//   `requiredPermissions: [...]`, and record adapters' `permissions: { read: 'x', create: 'y' }`);
// - in `permissions.includes('x')` (any list named …permissions, granted or scopes).
// Over-inclusion is harmless (a role may hold a code nothing checks); a miss refuses a real permission on save.
// WI-OI-167: a browser component (`'use client'`) cannot enforce access; when its checks only decide what to show and
// the module's API enforces them, it says so with a `// permission-scan: display-only` line and its codes are not
// counted for the platform (which would refuse them at a unit or place scope). The marker counts only in a client file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CODE = /^(?:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:[:.][a-z][a-z0-9-]*){0,2}|[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,3})$/;
const LITERAL = /'([^'\n]{3,120})'|"([^"\n]{3,120})"|`([^`$\n]{3,120})`/g;
const CONTEXTS = [
  /@\w*Permission\w*\(([^)]*)\)/g,
  /\b\w*(?:[Pp]ermission\w*|holds|grants)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
  /\b(?:permission|requiredPermission|readPermission|writePermission|recordsPermission)\s*:\s*('[^']*'|"[^"]*")/g,
  /\b(?:requiredPermissions|permissions)\s*:\s*\[([^\]]*)\]/g,
  /\bpermissions\s*:\s*\{([^}]*)\}/g,
  /\b\w*(?:[Pp]ermissions|granted|[Ss]copes)\??\.includes\(([^)]*)\)/g,
];

/** Whether a string is a permission code in either spelling (never `*`, never a platform code). */
export function isPermissionCode(value) {
  return typeof value === 'string' && CODE.test(value) && !/^platform[:.]/.test(value);
}

/** The permission codes one source text checks or declares. */
export function permissionCodesIn(text) {
  const codes = new Set();
  for (const context of CONTEXTS) {
    for (const match of text.matchAll(context)) {
      for (const literal of match[1].matchAll(LITERAL)) {
        const value = literal[1] ?? literal[2] ?? literal[3];
        if (isPermissionCode(value)) codes.add(value);
      }
    }
  }
  return codes;
}

function* sourceFiles(directory) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (!['node_modules', 'dist', '.next', 'generated', '__tests__', 'e2e'].includes(name)) yield* sourceFiles(path);
    } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|spec|d)\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.generated.ts')) {
      yield path;
    }
  }
}

/** Whether a file is a client component whose permission checks only decide what to show (see the header). */
export function isDisplayOnly(text) {
  return /^\s*['"]use client['"];?/.test(text) && /^\/\/ permission-scan: display-only\b/m.test(text);
}

/** The permission codes every source file under the directories checks, with the files that name each. */
export function scanPermissionCodes(directories) {
  const found = new Map();
  for (const directory of directories)
    for (const file of sourceFiles(directory)) {
      const text = readFileSync(file, 'utf8');
      if (isDisplayOnly(text)) continue;
      for (const code of permissionCodesIn(text)) {
        if (!found.has(code)) found.set(code, new Set());
        found.get(code).add(file);
      }
    }
  return found;
}

/** Where the control plane, shared packages and web check permissions (module code is scanned per module). */
export function platformSourceDirectories(root) {
  const packages = join(root, 'packages');
  return [
    join(root, 'apps', 'playground-api', 'src'),
    join(root, 'apps', 'module-host', 'src'),
    join(root, 'apps', 'workflow-platform', 'app'),
    join(root, 'apps', 'workflow-platform', 'lib'),
    join(root, 'apps', 'workflow-platform', 'components'),
    ...readdirSync(packages).map((name) => join(packages, name, 'src')),
  ];
}

/** A module's own source: its API apps and its web package. */
export function moduleSourceDirectories(root, moduleDirectory) {
  const base = join(root, 'modules', moduleDirectory);
  const apps = join(base, 'apps');
  return [
    ...(existsSync(apps) ? readdirSync(apps).map((app) => join(apps, app, 'src')) : []),
    join(base, 'web', 'src'),
    join(base, 'domain', 'src'),
  ];
}
