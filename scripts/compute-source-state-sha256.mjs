import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'buffer',
});
if (listed.status !== 0) {
  process.stderr.write(listed.stderr);
  process.exit(listed.status ?? 1);
}

const dockerExcludedTopLevel = new Set([
  '.github',
  '.pi',
  '.agents',
  '.codex',
  '.pnpm-store',
  'docs',
  'scratch',
  'Claude outputs',
  'universal-invoicing-demo',
  'universal-invoicing-demo 2',
  'universal-invoicing-demo.zip',
]);
const dockerExcludedSegments = new Set([
  '.next',
  'node_modules',
  'dist',
  '.turbo',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'coverage',
  'test-results',
  'playwright-report',
  'data',
  'secrets',
]);

function isExcludedFromDockerContext(relativePath) {
  const segments = relativePath.split('/');
  const basename = segments.at(-1) ?? '';
  if (dockerExcludedTopLevel.has(segments[0])) return true;
  if (dockerExcludedSegments.has(basename) || segments.some((part) => dockerExcludedSegments.has(part))) {
    return true;
  }
  if (relativePath === 'infra/compose/backups' || relativePath.startsWith('infra/compose/backups/')) {
    return true;
  }
  if (relativePath === 'infra/compose/evidence' || relativePath.startsWith('infra/compose/evidence/')) {
    return true;
  }
  return (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename.endsWith('.tsbuildinfo') ||
    basename === 'conformance.json' ||
    basename.endsWith('.log') ||
    basename.startsWith('celerybeat-schedule') ||
    basename === '.DS_Store'
  );
}

const paths = listed.stdout
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((relativePath) => !isExcludedFromDockerContext(relativePath))
  .sort((left, right) => left.localeCompare(right));
const hash = createHash('sha256');
for (const relativePath of paths) {
  const absolutePath = `${root}${relativePath}`;
  if (!existsSync(absolutePath)) {
    hash.update(relativePath);
    hash.update('\0deleted\0');
    continue;
  }
  const stat = lstatSync(absolutePath);
  hash.update(relativePath);
  hash.update('\0');
  hash.update(stat.isSymbolicLink() ? `link:${readlinkSync(absolutePath)}` : readFileSync(absolutePath));
  hash.update('\0');
}

process.stdout.write(`${hash.digest('hex')}\n`);
