import { type RecordExchangeRateDto, fxRateTableFromRows } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { Injectable } from '@nestjs/common';
import { resolveTenantId } from './tenant-resolver.js';

// WI-OI-120 (M-CUR, Phase 5A): the workspace exchange-rate store. A workspace records real rates for a pair with the
// moment each is effective; the live rate for a pair is the newest `asOf`. `ratesTable` assembles the base-relative
// FxRateTable the @gigalibs/multi-currency engine converts with — so conversion uses recorded rates, never a fabricated
// default. Scoped to the caller's workspace throughout; a row is never read or written across tenants.
@Injectable()
export class TenantExchangeRateService {
  /** Record a real rate for a pair. `asOf` defaults to now. Returns the stored row. */
  async recordRate(tenantId: string, createdById: string, dto: RecordExchangeRateDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.tenantExchangeRate.create({
      data: {
        tenantId: resolvedTenantId,
        baseCurrency: dto.baseCurrency,
        quoteCurrency: dto.quoteCurrency,
        rate: dto.rate,
        asOf: dto.asOf ? new Date(dto.asOf) : new Date(),
        source: dto.source,
        createdById,
      },
      select: {
        id: true,
        baseCurrency: true,
        quoteCurrency: true,
        rate: true,
        asOf: true,
        source: true,
        createdAt: true,
      },
    });
  }

  /** The live base-relative rate table for `base`: the newest rate per quote, assembled for the FX engine. */
  async ratesTable(tenantId: string, base: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const rows = await prisma.tenantExchangeRate.findMany({
      where: { tenantId: resolvedTenantId, baseCurrency: base },
      orderBy: [{ quoteCurrency: 'asc' }, { asOf: 'desc' }],
      distinct: ['quoteCurrency'],
      select: { quoteCurrency: true, rate: true, asOf: true, source: true },
    });
    return {
      base,
      table: fxRateTableFromRows(base, rows),
      rates: rows.map((row) => ({
        quoteCurrency: row.quoteCurrency,
        rate: row.rate,
        asOf: row.asOf.toISOString(),
        source: row.source,
      })),
    };
  }

  /** Every recorded rate for the workspace (optionally one base), newest first — the audit/history view. */
  async listRates(tenantId: string, base?: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const rows = await prisma.tenantExchangeRate.findMany({
      where: { tenantId: resolvedTenantId, ...(base ? { baseCurrency: base } : {}) },
      orderBy: { asOf: 'desc' },
      select: {
        id: true,
        baseCurrency: true,
        quoteCurrency: true,
        rate: true,
        asOf: true,
        source: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      asOf: row.asOf.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
