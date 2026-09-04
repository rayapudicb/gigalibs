import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const appRoot = join(root, 'apps/workflow-platform/app');
const sourceRoots = [appRoot, join(root, 'apps/workflow-platform/components')];
const pageRoutes = collectPageRoutes(appRoot);
const violations = [];
let staticLinkCount = 0;

for (const sourceRoot of sourceRoots) collectStaticLinks(sourceRoot);

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'failed', pageRoutes, violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      application: 'apps/workflow-platform',
      pageRoutes: pageRoutes.length,
      staticInternalLinks: staticLinkCount,
    },
    null,
    2,
  ),
);

function collectPageRoutes(directory) {
  const routes = [];
  walk(directory, (path) => {
    if (!path.endsWith(`${sep}page.tsx`)) return;
    const segments = relative(directory, path)
      .split(sep)
      .slice(0, -1)
      .filter((segment) => !/^\(.+\)$/.test(segment));
    routes.push(`/${segments.join('/')}`.replace(/\/$/, '') || '/');
  });
  return routes.sort();
}

function collectStaticLinks(directory) {
  walk(directory, (path) => {
    if (!/\.tsx?$/.test(path)) return;
    const source = readFileSync(path, 'utf8');
    const patterns = [
      /\bhref\s*=\s*"(\/[^"]*)"/g,
      /\bhref\s*=\s*'(\/[^']*)'/g,
      /\bhref\s*:\s*"(\/[^"]*)"/g,
      /\bhref\s*:\s*'(\/[^']*)'/g,
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const href = match[1];
        if (!href || href.startsWith('/api/')) continue;
        staticLinkCount += 1;
        const pathname = href.split(/[?#]/, 1)[0] || '/';
        if (pageRoutes.some((route) => routeMatches(route, pathname))) continue;
        violations.push({
          code: 'DEAD_INTERNAL_NAVIGATION',
          file: relative(root, path),
          href,
        });
      }
    }
  });
}

function routeMatches(route, pathname) {
  const pattern = route
    .split('/')
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
      if (/^\[.+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${pattern}$`).test(pathname);
}

function walk(directory, visitor) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, visitor);
    else visitor(path);
  }
}
