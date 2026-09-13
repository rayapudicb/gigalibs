import { randomUUID } from 'node:crypto';
import {
  type CalculatedInvoiceLine,
  type InvoiceDraftLineInput,
  calculateInvoiceDraft,
  formatInvoiceNumber,
  validateIssueDates,
} from '@gigalibs/ar-domain';
import { HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import {
  type IdempotentResult,
  assertActiveTenant,
  hashCanonicalJson,
  lockIdempotencyScope,
  readIdempotentResult,
  storeIdempotentResult,
} from '../database/persistence-helpers.js';
import { decodeInvoiceCursor, encodeCursor } from '../http/pagination.js';
import { ArConflictError } from '../http/problem.filter.js';

const uuid = z.uuid();
const lineSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z.string().regex(/^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/),
    unitAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const draftInputSchema = z
  .object({
    billingEntityId: uuid.optional(),
    invoiceSeriesId: uuid.optional(),
    customerId: uuid,
    currency: z.string().regex(/^[A-Z]{3}$/),
    issueDate: z.iso.date(),
    dueDate: z.iso.date(),
    purchaseOrderReference: z.string().trim().min(1).max(100).optional(),
    lines: z.array(lineSchema).min(1).max(500),
  })
  .strict();
const issueInputSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

interface DraftHeaderRow {
  id: string;
  billing_entity_id: string;
  invoice_series_id: string;
  customer_id: string;
  currency: string;
  issue_date: string;
  due_date: string;
  purchase_order_reference: string | null;
  status: 'DRAFT' | 'ISSUED';
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  version: number;
  invoice_number: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
  // Phase 4: live settlement values joined from payment_records / void_records
  amount_paid_minor: string;
  is_voided: boolean;
}

interface LineRow {
  position: number;
  description: string;
  quantity: string;
  unit_amount_minor: string;
  amount_minor: string;
}

interface BatchLineRow extends LineRow {
  document_id: string;
}

interface EntityRow {
  id: string;
  legal_name: string;
  legal_identifier: string | null;
  default_currency: string;
  locale: string;
  time_zone: string;
}

interface SeriesRow {
  id: string;
  billing_entity_id: string;
  prefix: string;
  next_value: string;
  padding: number;
}

interface CustomerSnapshotRow {
  id: string;
  legal_name: string;
  billing_email: string;
  external_reference: string | null;
  currency: string;
  status: string;
}

export interface InvoiceLineResponse extends InvoiceDraftLineInput {
  position: number;
  amountMinor: number;
}

export interface InvoiceResponse {
  id: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  customerId: string;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'ISSUED';
  currency: string;
  issueDate: string;
  dueDate: string;
  purchaseOrderReference?: string;
  lines: InvoiceLineResponse[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  isVoided: boolean;
  version: number;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class InvoicesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createDraft(
    rawInput: unknown,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<InvoiceResponse>> {
    const input = draftInputSchema.parse(rawInput);
    validateIssueDates(input.issueDate, input.dueDate);
    const calculation = calculateInvoiceDraft(input.currency, input.lines);
    const scope = 'invoices.create-draft.v1';
    const requestHash = hashCanonicalJson(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      await lockIdempotencyScope(client, principal.tenantId, scope, idempotencyKey);
      const replay = await readIdempotentResult<InvoiceResponse>(
        client,
        principal.tenantId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (replay) return replay;

      const entity = await resolveBillingEntity(client, principal.tenantId, input.billingEntityId);
      const series = await resolveInvoiceSeries(
        client,
        principal.tenantId,
        entity.id,
        input.invoiceSeriesId,
      );
      await requireActiveCustomer(client, principal.tenantId, input.customerId);

      const id = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.invoice_drafts (
            tenant_id, id, billing_entity_id, invoice_series_id, customer_id, currency,
            issue_date, due_date, purchase_order_reference, subtotal_minor, tax_minor, total_minor,
            created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13, $13)
        `,
        [
          principal.tenantId,
          id,
          entity.id,
          series.id,
          input.customerId,
          input.currency,
          input.issueDate,
          input.dueDate,
          input.purchaseOrderReference ?? null,
          calculation.subtotalMinor,
          calculation.taxMinor,
          calculation.totalMinor,
          principal.subject,
        ],
      );
      await insertDraftLines(client, principal.tenantId, id, calculation.lines);
      const body = await loadInvoice(client, principal.tenantId, id);
      await writeAudit(client, {
        principal,
        aggregateId: id,
        action: 'ar.invoice.draft-created',
        priorState: null,
        newState: body,
        correlationId,
      });
      await storeIdempotentResult(client, {
        tenantId: principal.tenantId,
        scope,
        key: idempotencyKey,
        requestHash,
        status: 201,
        body,
        resourceId: id,
      });
      return { status: 201, body, replayed: false };
    });
  }

  async updateDraft(
    invoiceId: string,
    rawInput: unknown,
    expectedVersion: number,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<InvoiceResponse> {
    const id = uuid.parse(invoiceId);
    const input = draftInputSchema.parse(rawInput);
    validateIssueDates(input.issueDate, input.dueDate);
    const calculation = calculateInvoiceDraft(input.currency, input.lines);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const prior = await loadInvoice(client, principal.tenantId, id, true);
      if (prior.status !== 'DRAFT') {
        throw new ArConflictError(
          'ISSUED_INVOICE_IMMUTABLE',
          'An issued invoice cannot be edited.',
        );
      }
      if (prior.version !== expectedVersion) throw staleVersion();

      const entity = await resolveBillingEntity(client, principal.tenantId, input.billingEntityId);
      const series = await resolveInvoiceSeries(
        client,
        principal.tenantId,
        entity.id,
        input.invoiceSeriesId,
      );
      await requireActiveCustomer(client, principal.tenantId, input.customerId);
      const update = await client.query(
        `
          UPDATE gigalibs_ar.invoice_drafts
          SET
            billing_entity_id = $3,
            invoice_series_id = $4,
            customer_id = $5,
            currency = $6,
            issue_date = $7::date,
            due_date = $8::date,
            purchase_order_reference = $9,
            subtotal_minor = $10,
            tax_minor = $11,
            total_minor = $12,
            version = version + 1,
            updated_by = $13,
            updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT' AND version = $14
        `,
        [
          principal.tenantId,
          id,
          entity.id,
          series.id,
          input.customerId,
          input.currency,
          input.issueDate,
          input.dueDate,
          input.purchaseOrderReference ?? null,
          calculation.subtotalMinor,
          calculation.taxMinor,
          calculation.totalMinor,
          principal.subject,
          expectedVersion,
        ],
      );
      if (update.rowCount !== 1) throw staleVersion();
      await client.query(
        'DELETE FROM gigalibs_ar.invoice_draft_lines WHERE tenant_id = $1 AND draft_id = $2',
        [principal.tenantId, id],
      );
      await insertDraftLines(client, principal.tenantId, id, calculation.lines);
      const body = await loadInvoice(client, principal.tenantId, id);
      await writeAudit(client, {
        principal,
        aggregateId: id,
        action: 'ar.invoice.draft-updated',
        priorState: prior,
        newState: body,
        correlationId,
      });
      return body;
    });
  }

  async issue(
    invoiceId: string,
    rawInput: unknown,
    expectedVersion: number,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<InvoiceResponse>> {
    const id = uuid.parse(invoiceId);
    const input = issueInputSchema.parse(rawInput);
    const scope = 'invoices.issue.v1';
    const requestHash = hashCanonicalJson({ id, expectedVersion, ...input });

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      await lockIdempotencyScope(client, principal.tenantId, scope, idempotencyKey);
      const replay = await readIdempotentResult<InvoiceResponse>(
        client,
        principal.tenantId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (replay) return replay;

      const prior = await loadInvoice(client, principal.tenantId, id, true);
      if (prior.status !== 'DRAFT') {
        throw new ArConflictError('INVOICE_ALREADY_ISSUED', 'The invoice has already been issued.');
      }
      if (prior.version !== expectedVersion) throw staleVersion();

      const entity = await loadBillingEntity(client, principal.tenantId, prior.billingEntityId);
      const customer = await requireActiveCustomer(client, principal.tenantId, prior.customerId);
      const seriesResult = await client.query<SeriesRow>(
        `
          SELECT id, billing_entity_id, prefix, next_value::text, padding
          FROM gigalibs_ar.invoice_series
          WHERE tenant_id = $1 AND id = $2 AND billing_entity_id = $3
          FOR UPDATE
        `,
        [principal.tenantId, prior.invoiceSeriesId, prior.billingEntityId],
      );
      const series = seriesResult.rows[0];
      if (!series)
        throw new ArConflictError('INVOICE_SERIES_UNAVAILABLE', 'Invoice series is unavailable.');
      const nextValue = Number(series.next_value);
      const invoiceNumber = formatInvoiceNumber(series.prefix, nextValue, series.padding);

      await client.query(
        `
          INSERT INTO gigalibs_ar.invoices (
            tenant_id, id, source_draft_id, billing_entity_id, invoice_series_id, customer_id,
            invoice_number, currency, issue_date, due_date, purchase_order_reference,
            seller_snapshot, buyer_snapshot, terms_snapshot,
            subtotal_minor, tax_minor, total_minor, issued_by
          ) VALUES (
            $1, $2, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10,
            $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17
          )
        `,
        [
          principal.tenantId,
          id,
          prior.billingEntityId,
          prior.invoiceSeriesId,
          prior.customerId,
          invoiceNumber,
          prior.currency,
          prior.issueDate,
          prior.dueDate,
          prior.purchaseOrderReference ?? null,
          JSON.stringify({
            id: entity.id,
            legalName: entity.legal_name,
            legalIdentifier: entity.legal_identifier,
            locale: entity.locale,
            timeZone: entity.time_zone,
          }),
          JSON.stringify({
            id: customer.id,
            legalName: customer.legal_name,
            billingEmail: customer.billing_email,
            externalReference: customer.external_reference,
          }),
          JSON.stringify({ reason: input.reason }),
          prior.subtotalMinor,
          prior.taxMinor,
          prior.totalMinor,
          principal.subject,
        ],
      );
      await client.query(
        `
          INSERT INTO gigalibs_ar.invoice_lines (
            tenant_id, id, invoice_id, position, description, quantity,
            unit_amount_minor, amount_minor
          )
          SELECT tenant_id, id, draft_id, position, description, quantity,
            unit_amount_minor, amount_minor
          FROM gigalibs_ar.invoice_draft_lines
          WHERE tenant_id = $1 AND draft_id = $2
          ORDER BY position
        `,
        [principal.tenantId, id],
      );
      const seriesUpdate = await client.query(
        `
          UPDATE gigalibs_ar.invoice_series
          SET next_value = next_value + 1, version = version + 1, updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND id = $2 AND next_value = $3
        `,
        [principal.tenantId, prior.invoiceSeriesId, nextValue],
      );
      if (seriesUpdate.rowCount !== 1) {
        throw new ArConflictError(
          'INVOICE_NUMBER_CONFLICT',
          'The invoice number sequence changed; retry the issue request.',
        );
      }
      const draftUpdate = await client.query(
        `
          UPDATE gigalibs_ar.invoice_drafts
          SET status = 'ISSUED', issued_invoice_id = id, version = version + 1,
            updated_by = $3, updated_at = transaction_timestamp()
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT' AND version = $4
        `,
        [principal.tenantId, id, principal.subject, expectedVersion],
      );
      if (draftUpdate.rowCount !== 1) throw staleVersion();

      const body = await loadInvoice(client, principal.tenantId, id);
      const eventId = randomUUID();
      const occurredAt = body.issuedAt ?? new Date().toISOString();
      const event = {
        specversion: '1.0',
        id: eventId,
        source: 'gigalibs.accounts-receivable',
        type: 'ar.invoice.issued.v1',
        tenantId: principal.tenantId,
        subject: `invoices/${id}`,
        time: occurredAt,
        correlationId,
        causationId: idempotencyKey,
        data: {
          invoiceId: id,
          billingEntityId: prior.billingEntityId,
          invoiceNumber,
          currency: prior.currency,
          totalMinor: prior.totalMinor,
          issuedAt: occurredAt,
        },
      };
      await client.query(
        `
          INSERT INTO gigalibs_ar.outbox_events (
            tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
            correlation_id, causation_id, payload, occurred_at
          ) VALUES ($1, $2, $3, 'invoice', $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
        `,
        [
          principal.tenantId,
          eventId,
          event.type,
          id,
          event.subject,
          correlationId,
          idempotencyKey,
          JSON.stringify(event),
          occurredAt,
        ],
      );
      await writeAudit(client, {
        principal,
        aggregateId: id,
        action: 'ar.invoice.issued',
        reason: input.reason,
        priorState: prior,
        newState: body,
        correlationId,
      });
      await storeIdempotentResult(client, {
        tenantId: principal.tenantId,
        scope,
        key: idempotencyKey,
        requestHash,
        status: 201,
        body,
        resourceId: id,
      });
      return { status: 201, body, replayed: false };
    });
  }

  async get(invoiceId: string, principal: ArPrincipal): Promise<InvoiceResponse> {
    const id = uuid.parse(invoiceId);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      return loadInvoice(client, principal.tenantId, id);
    });
  }

  async list(
    principal: ArPrincipal,
    pageSize: number,
    status?: string,
    customerId?: string,
    rawCursor?: string,
  ): Promise<{ items: InvoiceResponse[]; nextCursor: string | null }> {
    const limit = z.number().int().min(1).max(100).parse(pageSize);
    const parsedStatus = status
      ? z.enum(['DRAFT', 'ISSUED']).parse(status.toUpperCase())
      : undefined;
    const parsedCustomerId = customerId ? uuid.parse(customerId) : undefined;
    const cursor = decodeInvoiceCursor(rawCursor);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<DraftHeaderRow>(
        `
          SELECT
            d.id,
            d.billing_entity_id,
            d.invoice_series_id,
            d.customer_id,
            d.currency,
            d.issue_date::text,
            d.due_date::text,
            d.purchase_order_reference,
            d.status,
            d.subtotal_minor::text,
            d.tax_minor::text,
            d.total_minor::text,
            d.version,
            i.invoice_number,
            i.issued_at::text,
            d.created_at::text,
            d.updated_at::text,
            COALESCE(bal.amount_paid_minor, 0)::text AS amount_paid_minor,
            COALESCE(bal.is_voided, false) AS is_voided
          FROM gigalibs_ar.invoice_drafts d
          LEFT JOIN gigalibs_ar.invoices i
            ON i.tenant_id = d.tenant_id AND i.id = d.issued_invoice_id
          LEFT JOIN LATERAL gigalibs_ar.invoice_balance(d.tenant_id, i.id) bal
            ON i.id IS NOT NULL
          WHERE d.tenant_id = $1
            AND ($2::text IS NULL OR d.status = $2)
            AND ($3::uuid IS NULL OR d.customer_id = $3)
            AND (
              $4::timestamptz IS NULL OR d.updated_at < $4 OR
              (d.updated_at = $4 AND d.id > $5::uuid)
            )
          ORDER BY d.updated_at DESC, d.id ASC
          LIMIT $6
        `,
        [
          principal.tenantId,
          parsedStatus ?? null,
          parsedCustomerId ?? null,
          cursor?.u ?? null,
          cursor?.i ?? null,
          limit + 1,
        ],
      );
      const hasMore = result.rows.length > limit;
      const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;
      const draftIds = pageRows.filter((row) => row.status === 'DRAFT').map((row) => row.id);
      const issuedIds = pageRows.filter((row) => row.status === 'ISSUED').map((row) => row.id);
      const lineResult = await client.query<BatchLineRow>(
        `
          SELECT draft_id AS document_id, position, description, quantity::text,
            unit_amount_minor::text, amount_minor::text
          FROM gigalibs_ar.invoice_draft_lines
          WHERE tenant_id = $1 AND draft_id = ANY($2::uuid[])
          UNION ALL
          SELECT invoice_id AS document_id, position, description, quantity::text,
            unit_amount_minor::text, amount_minor::text
          FROM gigalibs_ar.invoice_lines
          WHERE tenant_id = $1 AND invoice_id = ANY($3::uuid[])
          ORDER BY document_id, position
        `,
        [principal.tenantId, draftIds, issuedIds],
      );
      const linesByDocument = new Map<string, LineRow[]>();
      for (const line of lineResult.rows) {
        const lines = linesByDocument.get(line.document_id) ?? [];
        lines.push(line);
        linesByDocument.set(line.document_id, lines);
      }
      const last = pageRows.at(-1);
      return {
        items: pageRows.map((row) => mapInvoice(row, linesByDocument.get(row.id) ?? [])),
        nextCursor:
          hasMore && last
            ? encodeCursor({ u: new Date(last.updated_at).toISOString(), i: last.id })
            : null,
      };
    });
  }
}

async function loadInvoice(
  client: PoolClient,
  tenantId: string,
  id: string,
  lock = false,
): Promise<InvoiceResponse> {
  const header = await client.query<DraftHeaderRow>(
    `
      SELECT
        d.id,
        d.billing_entity_id,
        d.invoice_series_id,
        d.customer_id,
        d.currency,
        d.issue_date::text,
        d.due_date::text,
        d.purchase_order_reference,
        d.status,
        d.subtotal_minor::text,
        d.tax_minor::text,
        d.total_minor::text,
        d.version,
        i.invoice_number,
        i.issued_at::text,
        d.created_at::text,
        d.updated_at::text,
        COALESCE(bal.amount_paid_minor, 0)::text AS amount_paid_minor,
        COALESCE(bal.is_voided, false) AS is_voided
      FROM gigalibs_ar.invoice_drafts d
      LEFT JOIN gigalibs_ar.invoices i
        ON i.tenant_id = d.tenant_id AND i.id = d.issued_invoice_id
      LEFT JOIN LATERAL gigalibs_ar.invoice_balance(d.tenant_id, i.id) bal
        ON i.id IS NOT NULL
      WHERE d.tenant_id = $1 AND d.id = $2
      ${lock ? 'FOR UPDATE OF d' : ''}
    `,
    [tenantId, id],
  );
  const row = header.rows[0];
  if (!row) throw new NotFoundException('Invoice was not found.');
  const lines = await client.query<LineRow>(
    row.status === 'ISSUED'
      ? `
          SELECT position, description, quantity::text, unit_amount_minor::text, amount_minor::text
          FROM gigalibs_ar.invoice_lines
          WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY position
        `
      : `
          SELECT position, description, quantity::text, unit_amount_minor::text, amount_minor::text
          FROM gigalibs_ar.invoice_draft_lines
          WHERE tenant_id = $1 AND draft_id = $2 ORDER BY position
        `,
    [tenantId, id],
  );
  return mapInvoice(row, lines.rows);
}

function mapInvoice(row: DraftHeaderRow, lines: readonly LineRow[]): InvoiceResponse {
  const totalMinor = safeInteger(row.total_minor, 'totalMinor');
  return {
    id: row.id,
    billingEntityId: row.billing_entity_id,
    invoiceSeriesId: row.invoice_series_id,
    customerId: row.customer_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    ...(row.purchase_order_reference
      ? { purchaseOrderReference: row.purchase_order_reference }
      : {}),
    lines: lines.map((line) => ({
      position: line.position,
      description: line.description,
      quantity: normalizeNumeric(line.quantity),
      unitAmountMinor: safeInteger(line.unit_amount_minor, 'unitAmountMinor'),
      amountMinor: safeInteger(line.amount_minor, 'amountMinor'),
    })),
    subtotalMinor: safeInteger(row.subtotal_minor, 'subtotalMinor'),
    taxMinor: safeInteger(row.tax_minor, 'taxMinor'),
    totalMinor,
    amountPaidMinor: safeInteger(row.amount_paid_minor ?? '0', 'amountPaidMinor'),
    amountDueMinor: Math.max(0, totalMinor - safeInteger(row.amount_paid_minor ?? '0', 'amountDueMinor')),
    isVoided: row.is_voided ?? false,
    version: row.version,
    issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function insertDraftLines(
  client: PoolClient,
  tenantId: string,
  draftId: string,
  lines: readonly CalculatedInvoiceLine[],
): Promise<void> {
  for (const line of lines) {
    await client.query(
      `
        INSERT INTO gigalibs_ar.invoice_draft_lines (
          tenant_id, id, draft_id, position, description, quantity,
          unit_amount_minor, amount_minor
        ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8)
      `,
      [
        tenantId,
        randomUUID(),
        draftId,
        line.position,
        line.description,
        line.quantity,
        line.unitAmountMinor,
        line.amountMinor,
      ],
    );
  }
}

async function resolveBillingEntity(
  client: PoolClient,
  tenantId: string,
  requestedId?: string,
): Promise<EntityRow> {
  if (requestedId) return loadBillingEntity(client, tenantId, requestedId);
  const result = await client.query<EntityRow>(
    `
      SELECT id, legal_name, legal_identifier, default_currency, locale, time_zone
      FROM gigalibs_ar.billing_entities
      WHERE tenant_id = $1 ORDER BY created_at, id LIMIT 2
    `,
    [tenantId],
  );
  if (result.rows.length !== 1) {
    throw new ArConflictError(
      'BILLING_ENTITY_REQUIRED',
      'Specify a billing entity when the tenant does not have exactly one.',
    );
  }
  const entity = result.rows[0];
  if (!entity) throw new ArConflictError('BILLING_ENTITY_REQUIRED', 'Billing entity is required.');
  return entity;
}

async function loadBillingEntity(
  client: PoolClient,
  tenantId: string,
  id: string,
): Promise<EntityRow> {
  const result = await client.query<EntityRow>(
    `
      SELECT id, legal_name, legal_identifier, default_currency, locale, time_zone
      FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, id],
  );
  const row = result.rows[0];
  if (!row)
    throw new ArConflictError('BILLING_ENTITY_UNAVAILABLE', 'Billing entity is unavailable.');
  return row;
}

async function resolveInvoiceSeries(
  client: PoolClient,
  tenantId: string,
  billingEntityId: string,
  requestedId?: string,
): Promise<SeriesRow> {
  const result = await client.query<SeriesRow>(
    `
      SELECT id, billing_entity_id, prefix, next_value::text, padding
      FROM gigalibs_ar.invoice_series
      WHERE tenant_id = $1 AND billing_entity_id = $2
        AND ($3::uuid IS NULL OR id = $3)
        AND ($3::uuid IS NOT NULL OR is_default)
      ORDER BY id LIMIT 2
    `,
    [tenantId, billingEntityId, requestedId ?? null],
  );
  if (result.rows.length !== 1) {
    throw new ArConflictError(
      'INVOICE_SERIES_REQUIRED',
      'Specify an available invoice series or configure exactly one default.',
    );
  }
  const series = result.rows[0];
  if (!series) throw new ArConflictError('INVOICE_SERIES_REQUIRED', 'Invoice series is required.');
  return series;
}

async function requireActiveCustomer(
  client: PoolClient,
  tenantId: string,
  customerId: string,
): Promise<CustomerSnapshotRow> {
  const result = await client.query<CustomerSnapshotRow>(
    `
      SELECT id, legal_name, billing_email, external_reference, currency, status
      FROM gigalibs_ar.customers
      WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, customerId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundException('Customer was not found.');
  if (row.status !== 'ACTIVE') {
    throw new ArConflictError(
      'CUSTOMER_INACTIVE',
      'An inactive customer cannot receive a new invoice.',
    );
  }
  return row;
}

async function writeAudit(
  client: PoolClient,
  input: {
    principal: ArPrincipal;
    aggregateId: string;
    action: string;
    reason?: string;
    priorState: InvoiceResponse | null;
    newState: InvoiceResponse;
    correlationId: string;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO gigalibs_ar.audit_events (
        tenant_id, id, aggregate_type, aggregate_id, action, actor_subject,
        actor_permissions, reason, prior_state, new_state, correlation_id
      ) VALUES ($1, $2, 'invoice', $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
    `,
    [
      input.principal.tenantId,
      randomUUID(),
      input.aggregateId,
      input.action,
      input.principal.subject,
      [...input.principal.permissions],
      input.reason ?? null,
      input.priorState ? JSON.stringify(input.priorState) : null,
      JSON.stringify(input.newState),
      input.correlationId,
    ],
  );
}

function staleVersion(): HttpException {
  return new HttpException('The invoice changed; reload it before retrying.', 412);
}

function safeInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`${field} exceeds the supported API integer range.`);
  return parsed;
}

function normalizeNumeric(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
