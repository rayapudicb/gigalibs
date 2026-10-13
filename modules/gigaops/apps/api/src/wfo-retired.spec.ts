import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { GigaOpsModule } from './gigaops.module.js';

// WI-OI-120u Slice 3 (U20a; owner "retire all", 2026-10-13): the WFO surfaces are retired. No route of the Workforce API
// reaches them, so nothing new is written to their tables; the services stay until they are removed after T1b.
describe('retired WFO surfaces', () => {
  const controllers = (Reflect.getMetadata('controllers', GigaOpsModule) ?? []) as (new (...args: never[]) => unknown)[];
  const paths = controllers.map((controller) => String(Reflect.getMetadata('path', controller) ?? ''));

  it('mounts no WFO controller and no wfo route', () => {
    expect(controllers.length).toBeGreaterThan(0);
    expect(controllers.map((controller) => controller.name).filter((name) => /^Wfo/.test(name))).toEqual([]);
    expect(paths.filter((path) => /^\/?wfo(\/|$)/.test(path))).toEqual([]);
  });

  it('still serves the canonical Workforce routes', () => {
    for (const path of ['v1/resources', 'v1/absences', 'v1/bookings', 'v1/punches', 'v1/timesheets']) expect(paths).toContain(path);
  });
});
