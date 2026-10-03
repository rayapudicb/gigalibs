import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@gigalibs/db';
import type {
  CreatePartyInputV1,
  UpdatePartyInputV1,
  ArchivePartyInputV1,
  MergePartiesInputV1,
  AddPartyRoleInputV1,
  UpdatePartyRoleInputV1,
  AddPartyAddressInputV1,
  UpdatePartyAddressInputV1,
  AddPartyContactInputV1,
  UpdatePartyContactInputV1,
  AddPartyIdentifierInputV1,
  AssignPartyOrgInputV1,
  PartyListQueryV1,
  PartyDetailResponseV1,
  PartyV1,
  PartyRoleV1,
  PartyAddressV1,
  PartyContactPointV1,
  PartyIdentifierV1,
  PartyOrgAssignmentV1,
} from '@gigalibs/contracts';

@Injectable()
export class PartyService {
  /**
   * Create a new canonical Party.
   */
  async createParty(
    tenantId: string,
    actorId: string,
    input: CreatePartyInputV1,
    idempotencyKey?: string,
  ): Promise<PartyDetailResponseV1> {
    if (idempotencyKey) {
      const cached = await this.findIdempotency(tenantId, actorId, 'createParty', idempotencyKey, input);
      if (cached) return cached as PartyDetailResponseV1;
    }

    const existing = await prisma.party.findFirst({
      where: { tenantId, code: input.code },
    });
    if (existing) {
      throw new ConflictException(`Party with code "${input.code}" already exists in this tenant.`);
    }

    const partyId = randomUUID();
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          id: partyId,
          tenantId,
          code: input.code,
          legalName: input.legalName,
          displayName: input.displayName ?? input.legalName,
          partyType: input.partyType,
          status: 'ACTIVE',
          classification: input.classification ?? null,
          version: 1,
          createdById: actorId,
          updatedById: actorId,
          createdAt: now,
          updatedAt: now,
        },
      });

      // Initial roles
      const roles: PartyRoleV1[] = [];
      if (input.initialRoles && input.initialRoles.length > 0) {
        for (const roleType of input.initialRoles) {
          const role = await tx.partyRole.create({
            data: {
              id: randomUUID(),
              tenantId,
              partyId: party.id,
              roleType,
              status: 'ACTIVE',
              metadata: {},
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
          });
          roles.push(this.mapRole(role));
        }
      }

      // Org assignments
      const orgAssignments: PartyOrgAssignmentV1[] = [];
      if (input.orgUnitIds && input.orgUnitIds.length > 0) {
        for (const orgUnitId of input.orgUnitIds) {
          const assignment = await tx.partyOrgAssignment.create({
            data: {
              id: randomUUID(),
              tenantId,
              partyId: party.id,
              orgUnitId,
              assignmentPurpose: 'OPERATIONAL',
              createdAt: now,
              updatedAt: now,
            },
          });
          orgAssignments.push(this.mapOrgAssignment(assignment));
        }
      }

      // Custom extensions in PartyExtensionSnapshot if provided
      if (input.customExtensions && Object.keys(input.customExtensions).length > 0) {
        await tx.partyExtensionSnapshot.create({
          data: {
            id: randomUUID(),
            tenantId,
            partyId: party.id,
            manifestChecksum: 'party-v1-snapshot-checksum-0000000000000000000000000000000000000000',
            snapshotPayload: input.customExtensions as Prisma.InputJsonValue,
            capturedAt: now,
          },
        });
      }

      // Outbox event
      await this.publishOutbox(tx, tenantId, party.id, 'party.created.v1', {
        partyId: party.id,
        code: party.code,
        legalName: party.legalName,
        displayName: party.displayName,
        partyType: party.partyType,
        status: party.status,
        classification: party.classification,
        version: party.version,
      });

      // Audit log
      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party', party.id, 'Created party', null, party);

      const response: PartyDetailResponseV1 = {
        party: this.mapParty(party),
        roles,
        identifiers: [],
        contacts: [],
        addresses: [],
        orgAssignments,
        customExtensions: input.customExtensions,
      };

      if (idempotencyKey) {
        await this.saveIdempotency(tx, tenantId, actorId, 'createParty', idempotencyKey, input, response, 201);
      }

      return response;
    });

    return result;
  }

  /**
   * Update an existing Party with optimistic locking.
   */
  async updateParty(
    tenantId: string,
    partyId: string,
    actorId: string,
    input: UpdatePartyInputV1,
  ): Promise<PartyDetailResponseV1> {
    const existing = await prisma.party.findFirst({
      where: { tenantId, id: partyId },
    });
    if (!existing) {
      throw new NotFoundException(`Party "${partyId}" not found.`);
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictException(
        `Party version conflict: expected ${input.expectedVersion}, current version is ${existing.version}.`,
      );
    }

    if (existing.status === 'ARCHIVED' || existing.status === 'MERGED') {
      throw new BadRequestException(`Cannot update party in ${existing.status} status.`);
    }

    const now = new Date();
    const nextVersion = existing.version + 1;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.party.update({
        where: { id: partyId },
        data: {
          legalName: input.legalName ?? existing.legalName,
          displayName: input.displayName ?? existing.displayName,
          status: input.status ?? existing.status,
          classification: input.classification !== undefined ? input.classification : existing.classification,
          version: nextVersion,
          updatedById: actorId,
          updatedAt: now,
        },
      });

      if (input.customExtensions) {
        const existingSnap = await tx.partyExtensionSnapshot.findFirst({
          where: { tenantId, partyId },
        });
        if (existingSnap) {
          await tx.partyExtensionSnapshot.update({
            where: { id: existingSnap.id },
            data: {
              snapshotPayload: input.customExtensions as Prisma.InputJsonValue,
              capturedAt: now,
            },
          });
        } else {
          await tx.partyExtensionSnapshot.create({
            data: {
              id: randomUUID(),
              tenantId,
              partyId,
              manifestChecksum: 'party-v1-snapshot-checksum-0000000000000000000000000000000000000000',
              snapshotPayload: input.customExtensions as Prisma.InputJsonValue,
              capturedAt: now,
            },
          });
        }
      }

      await this.publishOutbox(tx, tenantId, partyId, 'party.updated.v1', {
        partyId,
        code: updated.code,
        legalName: updated.legalName,
        displayName: updated.displayName,
        status: updated.status,
        classification: updated.classification,
        version: updated.version,
        previousVersion: existing.version,
      });

      await this.recordAudit(tx, tenantId, actorId, 'UPDATE', 'party', partyId, 'Updated party', existing, updated);

      return this.getPartyDetail(tenantId, partyId);
    });
  }

  /**
   * Archive a party.
   */
  async archiveParty(
    tenantId: string,
    partyId: string,
    actorId: string,
    input: ArchivePartyInputV1,
  ): Promise<PartyDetailResponseV1> {
    const existing = await prisma.party.findFirst({
      where: { tenantId, id: partyId },
    });
    if (!existing) {
      throw new NotFoundException(`Party "${partyId}" not found.`);
    }
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException(
        `Version conflict: expected ${input.expectedVersion}, got ${existing.version}.`,
      );
    }
    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException('Party is already archived.');
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.party.update({
        where: { id: partyId },
        data: {
          status: 'ARCHIVED',
          archivedAt: now,
          version: existing.version + 1,
          updatedById: actorId,
          updatedAt: now,
        },
      });

      await this.publishOutbox(tx, tenantId, partyId, 'party.archived.v1', {
        partyId,
        reason: input.reason,
        archivedAt: now.toISOString(),
      });

      await this.recordAudit(tx, tenantId, actorId, 'STATUS_CHANGE', 'party', partyId, input.reason, existing, res);

      return res;
    });

    return this.getPartyDetail(tenantId, updated.id);
  }

  /**
   * Restore an archived party.
   */
  async restoreParty(tenantId: string, partyId: string, actorId: string): Promise<PartyDetailResponseV1> {
    const existing = await prisma.party.findFirst({
      where: { tenantId, id: partyId },
    });
    if (!existing) {
      throw new NotFoundException(`Party "${partyId}" not found.`);
    }
    if (existing.status !== 'ARCHIVED') {
      throw new BadRequestException('Party is not archived.');
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const res = await tx.party.update({
        where: { id: partyId },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
          version: existing.version + 1,
          updatedById: actorId,
          updatedAt: now,
        },
      });

      await this.publishOutbox(tx, tenantId, partyId, 'party.updated.v1', {
        partyId,
        code: res.code,
        legalName: res.legalName,
        displayName: res.displayName,
        status: res.status,
        classification: res.classification,
        version: res.version,
        previousVersion: existing.version,
      });

      await this.recordAudit(tx, tenantId, actorId, 'STATUS_CHANGE', 'party', partyId, 'Restored party', existing, res);
    });

    return this.getPartyDetail(tenantId, partyId);
  }

  /**
   * Preview merging two parties.
   */
  async previewMerge(tenantId: string, sourcePartyId: string, targetPartyId: string) {
    if (sourcePartyId === targetPartyId) {
      throw new BadRequestException('Cannot merge a party into itself.');
    }

    const [source, target] = await Promise.all([
      this.getPartyDetail(tenantId, sourcePartyId),
      this.getPartyDetail(tenantId, targetPartyId),
    ]);

    const sourceRoles = source.roles.map((r) => r.roleType);
    const targetRoles = target.roles.map((r) => r.roleType);
    const combinedRoles = Array.from(new Set([...targetRoles, ...sourceRoles]));

    return {
      sourceParty: source.party,
      targetParty: target.party,
      combinedRoles,
      contactsToTransfer: source.contacts.length,
      addressesToTransfer: source.addresses.length,
      identifiersToTransfer: source.identifiers.length,
    };
  }

  /**
   * Execute merge of source party into target party.
   */
  async mergeParties(tenantId: string, actorId: string, input: MergePartiesInputV1): Promise<PartyDetailResponseV1> {
    if (input.sourcePartyId === input.targetPartyId) {
      throw new BadRequestException('Cannot merge party into itself.');
    }

    const [source, target] = await Promise.all([
      prisma.party.findFirst({ where: { tenantId, id: input.sourcePartyId } }),
      prisma.party.findFirst({ where: { tenantId, id: input.targetPartyId } }),
    ]);

    if (!source) throw new NotFoundException(`Source party "${input.sourcePartyId}" not found.`);
    if (!target) throw new NotFoundException(`Target party "${input.targetPartyId}" not found.`);

    if (source.version !== input.sourceExpectedVersion) {
      throw new ConflictException(`Source party version mismatch: expected ${input.sourceExpectedVersion}, got ${source.version}.`);
    }
    if (target.version !== input.targetExpectedVersion) {
      throw new ConflictException(`Target party version mismatch: expected ${input.targetExpectedVersion}, got ${target.version}.`);
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Re-parent addresses
      await tx.partyAddress.updateMany({
        where: { tenantId, partyId: source.id },
        data: { partyId: target.id, updatedAt: now },
      });

      // Re-parent contacts
      await tx.partyContactPoint.updateMany({
        where: { tenantId, partyId: source.id },
        data: { partyId: target.id, updatedAt: now },
      });

      // Re-parent identifiers
      await tx.partyIdentifier.updateMany({
        where: { tenantId, partyId: source.id },
        data: { partyId: target.id, updatedAt: now },
      });

      // Mark source as MERGED with pointer to target
      await tx.party.update({
        where: { id: source.id },
        data: {
          status: 'MERGED',
          survivorPartyId: target.id,
          version: source.version + 1,
          updatedById: actorId,
          updatedAt: now,
        },
      });

      // Increment target version
      await tx.party.update({
        where: { id: target.id },
        data: {
          version: target.version + 1,
          updatedById: actorId,
          updatedAt: now,
        },
      });

      await this.publishOutbox(tx, tenantId, target.id, 'party.merged.v1', {
        sourcePartyId: source.id,
        targetPartyId: target.id,
        reason: input.reason,
        mergedAt: now.toISOString(),
      });

      await this.recordAudit(tx, tenantId, actorId, 'STATUS_CHANGE', 'party', source.id, `Merged into ${target.id}: ${input.reason}`, source, { status: 'MERGED', survivorPartyId: target.id });
    });

    return this.getPartyDetail(tenantId, target.id);
  }

  // ─── Sub-entity Operations ──────────────────────────────────────────────────

  async addRole(tenantId: string, partyId: string, actorId: string, input: AddPartyRoleInputV1): Promise<PartyRoleV1> {
    const party = await prisma.party.findFirst({ where: { tenantId, id: partyId } });
    if (!party) throw new NotFoundException(`Party "${partyId}" not found.`);

    const existingRole = await prisma.partyRole.findFirst({
      where: { tenantId, partyId, roleType: input.roleType },
    });
    if (existingRole) {
      throw new ConflictException(`Role "${input.roleType}" already exists for this party.`);
    }

    const now = new Date();
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.partyRole.create({
        data: {
          id: randomUUID(),
          tenantId,
          partyId,
          roleType: input.roleType,
          status: 'ACTIVE',
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.publishOutbox(tx, tenantId, partyId, 'party.role.changed.v1', {
        partyId,
        roleId: created.id,
        roleType: created.roleType,
        action: 'ADDED',
        status: created.status,
      });

      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party_role', created.id, `Added role ${input.roleType}`, null, created);
      return created;
    });

    return this.mapRole(role);
  }

  async updateRole(tenantId: string, partyId: string, roleId: string, actorId: string, input: UpdatePartyRoleInputV1): Promise<PartyRoleV1> {
    const existing = await prisma.partyRole.findFirst({ where: { tenantId, partyId, id: roleId } });
    if (!existing) throw new NotFoundException(`Party role "${roleId}" not found.`);
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException(`Role version conflict: expected ${input.expectedVersion}, got ${existing.version}.`);
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.partyRole.update({
        where: { id: roleId },
        data: {
          status: input.status ?? existing.status,
          effectiveFrom: input.effectiveFrom !== undefined ? (input.effectiveFrom ? new Date(input.effectiveFrom) : null) : existing.effectiveFrom,
          effectiveTo: input.effectiveTo !== undefined ? (input.effectiveTo ? new Date(input.effectiveTo) : null) : existing.effectiveTo,
          metadata: input.metadata
            ? (input.metadata as Prisma.InputJsonValue)
            : (existing.metadata as Prisma.InputJsonValue),
          version: existing.version + 1,
          updatedAt: now,
        },
      });

      await this.publishOutbox(tx, tenantId, partyId, 'party.role.changed.v1', {
        partyId,
        roleId,
        roleType: res.roleType,
        action: 'UPDATED',
        status: res.status,
      });

      await this.recordAudit(tx, tenantId, actorId, 'UPDATE', 'party_role', roleId, 'Updated role', existing, res);
      return res;
    });

    return this.mapRole(updated);
  }

  async addAddress(tenantId: string, partyId: string, actorId: string, input: AddPartyAddressInputV1): Promise<PartyAddressV1> {
    const party = await prisma.party.findFirst({ where: { tenantId, id: partyId } });
    if (!party) throw new NotFoundException(`Party "${partyId}" not found.`);

    const now = new Date();
    const address = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.partyAddress.updateMany({
          where: { tenantId, partyId, isPrimary: true },
          data: { isPrimary: false, updatedAt: now },
        });
      }

      const created = await tx.partyAddress.create({
        data: {
          id: randomUUID(),
          tenantId,
          partyId,
          addressType: input.addressType,
          street1: input.street1,
          street2: input.street2 ?? null,
          city: input.city,
          stateOrProvince: input.stateOrProvince ?? null,
          postalCode: input.postalCode ?? null,
          countryCode: input.countryCode,
          isPrimary: input.isPrimary ?? false,
          isVerified: false,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party_address', created.id, `Added address ${input.addressType}`, null, created);
      return created;
    });

    return this.mapAddress(address);
  }

  async updateAddress(
    tenantId: string,
    partyId: string,
    addressId: string,
    actorId: string,
    input: UpdatePartyAddressInputV1,
  ): Promise<PartyAddressV1> {
    const existing = await prisma.partyAddress.findFirst({ where: { tenantId, partyId, id: addressId } });
    if (!existing) throw new NotFoundException(`Party address "${addressId}" not found.`);

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.partyAddress.updateMany({
          where: { tenantId, partyId, isPrimary: true },
          data: { isPrimary: false, updatedAt: now },
        });
      }

      const res = await tx.partyAddress.update({
        where: { id: addressId },
        data: {
          addressType: input.addressType ?? existing.addressType,
          street1: input.street1 ?? existing.street1,
          street2: input.street2 !== undefined ? input.street2 : existing.street2,
          city: input.city ?? existing.city,
          stateOrProvince: input.stateOrProvince !== undefined ? input.stateOrProvince : existing.stateOrProvince,
          postalCode: input.postalCode !== undefined ? input.postalCode : existing.postalCode,
          countryCode: input.countryCode ?? existing.countryCode,
          isPrimary: input.isPrimary !== undefined ? input.isPrimary : existing.isPrimary,
          isVerified: input.isVerified !== undefined ? input.isVerified : existing.isVerified,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'UPDATE', 'party_address', addressId, 'Updated address', existing, res);
      return res;
    });

    return this.mapAddress(updated);
  }

  async addContact(tenantId: string, partyId: string, actorId: string, input: AddPartyContactInputV1): Promise<PartyContactPointV1> {
    const party = await prisma.party.findFirst({ where: { tenantId, id: partyId } });
    if (!party) throw new NotFoundException(`Party "${partyId}" not found.`);

    const now = new Date();
    const contact = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.partyContactPoint.updateMany({
          where: { tenantId, partyId, channel: input.channel, isPrimary: true },
          data: { isPrimary: false, updatedAt: now },
        });
      }

      const created = await tx.partyContactPoint.create({
        data: {
          id: randomUUID(),
          tenantId,
          partyId,
          channel: input.channel,
          value: input.value,
          label: input.label ?? null,
          isPrimary: input.isPrimary ?? false,
          isVerified: false,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party_contact', created.id, `Added contact ${input.channel}`, null, created);
      return created;
    });

    return this.mapContact(contact);
  }

  async updateContact(
    tenantId: string,
    partyId: string,
    contactId: string,
    actorId: string,
    input: UpdatePartyContactInputV1,
  ): Promise<PartyContactPointV1> {
    const existing = await prisma.partyContactPoint.findFirst({ where: { tenantId, partyId, id: contactId } });
    if (!existing) throw new NotFoundException(`Party contact "${contactId}" not found.`);

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.partyContactPoint.updateMany({
          where: { tenantId, partyId, channel: existing.channel, isPrimary: true },
          data: { isPrimary: false, updatedAt: now },
        });
      }

      const res = await tx.partyContactPoint.update({
        where: { id: contactId },
        data: {
          channel: input.channel ?? existing.channel,
          value: input.value ?? existing.value,
          label: input.label !== undefined ? input.label : existing.label,
          isPrimary: input.isPrimary !== undefined ? input.isPrimary : existing.isPrimary,
          isVerified: input.isVerified !== undefined ? input.isVerified : existing.isVerified,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'UPDATE', 'party_contact', contactId, 'Updated contact', existing, res);
      return res;
    });

    return this.mapContact(updated);
  }

  async addIdentifier(tenantId: string, partyId: string, actorId: string, input: AddPartyIdentifierInputV1): Promise<PartyIdentifierV1> {
    const party = await prisma.party.findFirst({ where: { tenantId, id: partyId } });
    if (!party) throw new NotFoundException(`Party "${partyId}" not found.`);

    const now = new Date();
    const identifier = await prisma.$transaction(async (tx) => {
      const created = await tx.partyIdentifier.create({
        data: {
          id: randomUUID(),
          tenantId,
          partyId,
          identifierType: input.identifierType,
          value: input.value,
          issuerCountry: input.issuerCountry ?? null,
          isPrimary: input.isPrimary ?? false,
          isRestricted: input.isRestricted ?? false,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validTo: input.validTo ? new Date(input.validTo) : null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party_identifier', created.id, `Added identifier ${input.identifierType}`, null, {
        ...created,
        value: input.isRestricted ? '[REDACTED]' : created.value,
      });
      return created;
    });

    return this.mapIdentifier(identifier);
  }

  async assignOrgUnit(tenantId: string, partyId: string, actorId: string, input: AssignPartyOrgInputV1): Promise<PartyOrgAssignmentV1> {
    const party = await prisma.party.findFirst({ where: { tenantId, id: partyId } });
    if (!party) throw new NotFoundException(`Party "${partyId}" not found.`);

    const now = new Date();
    const purpose = input.assignmentPurpose ?? 'OPERATIONAL';

    const existing = await prisma.partyOrgAssignment.findFirst({
      where: { tenantId, partyId, orgUnitId: input.orgUnitId, assignmentPurpose: purpose },
    });
    if (existing) {
      return this.mapOrgAssignment(existing);
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.partyOrgAssignment.create({
        data: {
          id: randomUUID(),
          tenantId,
          partyId,
          orgUnitId: input.orgUnitId,
          assignmentPurpose: purpose,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.recordAudit(tx, tenantId, actorId, 'CREATE', 'party_org_assignment', created.id, `Assigned org ${input.orgUnitId}`, null, created);
      return created;
    });

    return this.mapOrgAssignment(assignment);
  }

  // ─── Queries & Fetching ─────────────────────────────────────────────────────

  async getPartyDetail(tenantId: string, partyId: string, memberOrgUnitIds?: string[]): Promise<PartyDetailResponseV1> {
    const party = await prisma.party.findFirst({
      where: { tenantId, id: partyId },
      include: {
        roles: true,
        addresses: true,
        contacts: true,
        identifiers: true,
        orgAssignments: true,
      },
    });

    if (!party) {
      throw new NotFoundException(`Party "${partyId}" not found.`);
    }

    // Scoping check: if member has restricted org unit scope, ensure party is assigned to one of them
    if (memberOrgUnitIds && memberOrgUnitIds.length > 0) {
      const partyOrgIds = party.orgAssignments.map((a) => a.orgUnitId);
      const inScope = partyOrgIds.some((id) => memberOrgUnitIds.includes(id));
      if (!inScope && partyOrgIds.length > 0) {
        throw new NotFoundException(`Party "${partyId}" not found.`);
      }
    }

    // Fetch custom extensions
    const ext = await prisma.partyExtensionSnapshot.findFirst({
      where: { tenantId, partyId },
      orderBy: { capturedAt: 'desc' },
    });

    return {
      party: this.mapParty(party),
      roles: party.roles.map((r) => this.mapRole(r)),
      identifiers: party.identifiers.map((i) => this.mapIdentifier(i)),
      contacts: party.contacts.map((c) => this.mapContact(c)),
      addresses: party.addresses.map((a) => this.mapAddress(a)),
      orgAssignments: party.orgAssignments.map((o) => this.mapOrgAssignment(o)),
      customExtensions: ext?.snapshotPayload ? (ext.snapshotPayload as Record<string, unknown>) : undefined,
    };
  }

  async listParties(
    tenantId: string,
    query: PartyListQueryV1,
    memberOrgUnitIds?: string[],
  ): Promise<{ items: PartyV1[]; nextCursor: string | null; totalCount: number }> {
    const where: Prisma.PartyWhereInput = {
      tenantId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.partyType) {
      where.partyType = query.partyType;
    }

    if (query.roleType) {
      where.roles = {
        some: {
          roleType: query.roleType,
          status: 'ACTIVE',
        },
      };
    }

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.orgUnitId) {
      where.orgAssignments = {
        some: {
          orgUnitId: query.orgUnitId,
        },
      };
    } else if (memberOrgUnitIds && memberOrgUnitIds.length > 0) {
      where.OR = [
        ...(where.OR ?? []),
        { orgAssignments: { none: {} } },
        { orgAssignments: { some: { orgUnitId: { in: memberOrgUnitIds } } } },
      ];
    }

    const take = query.limit ?? 25;
    const queryOptions: Prisma.PartyFindManyArgs = {
      where,
      take: take + 1,
      orderBy: { createdAt: 'desc' },
    };
    if (query.cursor) {
      queryOptions.cursor = { id: query.cursor };
    }
    const items = await prisma.party.findMany(queryOptions);

    const hasMore = items.length > take;
    const results = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1]!.id : null;
    const totalCount = await prisma.party.count({ where });

    return {
      items: results.map(this.mapParty),
      nextCursor,
      totalCount,
    };
  }

  // ─── Helpers & Mappers ──────────────────────────────────────────────────────

  private mapParty(p: any): PartyV1 {
    return {
      id: p.id,
      tenantId: p.tenantId,
      code: p.code,
      legalName: p.legalName,
      displayName: p.displayName,
      partyType: p.partyType,
      status: p.status,
      classification: p.classification,
      survivorPartyId: p.survivorPartyId,
      version: p.version,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
      archivedAt: p.archivedAt ? (p.archivedAt instanceof Date ? p.archivedAt.toISOString() : p.archivedAt) : null,
      createdById: p.createdById,
      updatedById: p.updatedById,
    };
  }

  private mapRole(r: any): PartyRoleV1 {
    return {
      id: r.id,
      tenantId: r.tenantId,
      partyId: r.partyId,
      roleType: r.roleType,
      status: r.status,
      effectiveFrom: r.effectiveFrom ? (r.effectiveFrom instanceof Date ? r.effectiveFrom.toISOString() : r.effectiveFrom) : null,
      effectiveTo: r.effectiveTo ? (r.effectiveTo instanceof Date ? r.effectiveTo.toISOString() : r.effectiveTo) : null,
      metadata: r.metadata ?? {},
      version: r.version,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    };
  }

  private mapAddress(a: any): PartyAddressV1 {
    return {
      id: a.id,
      tenantId: a.tenantId,
      partyId: a.partyId,
      addressType: a.addressType,
      street1: a.street1,
      street2: a.street2,
      city: a.city,
      stateOrProvince: a.stateOrProvince,
      postalCode: a.postalCode,
      countryCode: a.countryCode,
      isPrimary: a.isPrimary,
      isVerified: a.isVerified,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
    };
  }

  private mapContact(c: any): PartyContactPointV1 {
    return {
      id: c.id,
      tenantId: c.tenantId,
      partyId: c.partyId,
      channel: c.channel,
      value: c.value,
      label: c.label,
      isPrimary: c.isPrimary,
      isVerified: c.isVerified,
      validFrom: c.validFrom ? (c.validFrom instanceof Date ? c.validFrom.toISOString() : c.validFrom) : null,
      validTo: c.validTo ? (c.validTo instanceof Date ? c.validTo.toISOString() : c.validTo) : null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    };
  }

  private mapIdentifier(i: any): PartyIdentifierV1 {
    return {
      id: i.id,
      tenantId: i.tenantId,
      partyId: i.partyId,
      identifierType: i.identifierType,
      value: i.value,
      issuerCountry: i.issuerCountry,
      isPrimary: i.isPrimary,
      isRestricted: i.isRestricted,
      validFrom: i.validFrom ? (i.validFrom instanceof Date ? i.validFrom.toISOString() : i.validFrom) : null,
      validTo: i.validTo ? (i.validTo instanceof Date ? i.validTo.toISOString() : i.validTo) : null,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
      updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
    };
  }

  private mapOrgAssignment(o: any): PartyOrgAssignmentV1 {
    return {
      id: o.id,
      tenantId: o.tenantId,
      partyId: o.partyId,
      orgUnitId: o.orgUnitId,
      assignmentPurpose: o.assignmentPurpose,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
      updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    };
  }

  private publishOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    partyId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    return tx.controlOutboxEvent.create({
      data: {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'party',
        aggregateId: partyId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE',
    resource: string,
    resourceId: string,
    reason: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action,
        resource,
        resourceId,
        before: before ? (before as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: after ? (after as Prisma.InputJsonValue) : Prisma.JsonNull,
        metadata: { reason },
      },
    });
  }

  private async findIdempotency(
    tenantId: string,
    actorId: string,
    operation: string,
    key: string,
    payload: unknown,
  ) {
    const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = await prisma.partyIdempotencyRecord.findUnique({
      where: {
        tenantId_actorId_operation_idempotencyKey: {
          tenantId,
          actorId,
          operation,
          idempotencyKey: key,
        },
      },
    });
    if (!existing) return null;
    if (existing.requestSha256 !== sha256) {
      throw new ConflictException('Idempotency key reused with different request payload.');
    }
    return existing.response;
  }

  private saveIdempotency(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    operation: string,
    key: string,
    payload: unknown,
    response: unknown,
    statusCode: number,
  ) {
    const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return tx.partyIdempotencyRecord.create({
      data: {
        tenantId,
        actorId,
        operation,
        idempotencyKey: key,
        requestSha256: sha256,
        response: response as Prisma.InputJsonValue,
        statusCode,
      },
    });
  }
}
