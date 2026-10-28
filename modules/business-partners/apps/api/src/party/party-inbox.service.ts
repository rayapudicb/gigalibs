import {
  PartyArchivedEventV1Schema,
  PartyCreatedEventV1Schema,
  PartyMergedEventV1Schema,
  PartyRoleChangedEventV1Schema,
  PartyUpdatedEventV1Schema,
  RelayEnvelopeV1Schema,
  type RelayEnvelopeV1,
} from '@gigalibs/contracts';
import { receiveOnce } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

const RECEIPTS = { schema: SCHEMA, consumer: 'business-partners.party', sourceModule: 'kernel' } as const;
const PARTY_EVENTS = new Set(['party.created.v1', 'party.updated.v1', 'party.archived.v1', 'party.merged.v1', 'party.role.changed.v1']);

interface PartyReferenceRow {
  source_version: number;
  code: string;
  display_name: string;
  party_type: string;
  status: string;
}

/** Applies canonical Party facts without acquiring a second Party master. */
@Injectable()
export class PartyInboxService {
  constructor(private readonly database: DatabaseService) {}

  async receive(rawEnvelope: unknown, rawBody: string) {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) throw new BadRequestException({ code: 'PARTY_ENVELOPE_INVALID' });
    const envelope = parsed.data;
    if (envelope.schemaVersion !== 1 || envelope.aggregateType !== 'party' || !PARTY_EVENTS.has(envelope.eventType)) {
      throw new BadRequestException({ code: 'PARTY_EVENT_UNSUPPORTED' });
    }
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.apply(client, envelope)),
    );
  }

  private async apply(client: PoolClient, envelope: RelayEnvelopeV1): Promise<{ status: 'PROCESSED' }> {
    switch (envelope.eventType) {
      case 'party.created.v1':
        await this.created(client, envelope);
        break;
      case 'party.updated.v1':
        await this.updated(client, envelope);
        break;
      case 'party.archived.v1':
        await this.archived(client, envelope);
        break;
      case 'party.merged.v1':
        await this.merged(client, envelope);
        break;
      case 'party.role.changed.v1':
        await this.roleChanged(client, envelope);
        break;
      default:
        throw new BadRequestException({ code: 'PARTY_EVENT_UNSUPPORTED' });
    }
    return { status: 'PROCESSED' };
  }

  private async created(client: PoolClient, envelope: RelayEnvelopeV1): Promise<void> {
    const data = parse(PartyCreatedEventV1Schema.shape.data, envelope.payload);
    if (data.partyId !== envelope.aggregateId || data.version !== envelope.aggregateVersion) invalid();
    const inserted = await client.query(
      `INSERT INTO ${SCHEMA}.party_references
       (tenant_id, party_id, source_version, code, display_name, party_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, party_id) DO NOTHING`,
      [envelope.tenantId, data.partyId, data.version, data.code, data.displayName, data.partyType, data.status],
    );
    if (inserted.rowCount) return;
    const current = await this.lock(client, envelope.tenantId, data.partyId);
    if (!current) pending();
    if (current.source_version > data.version) return;
    if (current.source_version !== data.version || current.code !== data.code ||
        current.display_name !== data.displayName || current.party_type !== data.partyType || current.status !== data.status) {
      invalid();
    }
  }

  private async updated(client: PoolClient, envelope: RelayEnvelopeV1): Promise<void> {
    const data = parse(PartyUpdatedEventV1Schema.shape.data, envelope.payload);
    if (data.partyId !== envelope.aggregateId || data.version !== envelope.aggregateVersion ||
        data.version !== data.previousVersion + 1) invalid();
    const current = await this.lock(client, envelope.tenantId, data.partyId);
    if (!current || current.source_version < data.previousVersion) pending();
    if (current.source_version > data.version) return;
    if (current.source_version === data.version) {
      if (current.code !== data.code || current.display_name !== data.displayName || current.status !== data.status) invalid();
      return;
    }
    if (current.source_version !== data.previousVersion) invalid();
    await client.query(
      `UPDATE ${SCHEMA}.party_references
          SET source_version = $3, code = $4, display_name = $5, status = $6, received_at = now()
        WHERE tenant_id = $1 AND party_id = $2`,
      [envelope.tenantId, data.partyId, data.version, data.code, data.displayName, data.status],
    );
  }

  private async archived(client: PoolClient, envelope: RelayEnvelopeV1): Promise<void> {
    const data = parse(PartyArchivedEventV1Schema.shape.data, envelope.payload);
    if (data.partyId !== envelope.aggregateId || !data.version || data.version !== envelope.aggregateVersion) invalid();
    const current = await this.lock(client, envelope.tenantId, data.partyId);
    if (!current || current.source_version < data.version - 1) pending();
    if (current.source_version > data.version) return;
    if (current.source_version === data.version) {
      if (current.status !== 'ARCHIVED') invalid();
      return;
    }
    await client.query(
      `UPDATE ${SCHEMA}.party_references SET source_version = $3, status = 'ARCHIVED', received_at = now()
        WHERE tenant_id = $1 AND party_id = $2`,
      [envelope.tenantId, data.partyId, data.version],
    );
  }

  private async merged(client: PoolClient, envelope: RelayEnvelopeV1): Promise<void> {
    const data = parse(PartyMergedEventV1Schema.shape.data, envelope.payload);
    if (data.sourcePartyId === data.targetPartyId || data.targetPartyId !== envelope.aggregateId ||
        !data.sourceVersion || !data.targetVersion || data.targetVersion !== envelope.aggregateVersion) invalid();
    // Deterministic row-lock order avoids a cycle when two merge facts share a target.
    const rows = await client.query<PartyReferenceRow & { party_id: string }>(
      `SELECT party_id, source_version, code, display_name, party_type, status
         FROM ${SCHEMA}.party_references WHERE tenant_id = $1 AND party_id = ANY($2::uuid[])
        ORDER BY party_id FOR UPDATE`,
      [envelope.tenantId, [data.sourcePartyId, data.targetPartyId]],
    );
    const source = rows.rows.find((row) => row.party_id === data.sourcePartyId);
    const target = rows.rows.find((row) => row.party_id === data.targetPartyId);
    if (!source || !target || source.source_version < data.sourceVersion - 1 || target.source_version < data.targetVersion - 1) pending();
    if (source.source_version === data.sourceVersion && source.status !== 'MERGED') invalid();
    if (source.source_version === data.sourceVersion - 1) {
      await client.query(
        `UPDATE ${SCHEMA}.party_references SET source_version = $3, status = 'MERGED', received_at = now()
          WHERE tenant_id = $1 AND party_id = $2`,
        [envelope.tenantId, data.sourcePartyId, data.sourceVersion],
      );
    }
    if (target.source_version === data.targetVersion - 1) {
      await client.query(
        `UPDATE ${SCHEMA}.party_references SET source_version = $3, received_at = now()
          WHERE tenant_id = $1 AND party_id = $2`,
        [envelope.tenantId, data.targetPartyId, data.targetVersion],
      );
    }
  }

  private async roleChanged(client: PoolClient, envelope: RelayEnvelopeV1): Promise<void> {
    const data = parse(PartyRoleChangedEventV1Schema.shape.data, envelope.payload);
    if (data.partyId !== envelope.aggregateId || !data.version || data.version !== envelope.aggregateVersion) invalid();
    const party = await this.lock(client, envelope.tenantId, data.partyId);
    if (!party) pending();
    const result = await client.query<{ source_version: number; status: string; role_type: string; party_id: string }>(
      `SELECT source_version, status, role_type, party_id FROM ${SCHEMA}.party_role_references
        WHERE tenant_id = $1 AND role_id = $2 FOR UPDATE`,
      [envelope.tenantId, data.roleId],
    );
    const current = result.rows[0];
    if (!current) {
      if (data.version !== 1 || data.action !== 'ADDED') pending();
      await client.query(
        `INSERT INTO ${SCHEMA}.party_role_references
         (tenant_id, role_id, party_id, role_type, status, source_version, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [envelope.tenantId, data.roleId, data.partyId, data.roleType, data.status, data.version,
          data.effectiveFrom ?? null, data.effectiveTo ?? null],
      );
      return;
    }
    if (current.party_id !== data.partyId || current.role_type !== data.roleType) invalid();
    if (current.source_version > data.version) return;
    if (current.source_version === data.version) {
      if (current.status !== data.status) invalid();
      return;
    }
    if (current.source_version !== data.version - 1) pending();
    await client.query(
      `UPDATE ${SCHEMA}.party_role_references
          SET source_version = $3, status = $4, effective_from = $5, effective_to = $6, received_at = now()
        WHERE tenant_id = $1 AND role_id = $2`,
      [envelope.tenantId, data.roleId, data.version, data.action === 'REMOVED' ? 'INACTIVE' : data.status,
        data.effectiveFrom ?? null, data.effectiveTo ?? null],
    );
  }

  private async lock(client: PoolClient, tenantId: string, partyId: string): Promise<PartyReferenceRow | null> {
    const result = await client.query<PartyReferenceRow>(
      `SELECT source_version, code, display_name, party_type, status
         FROM ${SCHEMA}.party_references WHERE tenant_id = $1 AND party_id = $2 FOR UPDATE`,
      [tenantId, partyId],
    );
    return result.rows[0] ?? null;
  }
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) invalid();
  return result.data;
}

function invalid(): never {
  throw new BadRequestException({ code: 'PARTY_EVENT_PAYLOAD_INVALID' });
}

function pending(): never {
  throw new ServiceUnavailableException({ code: 'PARTY_PRIOR_VERSION_PENDING' });
}
