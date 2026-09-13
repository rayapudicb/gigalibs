import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import {
  type IdempotentResult,
  hashCanonicalJson,
  lockIdempotencyScope,
  readIdempotentResult,
  storeIdempotentResult,
} from '../database/persistence-helpers.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSeriesSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9_-]{1,40}$/),
    prefix: z.string().regex(/^[A-Z0-9-]{0,20}$/),
    padding: z.number().int().min(1).max(12),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();

const updateSeriesSchema = z
  .object({
    prefix: z.string().regex(/^[A-Z0-9-]{0,20}$/).optional(),
    padding: z.number().int().min(1).max(12).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided.',
  });

// ─── Response shape ───────────────────────────────────────────────────────────

export interface SeriesResponse {
  id: string;
  billingEntityId: string;
  code: string;
  prefix: string;
  padding: number;
  isDefault: boolean;
  nextSequence: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function rowToResponse(row: Record<string, unknown>): SeriesResponse {
  return {
    id: row.id as string,
    billingEntityId: row.billing_entity_id as string,
    code: row.code as string,
    prefix: row.prefix as string,
    padding: row.padding as number,
    isDefault: row.is_default as boolean,
    nextSequence: row.next_sequence as number,
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SeriesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // ── GET /v1/series ────────────────────────────────────────────────────────

  async list(principal: ArPrincipal): Promise<{ items: SeriesResponse[] }> {
    const result = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return client.query<Record<string, unknown>>(
        `SELECT s.* FROM gigalibs_ar.invoice_series s
         WHERE s.tenant_id = $1
         ORDER BY s.is_default DESC, s.code ASC`,
        [principal.tenantId],
      );
    });
    return { items: result.rows.map(rowToResponse) };
  }

  // ── POST /v1/series ───────────────────────────────────────────────────────

  async create(
    rawInput: unknown,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<SeriesResponse>> {
    const input = createSeriesSchema.parse(rawInput);
    const requestHash = hashCanonicalJson(input);
    const scope = 'series.create.v1';

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await lockIdempotencyScope(client, principal.tenantId, scope, idempotencyKey);

      const replay = await readIdempotentResult<SeriesResponse>(
        client, principal.tenantId, scope, idempotencyKey, requestHash,
      );
      if (replay) return replay;

      // Resolve billing entity
      const beResult = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 LIMIT 1`,
        [principal.tenantId],
      );
      if (!beResult.rows[0]) {
        throw new NotFoundException('Complete workspace setup before creating series.');
      }
      const billingEntityId = beResult.rows[0].id;

      // Guard duplicate code
      const dupeCheck = await client.query(
        `SELECT 1 FROM gigalibs_ar.invoice_series
         WHERE tenant_id = $1 AND code = $2`,
        [principal.tenantId, input.code],
      );
      if (dupeCheck.rowCount) {
        throw new ArConflictError(
          'SERIES_CODE_CONFLICT',
          `A series with code "${input.code}" already exists.`,
        );
      }

      // If making this default, clear current default
      if (input.isDefault) {
        await client.query(
          `UPDATE gigalibs_ar.invoice_series SET is_default = false WHERE tenant_id = $1 AND is_default = true`,
          [principal.tenantId],
        );
      }

      const id = randomUUID();
      const insertResult = await client.query<Record<string, unknown>>(
        `INSERT INTO gigalibs_ar.invoice_series
           (tenant_id, id, billing_entity_id, code, prefix, padding, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          principal.tenantId, id, billingEntityId,
          input.code, input.prefix, input.padding, input.isDefault,
        ],
      );
      const body = rowToResponse(insertResult.rows[0]!);

      await client.query(
        `INSERT INTO gigalibs_ar.audit_events
           (tenant_id, id, aggregate_type, aggregate_id, action,
            actor_subject, actor_permissions, new_state, correlation_id)
         VALUES ($1, $2, 'invoice-series', $3, 'ar.series.created', $4, $5, $6::jsonb, $7)`,
        [
          principal.tenantId, randomUUID(), id,
          principal.subject, [...principal.permissions],
          JSON.stringify(body), correlationId,
        ],
      );

      await storeIdempotentResult(client, {
        tenantId: principal.tenantId,
        scope, key: idempotencyKey, requestHash,
        status: 201, body, resourceId: id,
      });
      return { status: 201, body, replayed: false };
    });
  }

  // ── PATCH /v1/series/:id ──────────────────────────────────────────────────

  async update(
    id: string,
    rawInput: unknown,
    ifMatch: string | undefined,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<SeriesResponse> {
    const input = updateSeriesSchema.parse(rawInput);
    const expectedVersion = parseEtag(ifMatch);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Lock
      const lockResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM gigalibs_ar.invoice_series WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [principal.tenantId, id],
      );
      if (!lockResult.rows[0]) {
        throw new NotFoundException('Invoice series not found.');
      }
      const current = lockResult.rows[0];

      if (expectedVersion !== undefined && (current.version as number) !== expectedVersion) {
        throw new ArConflictError(
          'OPTIMISTIC_LOCK_CONFLICT',
          `Series was modified (current version: ${current.version as number}).`,
        );
      }

      // If making this default, clear others
      if (input.isDefault === true) {
        await client.query(
          `UPDATE gigalibs_ar.invoice_series SET is_default = false WHERE tenant_id = $1 AND is_default = true AND id <> $2`,
          [principal.tenantId, id],
        );
      }

      // Guard: can't un-default the only series
      if (input.isDefault === false && (current.is_default as boolean)) {
        const count = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM gigalibs_ar.invoice_series WHERE tenant_id = $1`,
          [principal.tenantId],
        );
        if (parseInt(count.rows[0]!.count, 10) <= 1) {
          throw new BadRequestException('Cannot remove default status from the only series.');
        }
        // Assign default to another series
        await client.query(
          `UPDATE gigalibs_ar.invoice_series SET is_default = true
           WHERE tenant_id = $1 AND id <> $2 ORDER BY created_at ASC LIMIT 1`,
          [principal.tenantId, id],
        );
      }

      const setParts: string[] = [];
      const values: unknown[] = [principal.tenantId, id];
      let idx = 3;

      if (input.prefix !== undefined) { setParts.push(`prefix = $${idx++}`); values.push(input.prefix); }
      if (input.padding !== undefined) { setParts.push(`padding = $${idx++}`); values.push(input.padding); }
      if (input.isDefault !== undefined) { setParts.push(`is_default = $${idx++}`); values.push(input.isDefault); }
      setParts.push(`version = version + 1`);
      setParts.push(`updated_at = NOW()`);

      const updatedResult = await client.query<Record<string, unknown>>(
        `UPDATE gigalibs_ar.invoice_series SET ${setParts.join(', ')}
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        values,
      );
      const body = rowToResponse(updatedResult.rows[0]!);

      await client.query(
        `INSERT INTO gigalibs_ar.audit_events
           (tenant_id, id, aggregate_type, aggregate_id, action,
            actor_subject, actor_permissions, prior_state, new_state, correlation_id)
         VALUES ($1, $2, 'invoice-series', $3, 'ar.series.updated', $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [
          principal.tenantId, randomUUID(), id,
          principal.subject, [...principal.permissions],
          JSON.stringify(rowToResponse(current)), JSON.stringify(body), correlationId,
        ],
      );

      return body;
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEtag(ifMatch: string | undefined): number | undefined {
  if (!ifMatch) return undefined;
  const stripped = ifMatch.replace(/^"(.+)"$/, '$1');
  const n = Number(stripped);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
