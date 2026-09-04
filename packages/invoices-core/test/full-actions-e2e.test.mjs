import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = 'http://127.0.0.1:3001/api/v1';

describe('⚡ Complete Enterprise Invoicing Lifecycle & Actions E2E Verification', () => {
  let createdRecordId;
  let createdInvoiceId;
  let createdInvoiceNumber;

  it('1. POST /invoices/billable-records/warner-bros: Persists new unbilled shift to PostgreSQL', async () => {
    const res = await fetch(`${API_BASE}/invoices/billable-records/warner-bros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'TIMESHEET_SHIFT',
        sourceId: `TS-E2E-${Date.now()}`,
        projectOrEventId: 'EVT-2026-WARNER-STAGE4',
        projectOrEventName: 'Warner Bros Stage 4 Production Shoot',
        resourceName: 'Diana Prince',
        resourceRole: 'Lead VFX Supervisor',
        quantity: 8,
        rawCostCents: 9500,
        markupType: 'PERCENTAGE',
        markupValue: 35,
        approvalStatus: 'PENDING',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.equal(data.resourceName, 'Diana Prince');
    assert.equal(data.approvalStatus, 'PENDING');
    assert.equal(data.billingStatus, 'UNBILLED');
    assert.equal(data.billedUnitPriceCents, 12825);
    assert.equal(data.billedTotalAmountCents, 102600);
    createdRecordId = data.id;
  });

  it('2. PATCH /invoices/billable-records/warner-bros/:id/approval: Approves shift in DB', async () => {
    const res = await fetch(`${API_BASE}/invoices/billable-records/warner-bros/${createdRecordId}/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalStatus: 'APPROVED' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, createdRecordId);
    assert.equal(data.approvalStatus, 'APPROVED');
  });

  it('3. POST /invoices/generate-incremental/warner-bros: Incremental billing covers Diana Prince and locks record', async () => {
    const res = await fetch(`${API_BASE}/invoices/generate-incremental/warner-bros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectOrEventId: 'EVT-2026-WARNER-STAGE4',
        defaultMarkupPercent: 35,
      }),
    });

    assert.equal(res.status, 201);
    const inv = await res.json();
    assert.ok(inv.id);
    assert.ok(inv.invoiceNumber);
    assert.equal(inv.status, 'OPEN');
    assert.ok(inv.lineItems.length > 0);
    assert.ok(inv.accountingSyncs.length > 0);
    assert.equal(inv.accountingSyncs[0].syncStatus, 'SYNCED');

    createdInvoiceId = inv.id;
    createdInvoiceNumber = inv.invoiceNumber;
  });

  it('4. PATCH /invoices/warner-bros/:id/pay: Marks invoice as PAID, records payment transaction, clears balance due', async () => {
    const res = await fetch(`${API_BASE}/invoices/warner-bros/${createdInvoiceId}/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(res.status, 200);
    const paidInv = await res.json();
    assert.equal(paidInv.id, createdInvoiceId);
    assert.equal(paidInv.status, 'PAID');
    assert.equal(paidInv.amountDueCents, 0);
    assert.equal(paidInv.amountPaidCents, paidInv.totalCents);
    assert.ok(paidInv.paidAt);
    assert.ok(paidInv.payments.length > 0);
    assert.equal(paidInv.payments[0].status, 'SUCCEEDED');
    assert.ok(paidInv.payments[0].transactionId.startsWith('TXN-'));
  });

  it('5. PATCH /invoices/warner-bros/:invoiceNumber/pay: Supports lookup by invoiceNumber and idempotency', async () => {
    const res = await fetch(`${API_BASE}/invoices/warner-bros/${createdInvoiceNumber}/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(res.status, 200);
    const paidInv = await res.json();
    assert.equal(paidInv.invoiceNumber, createdInvoiceNumber);
    assert.equal(paidInv.status, 'PAID');
  });

  it('6. POST /invoices/warner-bros/:id/sync-accounting: QuickBooks Online sync is idempotent and telemetry verified', async () => {
    const res = await fetch(`${API_BASE}/invoices/warner-bros/${createdInvoiceId}/sync-accounting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'QUICKBOOKS_ONLINE' }),
    });

    assert.equal(res.status, 201);
    const sync = await res.json();
    assert.equal(sync.invoiceId, createdInvoiceId);
    assert.equal(sync.provider, 'QUICKBOOKS_ONLINE');
    assert.equal(sync.syncStatus, 'SYNCED');
    assert.ok(sync.syncedAt);
  });
});
