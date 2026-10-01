import { describe, expect, it } from 'vitest';
import {
  CountryPackV2Schema,
  GovernedCatalogueDefinitionSchema,
  IndustryPackV1Schema,
  IndustryPackV2Schema,
  PACK_SECTION_SCHEMAS,
  SHIPPED_COUNTRY_PACKS,
  SHIPPED_INDUSTRY_PACKS,
  countryPackV2FromV1,
  industryPackV2FromV1,
  normaliseIndustryPack,
  parsePackSection,
  type CountryPackV1,
  type IndustryPackV1,
} from '../index.js';

// WI-OI-107 (ADR-0016 F10): packs at the solution layer.
describe('shipped industry and country packs', () => {
  it('parses every shipped pack against its schema and every section against its module', () => {
    expect(SHIPPED_INDUSTRY_PACKS.map((pack) => pack.slug)).toContain('agriculture');
    for (const pack of SHIPPED_INDUSTRY_PACKS) {
      const parsed = IndustryPackV2Schema.safeParse(pack);
      expect(parsed.success, `${pack.slug}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      for (const [moduleKey, section] of Object.entries(pack.modules)) {
        expect(parsePackSection('industry', moduleKey as keyof typeof PACK_SECTION_SCHEMAS.industry, section).success, `${pack.slug}.${moduleKey}`).toBe(true);
      }
    }
    expect(SHIPPED_COUNTRY_PACKS.map((pack) => pack.code).sort()).toEqual(['AU', 'EU', 'GB', 'IN', 'JP', 'US']);
    for (const pack of SHIPPED_COUNTRY_PACKS) expect(CountryPackV2Schema.safeParse(pack).success, pack.code).toBe(true);
  });

  it('keeps manufacturing exactly as it was before the move (wording, certifications, pay type, place levels)', () => {
    const manufacturing = SHIPPED_INDUSTRY_PACKS.find((pack) => pack.slug === 'manufacturing')!;
    // The values of modules/gigaops/config/industry-packs/manufacturing.json and the governed copy, before WI-OI-107.
    expect(manufacturing.modules.gigaops).toEqual({
      vocabulary: {
        terms: { workUnit: 'Shift Block', role: 'Production Line', position: 'Operator Slot', worker: 'Operator', agreement: 'Onboarding Doc' },
        roleLabels: { workforce_manager: 'Plant Manager', ops_supervisor: 'Line Supervisor', time_approver: 'Team Leader' },
        classificationLabels: { W2: 'Full-time Operator', CASUAL: 'Casual / Temp', CONTRACTOR: 'Contract Worker' },
      },
      lists: {
        certifications: [
          { slug: 'safety-induction', label: 'Safety Induction', required: true },
          { slug: 'forklift-license', label: 'Forklift License', required: false },
          { slug: 'first-aid', label: 'First Aid', required: false },
        ],
      },
      capabilities: {
        defaultPayTypeCode: '10ST',
        features: { perDiem: false, flatRates: false, guaranteedHours: true, unionSupport: true, vendorPay: false, clockPunches: true, mobileTimesheet: true },
      },
    });
    expect(manufacturing.modules.geospatial?.lists?.placeTypes.length).toBeGreaterThan(0);
  });

  it('reads a legacy V1 pack as V2 without losing anything, and still accepts installed V1 definitions', () => {
    const v1: IndustryPackV1 = IndustryPackV1Schema.parse({
      slug: 'legacy',
      label: 'Legacy',
      terminology: { workUnit: 'Job', role: 'Role', position: 'Slot', worker: 'Worker', agreement: 'Agreement' },
      requiredCertifications: [{ slug: 'first-aid', label: 'First Aid', required: false }],
      defaultPayTypeCode: 'HOURLY',
      features: { perDiem: false, flatRates: false, guaranteedHours: false, unionSupport: false, vendorPay: false, clockPunches: true, mobileTimesheet: true },
      placeTypes: [{ code: 'SITE', label: 'Site' }],
      demoProfile: SHIPPED_INDUSTRY_PACKS[0]!.demo,
    });
    const v2 = industryPackV2FromV1(v1);
    expect(IndustryPackV2Schema.parse(v2)).toEqual(v2);
    expect(v2.modules.gigaops?.vocabulary?.terms).toEqual(v1.terminology);
    expect(v2.modules.geospatial?.lists?.placeTypes).toEqual(v1.placeTypes);
    expect(normaliseIndustryPack(v1)).toEqual(v2);
    expect(normaliseIndustryPack(v2)).toBe(v2);
    const legacy = GovernedCatalogueDefinitionSchema.safeParse({
      contractVersion: '1.0', kind: 'INDUSTRY_PACK', moduleKey: 'gigaops', entityKey: 'industry-pack', surfaceKey: 'legacy', title: 'Legacy', catalogue: v1,
    });
    expect(legacy.success).toBe(true);
    const country = SHIPPED_COUNTRY_PACKS.find((pack) => pack.code === 'US')!;
    const v1Country: CountryPackV1 = {
      code: country.code,
      label: country.label,
      currency: country.currency,
      timeZones: country.timeZones,
      subdivisions: country.subdivisions,
      dataRetentionMonths: country.dataRetentionMonths,
      ...country.modules.gigaops!.rules!,
    };
    expect(countryPackV2FromV1(v1Country)).toEqual(country);
  });

  it('installs new packs only at the solution scope, as format 2', () => {
    const pack = SHIPPED_INDUSTRY_PACKS.find((candidate) => candidate.slug === 'agriculture')!;
    const definition = { contractVersion: '2.0', kind: 'INDUSTRY_PACK', moduleKey: 'solution', entityKey: 'industry-pack', surfaceKey: 'agriculture', title: 'Agriculture', catalogue: pack };
    expect(GovernedCatalogueDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(GovernedCatalogueDefinitionSchema.safeParse({ ...definition, moduleKey: 'gigaops' }).success).toBe(false);
    expect(GovernedCatalogueDefinitionSchema.safeParse({ ...definition, surfaceKey: 'farming' }).success).toBe(false);
    expect(parsePackSection('industry', 'gigaops', { vocabulary: { terms: {} } }).success).toBe(false);
  });
});
