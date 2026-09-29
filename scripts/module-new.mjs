// `pnpm module:new` (WI-OI-085): creates a complete business module from scripts/module-template, then regenerates
// everything the manifests drive (catalogue, gateway, upstream, navigation, pages, runtime overlay). No shell or
// infrastructure file is edited by hand.
//   pnpm module:new <name> --title "<Display name>" --group "<sidebar group>" [--icon <icon>] [--prefix <PREFIX>]
//                   [--hosting host|service] [--port <port>] [--work-item WI-OI-NNN]
// A module runs inside the shared module host by default (product vision §8, WI-OI-085e); `--hosting service` gives
// it its own image and service, for when scale, data isolation, team ownership or failure isolation justifies it.
// Everything the module needs to run follows: see scripts/module-template/README.md.tmpl.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import yaml from 'js-yaml';

const root = new URL('../', import.meta.url).pathname;
const templateRoot = join(root, 'scripts/module-template');
const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const refuse = (message) => {
  console.error(`module:new: ${message}`);
  process.exit(1);
};

const name = args[0];
if (!name || name.startsWith('--'))
  refuse('usage: pnpm module:new <name> --title "<Display name>" --group "<sidebar group>" [--icon <icon>]');

// Enumerations come from the typed contract, like the manifest audit.
const contract = readFileSync(join(root, 'packages/contracts/src/modules/index.ts'), 'utf8');
const union = (type) => [
  ...(contract.match(new RegExp(`export type ${type} =([^;]+);`))?.[1] ?? '').matchAll(/'([^']+)'/g),
].map(([, value]) => value);

const manifests = [
  yaml.load(readFileSync(join(root, 'platform/core.yaml'), 'utf8')),
  ...readdirSync(join(root, 'modules'))
    .filter((folder) => existsSync(join(root, 'modules', folder, 'module.yaml')))
    .map((folder) => yaml.load(readFileSync(join(root, 'modules', folder, 'module.yaml'), 'utf8'))),
].filter((manifest) => manifest?.apiVersion === 'modules.gigalibs.io/v1');
const entries = manifests.flatMap((manifest) => manifest.spec?.catalog ?? []);

if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length < 3 || name.length > 40)
  refuse('the name must be 3–40 characters of kebab-case, starting with a letter');
if (['host', 'module-host'].includes(name)) refuse('host and module-host are reserved for the module host');
if (existsSync(join(root, 'modules', name))) refuse(`modules/${name} already exists; it is never overwritten`);
for (const path of [`apps/workflow-platform/app/(app)/${name}`, `apps/workflow-platform/app/api/${name}`])
  if (existsSync(join(root, path))) refuse(`${path} already exists, so /${name} is taken`);
if (entries.some((entry) => entry.key === name || entry.route === `/${name}`))
  refuse(`a catalogue entry already uses the key or route ${name}`);

const title = option('--title');
if (!/^[A-Za-z0-9][A-Za-z0-9 &()/-]{1,58}[A-Za-z0-9)]$/.test(title ?? ''))
  refuse('--title is required: 3–60 letters, digits, spaces and & ( ) / -');
const group = option('--group');
if (!union('PlatformModuleArea').includes(group))
  refuse(`--group must be one of: ${union('PlatformModuleArea').join(' | ')}`);
const icon = option('--icon') ?? 'boxes';
if (!union('PlatformModuleIcon').includes(icon))
  refuse(`--icon must be one of: ${union('PlatformModuleIcon').join(' | ')}`);
const prefix = option('--prefix') ?? name.toUpperCase().replaceAll('-', '_');
if (!/^[A-Z][A-Z0-9_]*$/.test(prefix)) refuse('--prefix must be upper-case letters, digits and underscores');
const usedPrefixes = manifests
  .map((manifest) => /^([A-Z][A-Z0-9_]*)_API_URL$/.exec(manifest.spec?.api?.upstream?.environmentKey ?? '')?.[1])
  .filter(Boolean);
if (usedPrefixes.includes(prefix)) refuse(`the environment prefix ${prefix} is already used`);
const HOST_PORT = 4790;
const hosting = option('--hosting') ?? 'host';
if (!['host', 'service'].includes(hosting)) refuse('--hosting must be host or service');
const usedPorts = [HOST_PORT, ...manifests.map((manifest) => manifest.spec?.api?.port).filter(Number.isInteger)];
let port = HOST_PORT;
if (hosting === 'host') {
  if (option('--port')) refuse(`a hosted module is reached through the module host on port ${HOST_PORT}; omit --port`);
} else {
  port = option('--port') ? Number(option('--port')) : Array.from({ length: 200 }, (_, i) => 4800 + i).find((p) => !usedPorts.includes(p));
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || usedPorts.includes(port))
    refuse('--port must be a free integer between 1024 and 65535');
}
const workItem = option('--work-item') ?? null;
if (workItem !== null && !/^WI-OI-\d{3}$/.test(workItem)) refuse('--work-item must be WI-OI-NNN');
const order = Math.max(0, ...entries.map((entry) => entry.navigationOrder).filter(Number.isInteger)) + 10;
const snake = name.replaceAll('-', '_');

const values = {
  __NAME__: name,
  __TITLE__: title,
  __PREFIX__: prefix,
  __SCHEMA__: `gigalibs_${snake}`,
  __SNAKE__: snake,
  __PERMISSION__: name,
  __PORT__: String(port),
  __GROUP__: group,
  __ICON__: icon,
  __ORDER__: String(order),
  __WORK_ITEM__: workItem ?? 'null',
  __HOSTING__: hosting,
  __SERVICE__: hosting === 'host' ? 'module-host' : `${name}-api`,
  __BASE_PATH_LINE__: hosting === 'host' ? `basePath: /${name}` : '__DROP_LINE__',
  __RUN_WHERE__: hosting === 'host' ? 'inside the shared module host' : 'as its own service',
  __BUILD_SCRIPT__: hosting === 'host' ? 'build-module-host-image.sh' : `build-generated-module-image.sh ${name}`,
};
const tokens = new RegExp(Object.keys(values).join('|'), 'g');
const fill = (text) => text.replace(tokens, (token) => values[token]);

function* templates(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* templates(path);
    else if (entry.name.endsWith('.tmpl')) yield path;
  }
}
// Render every file first; nothing is written unless all of them render.
const moduleRoot = join(root, 'modules', name);
const rendered = [];
for (const template of templates(templateRoot)) {
  let target = relative(templateRoot, template).replace(/\.tmpl$/, '');
  if (target === 'db/migrations/000001_foundation.up.sql')
    target = `db/migrations/000001_${snake}_foundation.up.sql`;
  const content = fill(readFileSync(template, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '__DROP_LINE__')
    .join('\n');
  const leftover = content.match(/__[A-Z]+(?:_[A-Z]+)*__/);
  if (leftover) refuse(`template ${relative(root, template)} has an unknown placeholder ${leftover[0]}`);
  rendered.push([target, content]);
}
const written = [];
for (const [target, content] of rendered) {
  mkdirSync(dirname(join(moduleRoot, target)), { recursive: true });
  writeFileSync(join(moduleRoot, target), content);
  written.push(`modules/${name}/${target}`);
}
// A hosted module becomes a dependency of the module host, which loads it (restored if the module is rolled back).
const hostPackageFile = join(root, 'apps/module-host/package.json');
const hostPackageBefore = readFileSync(hostPackageFile, 'utf8');
if (hosting === 'host') {
  const hostPackage = JSON.parse(hostPackageBefore);
  hostPackage.dependencies = Object.fromEntries(
    Object.entries({ ...hostPackage.dependencies, [`@gigalibs/${name}-api`]: 'workspace:*' }).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(hostPackageFile, `${JSON.stringify(hostPackage, null, 2)}\n`);
}

// Regenerate everything the manifests drive; roll the module back if its manifest does not pass.
const regenerate = () =>
  spawnSync(process.execPath, [join(root, 'scripts/module-manifests.mjs'), '--write'], { encoding: 'utf8' });
const result = regenerate();
if (result.status !== 0) {
  rmSync(moduleRoot, { recursive: true, force: true });
  writeFileSync(hostPackageFile, hostPackageBefore);
  regenerate();
  console.error(result.stdout);
  refuse('the generated manifest did not pass the manifest audit; nothing was kept');
}

console.log(
  [
    `Created module ${name} (${title}): ${written.length} files, ${hosting === 'host' ? `hosted in module-host at /${name}` : `its own service on port ${port}`},`,
    `prefix ${prefix}, schema gigalibs_${snake}, catalogue entry /${name} in "${group}" (readiness PLANNED), gateway /api/${name}.`,
    'Regenerated the catalogue, gateways, upstreams, navigation, pages and runtime overlay. Next:',
    '  pnpm install',
    `  infra/compose/scripts/generate-generated-module-credentials.sh ${name}`,
    `  infra/compose/scripts/${values.__BUILD_SCRIPT__}`,
    `  pnpm module:conformance ${name} --live`,
  ].join('\n'),
);
