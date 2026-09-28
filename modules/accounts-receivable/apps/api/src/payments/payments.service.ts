import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { assertActiveTenant } from '../database/persistence-helpers.js';
import { redactFinancialFields } from '../auth/financial-redaction.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Input schemas ────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['WIRE', 'ACH', 'CHECK', 'CARD', 'CREDIT_NOTE', 'MANUAL'] as const;

const recordPaymentSchema = z
  .object({
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    paymentMethod: z.enum(PAYMENT_METHODS),
    paymentReference: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    paidAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const voidInvoiceSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const createCheckoutSessionSchema = z
  .object({
    provider: z.enum(['STRIPE', 'ADYEN']).default('STRIPE'),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    successUrl: z.string().url().max(2000),
    cancelUrl: z.string().url().max(2000),
  })
  .strict();

// ─── Response types ───────────────────────────────────────────────────────────

export interface CheckoutSessionResponse {
  id: string;
  invoiceId: string;
  provider: 'STRIPE' | 'ADYEN';
  providerSessionId: string;
  providerUrl: string;
  amountMinor: number;
  currency: string;
  status: 'OPEN' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

export interface PaymentResponse {
  id: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentReference?: string;
  notes?: string;
  paidAt: string;
  recordedBy: string;
  createdAt: string;
}

export interface VoidResponse {
  id: string;
  invoiceId: string;
  reason: string;
  voidedBy: string;
  voidedAt: string;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount_minor: string;
  currency: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  paid_at: string;
  recorded_by: string;
  created_at: string;
}

interface VoidRow {
  id: string;
  invoice_id: string;
  reason: string;
  voided_by: string;
  voided_at: string;
}

interface InvoiceHeaderRow {
  id: string;
  invoice_id: string | null; // issued_invoice_id from invoice_drafts
  status: 'DRAFT' | 'ISSUED';
  currency: string;
  total_minor: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // ── Record a payment against an issued invoice ────────────────────────────
  async record(
    invoiceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<PaymentResponse> {
    const id = z.uuid().parse(invoiceId);
    const input = recordPaymentSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      // Load draft header to get the issued_invoice_id
      const headerResult = await client.query<InvoiceHeaderRow>(
        `
          SELECT d.id, d.issued_invoice_id AS invoice_id, d.status,
            d.currency, d.total_minor::text
          FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND d.id = $2
          FOR SHARE OF d
        `,
        [principal.tenantId, id],
      );
      const header = headerResult.rows[0];
      if (!header) throw new NotFoundException('Invoice was not found.');
      if (header.status !== 'ISSUED' || !header.invoice_id) {
        throw new ArConflictError(
          'INVOICE_NOT_ISSUED',
          'Payments can only be recorded against issued invoices.',
        );
      }

      // Guard: currency must match invoice currency
      if (input.currency !== header.currency) {
        throw new ArConflictError(
          'PAYMENT_CURRENCY_MISMATCH',
          `Payment currency ${input.currency} does not match invoice currency ${header.currency}.`,
        );
      }

      // Guard: not already voided
      const voidCheck = await client.query(
        'SELECT id FROM gigalibs_ar.void_records WHERE tenant_id = $1 AND invoice_id = $2',
        [principal.tenantId, header.invoice_id],
      );
      if (voidCheck.rows.length > 0) {
        throw new ArConflictError(
          'INVOICE_VOIDED',
          'Payments cannot be recorded against a voided invoice.',
        );
      }

      // Guard: total paid must not exceed invoice total
      const totalMinor = Number(header.total_minor);
      const paidResult = await client.query<{ paid: string }>(
        `
          SELECT COALESCE(SUM(amount_minor), 0)::text AS paid
          FROM gigalibs_ar.payment_records
          WHERE tenant_id = $1 AND invoice_id = $2
        `,
        [principal.tenantId, header.invoice_id],
      );
      const alreadyPaid = Number(paidResult.rows[0]?.paid ?? '0');
      if (alreadyPaid + input.amountMinor > totalMinor) {
        throw new ArConflictError(
          'OVERPAYMENT',
          `Payment of ${input.amountMinor} would exceed the invoice total. ` +
            `Already paid: ${alreadyPaid}, invoice total: ${totalMinor}.`,
        );
      }

      const paymentId = randomUUID();
      const paidAt = input.paidAt ?? new Date().toISOString();
      await client.query(
        `
          INSERT INTO gigalibs_ar.payment_records (
            tenant_id, id, invoice_id, amount_minor, currency, payment_method,
            payment_reference, notes, paid_at, recorded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10)
        `,
        [
          principal.tenantId,
          paymentId,
          header.invoice_id,
          input.amountMinor,
          input.currency,
          input.paymentMethod,
          input.paymentReference ?? null,
          input.notes ?? null,
          paidAt,
          principal.subject,
        ],
      );

      // Outbox event
      const eventId = randomUUID();
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
          'ar.invoice.payment-recorded.v1',
          id,
          `invoices/${id}`,
          correlationId,
          paymentId,
          JSON.stringify({
            specversion: '1.0',
            id: eventId,
            source: 'gigalibs.accounts-receivable',
            type: 'ar.invoice.payment-recorded.v1',
            tenantId: principal.tenantId,
            subject: `invoices/${id}`,
            correlationId,
            data: {
              invoiceId: id,
              paymentId,
              amountMinor: input.amountMinor,
              currency: input.currency,
              paymentMethod: input.paymentMethod,
            },
          }),
          paidAt,
        ],
      );

      const row = await client.query<PaymentRow>(
        `
          SELECT id, invoice_id, amount_minor::text, currency, payment_method,
            payment_reference, notes, paid_at::text, recorded_by, created_at::text
          FROM gigalibs_ar.payment_records
          WHERE tenant_id = $1 AND id = $2
        `,
        [principal.tenantId, paymentId],
      );
      return mapPayment(row.rows[0]!);
    });
  }

  // ── List payments for an invoice ──────────────────────────────────────────
  async list(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<{ items: PaymentResponse[] }> {
    const id = z.uuid().parse(invoiceId);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      // Resolve the issued_invoice_id
      const headerResult = await client.query<{ invoice_id: string | null; status: string }>(
        `
          SELECT issued_invoice_id AS invoice_id, status
          FROM gigalibs_ar.invoice_drafts
          WHERE tenant_id = $1 AND id = $2
        `,
        [principal.tenantId, id],
      );
      const header = headerResult.rows[0];
      if (!header) throw new NotFoundException('Invoice was not found.');

      if (!header.invoice_id) return { items: [] }; // draft has no payments

      const result = await client.query<PaymentRow>(
        `
          SELECT id, invoice_id, amount_minor::text, currency, payment_method,
            payment_reference, notes, paid_at::text, recorded_by, created_at::text
          FROM gigalibs_ar.payment_records
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY paid_at DESC, id ASC
        `,
        [principal.tenantId, header.invoice_id],
      );
      return { items: result.rows.map(mapPayment) };
    });
  }

  // ── Void an issued invoice ────────────────────────────────────────────────
  async voidInvoice(
    invoiceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<VoidResponse> {
    const id = z.uuid().parse(invoiceId);
    const input = voidInvoiceSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const headerResult = await client.query<InvoiceHeaderRow>(
        `
          SELECT d.id, d.issued_invoice_id AS invoice_id, d.status, d.currency, d.total_minor::text
          FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND d.id = $2
          FOR SHARE OF d
        `,
        [principal.tenantId, id],
      );
      const header = headerResult.rows[0];
      if (!header) throw new NotFoundException('Invoice was not found.');
      if (header.status !== 'ISSUED' || !header.invoice_id) {
        throw new ArConflictError(
          'INVOICE_NOT_ISSUED',
          'Only issued invoices can be voided.',
        );
      }

      // Guard: already voided?
      const existingVoid = await client.query<VoidRow>(
        `
          SELECT id, invoice_id, reason, voided_by, voided_at::text
          FROM gigalibs_ar.void_records
          WHERE tenant_id = $1 AND invoice_id = $2
        `,
        [principal.tenantId, header.invoice_id],
      );
      if (existingVoid.rows[0]) {
        // Idempotent: return existing void record
        return mapVoid(existingVoid.rows[0]);
      }

      // Guard: cannot void a fully-paid invoice without explicit override
      const paidResult = await client.query<{ paid: string }>(
        'SELECT COALESCE(SUM(amount_minor), 0)::text AS paid FROM gigalibs_ar.payment_records WHERE tenant_id = $1 AND invoice_id = $2',
        [principal.tenantId, header.invoice_id],
      );
      const totalPaid = Number(paidResult.rows[0]?.paid ?? '0');
      const totalMinor = Number(header.total_minor);
      if (totalPaid >= totalMinor && totalMinor > 0) {
        throw new ArConflictError(
          'INVOICE_FULLY_PAID',
          'A fully paid invoice cannot be voided. Issue a credit note instead (Phase 5).',
        );
      }

      const voidId = randomUUID();
      const voidedAt = new Date().toISOString();
      await client.query(
        `
          INSERT INTO gigalibs_ar.void_records (
            tenant_id, id, invoice_id, reason, voided_by
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [principal.tenantId, voidId, header.invoice_id, input.reason, principal.subject],
      );

      // Outbox event
      const eventId = randomUUID();
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
          'ar.invoice.voided.v1',
          id,
          `invoices/${id}`,
          correlationId,
          voidId,
          JSON.stringify({
            specversion: '1.0',
            id: eventId,
            source: 'gigalibs.accounts-receivable',
            type: 'ar.invoice.voided.v1',
            tenantId: principal.tenantId,
            subject: `invoices/${id}`,
            correlationId,
            data: { invoiceId: id, voidId, reason: input.reason },
          }),
          voidedAt,
        ],
      );

      const row = await client.query<VoidRow>(
        `
          SELECT id, invoice_id, reason, voided_by, voided_at::text
          FROM gigalibs_ar.void_records
          WHERE tenant_id = $1 AND id = $2
        `,
        [principal.tenantId, voidId],
      );
      return mapVoid(row.rows[0]!);
    });
  }

  // ── Get void record for an invoice (if any) ───────────────────────────────
  async getVoid(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<VoidResponse | null> {
    const id = z.uuid().parse(invoiceId);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const headerResult = await client.query<{ invoice_id: string | null }>(
        'SELECT issued_invoice_id AS invoice_id FROM gigalibs_ar.invoice_drafts WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, id],
      );
      const header = headerResult.rows[0];
      if (!header) throw new NotFoundException('Invoice was not found.');
      if (!header.invoice_id) return null;

      const result = await client.query<VoidRow>(
        `
          SELECT id, invoice_id, reason, voided_by, voided_at::text
          FROM gigalibs_ar.void_records
          WHERE tenant_id = $1 AND invoice_id = $2
        `,
        [principal.tenantId, header.invoice_id],
      );
      return result.rows[0] ? mapVoid(result.rows[0]) : null;
    });
  }

  // ── Create hosted checkout session (Stripe / Adyen) ──────────────────────
  async createCheckoutSession(
    invoiceId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CheckoutSessionResponse> {
    const id = z.uuid().parse(invoiceId);
    const input = createCheckoutSessionSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      const headerResult = await client.query<InvoiceHeaderRow>(
        `
          SELECT d.id, d.issued_invoice_id AS invoice_id, d.status,
            d.currency, d.total_minor::text
          FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND d.id = $2
          FOR SHARE OF d
        `,
        [principal.tenantId, id],
      );
      const header = headerResult.rows[0];
      if (!header) throw new NotFoundException('Invoice was not found.');
      if (header.status !== 'ISSUED' || !header.invoice_id) {
        throw new ArConflictError(
          'INVOICE_NOT_ISSUED',
          'Checkout sessions can only be created for issued invoices.',
        );
      }

      // Guard: not voided
      const voidCheck = await client.query(
        'SELECT id FROM gigalibs_ar.void_records WHERE tenant_id = $1 AND invoice_id = $2',
        [principal.tenantId, header.invoice_id],
      );
      if (voidCheck.rows.length > 0) {
        throw new ArConflictError(
          'INVOICE_VOIDED',
          'Checkout sessions cannot be created for a voided invoice.',
        );
      }

      // Check balance
      const totalMinor = Number(header.total_minor);
      const paidResult = await client.query<{ paid: string }>(
        `
          SELECT COALESCE(SUM(amount_minor), 0)::text AS paid
          FROM gigalibs_ar.payment_records
          WHERE tenant_id = $1 AND invoice_id = $2
        `,
        [principal.tenantId, header.invoice_id],
      );
      const alreadyPaid = Number(paidResult.rows[0]?.paid ?? '0');
      const remainingMinor = totalMinor - alreadyPaid;
      if (remainingMinor <= 0) {
        throw new ArConflictError(
          'INVOICE_FULLY_PAID',
          'Invoice is already fully paid.',
        );
      }

      const sessionAmount = input.amountMinor ?? remainingMinor;
      if (sessionAmount > remainingMinor) {
        throw new ArConflictError(
          'OVERPAYMENT',
          `Checkout amount ${sessionAmount} exceeds remaining balance ${remainingMinor}.`,
        );
      }

      const sessionId = randomUUID();
      const providerSessionId = input.provider === 'STRIPE'
        ? `cs_${randomUUID().replace(/-/g, '')}`
        : `adyen_${randomUUID().replace(/-/g, '')}`;
      const providerUrl = input.provider === 'STRIPE'
        ? `https://checkout.stripe.com/c/pay/${providerSessionId}`
        : `https://test.adyen.link/pay/${providerSessionId}`;
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      await client.query(
        `
          INSERT INTO gigalibs_ar.checkout_sessions (
            tenant_id, id, invoice_id, provider, provider_session_id, provider_url,
            amount_minor, currency, status, expires_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9::timestamptz, $10)
        `,
        [
          principal.tenantId,
          sessionId,
          header.invoice_id,
          input.provider,
          providerSessionId,
          providerUrl,
          sessionAmount,
          header.currency,
          expiresAt,
          principal.subject,
        ],
      );

      // Outbox event
      const eventId = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.outbox_events (
            tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
            correlation_id, causation_id, payload, occurred_at
          ) VALUES ($1, $2, 'ar.payment.checkout-session-created.v1', 'invoice', $3, $4, $5, $6, $7::jsonb, transaction_timestamp())
        `,
        [
          principal.tenantId,
          eventId,
          id,
          `invoices/${id}`,
          correlationId,
          sessionId,
          JSON.stringify({
            specversion: '1.0',
            id: eventId,
            source: 'gigalibs.accounts-receivable',
            type: 'ar.payment.checkout-session-created.v1',
            tenantId: principal.tenantId,
            subject: `invoices/${id}`,
            correlationId,
            data: {
              invoiceId: id,
              sessionId,
              provider: input.provider,
              providerSessionId,
              amountMinor: sessionAmount,
              currency: header.currency,
            },
          }),
        ],
      );

      return {
        id: sessionId,
        invoiceId: id,
        provider: input.provider,
        providerSessionId,
        providerUrl,
        amountMinor: sessionAmount,
        currency: header.currency,
        status: 'OPEN',
        expiresAt,
        createdAt: new Date().toISOString(),
      };
    });
  }

  // ── Process inbound payment from provider webhook ────────────────────────
  async processWebhookPayment(input: {
    tenantId: string;
    provider: 'STRIPE' | 'ADYEN';
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    invoiceId: string;
    amountMinor: number;
    currency: string;
    paymentReference?: string;
    correlationId: string;
  }): Promise<{ status: string; replayed: boolean; paymentId?: string }> {
    return this.database.withTenantTransaction(input.tenantId, async (client) => {
      // 1. Deduplication check on webhook events
      const existing = await client.query<{ id: string; status: string }>(
        `
          SELECT id, status
          FROM gigalibs_ar.payment_webhook_events
          WHERE tenant_id = $1 AND provider = $2 AND event_id = $3
        `,
        [input.tenantId, input.provider, input.eventId],
      );
      if (existing.rows[0]?.status === 'PROCESSED') {
        return { status: 'PROCESSED', replayed: true };
      }

      const webhookEventId = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rows[0]) {
        const { sanitized } = redactFinancialFields(input.payload);
        await client.query(
          `
            INSERT INTO gigalibs_ar.payment_webhook_events (
              tenant_id, id, provider, event_id, event_type, payload, status
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'RECEIVED')
          `,
          [
            input.tenantId,
            webhookEventId,
            input.provider,
            input.eventId,
            input.eventType,
            JSON.stringify(sanitized),
          ],
        );
      }

      // 2. Locate invoice draft header
      const headerResult = await client.query<InvoiceHeaderRow>(
        `
          SELECT d.id, d.issued_invoice_id AS invoice_id, d.status,
            d.currency, d.total_minor::text
          FROM gigalibs_ar.invoice_drafts d
          WHERE d.tenant_id = $1 AND d.id = $2
          FOR SHARE OF d
        `,
        [input.tenantId, input.invoiceId],
      );
      const header = headerResult.rows[0];
      if (!header || header.status !== 'ISSUED' || !header.invoice_id) {
        await client.query(
          `
            UPDATE gigalibs_ar.payment_webhook_events
            SET status = 'FAILED', failure_reason = 'Invoice not found or not issued'
            WHERE tenant_id = $1 AND id = $2
          `,
          [input.tenantId, webhookEventId],
        );
        throw new ArConflictError('INVOICE_NOT_ISSUED', 'Invoice is not issued.');
      }

      // Check not voided
      const voidCheck = await client.query(
        'SELECT id FROM gigalibs_ar.void_records WHERE tenant_id = $1 AND invoice_id = $2',
        [input.tenantId, header.invoice_id],
      );
      if (voidCheck.rows.length > 0) {
        await client.query(
          `
            UPDATE gigalibs_ar.payment_webhook_events
            SET status = 'FAILED', failure_reason = 'Invoice voided'
            WHERE tenant_id = $1 AND id = $2
          `,
          [input.tenantId, webhookEventId],
        );
        throw new ArConflictError('INVOICE_VOIDED', 'Invoice is voided.');
      }

      // Prevent overpayment
      const totalMinor = Number(header.total_minor);
      const paidResult = await client.query<{ paid: string }>(
        `
          SELECT COALESCE(SUM(amount_minor), 0)::text AS paid
          FROM gigalibs_ar.payment_records
          WHERE tenant_id = $1 AND invoice_id = $2
        `,
        [input.tenantId, header.invoice_id],
      );
      const alreadyPaid = Number(paidResult.rows[0]?.paid ?? '0');
      if (alreadyPaid + input.amountMinor > totalMinor) {
        await client.query(
          `
            UPDATE gigalibs_ar.payment_webhook_events
            SET status = 'FAILED', failure_reason = 'Payment exceeds invoice total'
            WHERE tenant_id = $1 AND id = $2
          `,
          [input.tenantId, webhookEventId],
        );
        throw new ArConflictError('OVERPAYMENT', 'Webhook payment exceeds remaining balance.');
      }

      // Insert payment record
      const paymentId = randomUUID();
      const paidAt = new Date().toISOString();
      await client.query(
        `
          INSERT INTO gigalibs_ar.payment_records (
            tenant_id, id, invoice_id, amount_minor, currency, payment_method,
            payment_reference, notes, paid_at, recorded_by
          ) VALUES ($1, $2, $3, $4, $5, 'CARD', $6, $7, $8::timestamptz, 'webhook')
        `,
        [
          input.tenantId,
          paymentId,
          header.invoice_id,
          input.amountMinor,
          input.currency,
          input.paymentReference ?? input.eventId,
          `Automated settlement via ${input.provider} webhook (${input.eventType})`,
          paidAt,
        ],
      );

      // Update checkout session if reference matches
      if (input.paymentReference) {
        await client.query(
          `
            UPDATE gigalibs_ar.checkout_sessions
            SET status = 'COMPLETED', completed_at = $1::timestamptz
            WHERE tenant_id = $2 AND invoice_id = $3 AND provider_session_id = $4
          `,
          [paidAt, input.tenantId, header.invoice_id, input.paymentReference],
        );
      }

      // Outbox event
      const outboxEventId = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.outbox_events (
            tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
            correlation_id, causation_id, payload, occurred_at
          ) VALUES ($1, $2, 'ar.invoice.payment-recorded.v1', 'invoice', $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
        `,
        [
          input.tenantId,
          outboxEventId,
          header.id,
          `invoices/${header.id}`,
          input.correlationId,
          paymentId,
          JSON.stringify({
            specversion: '1.0',
            id: outboxEventId,
            source: 'gigalibs.accounts-receivable',
            type: 'ar.invoice.payment-recorded.v1',
            tenantId: input.tenantId,
            subject: `invoices/${header.id}`,
            correlationId: input.correlationId,
            data: {
              invoiceId: header.id,
              paymentId,
              amountMinor: input.amountMinor,
              currency: input.currency,
              paymentMethod: 'CARD',
              provider: input.provider,
            },
          }),
          paidAt,
        ],
      );

      // Mark webhook event processed
      await client.query(
        `
          UPDATE gigalibs_ar.payment_webhook_events
          SET status = 'PROCESSED', processed_at = $1::timestamptz
          WHERE tenant_id = $2 AND id = $3
        `,
        [paidAt, input.tenantId, webhookEventId],
      );

      return { status: 'PROCESSED', replayed: false, paymentId };
    });
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapPayment(row: PaymentRow): PaymentResponse {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    paymentMethod: row.payment_method as PaymentResponse['paymentMethod'],
    ...(row.payment_reference ? { paymentReference: row.payment_reference } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    paidAt: new Date(row.paid_at).toISOString(),
    recordedBy: row.recorded_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapVoid(row: VoidRow): VoidResponse {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    reason: row.reason,
    voidedBy: row.voided_by,
    voidedAt: new Date(row.voided_at).toISOString(),
  };
}
