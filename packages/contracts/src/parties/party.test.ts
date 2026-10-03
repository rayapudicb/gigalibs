import { describe, it, expect } from 'vitest';
import {
  CreatePartyInputV1Schema,
  PartyV1Schema,
  PartyRoleV1Schema,
  PartyAddressV1Schema,
  PartyIdentifierV1Schema,
  PartyContactPointV1Schema,
  PartyCreatedEventV1Schema,
  PartyMergedEventV1Schema,
  MergePartiesInputV1Schema,
} from './party.js';

describe('Party Contracts (@gigalibs/contracts)', () => {
  it('validates a valid CreatePartyInputV1 payload', () => {
    const input = {
      code: 'ACME_CORP',
      legalName: 'Acme Corporation Inc.',
      displayName: 'Acme Corp',
      partyType: 'ORGANIZATION',
      classification: 'ENTERPRISE',
      initialRoles: ['CUSTOMER', 'SUPPLIER'],
      orgUnitIds: ['org-corp-hq'],
      customExtensions: {
        x_credit_limit: 50000,
      },
    };

    const parsed = CreatePartyInputV1Schema.parse(input);
    expect(parsed.code).toBe('ACME_CORP');
    expect(parsed.partyType).toBe('ORGANIZATION');
    expect(parsed.initialRoles).toEqual(['CUSTOMER', 'SUPPLIER']);
  });

  it('rejects invalid party codes', () => {
    expect(() =>
      CreatePartyInputV1Schema.parse({
        code: ' invalid space ',
        legalName: 'Test Inc',
        partyType: 'ORGANIZATION',
      })
    ).toThrow();

    expect(() =>
      CreatePartyInputV1Schema.parse({
        code: '@special!',
        legalName: 'Test Inc',
        partyType: 'ORGANIZATION',
      })
    ).toThrow();
  });

  it('validates a canonical PartyV1 record with optimistic versioning', () => {
    const party = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      tenantId: 'tenant-acme',
      code: 'ACME_001',
      legalName: 'Acme Global Services',
      displayName: 'Acme Global',
      partyType: 'ORGANIZATION',
      status: 'ACTIVE',
      classification: 'TIER_1',
      survivorPartyId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      createdById: 'user-123',
      updatedById: null,
    };

    const parsed = PartyV1Schema.parse(party);
    expect(parsed.id).toBe(party.id);
    expect(parsed.version).toBe(1);
    expect(parsed.status).toBe('ACTIVE');
  });

  it('validates PartyRoleV1 with multiple business roles', () => {
    const role = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      tenantId: 'tenant-acme',
      partyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      roleType: 'SUPPLIER',
      status: 'ACTIVE',
      effectiveFrom: new Date().toISOString(),
      effectiveTo: null,
      metadata: { supplierCategory: 'RAW_MATERIALS' },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = PartyRoleV1Schema.parse(role);
    expect(parsed.roleType).toBe('SUPPLIER');
  });

  it('validates PartyAddressV1 with standard ISO country codes', () => {
    const address = {
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      tenantId: 'tenant-acme',
      partyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      addressType: 'HEADQUARTERS',
      street1: '100 Innovation Way',
      street2: 'Suite 400',
      city: 'Metropolis',
      stateOrProvince: 'NY',
      postalCode: '10001',
      countryCode: 'US',
      isPrimary: true,
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = PartyAddressV1Schema.parse(address);
    expect(parsed.countryCode).toBe('US');
    expect(parsed.isPrimary).toBe(true);

    // Invalid country code (non-ISO 2 char)
    expect(() =>
      PartyAddressV1Schema.parse({
        ...address,
        countryCode: 'USA',
      })
    ).toThrow();
  });

  it('validates PartyIdentifierV1 with restricted flag support', () => {
    const identifier = {
      id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      tenantId: 'tenant-acme',
      partyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      identifierType: 'TAX_ID',
      value: '12-3456789',
      issuerCountry: 'US',
      isPrimary: true,
      isRestricted: true,
      validFrom: null,
      validTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = PartyIdentifierV1Schema.parse(identifier);
    expect(parsed.identifierType).toBe('TAX_ID');
    expect(parsed.isRestricted).toBe(true);
  });

  it('validates PartyContactPointV1 for communication channels', () => {
    const contact = {
      id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
      tenantId: 'tenant-acme',
      partyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      channel: 'EMAIL',
      value: 'billing@acme.example.com',
      label: 'Accounts Payable',
      isPrimary: true,
      isVerified: true,
      validFrom: null,
      validTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = PartyContactPointV1Schema.parse(contact);
    expect(parsed.channel).toBe('EMAIL');
    expect(parsed.isVerified).toBe(true);
  });

  it('validates MergePartiesInputV1 with required reason and versions', () => {
    const mergeInput = {
      sourcePartyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      targetPartyId: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
      sourceExpectedVersion: 2,
      targetExpectedVersion: 5,
      reason: 'Duplicate supplier record created during manual migration',
    };

    const parsed = MergePartiesInputV1Schema.parse(mergeInput);
    expect(parsed.sourceExpectedVersion).toBe(2);
    expect(parsed.reason).toContain('Duplicate supplier');

    // Reject short reason
    expect(() =>
      MergePartiesInputV1Schema.parse({
        ...mergeInput,
        reason: 'dup',
      })
    ).toThrow();
  });

  it('validates transactional outbox event schemas', () => {
    const createdEvent = {
      eventId: '90eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
      tenantId: 'tenant-acme',
      occurredAt: new Date().toISOString(),
      actorId: 'user-admin',
      correlationId: 'req-corr-1',
      type: 'party.created.v1',
      data: {
        partyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        code: 'ACME_CORP',
        legalName: 'Acme Corp',
        displayName: 'Acme',
        partyType: 'ORGANIZATION',
        status: 'ACTIVE',
        classification: 'ENTERPRISE',
        version: 1,
      },
    };

    const parsedCreated = PartyCreatedEventV1Schema.parse(createdEvent);
    expect(parsedCreated.type).toBe('party.created.v1');
    expect(parsedCreated.data.code).toBe('ACME_CORP');

    const mergedEvent = {
      eventId: '80eebc99-9c0b-4ef8-bb6d-6bb9bd380a88',
      tenantId: 'tenant-acme',
      occurredAt: new Date().toISOString(),
      actorId: 'user-admin',
      correlationId: 'req-corr-2',
      type: 'party.merged.v1',
      data: {
        sourcePartyId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        targetPartyId: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
        reason: 'Duplicate merge',
        mergedAt: new Date().toISOString(),
      },
    };

    const parsedMerged = PartyMergedEventV1Schema.parse(mergedEvent);
    expect(parsedMerged.type).toBe('party.merged.v1');
  });
});
