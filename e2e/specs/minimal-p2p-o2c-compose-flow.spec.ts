/**
 * WI-OI-120gu: Minimal P2P and O2C through local compose (BFF + module APIs), plus metadata UI smoke.
 * Mirrors `.pi/TABLE-1-MINIMAL-FLOWS.md` and the throwaway Postgres proofs, against a signed-in tenant admin.
 *
 * Runs on the isolated test stack (project gigalibs-test; `pnpm test:minimal-p2p-o2c` loads e2e/test.env, which
 * generate-test-stack-credentials.sh writes). It creates vendors, orders, bills and invoices, so it skips itself
 * unless GIGALIBS_E2E_TARGET=test-stack, or GIGALIBS_ALLOW_UAT_WRITE_E2E=1 for an owner-approved UAT run.
 * E2E_UAT_ADMIN_* and E2E_UAT_APPROVER_* (org bootstrap is maker–checker).
 * Compose must include kernel-worker so activated org versions reach product-catalogue / procurement / orders.
 */
import { expect, type Page, test } from '@playwright/test';
import { ensureActiveOrgUnit } from './helpers/ensure-active-org-unit';
import { signInToUat, uatAdmin, uatApprover } from './uat-session';

const PROC = '/api/universal-procurement/v1';
const ORD = '/api/universal-orders/v1';
const run = Date.now().toString(36).toUpperCase();

async function signIn(page: Page, origin: string) {
  await signInToUat(page, origin, uatAdmin);
}

async function json<T>(
  page: Page,
  origin: string,
  path: string,
  init?: { method?: string; body?: unknown; expected?: number },
): Promise<T> {
  const expected = init?.expected ?? (init?.method === 'POST' ? 200 : 200);
  const deadline = Date.now() + 120_000;
  for (;;) {
    const response = await page.request.fetch(path, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Origin: origin,
        ...(init?.body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}),
      },
      data: init?.body,
    });
    const text = await response.text();
    if (
      response.status() === 503 &&
      text.includes('ORGANIZATION_VERSION_PENDING') &&
      Date.now() < deadline
    ) {
      await page.waitForTimeout(2000);
      continue;
    }
    if (response.status() === 503 && text.includes('ORGANIZATION_VERSION_PENDING')) {
      throw new Error(
        `${path}: organization version not delivered to this module. ` +
          'Bring up the isolated test stack (never UAT): bash infra/compose/scripts/up-test-stack.sh; ' +
          'then pnpm test:minimal-p2p-o2c from e2e/.',
      );
    }
    const status = response.status();
    const ok =
      status === expected ||
      (init?.method === 'POST' && expected === 200 && (status === 200 || status === 201));
    expect(ok, `${path}: ${text.slice(0, 400)}`).toBe(true);
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}

async function ensureParty(page: Page, origin: string, code: string, name: string) {
  const search = await page.request.get(`/api/control/parties?partyType=ORGANIZATION&search=${encodeURIComponent(code)}`, {
    headers: { Accept: 'application/json', Origin: origin },
  });
  expect(search.status()).toBeLessThan(500);
  if (search.ok()) {
    const body = (await search.json()) as { items?: { id: string; code: string }[] };
    const hit = body.items?.find((p) => p.code === code);
    if (hit) return hit.id;
  }
  const created = await json<{ party: { id: string } }>(page, origin, '/api/control/parties', {
    method: 'POST',
    expected: 201,
    body: { code, legalName: name, displayName: name, partyType: 'ORGANIZATION' },
  });
  expect(created.party?.id, 'party create response').toBeTruthy();
  return created.party.id;
}

async function firstOrgUnitId(page: Page, origin: string): Promise<string> {
  return ensureActiveOrgUnit(page, origin);
}

async function catalogueIds(page: Page, origin: string) {
  const tag = `${run}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const uom = await json<{ id: string }>(page, origin, '/api/product-catalogue/v1/uoms', {
    method: 'POST',
    expected: 201,
    body: { code: `EA${tag}`.slice(0, 20), name: `Each ${tag}`, symbol: 'ea', dimension: 'COUNT' },
  });
  const product = await json<{ id: string }>(page, origin, '/api/product-catalogue/v1/products', {
    method: 'POST',
    expected: 201,
    body: {
      code: `SKU-${tag}`,
      name: `Flow SKU ${tag}`,
      productType: 'GOOD',
      baseUomId: uom.id,
      isSold: true,
      isPurchased: true,
      isStocked: true,
    },
  });
  return { uomId: uom.id, productId: product.id };
}

// WI-OI-120bo: UAT is production; this spec writes business records there unless the owner approved the run.
const writesAllowed =
  process.env.GIGALIBS_E2E_TARGET === 'test-stack' || process.env.GIGALIBS_ALLOW_UAT_WRITE_E2E === '1';

test.describe('Minimal P2P and O2C on local compose', () => {
  test.skip(
    !writesAllowed,
    'Writes vendors, orders, bills and invoices: run `pnpm test:minimal-p2p-o2c` (isolated test stack), or set GIGALIBS_ALLOW_UAT_WRITE_E2E=1 with owner approval.',
  );
  test.skip(!uatAdmin.email || !uatAdmin.password, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD.');
  test.skip(
    !uatApprover.email || !uatApprover.password,
    'Set E2E_UAT_APPROVER_EMAIL and E2E_UAT_APPROVER_PASSWORD (org structure maker–checker).',
  );
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  test('P2P: requisition through approved vendor bill via module API', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signIn(page, origin);
    page.on('dialog', (dialog) => void dialog.accept());

    const orgUnitId = await firstOrgUnitId(page, origin);
    const vendorId = await ensureParty(page, origin, `VEND-P2P-${run}`, `P2P Vendor ${run}`);
    const { uomId, productId } = await catalogueIds(page, origin);
    const warehouseId = crypto.randomUUID();

    const req = await json<{ id: string; lines: { id: string }[] }>(page, origin, `${PROC}/requisitions`, {
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

    await json(page, origin, `${PROC}/requisitions/${req.id}/submit`, { method: 'POST' });
    await json(page, origin, `${PROC}/requisitions/${req.id}/approve`, { method: 'POST' });
    const po = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      origin,
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

    await json(page, origin, `${PROC}/orders/${po.id}/issue`, { method: 'POST' });
    const ack = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      origin,
      `${PROC}/orders/${po.id}/acknowledge`,
      { method: 'POST' },
    );
    expect(ack.status).toBe('ACKNOWLEDGED');

    const receiptId = crypto.randomUUID();
    const receiptLineId = crypto.randomUUID();
    const poLineId = ack.lines[0]!.id;
    await json(page, origin, `${PROC}/match/receipt`, {
      method: 'POST',
      expected: 201,
      body: {
        purchaseOrderId: ack.id,
        purchaseOrderLineId: poLineId,
        receiptId,
        receiptLineId,
        matchedQuantity: '2.000000',
        uomId,
      },
    });

    const bill = await json<{ id: string; lines: { id: string }[] }>(page, origin, `${PROC}/bills`, {
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

    await json(page, origin, `${PROC}/match/invoice`, {
      method: 'POST',
      expected: 201,
      body: {
        purchaseOrderId: ack.id,
        purchaseOrderLineId: poLineId,
        vendorBillId: bill.id,
        vendorBillLineId: bill.lines[0]!.id,
        receiptLineId,
        matchedQuantity: '2.000000',
      },
    });

    const approved = await json<{ status: string }>(page, origin, `${PROC}/bills/${bill.id}/approve`, { method: 'POST' });
    expect(approved.status).toBe('APPROVED');

    // WI-OI-145: each Procurement screen is a sidebar route with its own page header.
    await page.goto('/procurement');
    await expect(page.getByRole('heading', { name: 'Requisitions', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Purchase orders' })).toBeVisible();
  });

  test('O2C: quote through customer invoice via module API', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signIn(page, origin);
    page.on('dialog', (dialog) => void dialog.accept());

    const orgUnitId = await firstOrgUnitId(page, origin);
    const customerId = await ensureParty(page, origin, `CUST-O2C-${run}`, `O2C Customer ${run}`);
    const { uomId, productId } = await catalogueIds(page, origin);
    const warehouseId = crypto.randomUUID();

    const quote = await json<{ id: string }>(page, origin, `${ORD}/quotes`, {
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

    await json(page, origin, `${ORD}/quotes/${quote.id}/accept`, { method: 'POST', expected: 201 });
    const order = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      origin,
      `${ORD}/quotes/${quote.id}/convert`,
      { method: 'POST', expected: 201, body: { warehouseId } },
    );
    expect(order.status).toBe('DRAFT');

    const confirmed = await json<{ id: string; status: string; lines: { id: string }[] }>(
      page,
      origin,
      `${ORD}/orders/${order.id}/confirm`,
      { method: 'POST' },
    );
    expect(confirmed.status).toBe('CONFIRMED');
    const orderLineId = confirmed.lines[0]!.id;

    await json(page, origin, `${ORD}/orders/${confirmed.id}/allocate`, {
      method: 'POST',
      body: {
        orderId: confirmed.id,
        orderLineId,
        warehouseId,
        allocatedQuantity: '3.000000',
      },
    });

    await json(page, origin, `${ORD}/fulfillments`, {
      method: 'POST',
      expected: 201,
      body: {
        orderId: confirmed.id,
        warehouseId,
        lines: [{ orderLineId, shippedQuantity: '3.000000' }],
      },
    });

    const invoice = await json<{ status: string; lines: { invoicedQuantity: string }[] }>(page, origin, `${ORD}/invoices`, {
      method: 'POST',
      expected: 201,
      body: { orderId: confirmed.id, dueDate: '2026-11-15T00:00:00.000Z' },
    });
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.lines[0]?.invoicedQuantity).toBe('3.000000');

    // WI-OI-145: each Orders screen is a sidebar route with its own page header.
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Quotes', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sales orders' })).toBeVisible();
  });
});
