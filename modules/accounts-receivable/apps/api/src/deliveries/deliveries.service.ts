import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
// pdfkit — pure-JS PDF generation; install: pnpm add pdfkit @types/pdfkit
import PDFDocument from 'pdfkit';
// nodemailer — SMTP delivery; install: pnpm add nodemailer @types/nodemailer
import { type Transporter, createTransport } from 'nodemailer';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import {
  type IdempotentResult,
  assertActiveTenant,
} from '../database/persistence-helpers.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Environment ──────────────────────────────────────────────────────────────
// Required env vars:
//   SMTP_HOST        SMTP server hostname
//   SMTP_PORT        SMTP server port (default 587)
//   SMTP_USER        SMTP authentication username
//   SMTP_PASS        SMTP authentication password
//   SMTP_FROM        Sender address, e.g. "Billing <billing@example.com>"
//   SMTP_SECURE      "true" for TLS on connect, otherwise STARTTLS (default false)
//
// For local development set SMTP_HOST=localhost SMTP_PORT=1025 to use
// Mailhog / Mailpit (no auth required).

function buildTransporter(): Transporter {
  const host = process.env['SMTP_HOST'] || (process.env.NODE_ENV !== 'production' ? '127.0.0.1' : undefined);
  if (!host) {
    throw new Error('SMTP_HOST environment variable must be configured for email deliveries');
  }
  const port = Number(process.env['SMTP_PORT'] ?? '587');
  const secure = process.env['SMTP_SECURE'] === 'true';
  const user = process.env['SMTP_USER'];
  const pass = process.env['SMTP_PASS'];
  return createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface DeliveryResponse {
  id: string;
  invoiceId: string;
  pdfRenderId: string;
  recipientEmail: string;
  recipientName: string;
  subjectLine: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason?: string;
  sentAt: string | null;
  deliveredBy: string;
  createdAt: string;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface DeliveryRow {
  id: string;
  invoice_id: string;
  pdf_render_id: string;
  recipient_email: string;
  recipient_name: string;
  subject_line: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failure_reason: string | null;
  sent_at: string | null;
  delivered_by: string;
  created_at: string;
}

interface InvoiceDeliveryRow {
  id: string;
  invoice_number: string;
  currency: string;
  issue_date: string;
  due_date: string;
  subtotal_minor: string;
  tax_minor: string;
  total_minor: string;
  customer_id: string;
  seller_snapshot: {
    legalName: string;
    legalIdentifier?: string;
    locale: string;
    timeZone: string;
  };
  buyer_snapshot: {
    legalName: string;
    billingEmail: string;
    externalReference?: string;
  };
  invoice_footer_text: string | null;
}

interface InvoiceLineDeliveryRow {
  position: number;
  description: string;
  quantity: string;
  unit_amount_minor: string;
  amount_minor: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  private readonly mailer: Transporter;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    this.mailer = buildTransporter();
  }

  // ── List deliveries for an invoice ──────────────────────────────────────────
  async list(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<{ items: DeliveryResponse[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      // Verify invoice exists and belongs to tenant
      const exists = await client.query(
        'SELECT id FROM gigalibs_ar.invoices WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, invoiceId],
      );
      if (!exists.rows[0]) throw new NotFoundException('Invoice was not found.');
      const result = await client.query<DeliveryRow>(
        `
          SELECT id, invoice_id, pdf_render_id, recipient_email, recipient_name,
            subject_line, status, failure_reason, sent_at::text, delivered_by,
            created_at::text
          FROM gigalibs_ar.invoice_deliveries
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [principal.tenantId, invoiceId],
      );
      return { items: result.rows.map(mapDelivery) };
    });
  }

  // ── Deliver: render PDF + send email, idempotent ────────────────────────────
  async deliver(
    invoiceId: string,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<DeliveryResponse>> {
    // Check idempotency outside the render loop
    const existing = await this.database.withTenantTransaction(
      principal.tenantId,
      async (client) => {
        await assertActiveTenant(client, principal.tenantId, principal.issuer);
        const dup = await client.query<DeliveryRow>(
          `
            SELECT id, invoice_id, pdf_render_id, recipient_email, recipient_name,
              subject_line, status, failure_reason, sent_at::text, delivered_by,
              created_at::text
            FROM gigalibs_ar.invoice_deliveries
            WHERE tenant_id = $1 AND invoice_id = $2 AND idempotency_key = $3
          `,
          [principal.tenantId, invoiceId, idempotencyKey],
        );
        return dup.rows[0] ?? null;
      },
    );
    if (existing) {
      return { status: 200, body: mapDelivery(existing), replayed: true };
    }

    // Load invoice + lines from DB
    const { invoice, lines } = await this.database.withTenantTransaction(
      principal.tenantId,
      async (client) => {
        await assertActiveTenant(client, principal.tenantId, principal.issuer);
        const invResult = await client.query<InvoiceDeliveryRow>(
          `
            SELECT
              i.id,
              i.invoice_number,
              i.currency,
              i.issue_date::text,
              i.due_date::text,
              i.subtotal_minor::text,
              i.tax_minor::text,
              i.total_minor::text,
              i.customer_id,
              i.seller_snapshot,
              i.buyer_snapshot,
              be.invoice_footer_text
            FROM gigalibs_ar.invoices i
            LEFT JOIN gigalibs_ar.billing_entities be
              ON be.tenant_id = i.tenant_id AND be.id = i.billing_entity_id
            WHERE i.tenant_id = $1 AND i.id = $2
          `,
          [principal.tenantId, invoiceId],
        );
        const inv = invResult.rows[0];
        if (!inv) throw new NotFoundException('Invoice was not found.');
        if (!inv.invoice_number) {
          throw new ArConflictError(
            'INVOICE_NOT_ISSUED',
            'Only issued invoices with an invoice number can be delivered.',
          );
        }
        const lineResult = await client.query<InvoiceLineDeliveryRow>(
          `
            SELECT position, description, quantity::text, unit_amount_minor::text, amount_minor::text
            FROM gigalibs_ar.invoice_lines
            WHERE tenant_id = $1 AND invoice_id = $2
            ORDER BY position
          `,
          [principal.tenantId, invoiceId],
        );
        return { invoice: inv, lines: lineResult.rows };
      },
    );

    // Render PDF in-process
    const pdfBytes = await renderInvoicePdf(invoice, lines);
    const checksum = createHash('sha256').update(pdfBytes).digest('hex');
    const recipientEmail = invoice.buyer_snapshot.billingEmail;
    const recipientName = invoice.buyer_snapshot.legalName;
    const subjectLine = `Invoice ${invoice.invoice_number} from ${invoice.seller_snapshot.legalName}`;
    const fromAddress = process.env['SMTP_FROM'] ?? `billing@${invoice.seller_snapshot.legalName.toLowerCase().replace(/\s+/g, '')}.com`;

    // Attempt SMTP delivery
    let sendError: string | null = null;
    try {
      await this.mailer.sendMail({
        from: fromAddress,
        to: `${recipientName} <${recipientEmail}>`,
        subject: subjectLine,
        text: buildEmailText(invoice),
        html: buildEmailHtml(invoice),
        attachments: [
          {
            filename: `${invoice.invoice_number}.pdf`,
            content: pdfBytes,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `SMTP delivery failed for invoice ${invoiceId}: ${sendError}`,
      );
    }

    // Persist render + delivery record in one transaction
    const delivery = await this.database.withTenantTransaction(
      principal.tenantId,
      async (client) => {
        await assertActiveTenant(client, principal.tenantId, principal.issuer);

        // Upsert: re-check idempotency inside the transaction too
        const dup = await client.query<DeliveryRow>(
          `
            SELECT id, invoice_id, pdf_render_id, recipient_email, recipient_name,
              subject_line, status, failure_reason, sent_at::text, delivered_by,
              created_at::text
            FROM gigalibs_ar.invoice_deliveries
            WHERE tenant_id = $1 AND invoice_id = $2 AND idempotency_key = $3
            FOR UPDATE
          `,
          [principal.tenantId, invoiceId, idempotencyKey],
        );
        if (dup.rows[0]) return dup.rows[0];

        // Insert PDF render
        const renderId = randomUUID();
        await client.query(
          `
            INSERT INTO gigalibs_ar.invoice_pdf_renders
              (tenant_id, id, invoice_id, pdf_bytes, byte_size, checksum_sha256, rendered_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            principal.tenantId,
            renderId,
            invoiceId,
            pdfBytes,
            pdfBytes.byteLength,
            checksum,
            principal.subject,
          ],
        );

        // Insert delivery record
        const deliveryId = randomUUID();
        const status = sendError ? 'FAILED' : 'SENT';
        const sentAt = sendError ? null : new Date().toISOString();
        await client.query(
          `
            INSERT INTO gigalibs_ar.invoice_deliveries (
              tenant_id, id, invoice_id, pdf_render_id, recipient_email, recipient_name,
              subject_line, status, failure_reason, sent_at, idempotency_key,
              correlation_id, delivered_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13)
          `,
          [
            principal.tenantId,
            deliveryId,
            invoiceId,
            renderId,
            recipientEmail,
            recipientName,
            subjectLine,
            status,
            sendError,
            sentAt,
            idempotencyKey,
            correlationId,
            principal.subject,
          ],
        );

        // Outbox event
        const eventId = randomUUID();
        const eventType = sendError
          ? 'ar.invoice.delivery-failed.v1'
          : 'ar.invoice.delivered.v1';
        await client.query(
          `
            INSERT INTO gigalibs_ar.outbox_events (
              tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
              correlation_id, causation_id, payload, occurred_at
            ) VALUES ($1,$2,$3,'invoice',$4,$5,$6,$7,$8::jsonb,$9::timestamptz)
          `,
          [
            principal.tenantId,
            eventId,
            eventType,
            invoiceId,
            `invoices/${invoiceId}`,
            correlationId,
            idempotencyKey,
            JSON.stringify({
              specversion: '1.0',
              id: eventId,
              source: 'gigalibs.accounts-receivable',
              type: eventType,
              tenantId: principal.tenantId,
              subject: `invoices/${invoiceId}`,
              time: new Date().toISOString(),
              correlationId,
              causationId: idempotencyKey,
              data: {
                invoiceId,
                deliveryId,
                recipientEmail,
                ...(sendError ? { failureReason: sendError } : {}),
              },
            }),
            new Date().toISOString(),
          ],
        );

        const row = await client.query<DeliveryRow>(
          `
            SELECT id, invoice_id, pdf_render_id, recipient_email, recipient_name,
              subject_line, status, failure_reason, sent_at::text, delivered_by,
              created_at::text
            FROM gigalibs_ar.invoice_deliveries
            WHERE tenant_id = $1 AND id = $2
          `,
          [principal.tenantId, deliveryId],
        );
        return row.rows[0]!;
      },
    );

    return { status: sendError ? 409 : 201, body: mapDelivery(delivery), replayed: false };
  }

  // ── Stream PDF to HTTP response ──────────────────────────────────────────────
  async streamPdf(
    invoiceId: string,
    principal: ArPrincipal,
  ): Promise<{ filename: string; bytes: Buffer }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<{ invoice_number: string; pdf_bytes: Buffer }>(
        `
          SELECT i.invoice_number, r.pdf_bytes
          FROM gigalibs_ar.invoice_pdf_renders r
          JOIN gigalibs_ar.invoices i ON i.tenant_id = r.tenant_id AND i.id = r.invoice_id
          WHERE r.tenant_id = $1 AND r.invoice_id = $2
          ORDER BY r.rendered_at DESC
          LIMIT 1
        `,
        [principal.tenantId, invoiceId],
      );
      const row = result.rows[0];
      if (!row) {
        // No cached render; render on demand
        const invResult = await client.query<InvoiceDeliveryRow>(
          `
            SELECT i.id, i.invoice_number, i.currency, i.issue_date::text, i.due_date::text,
              i.subtotal_minor::text, i.tax_minor::text, i.total_minor::text,
              i.customer_id, i.seller_snapshot, i.buyer_snapshot, be.invoice_footer_text
            FROM gigalibs_ar.invoices i
            LEFT JOIN gigalibs_ar.billing_entities be
              ON be.tenant_id = i.tenant_id AND be.id = i.billing_entity_id
            WHERE i.tenant_id = $1 AND i.id = $2
          `,
          [principal.tenantId, invoiceId],
        );
        const inv = invResult.rows[0];
        if (!inv) throw new NotFoundException('Invoice was not found.');
        const lineResult = await client.query<InvoiceLineDeliveryRow>(
          `
            SELECT position, description, quantity::text, unit_amount_minor::text, amount_minor::text
            FROM gigalibs_ar.invoice_lines
            WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY position
          `,
          [principal.tenantId, invoiceId],
        );
        const bytes = await renderInvoicePdf(inv, lineResult.rows);
        return { filename: `${inv.invoice_number}.pdf`, bytes };
      }
      return {
        filename: `${row.invoice_number}.pdf`,
        bytes: row.pdf_bytes,
      };
    });
  }
}

// ─── PDF render ───────────────────────────────────────────────────────────────

function minorScale(currency: string): number {
  const ZERO_DECIMAL = new Set(['JPY','KRW','VND','BIF','CLP','GNF','ISK','MGA','PYG','RWF','UGX','XAF','XOF','XPF']);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

function fmtMinor(currency: string, minor: number | string): string {
  const n = typeof minor === 'string' ? Number(minor) : minor;
  const scale = minorScale(currency);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n / scale);
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function renderInvoicePdf(
  invoice: InvoiceDeliveryRow,
  lines: InvoiceLineDeliveryRow[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const curr = invoice.currency;
    const PAGE_W = doc.page.width - 100; // usable width

    // ── Header: Seller ────────────────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text(invoice.seller_snapshot.legalName, { align: 'left' });
    if (invoice.seller_snapshot.legalIdentifier) {
      doc.fontSize(10).font('Helvetica').fillColor('#555555')
        .text(invoice.seller_snapshot.legalIdentifier);
    }
    doc.moveDown(0.5);

    // ── Invoice label + number (right aligned) ────────────────────────────────
    const topY = 50;
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text('INVOICE', 50, topY, { align: 'right' });
    doc.fontSize(12).font('Helvetica').fillColor('#333333')
      .text(invoice.invoice_number, 50, topY + 36, { align: 'right' });

    doc.moveDown(2);

    // ── Bill-to ───────────────────────────────────────────────────────────────
    const billY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#888888').text('BILL TO', 50, billY);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(invoice.buyer_snapshot.legalName, 50, billY + 14);
    doc.fontSize(10).font('Helvetica').fillColor('#333333')
      .text(invoice.buyer_snapshot.billingEmail, 50, doc.y);

    // ── Dates (right side of bill-to row) ─────────────────────────────────────
    const dateX = doc.page.width - 250;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#888888').text('ISSUE DATE', dateX, billY);
    doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a')
      .text(fmtDate(invoice.issue_date), dateX, billY + 14);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#888888').text('DUE DATE', dateX, billY + 34);
    doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a')
      .text(fmtDate(invoice.due_date), dateX, billY + 48);

    doc.moveDown(2);

    // ── Line items table ──────────────────────────────────────────────────────
    const tableTop = doc.y;
    const COL = { desc: 50, qty: 280, unit: 360, total: 460 };
    const COL_W = { desc: 220, qty: 70, unit: 90, total: PAGE_W - (COL.total - 50) };

    // Table header
    doc.rect(50, tableTop, PAGE_W, 20).fill('#f0f0f0');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#444444');
    doc.text('Description', COL.desc + 4, tableTop + 5, { width: COL_W.desc });
    doc.text('Qty', COL.qty, tableTop + 5, { width: COL_W.qty, align: 'right' });
    doc.text('Unit price', COL.unit, tableTop + 5, { width: COL_W.unit, align: 'right' });
    doc.text('Total', COL.total, tableTop + 5, { width: COL_W.total, align: 'right' });

    let rowY = tableTop + 24;
    doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a');
    for (const [idx, line] of lines.entries()) {
      if (idx % 2 === 1) {
        doc.rect(50, rowY - 3, PAGE_W, 18).fill('#fafafa').fillColor('#1a1a1a');
      }
      doc.text(line.description, COL.desc + 4, rowY, { width: COL_W.desc });
      doc.text(line.quantity, COL.qty, rowY, { width: COL_W.qty, align: 'right' });
      doc.text(fmtMinor(curr, line.unit_amount_minor), COL.unit, rowY, { width: COL_W.unit, align: 'right' });
      doc.text(fmtMinor(curr, line.amount_minor), COL.total, rowY, { width: COL_W.total, align: 'right' });
      rowY += 20;
    }

    // Divider
    doc.moveTo(50, rowY + 4).lineTo(50 + PAGE_W, rowY + 4).strokeColor('#cccccc').stroke();
    rowY += 14;

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalsX = COL.total - 80;
    const totalsLabelW = 80;
    const totalsValW = COL_W.total;

    function totalsRow(label: string, value: string, bold = false) {
      doc.fontSize(10)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(bold ? '#1a1a1a' : '#444444')
        .text(label, totalsX, rowY, { width: totalsLabelW, align: 'right' })
        .text(value, COL.total, rowY, { width: totalsValW, align: 'right' });
      rowY += 18;
    }

    totalsRow('Subtotal', fmtMinor(curr, invoice.subtotal_minor));
    totalsRow('Tax', fmtMinor(curr, invoice.tax_minor));
    // Bold rule before total
    doc.moveTo(totalsX, rowY - 2).lineTo(50 + PAGE_W, rowY - 2).strokeColor('#1a1a1a').lineWidth(0.5).stroke();
    totalsRow('Total due', fmtMinor(curr, invoice.total_minor), true);

    // ── Footer ────────────────────────────────────────────────────────────────
    if (invoice.invoice_footer_text) {
      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica').fillColor('#888888')
        .text(invoice.invoice_footer_text, 50, doc.y, { width: PAGE_W, align: 'center' });
    }

    doc.end();
  });
}

// ─── Email content ────────────────────────────────────────────────────────────

function buildEmailText(invoice: InvoiceDeliveryRow): string {
  return [
    `Invoice ${invoice.invoice_number}`,
    `From: ${invoice.seller_snapshot.legalName}`,
    `To: ${invoice.buyer_snapshot.legalName}`,
    ``,
    `Issue date: ${invoice.issue_date}`,
    `Due date: ${invoice.due_date}`,
    ``,
    `Total: ${fmtMinor(invoice.currency, invoice.total_minor)}`,
    ``,
    `Please find the invoice attached as a PDF.`,
    invoice.invoice_footer_text ?? '',
  ].join('\n');
}

function buildEmailHtml(invoice: InvoiceDeliveryRow): string {
  const curr = invoice.currency;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Invoice ${invoice.invoice_number}</title>
<style>
  body{font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px}
  .header{border-bottom:2px solid #1a1a1a;padding-bottom:16px;margin-bottom:24px}
  .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em}
  .meta{display:flex;gap:32px;margin-bottom:24px}
  .total-row{font-size:18px;font-weight:bold;margin-top:16px;border-top:2px solid #1a1a1a;padding-top:12px}
  .footer{margin-top:32px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:16px}
</style>
</head>
<body>
<div class="header">
  <h2 style="margin:0">${invoice.seller_snapshot.legalName}</h2>
  <p style="margin:4px 0 0;font-size:20px;font-weight:bold">Invoice ${invoice.invoice_number}</p>
</div>
<p>Dear ${invoice.buyer_snapshot.legalName},</p>
<p>Please find attached invoice <strong>${invoice.invoice_number}</strong> for your review and payment.</p>
<div class="meta">
  <div><div class="label">Issue date</div><div>${fmtDate(invoice.issue_date)}</div></div>
  <div><div class="label">Due date</div><div>${fmtDate(invoice.due_date)}</div></div>
  <div><div class="label">Currency</div><div>${curr}</div></div>
</div>
<div>
  <div class="label">Subtotal</div><div>${fmtMinor(curr, invoice.subtotal_minor)}</div>
  <div class="label" style="margin-top:8px">Tax</div><div>${fmtMinor(curr, invoice.tax_minor)}</div>
  <div class="total-row">Total due: ${fmtMinor(curr, invoice.total_minor)}</div>
</div>
${invoice.invoice_footer_text
    ? `<div class="footer">${invoice.invoice_footer_text}</div>`
    : ''}
</body>
</html>`;
}

// ─── Map ──────────────────────────────────────────────────────────────────────

function mapDelivery(row: DeliveryRow): DeliveryResponse {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    pdfRenderId: row.pdf_render_id,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    subjectLine: row.subject_line,
    status: row.status,
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    deliveredBy: row.delivered_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
