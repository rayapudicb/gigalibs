import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { ArConflictError } from '../http/problem.filter.js';
import type { PoolClient } from 'pg';

// ─── Input schemas ────────────────────────────────────────────────────────────

const creditNoteLineSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitAmountMinor: z.number().int().nonnegative(),
});

export const issueCreditNoteSchema = z.object({
  reason: z.string().min(1).max(500),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issueDate must be YYYY-MM-DD'),
  lines: z.array(creditNoteLineSchema).min(1).max(200),
});

export const logCollectionEventSchema = z.object({
  eventType: z.enum(['REMINDER_SENT', 'ESCALATED', 'RESOLVED', 'NOTE_ADDED']),
  channel: z.enum(['EMAIL', 'PHONE', 'LETTER', 'PORTAL']).optional(),
  note: z.string().max(2000).optional(),
});

// ─── Response types ───────────────────────────────────────────────────────────

export interface CreditNoteLine {
  position: number;
  description: string;
  quantity: string;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface CreditNoteResponse {
  id: string;
  invoiceId: string;
  creditNoteNumber: string;
  currency: string;
  reason: string;
  issueDate: string;
  lines: CreditNoteLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  issuedBy: string;
  issuedAt: string;
}

export interface CollectionEventResponse {
  id: string;
  invoiceId: string;
  eventType: string;
  channel: string | null;
  note: string | null;
  actor: string;
  occurredAt: string;
}

export interface AgingRow {
  invoiceId: string;
  draftId: string;
  invoiceNumber: string;
  customerId: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  dueDate: string;
  daysOverdue: number;
  agingBucket: string;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface CreditNoteHeaderRow {
  tenant_id: string;
  id: string;
  invoice_id: string;
  credit_note_number: string;
  currency: string;
  reason: string;
  issue_date: string;
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  issued_by: string;
  issued_at: string;
}

interface CreditNoteLineRow {
  id: string;
  credit_note_id: string;
  position: number;
  description: string;
  quantity: string;
  unit_amount_minor: string;
  amount_minor: string;
}

interface AgingDbRow {
  invoice_id: string;
  draft_id: string;
  invoice_number: string;
  customer_id: string;
  currency: string;
  total_minor: string;
  amount_paid_minor: string;
  amount_due_minor: string;
  due_date: string;
  days_overdue: string;
  aging_bucket: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeInteger(value: string, field: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) throw new Error(`${field} is not a valid integer: ${value}`);
  return n;
}

async function queryOne<T extends Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T | undefined> {
  const result = await client.query<T>(sql, params);
  return result.rows[0];
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapCreditNote(
  header: CreditNoteHeaderRow,
  lines: CreditNoteLineRow[],
): CreditNoteResponse {
  return {
    id: header.id,
    invoiceId: header.invoice_id,
    creditNoteNumber: header.credit_note_number,
    currency: header.currency,
    reason: header.reason,
    issueDate: header.issue_date,
    lines: lines.map((l) => ({
      position: l.position,
      description: l.description,
      quantity: l.quantity,
      unitAmountMinor: safeInteger(l.unit_amount_minor, 'unitAmountMinor'),
      amountMinor: safeInteger(l.amount_minor, 'amountMinor'),
    })),
    subtotalMinor: safeInteger(header.subtotal_minor, 'subtotalMinor'),
    taxMinor: safeInteger(header.tax_minor, 'taxMinor'),
    totalMinor: safeInteger(header.total_minor, 'totalMinor'),
    issuedBy: header.issued_by,
    issuedAt: header.issued_at,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CreditNotesService {
  constructor(private readonly db: DatabaseService) {}

  // ── Issue credit note ─────────────────────────────────────────────────────

  async issue(
    invoiceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CreditNoteResponse> {
    const input = issueCreditNoteSchema.parse(rawInput);
    const { tenantId } = principal;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Resolve invoice
      const invoiceRow = await queryOne<{
        id: string;
        issued_invoice_id: string | null;
        currency: string;
        status: string;
      }>(
        client,
        `SELECT d.id, d.issued_invoice_id, d.currency, d.status
           FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND (d.id = $2 OR d.issued_invoice_id = $2)`,
        [tenantId, invoiceId],
      );
      if (!invoiceRow) throw new NotFoundException('Invoice not found.');
      if (invoiceRow.status !== 'ISSUED' || !invoiceRow.issued_invoice_id) {
        throw new ArConflictError(
          'INVOICE_NOT_ISSUED',
          'Credit notes require an issued invoice.',
        );
      }
      const { id: draftId, issued_invoice_id: issuedInvoiceId, currency } = invoiceRow;

      // Compute line amounts
      const computedLines = input.lines.map((l, idx) => {
        const amountMinor = Math.round(l.quantity * l.unitAmountMinor);
        if (amountMinor <= 0) {
          throw new BadRequestException(`Line ${idx + 1} amount must be positive.`);
        }
        return { ...l, amountMinor };
      });

      const subtotalMinor = computedLines.reduce((s, l) => s + l.amountMinor, 0);
      const taxMinor = 0;
      const totalMinor = subtotalMinor + taxMinor;

      if (totalMinor <= 0) {
        throw new BadRequestException('Credit note total must be positive.');
      }

      // Generate credit note number
      const seqRow = await queryOne<{ next_seq: string }>(
        client,
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(credit_note_number, '[^0-9]', '', 'g') AS bigint)), 0) + 1 AS next_seq
           FROM gigalibs_ar.credit_notes
          WHERE tenant_id = $1`,
        [tenantId],
      );
      const seq = seqRow?.next_seq ?? '1';
      const creditNoteNumber = `CN-${String(seq).padStart(6, '0')}`;

      const cnId = randomUUID();
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO gigalibs_ar.credit_notes
           (tenant_id, id, invoice_id, credit_note_number, currency, reason,
            issue_date, subtotal_minor, tax_minor, total_minor, issued_by, issued_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId, cnId, issuedInvoiceId, creditNoteNumber, currency,
         input.reason, input.issueDate, subtotalMinor, taxMinor, totalMinor,
         principal.subject, now],
      );

      for (let i = 0; i < computedLines.length; i++) {
        const l = computedLines[i]!;
        await client.query(
          `INSERT INTO gigalibs_ar.credit_note_lines
             (tenant_id, id, credit_note_id, position, description, quantity, unit_amount_minor, amount_minor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId, randomUUID(), cnId, i + 1, l.description,
           l.quantity.toString(), l.unitAmountMinor, l.amountMinor],
        );
      }

      // Record matching payment so balance functions pick this up
      await client.query(
        `INSERT INTO gigalibs_ar.payment_records
           (tenant_id, id, invoice_id, amount_minor, currency, payment_method,
            payment_reference, notes, paid_at, recorded_by, created_at)
         VALUES ($1,$2,$3,$4,$5,'CREDIT_NOTE',$6,$7,$8,$9,$8)`,
        [tenantId, randomUUID(), issuedInvoiceId, totalMinor, currency,
         cnId, `Credit note ${creditNoteNumber}`, now, principal.subject],
      );

      // Outbox
      await client.query(
        `INSERT INTO gigalibs_ar.outbox_events
           (tenant_id, id, topic, payload, correlation_id, created_at)
         VALUES ($1,$2,'ar.invoice.credit-note-issued.v1',$3::jsonb,$4,$5)`,
        [
          tenantId,
          randomUUID(),
          JSON.stringify({
            invoiceId: issuedInvoiceId,
            draftId,
            creditNoteId: cnId,
            creditNoteNumber,
            totalMinor,
            currency,
            reason: input.reason,
            issuedBy: principal.subject,
          }),
          correlationId,
          now,
        ],
      );

      const headerRow: CreditNoteHeaderRow = {
        tenant_id: tenantId, id: cnId, invoice_id: issuedInvoiceId,
        credit_note_number: creditNoteNumber, currency, reason: input.reason,
        issue_date: input.issueDate,
        subtotal_minor: String(subtotalMinor), tax_minor: String(taxMinor),
        total_minor: String(totalMinor), issued_by: principal.subject, issued_at: now,
      };
      const lineRows: CreditNoteLineRow[] = computedLines.map((l, idx) => ({
        id: randomUUID(), credit_note_id: cnId, position: idx + 1,
        description: l.description, quantity: String(l.quantity),
        unit_amount_minor: String(l.unitAmountMinor), amount_minor: String(l.amountMinor),
      }));
      return mapCreditNote(headerRow, lineRows);
    });
  }

  // ── List credit notes ─────────────────────────────────────────────────────

  async list(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<{ items: CreditNoteResponse[] }> {
    const { tenantId } = principal;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const draftRow = await queryOne<{ issued_invoice_id: string | null }>(
        client,
        `SELECT d.issued_invoice_id
           FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND (d.id = $2 OR d.issued_invoice_id = $2)`,
        [tenantId, invoiceId],
      );
      if (!draftRow?.issued_invoice_id) return { items: [] };
      const issuedId = draftRow.issued_invoice_id;

      const headersResult = await client.query<CreditNoteHeaderRow>(
        `SELECT tenant_id, id, invoice_id, credit_note_number, currency, reason,
                issue_date::text AS issue_date,
                subtotal_minor::text AS subtotal_minor,
                tax_minor::text AS tax_minor,
                total_minor::text AS total_minor,
                issued_by, issued_at
           FROM gigalibs_ar.credit_notes
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY issued_at DESC`,
        [tenantId, issuedId],
      );
      const headers = headersResult.rows;
      if (headers.length === 0) return { items: [] };

      const cnIds = headers.map((h) => h.id);
      const linesResult = await client.query<CreditNoteLineRow>(
        `SELECT id, credit_note_id, position, description, quantity::text AS quantity,
                unit_amount_minor::text AS unit_amount_minor,
                amount_minor::text AS amount_minor
           FROM gigalibs_ar.credit_note_lines
          WHERE tenant_id = $1 AND credit_note_id = ANY($2)
          ORDER BY credit_note_id, position`,
        [tenantId, cnIds],
      );

      const linesByNote = new Map<string, CreditNoteLineRow[]>();
      for (const l of linesResult.rows) {
        const bucket = linesByNote.get(l.credit_note_id) ?? [];
        bucket.push(l);
        linesByNote.set(l.credit_note_id, bucket);
      }

      return {
        items: headers.map((h) => mapCreditNote(h, linesByNote.get(h.id) ?? [])),
      };
    });
  }

  // ── Log collection event ──────────────────────────────────────────────────

  async logCollectionEvent(
    invoiceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
  ): Promise<CollectionEventResponse> {
    const input = logCollectionEventSchema.parse(rawInput);
    const { tenantId } = principal;

    if (input.eventType === 'REMINDER_SENT' && !input.channel) {
      throw new BadRequestException('channel is required when eventType is REMINDER_SENT.');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const draftRow = await queryOne<{ issued_invoice_id: string | null }>(
        client,
        `SELECT d.issued_invoice_id
           FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND (d.id = $2 OR d.issued_invoice_id = $2)`,
        [tenantId, invoiceId],
      );
      if (!draftRow?.issued_invoice_id) {
        throw new NotFoundException('Invoice not found.');
      }
      const { issued_invoice_id: issuedInvoiceId } = draftRow;

      const id = randomUUID();
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO gigalibs_ar.collection_events
           (tenant_id, id, invoice_id, event_type, channel, note, actor, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, id, issuedInvoiceId, input.eventType,
         input.channel ?? null, input.note ?? null, principal.subject, now],
      );

      return {
        id,
        invoiceId: issuedInvoiceId,
        eventType: input.eventType,
        channel: input.channel ?? null,
        note: input.note ?? null,
        actor: principal.subject,
        occurredAt: now,
      };
    });
  }

  // ── List collection events ────────────────────────────────────────────────

  async listCollectionEvents(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<{ items: CollectionEventResponse[] }> {
    const { tenantId } = principal;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const draftRow = await queryOne<{ issued_invoice_id: string | null }>(
        client,
        `SELECT d.issued_invoice_id
           FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND (d.id = $2 OR d.issued_invoice_id = $2)`,
        [tenantId, invoiceId],
      );
      if (!draftRow?.issued_invoice_id) return { items: [] };

      const result = await client.query<{
        id: string; invoice_id: string; event_type: string;
        channel: string | null; note: string | null; actor: string; occurred_at: string;
      }>(
        `SELECT id, invoice_id, event_type, channel, note, actor, occurred_at
           FROM gigalibs_ar.collection_events
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY occurred_at DESC`,
        [tenantId, draftRow.issued_invoice_id],
      );

      return {
        items: result.rows.map((r) => ({
          id: r.id,
          invoiceId: r.invoice_id,
          eventType: r.event_type,
          channel: r.channel,
          note: r.note,
          actor: r.actor,
          occurredAt: r.occurred_at,
        })),
      };
    });
  }

  // ── Aging report ──────────────────────────────────────────────────────────

  async aging(
    principal: ArPrincipal,
    bucketFilter?: string,
    customerId?: string,
  ): Promise<{ items: AgingRow[] }> {
    const { tenantId } = principal;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const conditions: string[] = ['a.tenant_id = $1'];
      const params: unknown[] = [tenantId];
      let pIdx = 2;

      if (bucketFilter) { conditions.push(`a.aging_bucket = $${pIdx++}`); params.push(bucketFilter); }
      if (customerId)   { conditions.push(`a.customer_id = $${pIdx++}`); params.push(customerId); }

      const result = await client.query<AgingDbRow>(
        `SELECT invoice_id, draft_id, invoice_number, customer_id, currency,
                total_minor::text AS total_minor,
                amount_paid_minor::text AS amount_paid_minor,
                amount_due_minor::text AS amount_due_minor,
                due_date::text AS due_date,
                days_overdue::text AS days_overdue,
                aging_bucket
           FROM gigalibs_ar.invoice_aging a
          WHERE ${conditions.join(' AND ')}
          ORDER BY due_date ASC`,
        params,
      );

      return {
        items: result.rows.map((r) => ({
          invoiceId: r.invoice_id,
          draftId: r.draft_id,
          invoiceNumber: r.invoice_number,
          customerId: r.customer_id,
          currency: r.currency,
          totalMinor: safeInteger(r.total_minor, 'totalMinor'),
          amountPaidMinor: safeInteger(r.amount_paid_minor, 'amountPaidMinor'),
          amountDueMinor: safeInteger(r.amount_due_minor, 'amountDueMinor'),
          dueDate: r.due_date,
          daysOverdue: parseInt(r.days_overdue, 10),
          agingBucket: r.aging_bucket,
        })),
      };
    });
  }
}
