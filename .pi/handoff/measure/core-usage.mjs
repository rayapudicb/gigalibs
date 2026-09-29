import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const layers = JSON.parse(readFileSync('config/package-layers.json', 'utf8'));
// all workspace package.json files
const pkgs = new Map(); // name -> {dir, deps}
function walk(dir, depth) {
  if (depth > 5) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || ['node_modules', 'dist', '.next', '.git', '.turbo', 'coverage'].includes(e.name)) continue;
    const d = join(dir, e.name);
    const pj = join(d, 'package.json');
    if (existsSync(pj)) {
      try { const p = JSON.parse(readFileSync(pj, 'utf8')); if (p.name) pkgs.set(p.name, { dir: d.slice(root.length + 1), deps: Object.keys({ ...p.dependencies, ...p.peerDependencies }) }); } catch {}
    }
    walk(d, depth + 1);
  }
}
for (const top of ['apps', 'packages', 'modules']) walk(join(root, top), 0);
const byDir = new Map([...pkgs].map(([n, v]) => [v.dir, n]));
const reach = (startDirs) => {
  const seen = new Set(); const stack = startDirs.map((d) => byDir.get(d)).filter(Boolean);
  while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); for (const d of pkgs.get(n)?.deps ?? []) if (pkgs.has(d)) stack.push(d); }
  return seen;
};
const deployedModuleDirs = [...pkgs.values()].map((v) => v.dir).filter((d) => /^modules\/(physical-operations-cmms|geospatial|analytics-studio|universal-connector-hub|gigaops)\/apps\/[^/]+$/.test(d));
const api = reach(['apps/playground-api']);
const web = reach(['apps/workflow-platform']);
const mods = reach(deployedModuleDirs);
const count = (dir, re) => { let n = 0; const w = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'dist', '.turbo'].includes(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) w(p); else if (re.test(e.name)) n++; } }; if (existsSync(dir)) w(dir); return n; };
const rows = [];
for (const dir of layers.core) {
  const name = byDir.get(dir);
  const tests = count(dir, /\.(test|spec)\.(ts|tsx|js|mjs)$/);
  const src = count(join(dir, 'src'), /^(?!.*\.(test|spec)\.).*\.(ts|tsx)$/);
  rows.push({ dir: dir.replace('packages/', ''), used: [api.has(name) && 'api', web.has(name) && 'web', mods.has(name) && 'modules'].filter(Boolean).join('+') || 'UNUSED', src, tests });
}
console.log('deployed module dirs:', deployedModuleDirs.join(', '));
rows.sort((a, b) => (a.used === 'UNUSED') - (b.used === 'UNUSED') || a.dir.localeCompare(b.dir));
for (const r of rows) console.log(r.dir.padEnd(30), r.used.padEnd(16), String(r.src).padStart(4), 'src', String(r.tests).padStart(4), 'tests');
const unused = rows.filter((r) => r.used === 'UNUSED');
console.log(`\nused by the running product: ${rows.length - unused.length}; not used by any running app: ${unused.length}; with no tests: ${rows.filter((r) => r.tests === 0).length}; used AND tested: ${rows.filter((r) => r.used !== 'UNUSED' && r.tests > 0).length}`);
