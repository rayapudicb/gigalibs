import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { WfoPacksService } from './wfo-packs.service.js';

describe('WfoPacksService', () => {
  let mockDb: any;
  let service: WfoPacksService;

  const principal = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    subject: 'test-admin',
    roles: ['TENANT_ADMIN'],
    permissions: ['workforce:*'],
  } as any;

  beforeEach(() => {
    mockDb = {
      withTenantTransaction: vi.fn(async (_tenantId, callback) => {
        const client = {
          query: vi.fn(async (sql: string) => {
            if (sql.includes('SELECT pack_key')) {
              return { rows: [{ pack_key: 'live-events-sports', applied_at: new Date() }] };
            }
            if (sql.includes('INSERT INTO gigalibs_workforce.pack_sections')) {
              return { rowCount: 1 };
            }
            if (sql.includes('INSERT INTO gigalibs_gigaops.tenant_packs')) {
              return { rows: [{ id: '22222222-2222-4222-8222-222222222222' }] };
            }
            return { rows: [] };
          }),
        };
        return callback(client);
      }),
    };
    service = new WfoPacksService(mockDb);
  });

  it('1. List packs returns all packaged industry packs with status and metadata', async () => {
    const packs = await service.listPacks(principal);
    expect(packs.length).toBe(3);
    const slugs = packs.map((p) => p.slug);
    expect(slugs).toContain('live-events-sports');
    expect(slugs).toContain('manufacturing');
    expect(slugs).toContain('healthcare');

    const liveEvents = packs.find((p) => p.slug === 'live-events-sports');
    expect(liveEvents).toBeDefined();
    expect(liveEvents?.isActive).toBe(true);
    expect(liveEvents?.complianceDocsCount).toBeGreaterThan(0);
  });

  it('2. Activate pack records active section and returns activated confirmation', async () => {
    const result = await service.activatePack(principal, 'manufacturing', 'US');
    expect(result.industrySlug).toBe('manufacturing');
    expect(result.countryCode).toBe('US');
    expect(result.isActive).toBe(true);
  });

  it('3. Unknown pack throws NotFoundException', async () => {
    await expect(service.activatePack(principal, 'space-mining-pack', 'US')).rejects.toThrow(
      NotFoundException,
    );
  });
});
