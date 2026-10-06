// WI-OI-120s (S16): writes a module's window baselines from its source, `modules/<module>/dictionary/windows.mjs`.
//   node scripts/generate-windows.mjs <module> [<module> ...]   write the windows
//   node scripts/generate-windows.mjs --check [<module> ...]    fail when a committed window differs from its source
// Without modules, every module with a `dictionary/windows.mjs` is processed. Run `pnpm modules:catalog` after writing.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { windowBuilder, windowText } from './lib/window-builder.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const named = args.filter((arg) => !arg.startsWith('--'));
const modules = named.length > 0 ? named : readdirSync(join(root, 'modules')).filter((name) => existsSync(join(root, 'modules', name, 'dictionary', 'windows.mjs')));

let failures = 0;
for (const name of modules) {
  const directory = join(root, 'modules', name, 'dictionary');
  const source = join(directory, 'windows.mjs');
  if (!existsSync(source)) {
    console.error(`${name}: no dictionary/windows.mjs`);
    failures += 1;
    continue;
  }
  const { windowSource } = await import(pathToFileURL(source).href);
  const built = windowSource((options) => windowBuilder({ moduleKey: name, ...options }));
  const committed = readdirSync(directory).filter((file) => file.endsWith('.window.json'));
  for (const [surface, window] of Object.entries(built)) {
    const file = join(directory, `${surface}.window.json`);
    const text = windowText(window);
    if (!check) {
      writeFileSync(file, text);
    } else if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`${name}/${surface}: the committed window differs from dictionary/windows.mjs`);
      failures += 1;
    }
  }
  for (const file of committed) {
    if (!(file.replace(/\.window\.json$/, '') in built)) {
      console.error(`${name}/${file}: not produced by dictionary/windows.mjs`);
      failures += 1;
    }
  }
  console.log(`${name}: ${Object.keys(built).length} windows ${check ? 'checked' : 'written'}`);
}
if (failures > 0) process.exit(1);
