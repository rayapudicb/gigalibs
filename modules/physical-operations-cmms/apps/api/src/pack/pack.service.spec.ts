import { describe, expect, it, vi } from 'vitest';
import { CmmsPackService } from './pack.service.js';

const SAMPLE_SECTION = {
  lists: {
    assetClasses: [{ code: 'PUMP', name: 'Pumps' }],
    workOrderTypes: [{ code: 'CORR', name: 'Corrective maintenance' }],
  },
};

describe('CmmsPackService', () => {
  it('creates only missing asset classes from a manufacturing section', async () => {
    const create = vi.fn(async () => ({ id: 'class-1', code: 'PUMP', name: 'Pumps' }));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('cmms_asset_classifications')) return { rows: [] };
      if (sql.includes('INSERT INTO gigalibs_cmms.pack_sections')) return { rows: [] };
      if (sql.includes('INSERT INTO gigalibs_cmms.audit_events')) return { rows: [] };
      return { rows: [] };
    });
    const client = { query };
    const service = new CmmsPackService(
      { withTenantTransaction: async (_tenant: string, run: (c: typeof client) => Promise<unknown>) => run(client) } as never,
      { create } as never,
    );
    const result = await service.apply(
      { principal: { tenantId: 't1', subject: 'u1' }, correlationId: 'c1' } as never,
      {
        kind: 'INDUSTRY',
        key: 'manufacturing',
        version: '1.0',
        checksum: 'sha256:' + 'c'.repeat(64),
        publishedVersionId: '00000000pack0003',
        section: SAMPLE_SECTION,
      },
    );
    expect(create).toHaveBeenCalledTimes(SAMPLE_SECTION.lists.assetClasses.length);
    expect(result.createdAssetClasses).toEqual(['PUMP']);
  });
});
