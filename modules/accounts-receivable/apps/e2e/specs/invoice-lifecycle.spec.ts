import { expect, test } from '@playwright/test';

test('persists and issues an invoice through the standalone product', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/setup');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Legal name').fill('Playwright Certification Entity');
  await page.getByLabel('Default currency').fill('USD');
  await page.getByLabel('Document prefix').fill('TEST-');
  await expect(page.getByLabel('Document prefix')).toHaveValue('TEST-');
  await page.getByRole('button', { name: 'Configure workspace' }).click();
  await expect(page.getByText('Workspace is active.')).toBeVisible();

  await page.getByRole('link', { name: 'Customers' }).click();
  await expect(page).toHaveURL('/customers');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await page.getByLabel('Legal name').fill('Playwright Certification Customer');
  await page.getByLabel('Billing email').fill('billing@playwright.invalid');
  await page.getByLabel('External reference').fill('PW-CUSTOMER-001');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('cell', { name: 'Playwright Certification Customer' })).toBeVisible();

  await page.getByRole('link', { name: 'Invoices' }).click();
  await expect(page).toHaveURL('/invoices');
  await page.getByRole('link', { name: 'Create invoice' }).click();
  await expect(page).toHaveURL('/invoices/new');
  await page.waitForLoadState('networkidle');
  await page
    .getByLabel('Customer')
    .selectOption({ label: 'Playwright Certification Customer · USD' });
  await page.getByLabel('Description').fill('Certification service');
  await page.getByLabel('Quantity').fill('1');
  await page.getByLabel('Unit amount (minor)').fill('2500');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();
  await expect(page.locator('.grand-total')).toContainText('USD 2,500 minor units');

  await page.getByRole('link', { name: 'Edit draft' }).click();
  await page.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.grand-total')).toContainText('USD 5,000 minor units');

  await page.getByRole('button', { name: 'Issue invoice' }).click();
  await page.getByLabel('Reason for issue').fill('Playwright certification approval');
  await page.getByRole('button', { name: 'Issue permanently' }).click();
  await expect(page.getByText('ISSUED', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TEST-000001' })).toBeVisible();

  await expect
    .poll(async () => {
      const response = await request.get('http://127.0.0.1:3503/__events');
      const body = (await response.json()) as { items: Array<{ type: string }> };
      return body.items.filter((event) => event.type === 'ar.invoice.issued.v1').length;
    })
    .toBe(1);

  const restart = await request.post('http://127.0.0.1:3503/__control/restart-api');
  expect(restart.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'TEST-000001' })).toBeVisible();
  await expect(page.getByText('ISSUED', { exact: true })).toBeVisible();
  await expect(page.locator('.immutable-note')).toContainText('Financial fields are immutable');

  const apiEvidence = await page.evaluate(async () => {
    const request = async (path: string, init?: RequestInit) => {
      const response = await fetch(`/api/ar/${path}`, init);
      return { status: response.status, body: await response.json() };
    };
    const customerPage = await request('v1/customers?pageSize=10');
    const customerId = customerPage.body.items[0].id as string;
    const draftBody = {
      customerId,
      currency: 'USD',
      issueDate: '2026-09-04',
      dueDate: '2026-10-04',
      lines: [{ description: 'API invariant certification', quantity: '1', unitAmountMinor: 100 }],
    };
    const create = (key: string) =>
      request('v1/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(draftBody),
      });
    const first = await create('playwright-create-idempotency-0001');
    const replay = await create('playwright-create-idempotency-0001');
    const [left, right] = await Promise.all([
      create('playwright-concurrent-draft-0001'),
      create('playwright-concurrent-draft-0002'),
    ]);
    const issue = (invoiceId: string, key: string) =>
      request(`v1/invoices/${invoiceId}/issue`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': key,
          'if-match': '"1"',
        },
        body: JSON.stringify({ reason: 'Concurrent numbering certification' }),
      });
    const [issuedLeft, issuedRight] = await Promise.all([
      issue(left.body.id, 'playwright-concurrent-issue-0001'),
      issue(right.body.id, 'playwright-concurrent-issue-0002'),
    ]);
    const issueReplay = await issue(left.body.id, 'playwright-concurrent-issue-0001');
    const immutableEdit = await request(`v1/invoices/${left.body.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'if-match': '"2"' },
      body: JSON.stringify(draftBody),
    });
    const pageOne = await request('v1/invoices?pageSize=2');
    const pageTwo = await request(
      `v1/invoices?pageSize=2&cursor=${encodeURIComponent(pageOne.body.nextCursor)}`,
    );
    return {
      createStatus: first.status,
      replayStatus: replay.status,
      sameDraftId: first.body.id === replay.body.id,
      issueStatuses: [issuedLeft.status, issuedRight.status],
      issuedNumbers: [issuedLeft.body.invoiceNumber, issuedRight.body.invoiceNumber],
      issueReplayStatus: issueReplay.status,
      issueReplayId: issueReplay.body.id,
      immutableEditStatus: immutableEdit.status,
      pageOneIds: pageOne.body.items.map((item: { id: string }) => item.id),
      pageTwoIds: pageTwo.body.items.map((item: { id: string }) => item.id),
    };
  });

  expect(apiEvidence.createStatus).toBe(201);
  expect(apiEvidence.replayStatus).toBe(200);
  expect(apiEvidence.sameDraftId).toBe(true);
  expect(apiEvidence.issueStatuses).toEqual([201, 201]);
  expect(new Set(apiEvidence.issuedNumbers).size).toBe(2);
  expect(apiEvidence.issueReplayStatus).toBe(200);
  expect(apiEvidence.issueReplayId).toBeTruthy();
  expect(apiEvidence.immutableEditStatus).toBe(409);
  expect(apiEvidence.pageOneIds).toHaveLength(2);
  expect(apiEvidence.pageTwoIds.length).toBeGreaterThan(0);
  expect(apiEvidence.pageTwoIds.some((id: string) => apiEvidence.pageOneIds.includes(id))).toBe(false);
});
