/**
 * WI-OI-107 (ADR-0016 F10): the kernel worker's view of an activated pack. A `pack.apply` job names a published pack
 * version; this reads that version (tenant-scoped) and returns one module's section with the pack's identity, as
 * the module receives it. A version that is not a pack, or has no section for the module, gives nothing.
 */

import { prisma } from '@gigalibs/db';
import {
  GovernedCatalogueDefinitionSchema,
  PackApplicationV1Schema,
  normaliseCountryPack,
  normaliseIndustryPack,
  type PackApplicationV1,
} from '@gigalibs/contracts';
import type { PackSectionSource } from './module-call.job.js';

export function packApplication(manifest: unknown, publishedVersionId: string, checksum: string, moduleKey: string): PackApplicationV1 | null {
  const definition = GovernedCatalogueDefinitionSchema.safeParse(stripCompiled(manifest));
  if (!definition.success) return null;
  const value = definition.data;
  if (value.kind === 'INDUSTRY_PACK') {
    const pack = normaliseIndustryPack(value.catalogue);
    const section = pack.modules[moduleKey as keyof typeof pack.modules];
    return section ? build('INDUSTRY', pack.slug, pack.version, checksum, publishedVersionId, section) : null;
  }
  if (value.kind === 'COUNTRY_PACK') {
    const pack = normaliseCountryPack(value.catalogue);
    const section = pack.modules[moduleKey as keyof typeof pack.modules];
    return section ? build('COUNTRY', pack.code, pack.version, checksum, publishedVersionId, section) : null;
  }
  return null;
}

function build(kind: 'INDUSTRY' | 'COUNTRY', key: string, version: string, checksum: string, publishedVersionId: string, section: object) {
  const parsed = PackApplicationV1Schema.safeParse({ kind, key, version, checksum, publishedVersionId, section });
  return parsed.success ? parsed.data : null;
}

// A published manifest is the definition plus the compiler's version and checksum.
function stripCompiled(manifest: unknown): unknown {
  if (!manifest || typeof manifest !== 'object') return manifest;
  const { compilerVersion: _version, checksum: _checksum, ...definition } = manifest as Record<string, unknown>;
  return definition;
}

export const prismaPackSections: PackSectionSource = {
  async application(tenantId, publishedVersionId, moduleKey) {
    const published = await prisma.configurationPublishedVersion.findFirst({
      where: { id: publishedVersionId, tenantId },
      select: { manifest: true, checksum: true },
    });
    return published ? packApplication(published.manifest, publishedVersionId, published.checksum, moduleKey) : null;
  },
};
