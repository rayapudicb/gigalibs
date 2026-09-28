import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Pool } from 'pg';

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
  private readonly configDir: string;
  private readonly cache = new Map<string, { pack: MergedPack; expiresAt: number }>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {
    // Determine path to modules/gigaops/config
    const cwd = process.cwd();
    const candidatePaths = [
      path.resolve(cwd, 'modules/gigaops/config'),
      path.resolve(cwd, 'config'),
      path.resolve(__dirname, '../../../../config'),
      path.resolve(__dirname, '../../../config'),
    ];
    this.configDir = candidatePaths.find((p) => fs.existsSync(p)) ?? candidatePaths[0];
  }

  getIndustries(): IndustryPack[] {
    const dir = path.join(this.configDir, 'industry-packs');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }

  getCountries(): CountryPack[] {
    const dir = path.join(this.configDir, 'country-packs');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }

  loadIndustryPack(slug: string): IndustryPack {
    const filePath = path.join(this.configDir, 'industry-packs', `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Industry pack '${slug}' not found.`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  loadCountryPack(code: string): CountryPack {
    const filePath = path.join(this.configDir, 'country-packs', `${code}.json`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Country pack '${code}' not found.`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

  async activatePack(
    tenantId: string,
    industrySlug: string,
    countryCode: string,
    activatedBy?: string,
  ): Promise<MergedPack> {
    // Validate that JSONs exist
    this.loadIndustryPack(industrySlug);
    this.loadCountryPack(countryCode);

    // Deactivate previous
    await this.db.query(
      `UPDATE gigalibs_gigaops.tenant_packs 
       SET is_active = false 
       WHERE tenant_id = $1`,
      [tenantId],
    );

    // Insert new active
    await this.db.query(
      `INSERT INTO gigalibs_gigaops.tenant_packs (tenant_id, industry_slug, country_code, activated_by, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [tenantId, industrySlug, countryCode, activatedBy ?? null],
    );

    // Bust cache
    this.cache.delete(tenantId);

    return this.getActivePack(tenantId);
  }
}
