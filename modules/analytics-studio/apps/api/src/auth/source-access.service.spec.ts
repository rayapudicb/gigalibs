import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourceAccessService } from './source-access.service.js';
import type { AnalyticsPrincipal } from './authorization.js';

const principal = (permissions: string[]): AnalyticsPrincipal =>
  Object.freeze({
    tenantId: 'tenant-1',
    subject: 'user-1',
    sessionId: 'sess-1',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
    orgScope: Object.freeze({ mode: 'FLAT_TENANT' as const }),
    spatialScope: Object.freeze({ mode: 'UNBOUNDED' as const }),
  });

describe('SourceAccessService', () => {
  it('denies module sources when entitlement replica is missing', async () => {
    const db = {
      queryWithTenant: vi.fn(async (_tenant: string, sql: string) => {
        if (sql.includes('source_connections')) {
          return {
            rows: [
              {
                id: 'src-1',
                display_name: 'CMMS asset downtime',
                source_type: 'MODULE_EVENTS',
                status: 'ACTIVE',
                catalog_module_key: 'asset-maintenance',
                module_lifecycle: 'NO_DATA',
                owner_scope_policy: 'UNIT_REQUIRED',
                module_source_key: 'cmms:downtime',
              },
            ],
          };
        }
        if (sql.includes('tenant_module_entitlement_replica')) return { rows: [] };
        return { rows: [] };
      }),
    };
    const service = new SourceAccessService(db as never);
    await expect(service.assertAnalyticsSourceAccess(principal(['cmms.analytics.read']), 'src-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows entitled module sources with the module read permission', async () => {
    const db = {
      queryWithTenant: vi.fn(async (_tenant: string, sql: string) => {
        if (sql.includes('source_connections')) {
          return {
            rows: [
              {
                id: 'src-1',
                display_name: 'CMMS asset downtime',
                source_type: 'MODULE_EVENTS',
                status: 'ACTIVE',
                catalog_module_key: 'asset-maintenance',
                module_lifecycle: 'NO_DATA',
                owner_scope_policy: 'UNIT_REQUIRED',
                module_source_key: 'cmms:downtime',
              },
            ],
          };
        }
        if (sql.includes('tenant_module_entitlement_replica')) return { rows: [{ status: 'ENABLED' }] };
        return { rows: [] };
      }),
    };
    const service = new SourceAccessService(db as never);
    await expect(service.assertAnalyticsSourceAccess(principal(['cmms.analytics.read']), 'src-1')).resolves.toMatchObject({
      id: 'src-1',
    });
  });

  it('returns not found for unknown sources', async () => {
    const db = { queryWithTenant: vi.fn(async () => ({ rows: [] })) };
    const service = new SourceAccessService(db as never);
    await expect(service.assertAnalyticsSourceAccess(principal(['analytics:read']), 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
