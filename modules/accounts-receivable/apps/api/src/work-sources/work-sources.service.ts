import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { assertActiveTenant } from '../database/persistence-helpers.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Input Schemas ──────────────────────────────────────────────────────────

const createWorkSourceSchema = z
  .object({
    customerId: z.uuid(),
    sourceType: z.enum(['EVENT', 'PROJECT', 'CASE', 'CONTRACT', 'ORDER']),
    sourceReference: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const createBillableRecordSchema = z
  .object({
    externalRecordId: z.string().trim().min(1).max(100),
    resourceName: z.string().trim().min(1).max(200),
    resourceRole: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(100),
    quantity: z.number().positive().max(1_000_000),
    rawCostMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    markupPercentBp: z.number().int().nonnegative().max(100_000).default(0), // 3500 = 35%
    markupFlatMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
    approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  })
  .strict();

const ingestRecordsSchema = z
  .object({
    records: z.array(createBillableRecordSchema).min(1).max(1000),
  })
  .strict();

const generateInvoiceSchema = z
  .object({
    invoiceSeriesId: z.uuid().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    taxRateBp: z.number().int().nonnegative().max(10_000).default(0), // 1000 = 10%
  })
  .strict();

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkSourceSummaryResponse {
  workSourceId: string;
  sourceReference: string;
  name: string;
  totalRecords: number;
  uniqueWorkers: number;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    reserved: number;
    invoiced: number;
    readyToBill: number;
  };
  amounts: {
    rawCostMinor: number;
    readyToBillMinor: number;
    invoicedMinor: number;
  };
}

export interface GeneratedInvoiceFamilyResponse {
  draftId: string;
  workSourceId: string;
  familyRole: 'ORIGINAL' | 'SUPPLEMENTAL' | 'REPLACEMENT';
  sequenceNumber: number;
  recordCount: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

export interface FamilyItemResponse {
  invoiceId: string;
  sequenceNumber: number;
  familyRole: string;
  recordCount: number;
  status: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class WorkSourcesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // ── Register Work Source ──────────────────────────────────────────────────
  async createWorkSource(
    rawInput: unknown,
    principal: ArPrincipal,
  ): Promise<{ id: string; name: string; sourceReference: string }> {
    const input = createWorkSourceSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const customer = await client.query(
        'SELECT id FROM gigalibs_ar.customers WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, input.customerId],
      );
      if (!customer.rows[0]) throw new NotFoundException('Customer not found.');

      const id = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.work_sources (
            tenant_id, id, customer_id, source_type, source_reference, name, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          principal.tenantId,
          id,
          input.customerId,
          input.sourceType,
          input.sourceReference,
          input.name,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return {
        id,
        name: input.name,
        sourceReference: input.sourceReference,
      };
    });
  }

  // ── Ingest Billable Records ───────────────────────────────────────────────
  async ingestRecords(
    workSourceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
  ): Promise<{ ingested: number }> {
    const sourceId = z.uuid().parse(workSourceId);
    const { records } = ingestRecordsSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const ws = await client.query(
        'SELECT id FROM gigalibs_ar.work_sources WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, sourceId],
      );
      if (!ws.rows[0]) throw new NotFoundException('Work source not found.');

      for (const rec of records) {
        // Calculate billed rate and total
        // billed_rate = raw_cost * (10000 + markup_bp) / 10000 + markup_flat
        const billedRateMinor = Math.round(
          (rec.rawCostMinor * (10000 + rec.markupPercentBp)) / 10000 + rec.markupFlatMinor,
        );
        const billedTotalMinor = Math.round(rec.quantity * billedRateMinor);

        const recordId = randomUUID();
        const approvedAt = rec.approvalStatus === 'APPROVED' ? new Date().toISOString() : null;
        const approvedBy = rec.approvalStatus === 'APPROVED' ? principal.subject : null;

        await client.query(
          `
            INSERT INTO gigalibs_ar.billable_source_records (
              tenant_id, id, work_source_id, external_record_id, resource_name,
              resource_role, category, quantity, raw_cost_minor, markup_percent_bp,
              markup_flat_minor, billed_rate_minor, billed_total_minor,
              approval_status, billing_status, approved_by, approved_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'UNBILLED', $15, $16::timestamptz)
            ON CONFLICT (tenant_id, work_source_id, external_record_id) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              raw_cost_minor = EXCLUDED.raw_cost_minor,
              markup_percent_bp = EXCLUDED.markup_percent_bp,
              markup_flat_minor = EXCLUDED.markup_flat_minor,
              billed_rate_minor = EXCLUDED.billed_rate_minor,
              billed_total_minor = EXCLUDED.billed_total_minor,
              approval_status = EXCLUDED.approval_status,
              approved_by = EXCLUDED.approved_by,
              approved_at = EXCLUDED.approved_at,
              updated_at = transaction_timestamp()
            WHERE gigalibs_ar.billable_source_records.billing_status = 'UNBILLED'
          `,
          [
            principal.tenantId,
            recordId,
            sourceId,
            rec.externalRecordId,
            rec.resourceName,
            rec.resourceRole,
            rec.category,
            rec.quantity,
            rec.rawCostMinor,
            rec.markupPercentBp,
            rec.markupFlatMinor,
            billedRateMinor,
            billedTotalMinor,
            rec.approvalStatus,
            approvedBy,
            approvedAt,
          ],
        );
      }

      return { ingested: records.length };
    });
  }

  // ── Work Source Summary (FR-17-EB-01) ────────────────────────────────────
  async getSummary(
    workSourceId: string,
    principal: ArPrincipal,
  ): Promise<WorkSourceSummaryResponse> {
    const sourceId = z.uuid().parse(workSourceId);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const wsResult = await client.query<{ id: string; source_reference: string; name: string }>(
        'SELECT id, source_reference, name FROM gigalibs_ar.work_sources WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, sourceId],
      );
      const ws = wsResult.rows[0];
      if (!ws) throw new NotFoundException('Work source not found.');

      const aggResult = await client.query<{
        total_records: string;
        unique_workers: string;
        pending: string;
        approved: string;
        rejected: string;
        reserved: string;
        invoiced: string;
        ready_to_bill: string;
        raw_cost: string;
        ready_minor: string;
        invoiced_minor: string;
      }>(
        `
          SELECT
            COUNT(*)::text AS total_records,
            COUNT(DISTINCT resource_name)::text AS unique_workers,
            COUNT(*) FILTER (WHERE approval_status = 'PENDING')::text AS pending,
            COUNT(*) FILTER (WHERE approval_status = 'APPROVED')::text AS approved,
            COUNT(*) FILTER (WHERE approval_status = 'REJECTED')::text AS rejected,
            COUNT(*) FILTER (WHERE billing_status = 'RESERVED')::text AS reserved,
            COUNT(*) FILTER (WHERE billing_status = 'INVOICED')::text AS invoiced,
            COUNT(*) FILTER (WHERE approval_status = 'APPROVED' AND billing_status = 'UNBILLED')::text AS ready_to_bill,
            COALESCE(SUM(raw_cost_minor), 0)::text AS raw_cost,
            COALESCE(SUM(billed_total_minor) FILTER (WHERE approval_status = 'APPROVED' AND billing_status = 'UNBILLED'), 0)::text AS ready_minor,
            COALESCE(SUM(billed_total_minor) FILTER (WHERE billing_status = 'INVOICED'), 0)::text AS invoiced_minor
          FROM gigalibs_ar.billable_source_records
          WHERE tenant_id = $1 AND work_source_id = $2
        `,
        [principal.tenantId, sourceId],
      );

      const agg = aggResult.rows[0]!;
      return {
        workSourceId: ws.id,
        sourceReference: ws.source_reference,
        name: ws.name,
        totalRecords: Number(agg.total_records),
        uniqueWorkers: Number(agg.unique_workers),
        counts: {
          pending: Number(agg.pending),
          approved: Number(agg.approved),
          rejected: Number(agg.rejected),
          reserved: Number(agg.reserved),
          invoiced: Number(agg.invoiced),
          readyToBill: Number(agg.ready_to_bill),
        },
        amounts: {
          rawCostMinor: Number(agg.raw_cost),
          readyToBillMinor: Number(agg.ready_minor),
          invoicedMinor: Number(agg.invoiced_minor),
        },
      };
    });
  }

  // ── Generate Supplemental Invoice (FR-17-EB-02 / EB-03) ───────────────────
  async generateInvoice(
    workSourceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<GeneratedInvoiceFamilyResponse> {
    const sourceId = z.uuid().parse(workSourceId);
    const input = generateInvoiceSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const wsResult = await client.query<{ id: string; customer_id: string; source_reference: string; name: string }>(
        'SELECT id, customer_id, source_reference, name FROM gigalibs_ar.work_sources WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, sourceId],
      );
      const ws = wsResult.rows[0];
      if (!ws) throw new NotFoundException('Work source not found.');

      // Lock eligible records
      const recordsResult = await client.query<{
        id: string;
        resource_name: string;
        resource_role: string;
        category: string;
        quantity: string;
        billed_rate_minor: string;
        billed_total_minor: string;
      }>(
        `
          SELECT id, resource_name, resource_role, category, quantity::text,
            billed_rate_minor::text, billed_total_minor::text
          FROM gigalibs_ar.billable_source_records
          WHERE tenant_id = $1 AND work_source_id = $2
            AND approval_status = 'APPROVED' AND billing_status = 'UNBILLED'
          FOR UPDATE
        `,
        [principal.tenantId, sourceId],
      );

      const records = recordsResult.rows;
      if (records.length === 0) {
        throw new ArConflictError(
          'NO_ELIGIBLE_RECORDS',
          'Cannot generate invoice: zero approved unbilled records are eligible for billing.',
        );
      }

      // Check existing sequence in family
      const seqResult = await client.query<{ max_seq: string | null }>(
        `
          SELECT MAX(sequence_number)::text AS max_seq
          FROM gigalibs_ar.invoice_families
          WHERE tenant_id = $1 AND work_source_id = $2
        `,
        [principal.tenantId, sourceId],
      );
      const maxSeq = seqResult.rows[0]?.max_seq != null ? Number(seqResult.rows[0].max_seq) : null;
      const sequenceNumber = maxSeq !== null ? maxSeq + 1 : 0;
      const familyRole: GeneratedInvoiceFamilyResponse['familyRole'] = sequenceNumber === 0 ? 'ORIGINAL' : 'SUPPLEMENTAL';

      // Compute invoice lines
      let subtotalMinor = 0;
      for (const r of records) {
        subtotalMinor += Number(r.billed_total_minor);
      }
      const taxMinor = Math.round((subtotalMinor * input.taxRateBp) / 10000);
      const totalMinor = subtotalMinor + taxMinor;

      // Select billing entity
      const beResult = await client.query<{ id: string }>(
        'SELECT id FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 LIMIT 1',
        [principal.tenantId],
      );
      const billingEntityId = beResult.rows[0]?.id;
      if (!billingEntityId) {
        throw new ArConflictError('SETUP_INCOMPLETE', 'No billing entity configured for tenant.');
      }

      const draftId = randomUUID();
      const issueDate = new Date().toISOString().split('T')[0];
      const dueDate = input.dueDate ?? issueDate;

      // Create draft invoice header
      await client.query(
        `
          INSERT INTO gigalibs_ar.invoice_drafts (
            tenant_id, id, customer_id, billing_entity_id, status, currency,
            issue_date, due_date, subtotal_minor, tax_minor, total_minor,
            version, created_by
          ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6::date, $7::date, $8, $9, $10, 1, $11)
        `,
        [
          principal.tenantId,
          draftId,
          ws.customer_id,
          billingEntityId,
          input.currency,
          issueDate,
          dueDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          principal.subject,
        ],
      );

      // Create invoice draft lines
      let position = 1;
      for (const r of records) {
        const lineDescription = `[${ws.source_reference}] ${r.category}: ${r.resource_name} (${r.resource_role})`;
        await client.query(
          `
            INSERT INTO gigalibs_ar.invoice_draft_lines (
              tenant_id, id, draft_id, position, description, quantity,
              unit_amount_minor, amount_minor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            principal.tenantId,
            randomUUID(),
            draftId,
            position++,
            lineDescription,
            r.quantity,
            r.billed_rate_minor,
            r.billed_total_minor,
          ],
        );
      }

      // Mark records RESERVED
      const recordIds = records.map((r) => r.id);
      await client.query(
        `
          UPDATE gigalibs_ar.billable_source_records
          SET billing_status = 'RESERVED', reserved_invoice_id = $1, updated_at = transaction_timestamp()
          WHERE tenant_id = $2 AND id = ANY($3)
        `,
        [draftId, principal.tenantId, recordIds],
      );

      // Record family relationship
      const familyId = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.invoice_families (
            tenant_id, id, work_source_id, invoice_id, sequence_number, family_role, record_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          principal.tenantId,
          familyId,
          sourceId,
          draftId,
          sequenceNumber,
          familyRole,
          records.length,
        ],
      );

      // Outbox event
      const eventId = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.outbox_events (
            tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
            correlation_id, causation_id, payload, occurred_at
          ) VALUES ($1, $2, 'ar.work-source.invoice-generated.v1', 'work_source', $3, $4, $5, $6, $7::jsonb, transaction_timestamp())
        `,
        [
          principal.tenantId,
          eventId,
          sourceId,
          `work-sources/${sourceId}`,
          correlationId,
          draftId,
          JSON.stringify({
            specversion: '1.0',
            id: eventId,
            source: 'gigalibs.accounts-receivable',
            type: 'ar.work-source.invoice-generated.v1',
            tenantId: principal.tenantId,
            subject: `work-sources/${sourceId}`,
            correlationId,
            data: {
              workSourceId: sourceId,
              draftId,
              familyRole,
              sequenceNumber,
              recordCount: records.length,
              totalMinor,
              currency: input.currency,
            },
          }),
        ],
      );

      return {
        draftId,
        workSourceId: sourceId,
        familyRole,
        sequenceNumber,
        recordCount: records.length,
        subtotalMinor,
        taxMinor,
        totalMinor,
        currency: input.currency,
      };
    });
  }

  // ── Get Complete Family Lineage (FR-17-EB-03 / EB-15) ─────────────────────
  async getFamily(
    workSourceId: string,
    principal: ArPrincipal,
  ): Promise<{ items: FamilyItemResponse[] }> {
    const sourceId = z.uuid().parse(workSourceId);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const result = await client.query<{
        invoice_id: string;
        sequence_number: number;
        family_role: string;
        record_count: number;
        status: string;
        total_minor: string;
        currency: string;
        created_at: string;
      }>(
        `
          SELECT
            f.invoice_id,
            f.sequence_number,
            f.family_role,
            f.record_count,
            COALESCE(i.status, d.status) AS status,
            COALESCE(i.total_minor, d.total_minor)::text AS total_minor,
            COALESCE(i.currency, d.currency) AS currency,
            f.created_at::text
          FROM gigalibs_ar.invoice_families f
          LEFT JOIN gigalibs_ar.invoice_drafts d ON d.tenant_id = f.tenant_id AND d.id = f.invoice_id
          LEFT JOIN gigalibs_ar.invoices i ON i.tenant_id = f.tenant_id AND i.id = f.invoice_id
          WHERE f.tenant_id = $1 AND f.work_source_id = $2
          ORDER BY f.sequence_number ASC
        `,
        [principal.tenantId, sourceId],
      );

      return {
        items: result.rows.map((row) => ({
          invoiceId: row.invoice_id,
          sequenceNumber: row.sequence_number,
          familyRole: row.family_role,
          recordCount: row.record_count,
          status: row.status ?? 'DRAFT',
          totalMinor: Number(row.total_minor ?? 0),
          currency: row.currency ?? 'USD',
          createdAt: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }
}
