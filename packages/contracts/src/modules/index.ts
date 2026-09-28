import { generatedPlatformModuleCatalog } from './catalog.generated.js';

export type PlatformModuleReadiness = 'AVAILABLE' | 'REVIEW' | 'CONTAINED' | 'PLANNED';

// The sidebar groups, in display order (WI-OI-083c). Each catalogue entry picks its group in its manifest.
export type PlatformModuleArea =
  | 'Studio & Build'
  | 'Automate & Run'
  | 'Workforce & Operations'
  | 'Financial Operations'
  | 'Intelligence'
  | 'Data & Documents'
  | 'Platform';

// The shell's navigation icon set (WI-OI-083c). A manifest picks one by name, so a new module needs no shell change.
export type PlatformModuleIcon =
  | 'arrow-left-right'
  | 'bar-chart'
  | 'boxes'
  | 'building'
  | 'check-circle'
  | 'clock'
  | 'coins'
  | 'cpu'
  | 'credit-card'
  | 'database'
  | 'factory'
  | 'file-check'
  | 'file-signature'
  | 'file-text'
  | 'key-round'
  | 'lock'
  | 'map-pin'
  | 'message-square'
  | 'network'
  | 'radio'
  | 'scale'
  | 'scan-line'
  | 'server'
  | 'settings'
  | 'shield-alert'
  | 'shield-check'
  | 'shopping-bag'
  | 'sparkles'
  | 'workflow'
  | 'zap';

export interface PlatformModuleDefinition {
  key: string;
  name: string;
  navigationLabel: string;
  area: string;
  navigationGroup: PlatformModuleArea;
  route: `/${string}`;
  iconKey: PlatformModuleIcon;
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
