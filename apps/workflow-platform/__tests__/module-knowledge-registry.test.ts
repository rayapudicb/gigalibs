import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { generatedModuleMenus } from '../lib/generated/module-navigation';
import { canOpenPlatformModule } from '../lib/module-access';
import { getKnowledgeEntry } from '../lib/module-knowledge-registry';

// WI-OI-120ak (S6, owner decision D7a): help comes from the module catalogue and says only what the access check enforces.
const verifiedPages = new Set(['/gigaops/time', '/connectors']);

// Claims the 27 hand-written entries made and nothing checked.
const unprovenClaims = [
  /immutable/i,
  /AES-?256/i,
  /cryptograph/i,
  /biometric/i,
  /isolation enforced/i,
  /SOC ?2|ISO ?27001|GDPR|HIPAA/i,
  /port \d+|:\d{4}\b/i,
  /\bgigalibs_[a-z_]+\b|schema:/i,
  /real-time/i,
];

// The words the help adds. A module's status line is the catalogue's own (module.yaml `reason`), shown as written.
const addedText = (pathname: string) => {
  const entry = getKnowledgeEntry(pathname);
  const fromCatalogue = platformModuleCatalog.some((module) => module.reason === entry.summary);
  return [
    fromCatalogue ? '' : entry.summary,
    ...entry.actions,
    ...entry.guardrails,
    ...entry.limitations,
  ].join('\n');
};

describe('module help (Knowledge Hub)', () => {
  it("takes each module's title, area, status line and pages from the catalogue", () => {
    for (const module of platformModuleCatalog) {
      if (verifiedPages.has(module.route)) continue;
      const entry = getKnowledgeEntry(module.route);
      expect(entry.businessTitle).toBe(module.name);
      expect(entry.category).toBe(module.area);
      expect(entry.summary).toBe(module.reason);
      expect(entry.actions).toEqual(
        (generatedModuleMenus[module.key] ?? []).map((item) => `${item.label} (${item.path})`),
      );
      expect('technicalSpec' in entry).toBe(false);
    }
  });

  it('answers a page inside a module with the most specific module', () => {
    const gigaops = platformModuleCatalog.find((module) => module.key === 'gigaops');
    expect(gigaops).toBeDefined();
    expect(getKnowledgeEntry(`${gigaops?.route}/a-page-with-no-help`).businessTitle).toBe(
      gigaops?.name,
    );
  });

  it('says the rule the access check enforces, for every module', () => {
    for (const module of platformModuleCatalog) {
      if (verifiedPages.has(module.route)) continue;
      const [rule] = getKnowledgeEntry(module.route).guardrails;
      const preview = module.readiness === 'PLANNED';
      const member = {
        tenant: { features: [module.key] },
        permissions: module.requiredPermission ? [module.requiredPermission] : [],
        platformRoles: [] as string[],
        uatPreview: preview,
      };
      const operator = {
        tenant: { features: [] as string[] },
        permissions: [],
        platformRoles: ['PLATFORM_ADMIN'],
        uatPreview: preview,
      };

      if (module.key === 'platform-control') {
        expect(rule).toBe('Only platform operators can open it.');
        expect(canOpenPlatformModule(module, operator)).toBe(true);
        expect(canOpenPlatformModule(module, member)).toBe(false);
      } else if (module.readiness === 'CONTAINED') {
        expect(rule).toBe('Nobody can open it until it is released.');
        expect(canOpenPlatformModule(module, { ...member, uatPreview: true })).toBe(false);
        expect(canOpenPlatformModule(module, { ...operator, uatPreview: true })).toBe(false);
      } else {
        expect(rule).toContain(
          `Opening it needs the ${module.requiredPermission} permission and the module in your workspace's plan.`,
        );
        expect(canOpenPlatformModule(module, member)).toBe(true);
        expect(canOpenPlatformModule(module, { ...member, permissions: [] })).toBe(false);
        expect(canOpenPlatformModule(module, { ...member, tenant: { features: [] } })).toBe(false);
        expect(rule.includes('Platform operators can also open it')).toBe(
          module.platformInspection,
        );
        expect(canOpenPlatformModule(module, operator)).toBe(module.platformInspection);
      }
    }
  });

  it('marks a module that is not released, and only then', () => {
    for (const module of platformModuleCatalog) {
      if (verifiedPages.has(module.route)) continue;
      const { limitations } = getKnowledgeEntry(module.route);
      if (module.readiness === 'PLANNED')
        expect(limitations).toEqual([expect.stringContaining('UAT instance only')]);
      if (module.readiness === 'CONTAINED')
        expect(limitations).toEqual(['This module is not released.']);
      if (module.readiness === 'REVIEW') expect(limitations).toEqual(['This module is in review.']);
    }
  });

  it('claims nothing for a page outside every module', () => {
    const entry = getKnowledgeEntry('/some-unlisted-page');
    expect(entry.summary).toBe('No help is written for this page yet.');
    expect(entry.actions).toEqual([]);
    expect(entry.guardrails).toEqual([]);
    expect(entry.limitations).toEqual([]);
  });

  it('adds none of the unproven claims', () => {
    const pages = [
      ...platformModuleCatalog.map((module) => module.route),
      ...verifiedPages,
      '/some-unlisted-page',
    ];
    for (const page of pages) {
      for (const claim of unprovenClaims)
        expect(addedText(page), `${page} ${claim}`).not.toMatch(claim);
    }
  });
});
