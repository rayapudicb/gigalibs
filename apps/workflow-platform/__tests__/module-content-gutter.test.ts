import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '..');
const appLayout = readFileSync(resolve(appRoot, 'app/(app)/layout.tsx'), 'utf8');
const studioLayout = readFileSync(resolve(appRoot, 'app/(studio)/layout.tsx'), 'utf8');
const globalStyles = readFileSync(resolve(appRoot, 'app/globals.css'), 'utf8');

describe('authenticated module content gutter', () => {
  it('marks both shared viewports used by authenticated modules and studios', () => {
    expect(appLayout).toContain('data-module-content-root');
    expect(appLayout.match(/data-module-content-root/g)).toHaveLength(1);
    expect(studioLayout).toContain('data-module-content-root');
    expect(studioLayout.match(/data-module-content-root/g)).toHaveLength(1);
  });

  it('uses exactly five pixels on the left and right edges', () => {
    expect(globalStyles).toMatch(
      /\[data-module-content-root\]\s*\{[^}]*padding-inline:\s*5px;/s,
    );
  });

  it('removes legacy page-wrapper width caps without stripping bordered-card padding', () => {
    expect(globalStyles).toContain(
      '[data-module-content-root] > :where(div, main, section):not([class*="border"])',
    );
    expect(globalStyles).toContain('[class~="mx-auto"][class~="max-w-7xl"]');
    expect(globalStyles).toContain('[class~="mx-auto"][class~="max-w-[1500px]"]');
  });

  it('removes the screen gutter when printing', () => {
    expect(globalStyles).toMatch(
      /@media print\s*\{\s*\[data-module-content-root\]\s*\{\s*padding-inline:\s*0;/s,
    );
  });
});
