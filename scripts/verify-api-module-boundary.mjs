import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const repositoryRoot = new URL('../', import.meta.url).pathname;
const apiSourceRoot = join(repositoryRoot, 'apps/playground-api/src');
const modulePath = join(apiSourceRoot, 'app.module.ts');

if (!existsSync(modulePath)) {
  throw new Error('apps/playground-api/src/app.module.ts is missing.');
}

const moduleSource = readFileSync(modulePath, 'utf8');
const controllers = extractArray('controllers', 'providers');
const providers = extractArray('providers', undefined);
const violations = [];

for (const entry of readdirSync(apiSourceRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
  const absolutePath = join(apiSourceRoot, entry.name);
  const source = readFileSync(absolutePath, 'utf8');
  const declaration = source.match(/@(Controller|Injectable)\s*\([^)]*\)[\s\S]*?export class\s+(\w+)/);
  if (!declaration) continue;

  const [, decorator, className] = declaration;
  const importPath = `./${basename(entry.name, '.ts')}.js`;
  const registrationTarget = decorator === 'Controller' ? controllers : providers;
  if (!moduleSource.includes(`from '${importPath}'`) || !registrationTarget.includes(className)) {
    violations.push({
      code: decorator === 'Controller' ? 'UNMOUNTED_API_CONTROLLER' : 'UNREGISTERED_API_PROVIDER',
      file: relative(repositoryRoot, absolutePath),
      className,
    });
  }
}

if (violations.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: 'failed', violations }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'passed',
        module: relative(repositoryRoot, modulePath),
        mountedControllers: controllers.match(/\b[A-Z]\w+Controller\b/g)?.length ?? 0,
        registeredProviders: providers.match(/\b[A-Z]\w+(?:Service|Client|Guard|Worker)\b/g)?.length ?? 0,
      },
      null,
      2,
    )}\n`,
  );
}

function extractArray(property, followingProperty) {
  const ending = followingProperty ? `\\],\\s*${followingProperty}` : '\\],\\s*\\}';
  const match = moduleSource.match(new RegExp(`${property}:\\s*\\[([\\s\\S]*?)${ending}`));
  if (!match?.[1]) throw new Error(`Unable to locate ${property} registration in AppModule.`);
  return match[1];
}
