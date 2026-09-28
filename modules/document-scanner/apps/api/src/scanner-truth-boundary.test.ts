import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import { parseDocumentText } from './scanner/ocr-adapters.js';
import { ScannerService } from './scanner/scanner.service.js';

describe('Document Scanner Truth Boundary & Arithmetic Validation (AI-01, AI-02)', () => {
  const mockDb = {
    queryWithTenant: async (_tenantId: string, query: string, params?: any[]) => {
      if (query.includes('INSERT INTO gigalibs_scanner.document_uploads')) {
        return {
          rows: [
            {
              id: 'doc-uuid-1',
              tenant_id: params?.[0],
              sha256_checksum: params?.[1],
              storage_key: params?.[2],
              file_name: params?.[3],
              mime_type: params?.[4],
              byte_size: params?.[5],
              uploaded_by: params?.[6],
              status: 'CLEARED',
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (query.includes('INSERT INTO gigalibs_scanner.extraction_jobs')) {
        return {
          rows: [
            {
              id: 'job-uuid-1',
              tenant_id: params?.[0],
              document_id: params?.[1],
              model_adapter: params?.[2],
              status: 'EXTRACTED',
              confidence_score: params?.[3],
              extracted_data: JSON.parse(params?.[4] ?? '{}'),
              is_arithmetic_reconciled: params?.[5],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (query.includes('SELECT') && query.includes('gigalibs_scanner.extraction_jobs')) {
        return {
          rows: [
            {
              id: 'job-uuid-1',
              tenant_id: 'tenant-alpha-uuid',
              document_id: 'doc-uuid-1',
              file_name: 'invoice.pdf',
              sha256_checksum: 'a'.repeat(64),
              byte_size: 1024,
              model_adapter: 'GIGALIBS_OCR_V1',
              status: 'EXTRACTED',
              confidence_score: 0.95,
              extracted_data: {
                subtotalAmount: { value: 1000 },
                taxAmount: { value: 80 },
                totalAmount: { value: 1080 },
                lineItems: [{ lineTotal: 1000 }],
              },
              is_arithmetic_reconciled: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const service = new ScannerService(mockDb as any);

  it('calculates exact SHA-256 checksum and bounds upload size (AI-01)', async () => {
    const rawPayload = Buffer.from('INVOICE TEST DATA FROM SUPPLIER ACME');
    const expectedHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const result = await service.uploadDocument('tenant-alpha-uuid', 'user-1', {
      buffer: rawPayload,
      originalName: 'invoice_sep2026.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.sha256Checksum).toBe(expectedHash);
    expect(result.byteSize).toBe(rawPayload.length);
    expect(result.status).toBe('CLEARED');
    expect(result.storageKey).toContain(expectedHash);
  });

  it('rejects oversized file uploads exceeding 25MB bounded limit', async () => {
    const hugeBuffer = {
      buffer: { length: 26 * 1024 * 1024 },
      originalName: 'huge.pdf',
      mimeType: 'application/pdf',
    };

    await expect(service.uploadDocument('tenant-alpha-uuid', 'user-1', hugeBuffer as any)).rejects.toThrow(
      /File size exceeds maximum allowed limit/,
    );
  });

  it('extracts structured invoice fields and verifies arithmetic consistency (AI-02)', async () => {
    const invoiceText = `
INVOICE #INV-2026-8819
DATE: 2026-09-15
DUE DATE: 2026-10-15
SUPPLIER: Lockheed Martin Integrated Systems
TAX ID: US-EIN-52-1928410
IBAN: US44CHAS00001928374650

1. Mission Avionics Sensor Kit | QTY: 2 | UNIT: $10,000.00 | TOTAL: $20,000.00
2. Radar Firmware Upgrade License | QTY: 1 | UNIT: $5,000.00 | TOTAL: $5,000.00

SUBTOTAL: $25,000.00
TAX: $2,000.00
TOTAL AMOUNT DUE: $27,000.00
`;

    const extracted = parseDocumentText(invoiceText);

    expect(extracted.invoiceNumber.value).toBe('INV-2026-8819');
    expect(extracted.supplierName.value).toBe('Lockheed Martin Integrated Systems');
    expect(extracted.supplierTaxId.value).toBe('US-EIN-52-1928410');
    expect(extracted.supplierIban.value).toBe('US44CHAS00001928374650');
    expect(extracted.subtotalAmount.value).toBe(25000);
    expect(extracted.taxAmount.value).toBe(2000);
    expect(extracted.totalAmount.value).toBe(27000);
    expect(extracted.lineItems).toHaveLength(2);
    expect(extracted.lineItems[0].lineTotal).toBe(20000);
    expect(extracted.lineItems[1].lineTotal).toBe(5000);

    // Sum of line items: 20000 + 5000 = 25000 == subtotal
    // Subtotal + Tax: 25000 + 2000 = 27000 == total
    expect(extracted.isArithmeticReconciled).toBe(true);
    expect(extracted.overallConfidence).toBeGreaterThanOrEqual(0.90);
  });

  it('flags arithmetic reconciliation mismatch when line items or totals do not balance', async () => {
    const invalidInvoiceText = `
INVOICE #INV-CORRUPT-01
SUPPLIER: Shady Parts LLC
1. Broken Gear | QTY: 1 | UNIT: $100.00 | TOTAL: $100.00
SUBTOTAL: $100.00
TAX: $10.00
TOTAL AMOUNT DUE: $999.00
`;

    const extracted = parseDocumentText(invalidInvoiceText);
    // 100 + 10 = 110 != 999
    expect(extracted.isArithmeticReconciled).toBe(false);
  });

  it('records human corrections and updates arithmetic reconciliation', async () => {
    const corrected = await service.correctJob('tenant-alpha-uuid', 'job-uuid-1', {
      subtotalAmount: 1000,
      taxAmount: 80,
      totalAmount: 1080,
      lineItems: [{ lineTotal: 1000 }],
    });

    expect(corrected.isArithmeticReconciled).toBe(true);
    expect(corrected.correctedData.totalAmount).toBe(1080);
  });

  it('dispatches approved invoice to Accounts Payable with immutable reference ID', async () => {
    const handoff = await service.handoffJob('tenant-alpha-uuid', 'approver-1', 'job-uuid-1', 'ACCOUNTS_PAYABLE');

    expect(handoff.status).toBe('HANDED_OFF');
    expect(handoff.approvedBy).toBe('approver-1');
    expect(handoff.handoffReferenceId).toMatch(/^AP-INV-[0-9A-F]{8}$/);
    expect(handoff.message).toContain('dispatched invoice to Accounts Payable');
  });
});
