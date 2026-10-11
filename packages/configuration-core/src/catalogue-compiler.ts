import { createHash } from 'node:crypto';
import {
  GovernedCatalogueDefinitionSchema,
  SHIPPED_COUNTRY_PACKS,
  SHIPPED_INDUSTRY_PACKS,
  SOLUTION_CONFIGURATION_MODULE_KEY,
  normaliseCountryPack,
  normaliseIndustryPack,
  type AssistantPolicyV1,
  type GovernedCatalogueDefinition,
  type GovernedCatalogueKind,
} from '@gigalibs/contracts';
import { BUNDLED_METRIC_CATALOGUES } from './governed-catalogues.js';
import { CONFIGURATION_COMPILER_VERSION, canonicalJson, type ConfigurationFinding } from './index.js';

export type CompiledGovernedCatalogue = GovernedCatalogueDefinition & {
  compilerVersion: string;
  checksum: string;
};

const DEFAULT_ASSISTANT_POLICY_V1: AssistantPolicyV1 = {
  formatVersion: 1,
  enabled: false,
  retentionDays: 30,
  model: { mode: 'DISABLED' },
  allowedToolKeys: [],
  credentialReference: null,
  displayName: 'GigaLibs Assistant',
  locale: 'en',
};

/** WI-OI-064c: validates a governed catalogue and produces a checksummed manifest, like compileConfiguration. */
export function compileGovernedCatalogue(input: unknown): {
  valid: boolean;
  findings: ConfigurationFinding[];
  manifest?: CompiledGovernedCatalogue;
} {
  const parsed = GovernedCatalogueDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      findings: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA_INVALID',
        path: issue.path.join('.'),
        message: issue.message,
        severity: 'ERROR',
      })),
    };
  }
  const canonical = canonicalJson(parsed.data);
  const checksum = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  return {
    valid: true,
    findings: [],
    manifest: { ...parsed.data, compilerVersion: CONFIGURATION_COMPILER_VERSION, checksum },
  };
}

/**
 * Breaking when a published catalogue loses an entry that consumers may reference: a metric key, a place type,
 * or a subdivision. Additions and label changes are compatible. Legacy (V1) and solution-layer (V2) packs compare
 * by the same entries, so moving a tenant from one to the other is judged on content.
 */
export function classifyGovernedCatalogueChange(
  previous: GovernedCatalogueDefinition,
  next: GovernedCatalogueDefinition,
): 'COMPATIBLE' | 'BREAKING' {
  // A tenant policy change can alter data access or retention. It must be reviewed as
  // breaking even when it only changes presentation; no downstream consumer may infer safety.
  if (previous.kind === 'ASSISTANT_POLICY' || next.kind === 'ASSISTANT_POLICY')
    return previous.kind === next.kind && canonicalJson(previous.catalogue) === canonicalJson(next.catalogue)
      ? 'COMPATIBLE' : 'BREAKING';
  const keys = (definition: GovernedCatalogueDefinition): Set<string> => {
    switch (definition.kind) {
      case 'METRIC_CATALOGUE':
        return new Set(definition.catalogue.metrics.map((metric) => `metric:${metric.key}`));
      case 'INDUSTRY_PACK':
        return new Set(
          (normaliseIndustryPack(definition.catalogue).modules.geospatial?.lists?.placeTypes ?? []).map((type) => `place:${type.code}`),
        );
      case 'COUNTRY_PACK':
        return new Set(normaliseCountryPack(definition.catalogue).subdivisions.map((subdivision) => `subdivision:${subdivision.code}`));
      case 'ASSISTANT_POLICY':
        return new Set();
    }
  };
  const after = keys(next);
  return [...keys(previous)].every((key) => after.has(key)) ? 'COMPATIBLE' : 'BREAKING';
}

/** A platform-shipped catalogue as a draft definition a tenant can install, or undefined when unknown. */
export function bundledGovernedCatalogue(
  kind: GovernedCatalogueKind,
  surfaceKey: string,
): GovernedCatalogueDefinition | undefined {
  switch (kind) {
    case 'METRIC_CATALOGUE': {
      const bundled = BUNDLED_METRIC_CATALOGUES.find((candidate) => candidate.key === surfaceKey);
      return bundled
        ? { contractVersion: '1.0', kind, moduleKey: 'analytics-studio', entityKey: 'metric-catalogue', surfaceKey, title: bundled.title, catalogue: bundled.catalogue }
        : undefined;
    }
    // WI-OI-107: packs are installed at the solution scope, as format 2.
    case 'INDUSTRY_PACK': {
      const pack = SHIPPED_INDUSTRY_PACKS.find((candidate) => candidate.slug === surfaceKey);
      return pack
        ? { contractVersion: '2.0', kind, moduleKey: SOLUTION_CONFIGURATION_MODULE_KEY, entityKey: 'industry-pack', surfaceKey, title: pack.label, catalogue: pack }
        : undefined;
    }
    case 'COUNTRY_PACK': {
      const pack = SHIPPED_COUNTRY_PACKS.find((candidate) => candidate.code.toLowerCase() === surfaceKey);
      return pack
        ? { contractVersion: '2.0', kind, moduleKey: SOLUTION_CONFIGURATION_MODULE_KEY, entityKey: 'country-pack', surfaceKey, title: pack.label, catalogue: pack }
        : undefined;
    }
    case 'ASSISTANT_POLICY':
      return surfaceKey === 'assistant-default'
        ? {
            contractVersion: '1.0', kind, moduleKey: 'gigalibs-assistant', entityKey: 'tenant-policy',
            surfaceKey, title: 'Assistant tenant policy',
            description: 'Disabled-by-default Assistant settings; publishing does not enable inference or tools.',
            catalogue: DEFAULT_ASSISTANT_POLICY_V1,
          }
        : undefined;
  }
}

/** Every platform-shipped catalogue, for the Configuration Studio install list. */
export function listBundledGovernedCatalogues(): readonly { kind: GovernedCatalogueKind; surfaceKey: string; title: string }[] {
  return Object.freeze([
    ...BUNDLED_METRIC_CATALOGUES.map((item) => ({ kind: 'METRIC_CATALOGUE' as const, surfaceKey: item.key, title: item.title })),
    ...SHIPPED_INDUSTRY_PACKS.map((pack) => ({ kind: 'INDUSTRY_PACK' as const, surfaceKey: pack.slug, title: pack.label })),
    ...SHIPPED_COUNTRY_PACKS.map((pack) => ({ kind: 'COUNTRY_PACK' as const, surfaceKey: pack.code.toLowerCase(), title: pack.label })),
    { kind: 'ASSISTANT_POLICY' as const, surfaceKey: 'assistant-default', title: 'Assistant tenant policy' },
  ]);
}
