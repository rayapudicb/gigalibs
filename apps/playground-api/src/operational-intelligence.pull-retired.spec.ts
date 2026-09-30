import { BadRequestException, GoneException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  sourceConnection: { findFirst: vi.fn() },
  connectorAttempt: { create: vi.fn() },
  tenantEnvironment: { findFirst: vi.fn() },
}));
vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));
vi.mock('./tenant-resolver.js', () => ({ resolveTenantId: async (tenantId: string) => tenantId }));

import { OperationalIntelligenceService } from './operational-intelligence.service.js';

const service = () =>
  new OperationalIntelligenceService(
    {} as never, // credentials
    {} as never, // profiler
    {} as never, // JSON schema
    {} as never, // payload crypto
    {} as never, // object storage
    {} as never, // payload parser
  );

const pulled = (interfaceType: string) => ({
  id: 'conn-1',
  tenantId: 'tenant-1',
  environmentId: 'env-1',
  endpoint: 'https://source.example.invalid',
  interfaceType,
  status: 'READY',
  circuitOpenUntil: null,
  configuration: {},
  credentialReference: null,
});

// WI-OI-104f (ADR-0016 F8, owner option A): pulling outside systems moved to Connector Hub.
describe('core source connections after the pull retirement', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['REST', 'CSV_HTTP', 'POSTGRESQL'])('refuses to create a %s connection and points to Connector Hub', async (interfaceType) => {
    const refusal = service().createConnection('tenant-1', 'user-1', { interfaceType, environmentId: 'env-1' } as never);
    await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
    await expect(refusal).rejects.toThrow('Connector Hub');
    expect(prismaMock.tenantEnvironment.findFirst).not.toHaveBeenCalled();
  });

  it.each(['REST', 'POSTGRESQL'])('answers gone when an existing %s connection is tested or profiled, before recording an attempt', async (interfaceType) => {
    prismaMock.sourceConnection.findFirst.mockResolvedValue(pulled(interfaceType));
    await expect(service().testConnection('tenant-1', 'user-1', 'conn-1')).rejects.toBeInstanceOf(GoneException);
    await expect(service().profileConnection('tenant-1', 'user-1', 'conn-1')).rejects.toBeInstanceOf(GoneException);
    expect(prismaMock.connectorAttempt.create).not.toHaveBeenCalled();
  });
});
