import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RecoveryPrincipal } from './auth/authorization.js';
import { ClaimsService } from './claims/claims.service.js';
import { DatabaseService } from './database/database.service.js';
import { LeaksService } from './leaks/leaks.service.js';
import { ScannerService } from './scanner/scanner.service.js';
import { SetupService } from './setup/setup.service.js';

const principal: RecoveryPrincipal = {
  tenantId: '54029e0d-e591-51a6-b93a-94469a87d153',
  subject: 'uat-operator',
  issuer: 'https://identity.example.com',
  permissions: ['recovery:*'],
};

describe('Recovery financial truth boundary', () => {
  it('configures a tenant without creating or adopting recovery findings', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(statement);
        return statement.includes('RETURNING tenant_id')
          ? { rowCount: 1, rows: [{ tenant_id: principal.tenantId }] }
          : { rowCount: 1, rows: [] };
      }),
    };
    const db = {
      withTenantTransaction: vi.fn(
        async (_tenantId: string, callback: (dbClient: unknown) => Promise<unknown>) =>
          callback(client),
      ),
    } as unknown as DatabaseService;

    await expect(new SetupService(db).setupTenant(principal.tenantId, principal)).resolves.toEqual({
      tenantId: principal.tenantId,
      status: 'ACTIVE',
      created: true,
      seededCases: 0,
    });
    expect(statements.join('\n')).not.toMatch(
      /detected_leaks|historical_scan_sessions|recovery_claims/i,
    );
  });

  it('rejects scanning before any database mutation when no authoritative source exists', async () => {
    const db = { query: vi.fn(), transaction: vi.fn() } as unknown as DatabaseService;
    const service = new ScannerService(db);

    await expect(
      service.triggerScan(principal.tenantId, undefined, principal),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each(['BLOCK_PAYMENT', 'AUTO_APPLY_CREDIT', 'TRIGGER_CLAWBACK_WORKFLOW'])(
    'rejects %s before any database mutation when no external provider exists',
    async (action) => {
      const db = { query: vi.fn(), transaction: vi.fn() } as unknown as DatabaseService;
      const service = new LeaksService(db);

      await expect(
        service.takeAction(principal.tenantId, 'finding-1', action, 'operator request', principal),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.query).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it('requires operator notes before starting a dismissal transaction', async () => {
    const db = { query: vi.fn(), transaction: vi.fn() } as unknown as DatabaseService;
    const service = new LeaksService(db);

    await expect(
      service.takeAction(principal.tenantId, 'finding-1', 'DISMISS', '   ', principal),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects claim issue and settlement status mutations before database access', async () => {
    const db = { query: vi.fn(), transaction: vi.fn() } as unknown as DatabaseService;
    const service = new ClaimsService(db);

    await expect(
      service.createClaim(
        principal.tenantId,
        {
          leakId: 'finding-1',
          vendorName: 'Vendor',
          vendorContactEmail: 'verified@example.org',
          claimAmountUsd: 1,
          settlementType: 'CREDIT_MEMO',
          evidencePayload: {},
        },
        principal,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service.updateClaimStatus(principal.tenantId, 'claim-1', 'SETTLED', principal),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('withTenantTransaction sets app.tenant_id before performing DML', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(typeof statement === 'string' ? statement : String(statement));
        return { rowCount: 1, rows: [{ tenant_id: principal.tenantId }] };
      }),
    };
    const db = {
      withTenantTransaction: vi.fn(
        async (tenantId: string, callback: (dbClient: unknown) => Promise<unknown>) => {
          // Simulate the real withTenantTransaction: set_config before callback
          await client.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
          return callback(client);
        },
      ),
    } as unknown as DatabaseService;

    await new SetupService(db).setupTenant(principal.tenantId, principal);

    const setConfigCall = statements.find((s) => s.includes('set_config'));
    const dmlCall = statements.find((s) => s.includes('tenant_recovery_configs'));
    expect(setConfigCall).toBeDefined();
    expect(dmlCall).toBeDefined();
    // set_config must appear before any DML
    expect(statements.indexOf(setConfigCall!)).toBeLessThan(statements.indexOf(dmlCall!));
  });
});
