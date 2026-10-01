import { SHIPPED_COUNTRY_PACKS, SHIPPED_INDUSTRY_PACKS, type CountryPackV2, type IndustryPackV2 } from '@gigalibs/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';

// Prototype pack reader (not wired into the running Workforce service). WI-OI-107 (ADR-0016 F10): it reads the packs
// shipped at the solution layer (`solutions/packs`, compiled into @gigalibs/contracts) instead of its own JSON copies,
// and the per-tenant pack switch (`POST packs/activate`) is retired: packs are activated in Configuration Studio and
// sent to Workforce by the kernel (`v1/pack`). Removing this prototype is a package-inventory decision (F7).

export interface IndustryPack {
  slug: string;
  label: string;
  emoji: string;
  terminology: {
    workUnit: string;
    role: string;
    position: string;
    worker: string;
    agreement: string;
  };
  roleLabels?: Record<string, string>;
  classificationLabels?: Record<string, string>;
  requiredCertifications: Array<{
    slug: string;
    label: string;
    required: boolean;
  }>;
  defaultPayTypeCode: string;
  features: {
    perDiem: boolean;
    flatRates: boolean;
    guaranteedHours: boolean;
    unionSupport: boolean;
    vendorPay: boolean;
    clockPunches: boolean;
    mobileTimesheet: boolean;
  };
}

export interface CountryPack {
  code: string;
  label: string;
  currency: string;
  weeklyOtThreshold: number;
  dataRetentionMonths: number;
  payroll: {
    type: string;
    dailyRegularCap: number | null;
    dailyOtCap: number | null;
    otMultiplier: number;
    dtMultiplier: number | null;
    holidayRegularCap?: number;
    holidayOtMultiplier?: number;
    holidayDtMultiplier?: number;
    seventhDayRule: boolean;
    stateRules?: Record<
      string,
      {
        dailyRegularCap: number | null;
        dailyOtCap: number | null;
        otMultiplier: number;
        dtMultiplier: number | null;
        seventhDayRule: boolean;
      }
    >;
    deductions?: Record<string, any>;
  };
  exportFormats: Array<{
    code: string;
    label: string;
    periodDays: number;
  }>;
}

export interface MergedPack extends IndustryPack {
  countryCode: string;
  currency: string;
  weeklyOtThreshold: number;
  dataRetentionMonths: number;
  countryPayroll: CountryPack['payroll'];
  exportFormats: CountryPack['exportFormats'];
}

export const GIGAOPS_DB_POOL = 'GIGAOPS_DB_POOL';

@Injectable()
export class PacksService {
  private readonly cache = new Map<string, { pack: MergedPack; expiresAt: number }>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  getIndustries(): IndustryPack[] {
    return SHIPPED_INDUSTRY_PACKS.map(legacyIndustryPack);
  }

  getCountries(): CountryPack[] {
    return SHIPPED_COUNTRY_PACKS.map(legacyCountryPack);
  }

  loadIndustryPack(slug: string): IndustryPack {
    const pack = SHIPPED_INDUSTRY_PACKS.find((candidate) => candidate.slug === slug);
    if (!pack) throw new NotFoundException(`Industry pack '${slug}' not found.`);
    return legacyIndustryPack(pack);
  }

  loadCountryPack(code: string): CountryPack {
    const pack = SHIPPED_COUNTRY_PACKS.find((candidate) => candidate.code === code);
    if (!pack) throw new NotFoundException(`Country pack '${code}' not found.`);
    return legacyCountryPack(pack);
  }

  async getActivePack(tenantId: string, stateCode?: string): Promise<MergedPack> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.pack;
    }

    // Query active pack from DB
    const res = await this.db.query(
      `SELECT industry_slug, country_code 
       FROM gigalibs_gigaops.tenant_packs 
       WHERE tenant_id = $1 AND is_active = true 
       ORDER BY activated_at DESC LIMIT 1`,
      [tenantId],
    );

    const industrySlug = res.rows[0]?.industry_slug ?? 'manufacturing';
    const countryCode = res.rows[0]?.country_code ?? 'US';

    const industry = this.loadIndustryPack(industrySlug);
    const country = this.loadCountryPack(countryCode);

    // Deep merge: state overrides if provided
    let payrollRules = { ...country.payroll };
    if (stateCode && country.payroll.stateRules?.[stateCode]) {
      payrollRules = {
        ...payrollRules,
        ...country.payroll.stateRules[stateCode],
      };
    }

    const merged: MergedPack = {
      ...industry,
      countryCode: country.code,
      currency: country.currency,
      weeklyOtThreshold: country.weeklyOtThreshold,
      dataRetentionMonths: country.dataRetentionMonths,
      countryPayroll: payrollRules,
      exportFormats: country.exportFormats,
    };

    this.cache.set(tenantId, {
      pack: merged,
      expiresAt: Date.now() + this.TTL_MS,
    });

    return merged;
  }
}

// The prototype's own shape, from a shipped pack's Workforce sections.
function legacyIndustryPack(pack: IndustryPackV2): IndustryPack {
  const workforce = pack.modules.gigaops;
  return {
    slug: pack.slug,
    label: pack.label,
    emoji: pack.emoji ?? '',
    terminology: workforce!.vocabulary!.terms,
    ...(workforce?.vocabulary?.roleLabels ? { roleLabels: workforce.vocabulary.roleLabels } : {}),
    ...(workforce?.vocabulary?.classificationLabels ? { classificationLabels: workforce.vocabulary.classificationLabels } : {}),
    requiredCertifications: workforce?.lists?.certifications ?? [],
    defaultPayTypeCode: workforce!.capabilities!.defaultPayTypeCode,
    features: workforce!.capabilities!.features,
  };
}

function legacyCountryPack(pack: CountryPackV2): CountryPack {
  const rules = pack.modules.gigaops!.rules!;
  return {
    code: pack.code,
    label: pack.label,
    currency: pack.currency,
    weeklyOtThreshold: rules.weeklyOtThreshold,
    dataRetentionMonths: pack.dataRetentionMonths,
    payroll: rules.payroll as CountryPack['payroll'],
    exportFormats: rules.exportFormats,
  };
}
