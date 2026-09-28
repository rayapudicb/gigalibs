import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    tenantMember: { findUnique: vi.fn() },
    tenantDataExport: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    platformOutboxEvent: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('@gigalibs/db', () => ({
  prisma: mockPrisma,
  Prisma: {
    sql: (...args: unknown[]) => args,
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    },
  },
}));

vi.mock('./tenant-export-config.js', () => ({
  requireTenantExportSigningConfig: vi.fn(),
  getTenantExportSigningConfig: vi.fn(() => ({
    keyId: 'k1',
    privateKey: {} as any,
    publicKey: {} as any,
    publicKeyBase64: 'pk-base64',
  })),
  tenantExportPolicy: vi.fn(() => ({
    pollIntervalSeconds: 10,
    claimTimeoutSeconds: 300,
    batchSize: 5,
    expiryHours: 168,
    retryBaseSeconds: 10,
    retryMaxSeconds: 300,
    maxAttempts: 3,
  })),
}));

import { TenantDataExportService } from './tenant-data-export.service.js';
import { OutboxRelayProcessor } from './outbox-relay.processor.js';

describe('TenantDataExportService TP-2 Conformance', () => {
  let service: TenantDataExportService;
  const mockStorage = {
    createDownloadUrl: vi.fn().mockResolvedValue({
      downloadUrl: 'https://minio.local/gigalibs-exports/test.zip',
      expiresAt: new Date(Date.now() + 600_000),
    }),
    writeVerifiedObject: vi.fn(),
    deleteObject: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantDataExportService(mockStorage as any);
  });

  describe('request idempotency', () => {
    it('returns existing export record when idempotencyKey matches', async () => {
      const existing = {
        id: 'export-existing-1',
        status: 'REQUESTED',
        idempotencyKey: 'idem-key-123',
        tenantId: 'tenant-1',
      };
      mockPrisma.tenantDataExport.findUnique.mockResolvedValueOnce(existing);

      const result = await service.request('tenant-1', 'user-1', 'Routine backup', 'idem-key-123');

      expect(mockPrisma.tenantDataExport.findUnique).toHaveBeenCalledWith({
        where: { tenantId_idempotencyKey: { tenantId: 'tenant-1', idempotencyKey: 'idem-key-123' } },
        select: expect.any(Object),
      });
      expect(result).toBe(existing);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates new export and records audit when no active export exists', async () => {
      mockPrisma.tenantDataExport.findUnique.mockResolvedValueOnce(null);
      const createdRecord = {
        id: 'export-new-1',
        status: 'REQUESTED',
        tenantId: 'tenant-1',
        idempotencyKey: 'idem-key-new',
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          tenantMember: {
            findUnique: vi.fn().mockResolvedValue({
              status: 'ACTIVE',
              user: { status: 'ACTIVE' },
            }),
          },
          tenantDataExport: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdRecord),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.request('tenant-1', 'user-1', 'Monthly compliance', 'idem-key-new');

      expect(result).toBe(createdRecord);
    });

    it('rejects with ConflictException if an export is already active', async () => {
      mockPrisma.tenantDataExport.findUnique.mockResolvedValueOnce(null);

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([]),
          tenantMember: {
            findUnique: vi.fn().mockResolvedValue({
              status: 'ACTIVE',
              user: { status: 'ACTIVE' },
            }),
          },
          tenantDataExport: {
            findFirst: vi.fn().mockResolvedValue({ id: 'export-active', status: 'RUNNING' }),
          },
        };
        return callback(tx);
      });

      await expect(
        service.request('tenant-1', 'user-1', 'Monthly compliance', 'idem-key-new'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel export', () => {
    it('cancels a pending export and logs STATUS_CHANGE audit action', async () => {
      mockPrisma.tenantDataExport.findFirst.mockResolvedValueOnce({
        id: 'export-pending',
        status: 'REQUESTED',
      });
      const updated = {
        id: 'export-pending',
        status: 'CANCELLED',
        cancelledById: 'user-1',
      };
      mockPrisma.tenantDataExport.update.mockResolvedValueOnce(updated);
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      const result = await service.cancel('tenant-1', 'user-1', 'export-pending');

      expect(result).toBe(updated);
      expect(mockPrisma.tenantDataExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'export-pending' },
          data: expect.objectContaining({ status: 'CANCELLED', cancelledById: 'user-1' }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'STATUS_CHANGE',
          resource: 'tenant-data-export',
          resourceId: 'export-pending',
        }),
      });
    });

    it('rejects cancellation of already completed export', async () => {
      mockPrisma.tenantDataExport.findFirst.mockResolvedValueOnce({
        id: 'export-done',
        status: 'SUCCEEDED',
      });

      await expect(service.cancel('tenant-1', 'user-1', 'export-done')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('createDownload authority revalidation', () => {
    it('throws NotFoundException if user membership has lapsed', async () => {
      mockPrisma.tenantMember.findUnique.mockResolvedValueOnce({
        status: 'SUSPENDED',
        user: { status: 'ACTIVE' },
      });

      await expect(
        service.createDownload('tenant-1', 'user-suspended', 'export-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('generates short-lived download URL when active', async () => {
      mockPrisma.tenantMember.findUnique.mockResolvedValueOnce({
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
      });
      mockPrisma.tenantDataExport.findFirst.mockResolvedValueOnce({
        id: 'export-1',
        status: 'SUCCEEDED',
        expiresAt: new Date(Date.now() + 3_600_000),
        storageKey: 'tenant-exports/tenant-1/export-1.zip',
        archiveSha256: 'a'.repeat(64),
        archiveBytes: 1024,
      });

      const res = await service.createDownload('tenant-1', 'user-1', 'export-1');

      expect(res.downloadUrl).toBe('https://minio.local/gigalibs-exports/test.zip');
      expect(mockStorage.createDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInSeconds: 900 }), // Capped at 900s (15 min)
      );
    });
  });
});

describe('OutboxRelayProcessor', () => {
  let processor: OutboxRelayProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new OutboxRelayProcessor();
  });

  it('marks pending outbox events as PUBLISHED', async () => {
    const mockEvent = {
      id: 'event-1',
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(),
    };
    mockPrisma.platformOutboxEvent.findMany.mockResolvedValueOnce([mockEvent]);
    mockPrisma.platformOutboxEvent.update.mockResolvedValueOnce({});

    await processor.tick();

    expect(mockPrisma.platformOutboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
  });

  it('quarantines event after 5 failed attempts', async () => {
    const mockEvent = {
      id: 'event-poison',
      status: 'PENDING',
      attempts: 4,
      availableAt: new Date(),
    };
    mockPrisma.platformOutboxEvent.findMany.mockResolvedValueOnce([mockEvent]);
    mockPrisma.platformOutboxEvent.update
      .mockRejectedValueOnce(new Error('Transport down'))
      .mockResolvedValueOnce({});

    await processor.tick();

    expect(mockPrisma.platformOutboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-poison' },
        data: expect.objectContaining({
          attempts: 5,
          status: 'QUARANTINED',
        }),
      }),
    );
  });
});
