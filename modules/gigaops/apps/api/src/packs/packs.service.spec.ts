import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PacksService } from './packs.service.js';

// The prototype pack reader now reads the packs shipped at the solution layer (WI-OI-107).
describe('GigaOps PacksService', () => {
  let mockDb: any;
  let service: PacksService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new PacksService(mockDb);
  });

  it('1. Load manufacturing pack returns correct terminology', () => {
    const pack = service.loadIndustryPack('manufacturing');
    expect(pack.slug).toBe('manufacturing');
    expect(pack.terminology.workUnit).toBe('Shift Block');
    expect(pack.terminology.role).toBe('Production Line');
    expect(pack.terminology.position).toBe('Operator Slot');
    expect(pack.terminology.worker).toBe('Operator');
  });

  it('2. Country merge overrides payroll config (e.g. CA state override)', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ industry_slug: 'manufacturing', country_code: 'US' }],
    });

    const merged = await service.getActivePack('tenant-1', 'CA');
    expect(merged.countryCode).toBe('US');
    expect(merged.currency).toBe('USD');
    expect(merged.countryPayroll.dailyRegularCap).toBe(8); // CA 8 hours
    expect(merged.countryPayroll.seventhDayRule).toBe(true);
  });

  it('3. Unknown slug throws 404', () => {
    expect(() => service.loadIndustryPack('unknown-industry-xyz')).toThrow(NotFoundException);
    expect(() => service.loadCountryPack('ZZ')).toThrow(NotFoundException);
  });

  it('4. Feature flags correctly reflect pack configuration', () => {
    const qsr = service.loadIndustryPack('qsr');
    expect(qsr.features.perDiem).toBe(false);
    expect(qsr.features.clockPunches).toBe(true);

    const eventStaffing = service.loadIndustryPack('event-staffing');
    expect(eventStaffing.features.perDiem).toBe(true);
    expect(eventStaffing.features.flatRates).toBe(true);
  });

  it('5. Lists every shipped pack, including the agriculture starter pack', () => {
    expect(service.getIndustries().map((pack) => pack.slug)).toContain('agriculture');
    expect(service.getCountries().map((pack) => pack.code)).toEqual(expect.arrayContaining(['US', 'JP']));
  });
});
