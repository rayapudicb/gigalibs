import { readFileSync } from 'node:fs';
import { SPEED_SECTIONS, surfaceOf } from '@gigalibs/process-safety-screening-web';
import { describe, expect, it } from 'vitest';
import { moduleMenu } from '../lib/module-navigation';

// WI-OI-120cb (owner, 2026-10-21): SPEED is its own sidebar section like EAM. Each menu item opens its own generated
// page, which shows that screen's window; /speed opens Projects.

const page = (route: string) =>
  readFileSync(new URL(`../app/(app)${route}/page.tsx`, import.meta.url), 'utf8');

describe('SPEED sidebar section (WI-OI-120cb)', () => {
  const menu = moduleMenu('process-safety-screening');

  it('lists every SPEED screen once', () => {
    expect(menu.map((item) => item.key)).toEqual(Object.keys(SPEED_SECTIONS));
  });

  it.each(menu.map((item) => [item.href, item.key] as const))(
    '%s is a generated page showing its screen with the session permissions',
    (href, key) => {
      const source = page(href);
      expect(source).toContain(`<SpeedWorkspace section={"${key}"} permissions=`);
      expect(surfaceOf(key)).toBe(SPEED_SECTIONS[key as keyof typeof SPEED_SECTIONS]);
    },
  );

  it('opens Projects at /speed, and for a section it does not know', () => {
    expect(page('/speed')).toContain('<SpeedWorkspace section={"projects"}');
    expect(surfaceOf(undefined)).toBe('speed-projects');
    expect(surfaceOf('unknown')).toBe('speed-projects');
  });
});
