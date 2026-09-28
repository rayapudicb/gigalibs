import { generatedPlatformModuleCatalog } from './catalog.generated.js';

export type PlatformModuleReadiness = 'AVAILABLE' | 'REVIEW' | 'CONTAINED' | 'PLANNED';

export type PlatformModuleArea =
  | 'Executive Intelligence'
  | 'Financial Operations'
  | 'Physical Operations & CMMS'
  | 'Studio & Orchestration'
  | 'Platform Administration';

export interface PlatformModuleDefinition {
  key: string;
  name: string;
  navigationLabel: string;
  area: string;
  navigationGroup: PlatformModuleArea;
  route: `/${string}`;
  iconKey: string;
  readiness: PlatformModuleReadiness;
  entitlementEligible: boolean;
  trialEligible: boolean;
  requiredPermission: string | null;
  platformInspection: boolean;
  reason: string;
}

// WI-OI-013 / WI-OI-039 / WI-OI-081: this is the single code-owned catalogue consumed by entitlement
// policy and the assembled application. Each entry is declared by its owning manifest
// (`modules/<module>/module.yaml` or `platform/core.yaml`) and generated into catalog.generated.ts by
// `pnpm modules:catalog`; `pnpm audit:module-manifests` fails if they drift. A later Configuration Studio
// registry may activate published presentation metadata, but it cannot independently change readiness,
// permissions, or entitlement eligibility.
export const platformModuleCatalog: readonly PlatformModuleDefinition[] =
  generatedPlatformModuleCatalog;

export const trialModuleKeys = platformModuleCatalog
  .filter((module) => module.trialEligible)
  .map((module) => module.key);

export function assertEligibleModuleKeys(moduleKeys: readonly string[]): string[] {
  const eligible = new Set(
    platformModuleCatalog
      .filter((module) => module.entitlementEligible)
      .map((module) => module.key),
  );
  const unique = [...new Set(moduleKeys)];
  const invalid = unique.filter((key) => !eligible.has(key));
  if (invalid.length > 0) {
    throw new Error(`Modules are not eligible for enablement: ${invalid.join(', ')}`);
  }
  return unique;
}
