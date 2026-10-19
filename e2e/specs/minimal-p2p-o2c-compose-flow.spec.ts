/**
 * WI-OI-120gu: Minimal P2P and O2C through local compose (BFF + module APIs), plus metadata UI smoke.
 * Mirrors `.pi/TABLE-1-MINIMAL-FLOWS.md` and the throwaway Postgres proofs, against a signed-in tenant admin.
 *
 * Requires local stack on PLAYWRIGHT_TEST_BASE_URL (default http://127.0.0.1:5180) and
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD (see e2e/uat.env.example).
 */
import { expect, type Page, test } from '@playwright/test';
import { signInToUat, uatAdmin } from './uat-session';

const PROC = '/api/universal-procurement/v1';
const ORD = '/api/universal-orders/v1';
const run = Date.now().toString(36).toUpperCase();

async function signIn(page: Page, origin: string) {
  await signInToUat(page, origin, uatAdmin);
}

async function json<T>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; expected?: number },
): Promise<T> {
  const expected = init?.expected ?? (init?.method === 'POST' ? 200 : 200);
  const response = await page.request.fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    data: init?.body,
  });
  const text = await response.text();
  expect(response.status(), `${path}: ${text.slice(0, 400)}`).toBe(expected);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function ensureParty(page: Page, code: string, name: string) {
  const search = await page.request.get(`/api/control/parties?partyType=ORGANIZATION&search=${encodeURIComponent(code)}`);
  expect(search.status()).toBeLessThan(500);
  if (search.ok()) {
    const body = (await search.json()) as { items?: { id: string; code: string }[] };
    const hit = body.items?.find((p) => p.code === code);
    if (hit) return hit.id;
  }
  const created = await json<{ id: string }>(page, '/api/control/parties', {
    method: 'POST',
    expected: 201,
    body: { code, legalName: name, displayName: name, partyType: 'ORGANIZATION' },
  });
  return created.id;
}

async function firstOrgUnitId(page: Page): Promise<string> {
  const lookup = await json<{ items: { value: string; label: string }[] }>(
    page,
    '/api/control/v1/lookups/organization-units?limit=20',
  );
  const first = lookup.items?.[0]?.value;
  expect(first, 'Tenant needs at least one organization unit for P2P/O2C').toBeTruthy();
  return first!;
}

async function catalogueIds(page: Page) {
  const uom = await json<{ id: string }>(page, '/api/product-catalogue/v1/uoms', {
    method: 'POST',
    expected: 201,
    body: { code: `EA${run}`.slice(0, 20), name: `Each ${run}`, symbol: 'ea', dimension: 'COUNT' },
  });
  const product = await json<{ id: string }>(page, '/api/product-catalogue/v1/products', {
    method: 'POST',
    expected: 201,
    body: {
      code: `SKU-${run}`,
      name: `Flow SKU ${run}`,
      productType: 'GOOD',
      baseUomId: uom.id,
      isSold: true,
      isPurchased: true,
      isStocked: true,
    },
  });
  return { uomId: uom.id, productId: product.id };
}

test.describe('Minimal P2P and O2C on local compose', () => {
  test.skip(!uatAdmin.email || !uatAdmin.password, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD.');
  test.describe.configure({ mode: 'serial' });

  test('P2P: requisition through approved vendor bill via module API', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signIn(page, origin);
    page.on('dialog', (dialog) => void dialog.accept());

    const orgUnitId = await firstOrgUnitId(page);
    const vendorId = await ensureParty(page, `VEND-P2P-${run}`, `P2P Vendor ${run}`);
    const { uomId, productId } = await catalogueIds(page);
    const warehouseId = crypto.randomUUID();

    const req = await json<{ id: string; lines: { id: string }[] }>(page, `${PROC}/requisitions`, {
      method: 'POST',
      expected: 201,
      body: {
        orgUnitId,
        description: `Minimal P2P ${run}`,
        currencyCode: 'USD',
        lines: [
          {
            productId,
            productCode: `SKU-${run}`,
            productName: `Flow SKU ${run}`,
            quantity: '2.000000',
            uomId,
            estimatedUnitPriceMinor: '500',
          },
        ],
      },
    });

    await json(page, `${PROC}/requisitions/${req.id}/submit`, { method: 'POST' });
    await json(page, `${PROC}/requisitions/${req.id}/approve`, { method: 'POST' });
    const po = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      `${PROC}/requisitions/${req.id}/convert-to-po`,
      {
        method: 'POST',
        body: {
          vendorPartyId: vendorId,
          vendorName: `P2P Vendor ${run}`,
          destinationWarehouseId: warehouseId,
        },
      },
    );
    expect(po.status).toBe('DRAFT');

    await json(page, `${PROC}/orders/${po.id}/issue`, { method: 'POST' });
    const ack = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      `${PROC}/orders/${po.id}/acknowledge`,
      { method: 'POST' },
    );
    expect(ack.status).toBe('ACKNOWLEDGED');

    const receiptId = crypto.randomUUID();
    const receiptLineId = crypto.randomUUID();
    const poLineId = ack.lines[0]!.id;
    await json(page, `${PROC}/match/receipt`, {
      method: 'POST',
      body: {
        purchaseOrderId: ack.id,
        purchaseOrderLineId: poLineId,
        receiptId,
        receiptLineId,
        matchedQuantity: '2.000000',
        uomId,
      },
    });

    const bill = await json<{ id: string; lines: { id: string }[] }>(page, `${PROC}/bills`, {
      method: 'POST',
      expected: 201,
      body: {
        vendorPartyId: vendorId,
        vendorInvoiceNumber: `VINV-${run}`,
        invoiceDate: '2026-10-01T12:00:00.000Z',
        dueDate: '2026-11-01T12:00:00.000Z',
        currencyCode: 'USD',
        purchaseOrderId: ack.id,
        lines: [
          {
            purchaseOrderId: ack.id,
            purchaseOrderLineId: poLineId,
            productId,
            description: 'Line',
            billedQuantity: '2.000000',
            uomId,
            unitPriceMinor: '500',
            matchedReceiptLineId: receiptLineId,
          },
        ],
      },
    });

    await json(page, `${PROC}/match/invoice`, {
      method: 'POST',
      body: {
        purchaseOrderId: ack.id,
        purchaseOrderLineId: poLineId,
        vendorBillId: bill.id,
        vendorBillLineId: bill.lines[0]!.id,
        receiptLineId,
        matchedQuantity: '2.000000',
      },
    });

    const approved = await json<{ status: string }>(page, `${PROC}/bills/${bill.id}/approve`, { method: 'POST' });
    expect(approved.status).toBe('APPROVED');

    await page.goto('/procurement');
    await expect(page.getByRole('heading', { name: /Procurement & Payables/i })).toBeVisible();
    await page.getByRole('button', { name: 'Purchase orders' }).click();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible({ timeout: 20000 });
  });

  test('O2C: quote through customer invoice via module API', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signIn(page, origin);
    page.on('dialog', (dialog) => void dialog.accept());

    const orgUnitId = await firstOrgUnitId(page);
    const customerId = await ensureParty(page, `CUST-O2C-${run}`, `O2C Customer ${run}`);
    const { uomId, productId } = await catalogueIds(page);
    const warehouseId = crypto.randomUUID();

    const quote = await json<{ id: string }>(page, `${ORD}/quotes`, {
      method: 'POST',
      expected: 201,
      body: {
        orgUnitId,
        customerPartyId: customerId,
        customerName: `O2C Customer ${run}`,
        currencyCode: 'USD',
        validUntil: '2026-12-31T00:00:00.000Z',
        paymentTermDays: 30,
        lines: [
          {
            productId,
            productCode: `SKU-${run}`,
            productName: `Flow SKU ${run}`,
            quotedQuantity: '3.000000',
            uomId,
            unitPriceMinor: '1000',
            discountPercentBasisPoints: 0,
            taxRateBasisPoints: 0,
          },
        ],
      },
    });

    await json(page, `${ORD}/quotes/${quote.id}/accept`, { method: 'POST' });
    const order = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      `${ORD}/quotes/${quote.id}/convert`,
      { method: 'POST', body: { warehouseId } },
    );
    expect(order.status).toBe('DRAFT');

    const confirmed = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      `${ORD}/orders/${order.id}/confirm`,
      { method: 'POST' },
    );
    expect(confirmed.status).toBe('CONFIRMED');
    const orderLineId = confirmed.lines[0]!.id;

    await json(page, `${ORD}/orders/${confirmed.id}/allocate`, {
      method: 'POST',
      body: {
        orderId: confirmed.id,
        orderLineId,
        warehouseId,
        allocatedQuantity: '3.000000',
      },
    });

    await json(page, `${ORD}/fulfillments`, {
      method: 'POST',
      expected: 201,
      body: {
        orderId: confirmed.id,
        warehouseId,
        lines: [{ orderLineId, shippedQuantity: '3.000000' }],
      },
    });

    const invoice = await json<{ status: string; lines: { invoicedQuantity: string }[] }>(page, `${ORD}/invoices`, {
      method: 'POST',
      expected: 201,
      body: { orderId: confirmed.id, dueDate: '2026-11-15T00:00:00.000Z' },
    });
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.lines[0]?.invoicedQuantity).toBe('3.000000');

    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /Universal Order Management/i })).toBeVisible();
    await page.getByRole('button', { name: 'Sales orders' }).click();
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  });
});
