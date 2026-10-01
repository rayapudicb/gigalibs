import { bundledGovernedCatalogue, compileGovernedCatalogue } from '@gigalibs/configuration-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({ tenantModuleEntitlement: { findMany: vi.fn() } }));
vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { KernelPackApplicationsService } from './kernel-pack-applications.service.js';

const auth = { getSubjectContext: vi.fn(async () => ({ authVersion: 5 })) };
const activated = (kind: 'INDUSTRY_PACK' | 'COUNTRY_PACK' | 'METRIC_CATALOGUE', key: string) => {
  const manifest = compileGovernedCatalogue(bundledGovernedCatalogue(kind, key)).manifest!;
  return { tenantId: 'tenant-1', actorId: 'admin-1', activationId: 'act-1', publishedVersionId: '00000000-0000-4000-8000-0000000000c1', checksum: manifest.checksum, manifest };
};

// WI-OI-107: activation queues one pack.apply job per module that reads the pack and is enabled for the tenant.
describe('KernelPackApplicationsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues Workforce and Geospatial for an industry pack, only where the tenant is entitled, as the activating member', async () => {
    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([{ moduleKey: 'geospatial-studio' }]);
    const enqueue = vi.fn(async () => ({ id: 'job-1' }));
    const service = new KernelPackApplicationsService(auth as never, { enqueue } as never);
    expect(await service.enqueueForActivation(activated('INDUSTRY_PACK', 'agriculture'))).toEqual([{ moduleKey: 'geospatial', jobId: 'job-1' }]);
    // Entitlements are by catalogue key; the pack names modules by their manifest name.
    expect(prismaMock.tenantModuleEntitlement.findMany.mock.calls[0]![0].where.moduleKey).toEqual({ in: ['gigaops', 'geospatial-studio'] });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      type: 'module.call',
      payload: { operation: 'geospatial.pack-apply', publishedVersionId: '00000000-0000-4000-8000-0000000000c1' },
      ownerSubjectId: 'admin-1',
      ownerAuthVersion: 5,
      idempotencyKey: 'pack-apply:act-1:geospatial',
    }));
  });

  it('queues nothing for a country pack Workforce is not enabled for, or for a catalogue that is not a pack', async () => {
    prismaMock.tenantModuleEntitlement.findMany.mockResolvedValue([]);
    const enqueue = vi.fn();
    const service = new KernelPackApplicationsService(auth as never, { enqueue } as never);
    expect(await service.enqueueForActivation(activated('COUNTRY_PACK', 'in'))).toEqual([]);
    expect(await service.enqueueForActivation(activated('METRIC_CATALOGUE', 'operations'))).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
