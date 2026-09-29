import { platformModuleCatalog } from '@gigalibs/contracts';

/**
 * True while a catalogue entry is frozen and locked (readiness CONTAINED or PLANNED; ADR-0016 F6, WI-OI-102e/f). Its web
 * routes refuse every caller, so suites that exercise the route behaviour behind the lock are skipped while it holds
 * and run again automatically when the owner revives the module. `module-access.test.ts` proves the lock itself.
 */
export function isLockedModule(key: string): boolean {
  const entry = platformModuleCatalog.find((module) => module.key === key);
  if (!entry) throw new Error(`Unknown catalogue entry ${key}`);
  return entry.readiness === 'CONTAINED' || entry.readiness === 'PLANNED';
}
