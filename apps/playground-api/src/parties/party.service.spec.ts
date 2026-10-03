import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartyService } from './party.service.js';
import { prisma } from '@gigalibs/db';
import { ConflictException, BadRequestException } from '@nestjs/common';

vi.mock('@gigalibs/db', () => ({
  prisma: {
    party: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    partyRole: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    partyAddress: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    partyContactPoint: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    partyIdentifier: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    partyOrgAssignment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    partyIdempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    configurationExtensionValue: {
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    controlOutboxEvent: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  Prisma: {
    JsonNull: null,
  },
}));

describe('PartyService', () => {
  let service: PartyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PartyService();
  });

  describe('createParty', () => {
    it('creates a canonical party with initial roles and org assignments', async () => {
      vi.mocked(prisma.partyIdempotencyRecord.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.party.findFirst).mockResolvedValue(null);

      const mockParty = {
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: 'tenant-1',
        code: 'ACME_CORP',
        legalName: 'Acme Corporation',
        displayName: 'Acme',
        partyType: 'ORGANIZATION',
        status: 'ACTIVE',
        classification: 'ENTERPRISE',
        version: 1,
        survivorPartyId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        createdById: 'user-admin',
        updatedById: 'user-admin',
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          party: { create: vi.fn().mockResolvedValue(mockParty) },
          partyRole: {
            create: vi.fn().mockResolvedValue({
              id: '22222222-2222-2222-2222-222222222222',
              tenantId: 'tenant-1',
              partyId: mockParty.id,
              roleType: 'CUSTOMER',
              status: 'ACTIVE',
              metadata: {},
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          partyOrgAssignment: {
            create: vi.fn().mockResolvedValue({
              id: '33333333-3333-3333-3333-333333333333',
              tenantId: 'tenant-1',
              partyId: mockParty.id,
              orgUnitId: 'org-hq',
              assignmentPurpose: 'OPERATIONAL',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          controlOutboxEvent: { create: vi.fn().mockResolvedValue({}) },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
          partyIdempotencyRecord: { create: vi.fn().mockResolvedValue({}) },
          configurationExtensionValue: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.createParty('tenant-1', 'user-admin', {
        code: 'ACME_CORP',
        legalName: 'Acme Corporation',
        displayName: 'Acme',
        partyType: 'ORGANIZATION',
        classification: 'ENTERPRISE',
        initialRoles: ['CUSTOMER'],
        orgUnitIds: ['org-hq'],
      });

      expect(result.party.code).toBe('ACME_CORP');
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0]!.roleType).toBe('CUSTOMER');
      expect(result.orgAssignments).toHaveLength(1);
    });

    it('rejects duplicate party codes within the same tenant', async () => {
      vi.mocked(prisma.partyIdempotencyRecord.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.party.findFirst).mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: 'tenant-1',
        code: 'ACME_CORP',
      } as any);

      await expect(
        service.createParty('tenant-1', 'user-admin', {
          code: 'ACME_CORP',
          legalName: 'Acme',
          partyType: 'ORGANIZATION',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateParty', () => {
    it('rejects version conflicts during optimistic update', async () => {
      vi.mocked(prisma.party.findFirst).mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: 'tenant-1',
        code: 'ACME_CORP',
        version: 5,
        status: 'ACTIVE',
      } as any);

      await expect(
        service.updateParty('tenant-1', '11111111-1111-1111-1111-111111111111', 'user-admin', {
          expectedVersion: 4, // Mismatch!
          legalName: 'Updated Name',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('mergeParties', () => {
    it('rejects self-merge requests', async () => {
      await expect(
        service.mergeParties('tenant-1', 'user-admin', {
          sourcePartyId: '11111111-1111-1111-1111-111111111111',
          targetPartyId: '11111111-1111-1111-1111-111111111111',
          sourceExpectedVersion: 1,
          targetExpectedVersion: 1,
          reason: 'Duplicate merger test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
