import { createHash, randomUUID } from 'node:crypto';
import { PartnerCreditHoldV1Schema } from '@gigalibs/contracts';
import {
  DocumentIdempotencyConflictError,
  DocumentTransitionRefusedError,
  DocumentVersionConflictError,
  executeTransactionalDocumentAction,
  type DocumentTransitionGraph,
} from '@gigalibs/document-lifecycle';
import {
  OrganizationReplica, assertOrganizationWrite, assertOwningUnit,
  organizationAccess, organizationReadCondition,
  type ModuleCommandContext, type ModulePrincipal,
} from '@gigalibs/module-sdk';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import type { CreateManualHold, CreditHoldV1, ReleaseHold } from './holds.contract.js';

const orgReplica = new OrganizationReplica(SCHEMA);

interface HoldRow {
  id: string;
  party_id: string;
  org_unit_id: string;
  currency_code: string;
  status: 'ACTIVE' | 'RELEASED';
  origin: 'MANUAL' | 'EXPOSURE';
  reason: string;
  exposure_minor: string | null;
  credit_limit_minor: string | null;
  version: number;
  created_by: string;
  created_at: Date;
  released_by: string | null;
  released_at: Date | null;
  release_reason: string | null;
}

const HOLD_COLUMNS = `id, party_id, org_unit_id, currency_code, status, origin, reason,
  exposure_minor::text, credit_limit_minor::text, version, created_by, created_at,
  released_by, released_at, release_reason`;

/** Manual holds never synthesize a financial snapshot. The credit check remains closed until all feeds are complete. */
@Injectable()
export class CreditHoldsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: ModulePrincipal, partyId: string): Promise<{ items: CreditHoldV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
      const values: unknown[] = [principal.tenantId, partyId];
      const scoped = organizationReadCondition(access, 'org_unit_id', (value) => {
        values.push(value);
        return `$${values.length}`;
      });
      const rows = await client.query<HoldRow>(
        `SELECT ${HOLD_COLUMNS} FROM ${SCHEMA}.credit_holds
         WHERE tenant_id = $1 AND party_id = $2 ${scoped ? `AND ${scoped}` : ''}
         ORDER BY created_at DESC, id LIMIT 100`, values,
      );
      return { items: rows.rows.map(toHold) };
    });
  }

  async createManual(context: ModuleCommandContext, partyId: string, input: CreateManualHold): Promise<{ hold: CreditHoldV1; replayed: boolean }> {
    const tenantId = context.principal.tenantId;
    const hash = requestHash({ action: 'CREATE_MANUAL_HOLD', partyId, input });
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${SCHEMA}:${tenantId}:credit-hold:${input.requestKey}`]);
      await authorizeUnit(client, context.principal, input.orgUnitId);
      const previous = await readOutcome(client, tenantId, input.requestKey, 'CREATE_MANUAL', input.requestKey, hash);
      if (previous) return { hold: previous, replayed: true };
      const account = await client.query(
        `SELECT 1 FROM ${SCHEMA}.partner_customer_acct a
         JOIN ${SCHEMA}.party_references p ON p.tenant_id = a.tenant_id AND p.party_id = a.party_id
         WHERE a.tenant_id = $1 AND a.party_id = $2 AND a.org_unit_id = $3
           AND a.currency_code = $4 AND a.status = 'ACTIVE' AND p.status = 'ACTIVE'
         FOR SHARE OF a, p`,
        [tenantId, partyId, input.orgUnitId, input.currencyCode],
      );
      if (!account.rowCount) throw new ConflictException({ code: 'CREDIT_CUSTOMER_ACCOUNT_NOT_ACTIVE' });
      const id = randomUUID();
      let inserted;
      try {
        inserted = await client.query<HoldRow>(
          `INSERT INTO ${SCHEMA}.credit_holds
           (tenant_id, id, party_id, org_unit_id, currency_code, status, origin,
            reason, exposure_minor, credit_limit_minor, source_version, created_by)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'MANUAL', $6, NULL, NULL, 'MANUAL', $7)
           RETURNING ${HOLD_COLUMNS}`,
          [tenantId, id, partyId, input.orgUnitId, input.currencyCode, input.reason, context.principal.subject],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException({ code: 'CREDIT_HOLD_ALREADY_ACTIVE' });
        throw error;
      }
      const hold = toHold(inserted.rows[0]!);
      await writeEvidence(client, context, hold, 'PLACED');
      await writeOutcome(client, tenantId, input.requestKey, 'CREATE_MANUAL', input.requestKey, hash, hold);
      return { hold, replayed: false };
    });
  }

  async release(context: ModuleCommandContext, partyId: string, holdId: string, input: ReleaseHold): Promise<CreditHoldV1> {
    const tenantId = context.principal.tenantId;
    const hash = requestHash({ action: 'RELEASE', holdId, input });
    try {
      return await executeTransactionalDocumentAction<PoolClient, HoldRow, CreditHoldV1>({
        tenantId, actorId: context.principal.subject, documentId: holdId,
        action: 'releaseIt', expectedVersion: input.expectedVersion,
        idempotencyKey: input.requestKey, requestHash: hash,
      }, {
        withTransaction: (operation) => this.database.withTenantTransaction(tenantId, operation),
        lockDocument: async (client) => {
          const result = await client.query<HoldRow>(
            `SELECT ${HOLD_COLUMNS} FROM ${SCHEMA}.credit_holds
             WHERE tenant_id = $1 AND party_id = $2 AND id = $3 FOR UPDATE`,
            [tenantId, partyId, holdId],
          );
          if (!result.rows[0]) throw new NotFoundException({ code: 'CREDIT_HOLD_NOT_FOUND' });
          return result.rows[0];
        },
        authorize: async (client, transition) => authorizeUnit(client, context.principal, transition.document.org_unit_id),
        findOutcome: async (client, action) => {
          const previous = await readOutcome(client, tenantId, holdId, action.action, action.idempotencyKey, hash);
          return previous ? { requestHash: hash, result: previous } : null;
        },
        graph: (client): DocumentTransitionGraph<HoldRow> => ({
          releaseIt: {
            from: ['ACTIVE'], to: 'RELEASED',
            effect: async () => {
              const updated = await client.query<HoldRow>(
                `UPDATE ${SCHEMA}.credit_holds
                 SET status = 'RELEASED', released_by = $3, released_at = now(),
                     release_reason = $4, version = version + 1
                 WHERE tenant_id = $1 AND id = $2 RETURNING ${HOLD_COLUMNS}`,
                [tenantId, holdId, context.principal.subject, input.reason],
              );
              return toHold(updated.rows[0]!);
            },
          },
        }),
        appendAudit: async (client, _transition, hold) => writeAudit(client, context, hold, 'RELEASED'),
        appendOutbox: async (client, _transition, hold) => writeOutbox(client, context, hold, 'RELEASED'),
        storeOutcome: (client, action, hold) => writeOutcome(client, tenantId, holdId, action.action,
          action.idempotencyKey, hash, hold),
      });
    } catch (error) {
      if (error instanceof DocumentIdempotencyConflictError ||
          error instanceof DocumentTransitionRefusedError ||
          error instanceof DocumentVersionConflictError) {
        throw new ConflictException({ code: error.name });
      }
      throw error;
    }
  }
}

async function authorizeUnit(client: PoolClient, principal: ModulePrincipal, orgUnitId: string): Promise<void> {
  const access = await organizationAccess(orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'DENIED' });
  if (!access.versionId) throw new ServiceUnavailableException({ code: 'BUSINESS_PARTNERS_ORGANIZATION_REQUIRED' });
  await assertOwningUnit(orgReplica, client, principal.tenantId, access, 'UNIT', orgUnitId);
  assertOrganizationWrite(access, orgUnitId);
}

async function readOutcome(client: PoolClient, tenantId: string, documentId: string, action: string,
  key: string, hash: string): Promise<CreditHoldV1 | null> {
  const result = await client.query<{ request_hash: string; result: CreditHoldV1 }>(
    `SELECT request_hash, result FROM ${SCHEMA}.document_action_outcomes
     WHERE tenant_id = $1 AND document_id = $2 AND action = $3 AND idempotency_key = $4`,
    [tenantId, documentId, action, key],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.request_hash !== hash) throw new ConflictException({ code: 'CREDIT_HOLD_IDEMPOTENCY_CONFLICT' });
  return row.result;
}

async function writeOutcome(client: PoolClient, tenantId: string, documentId: string, action: string,
  key: string, hash: string, result: CreditHoldV1): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.document_action_outcomes
     (tenant_id, document_id, action, idempotency_key, request_hash, result)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenantId, documentId, action, key, hash, JSON.stringify(result)],
  );
}

async function writeEvidence(client: PoolClient, context: ModuleCommandContext, hold: CreditHoldV1,
  outcome: 'PLACED' | 'RELEASED'): Promise<void> {
  await writeAudit(client, context, hold, outcome);
  await writeOutbox(client, context, hold, outcome);
}

async function writeAudit(client: PoolClient, context: ModuleCommandContext, hold: CreditHoldV1,
  outcome: 'PLACED' | 'RELEASED'): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.audit_events
     (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
     VALUES ($1, $2, $3, $4, 'credit_hold', $5, $6, $7::jsonb)`,
    [randomUUID(), context.principal.tenantId, context.principal.subject, `CREDIT_HOLD_${outcome}`,
      hold.id, context.correlationId, JSON.stringify({ partyId: hold.partyId, orgUnitId: hold.orgUnitId,
        currencyCode: hold.currencyCode, origin: hold.origin, status: hold.status, version: hold.version,
        reason: outcome === 'PLACED' ? hold.reason : hold.releaseReason })],
  );
}

async function writeOutbox(client: PoolClient, context: ModuleCommandContext, hold: CreditHoldV1,
  outcome: 'PLACED' | 'RELEASED'): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.outbox_events
     (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
      correlation_id, schema_version, payload)
     VALUES ($1, $2, $3, 'partner.credit-hold.v1', 'credit_hold', $4, $5, $6, 1, $7::jsonb)`,
    [randomUUID(), context.principal.tenantId, TOPIC, hold.id, hold.version, context.correlationId,
      JSON.stringify(PartnerCreditHoldV1Schema.parse({ holdId: hold.id, partyId: hold.partyId,
        orgUnitId: hold.orgUnitId, currencyCode: hold.currencyCode, status: hold.status,
        origin: hold.origin, outcome, version: hold.version }))],
  );
}

function requestHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function toHold(row: HoldRow): CreditHoldV1 {
  return {
    id: row.id, partyId: row.party_id, orgUnitId: row.org_unit_id,
    currencyCode: row.currency_code.trim(), status: row.status, origin: row.origin,
    reason: row.reason, exposureMinor: row.exposure_minor, creditLimitMinor: row.credit_limit_minor,
    version: Number(row.version), createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(), releasedBy: row.released_by,
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
    releaseReason: row.release_reason,
  };
}
