/**
 * WI-OI-120l (U12): the general ledger on the UAT instance, as two people on screen, with data the owner keeps using.
 * - Set up: the organization UAT-CO (a party), then the book UAT-GL from the Finance page's "Set up a book" panel, with
 *   its fiscal year and the standard chart of accounts.
 * - A month of journals (September of UAT_GL_YEAR, default 2026): opening balances, a credit sale, a purchase of
 *   stock, rent, payroll and depreciation. uat.admin drafts each one, adds its lines and submits it; uat.admin's own
 *   approval is refused; uat.approver approves and posts it.
 * - Reports: the trial balance and balance sheet balance; the income statement shows the month's result.
 * Idempotent: a book whose set-up stopped part-way is completed from the panel; a journal whose description already
 * exists is carried on from where it stands, never entered twice.
 */
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { signInToUat, uatAdmin, uatApprover } from './uat-session';

test.use({ video: process.env.UAT_VIDEO === 'on' ? 'on' : 'retain-on-failure' });

const YEAR = process.env.UAT_GL_YEAR ?? '2026';
const BOOK = 'UAT-GL';
const PARTY = 'UAT-CO';

/** Each line is [account code, debit minor units, credit minor units]. */
const JOURNALS: readonly { description: string; date: string; kind?: string; lines: readonly [string, string, string][] }[] = [
  {
    description: `UAT ${YEAR}-09 opening balances`,
    date: `${YEAR}-09-01`,
    kind: 'OPENING_BALANCE',
    lines: [['1000', '5000000', ''], ['1500', '2000000', ''], ['3000', '', '6000000'], ['2500', '', '1000000']],
  },
  { description: `UAT ${YEAR}-09 credit sale INV-0901`, date: `${YEAR}-09-05`, lines: [['1100', '1200000', ''], ['4000', '', '1200000']] },
  { description: `UAT ${YEAR}-09 stock purchase PO-0902`, date: `${YEAR}-09-08`, lines: [['1200', '600000', ''], ['2000', '', '600000']] },
  { description: `UAT ${YEAR}-09 office rent`, date: `${YEAR}-09-01`, lines: [['6100', '200000', ''], ['1000', '', '200000']] },
  { description: `UAT ${YEAR}-09 payroll`, date: `${YEAR}-09-30`, lines: [['6000', '750000', ''], ['1000', '', '750000']] },
  { description: `UAT ${YEAR}-09 depreciation`, date: `${YEAR}-09-30`, lines: [['6300', '33333', ''], ['1590', '', '33333']] },
];

async function person(browser: Browser, origin: string, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: origin, viewport: { width: 1300, height: 900 } })).newPage();
  await signInToUat(page, origin, user);
  page.on('dialog', (dialog) => void dialog.accept());
  return page;
}

async function openTab(page: Page, tab: string) {
  await page.goto('/finance');
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** A JSON call from the page, as the signed-in user (the same calls the Finance page makes). */
async function api<T>(page: Page, path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, {
        method: init?.method ?? 'GET',
        headers: { Accept: 'application/json', ...(init ? { 'Content-Type': 'application/json' } : {}) },
        ...(init ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${path}: ${response.status} ${text.slice(0, 300)}`);
      return JSON.parse(text);
    },
    { path, init },
  ) as Promise<T>;
}

async function save(form: Locator) {
  // The floating Softphone button can sit over Save; submitting the form is exactly what Save does.
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  await expect(async () => {
    if (await form.getByText('Not saved').count()) throw new Error(`Not saved: ${await form.innerText()}`);
    await expect(form).toHaveCount(0);
  }).toPass({ timeout: 15000 });
}

async function pick(form: Locator, label: string, fieldKey: string, search: string, shown: string) {
  await form.getByLabel(`Search ${label}`, { exact: true }).fill(search);
  const select = form.locator(`#field-${fieldKey}`);
  const option = select.locator('option', { hasText: shown }).first();
  await expect(option).toHaveCount(1, { timeout: 10000 });
  await select.selectOption({ label: (await option.textContent()) ?? shown });
}

/** Opens the journal draft with this description from the Journal entry list; false when there is none. */
async function openDraft(page: Page, description: string): Promise<boolean> {
  await openTab(page, 'Journal entry');
  const search = page.getByLabel('Search Journal entry', { exact: true });
  await search.fill(description);
  await search.press('Enter');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
  const row = page.getByRole('row').filter({ hasText: description }).first();
  if ((await row.count()) === 0) return false;
  await row.click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  return true;
}

/** The open draft's status, from its Status field's chosen value (every status is also an option of that field). */
async function draftStatus(page: Page): Promise<string> {
  const value = await page.locator('#field-status').inputValue({ timeout: 10000 });
  return ({ DRAFT: 'Draft', SUBMITTED: 'Submitted for approval', POSTED: 'Posted' } as Record<string, string>)[value] ?? value;
}

/** Runs a record action; answers the notice shown after it. */
async function act(page: Page, action: string, reason?: string): Promise<string> {
  await page.getByRole('button', { name: action, exact: true }).click();
  if (reason !== undefined) {
    const form = page.getByRole('form', { name: action });
    await form.getByLabel(/Reason/).fill(reason);
    await form.getByRole('button', { name: action, exact: true }).click();
  }
  const notice = page.getByText(new RegExp(`^${action}: done\\.$|submitted a journal cannot approve|does not balance|locked|changed by someone else`)).first();
  await expect(notice).toBeVisible({ timeout: 20000 });
  return (await notice.textContent()) ?? '';
}

test.describe('UAT general ledger', () => {
  test.skip(!uatAdmin.email || !uatApprover.email, 'Set the UAT admin and approver logins (run e2e/run-uat-walkthrough.sh).');
  test.describe.configure({ timeout: 15 * 60 * 1000 });

  test('a book, a month of journals approved by a second person, and the reports', async ({ browser, baseURL }, testInfo) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    const maker = await person(browser, origin, uatAdmin);
    const checker = await person(browser, origin, uatApprover);

    // 1. The organization the book belongs to, then the book from the set-up panel.
    await maker.goto('/finance');
    const parties = await api<{ items: { id: string; code: string }[] }>(maker, `/api/control/parties?partyType=ORGANIZATION&search=${PARTY}`);
    if (!parties.items.some((party) => party.code === PARTY)) {
      await api(maker, '/api/control/parties', { method: 'POST', body: { code: PARTY, legalName: 'GigaLibs UAT Trading Ltd', displayName: 'UAT Trading', partyType: 'ORGANIZATION' } });
    }
    const books = await api<{ bookCode: string }[]>(maker, '/api/financial-operations/v1/books');
    if (!books.some((book) => book.bookCode === BOOK)) {
      await openTab(maker, 'Set up a book');
      const setUp = maker.getByRole('form', { name: 'Set up a book' });
      const party = setUp.locator('#setup-party option', { hasText: PARTY }).first();
      await expect(party).toHaveCount(1, { timeout: 10000 });
      await setUp.locator('#setup-party').selectOption({ label: (await party.textContent()) ?? PARTY });
      await setUp.locator('#setup-code').fill(BOOK);
      await setUp.locator('#setup-name').fill('UAT general ledger');
      await setUp.locator('#setup-currency').fill('USD');
      await setUp.locator('#setup-year').fill(YEAR);
      await setUp.getByRole('button', { name: 'Set up the book' }).click();
      await expect(maker.getByText(/^Starter chart: /)).toBeVisible({ timeout: 60000 });
      await expect(maker.locator('ul[aria-live="polite"] li.text-ui-fg-error'), 'a set-up step was refused').toHaveCount(0);
    }
    // A book whose set-up stopped part-way (no periods for the year, or missing accounts) is completed from the panel.
    const ledger = (await api<{ id: string; bookCode: string }[]>(maker, '/api/financial-operations/v1/books')).find((entry) => entry.bookCode === BOOK)!;
    const periods = await api<{ startDate: string }[]>(maker, `/api/financial-operations/v1/fiscal-periods?bookId=${ledger.id}`);
    const accounts = await api<unknown[]>(maker, `/api/financial-operations/v1/accounts?bookId=${ledger.id}`);
    const hasYear = periods.some((period) => period.startDate.startsWith(`${YEAR}-09`));
    if (!hasYear || accounts.length < 22) {
      await openTab(maker, 'Set up a book');
      const complete = maker.getByRole('form', { name: 'Add a fiscal year' });
      const option = complete.locator('#year-book option', { hasText: `${BOOK} — ` }).first();
      await complete.locator('#year-book').selectOption({ label: (await option.textContent()) ?? BOOK });
      await complete.locator('#year-year').fill(YEAR);
      await complete.getByRole('checkbox').check();
      await complete.getByRole('button', { name: 'Add the year' }).click();
      await expect(maker.getByText(/^Starter chart: /)).toBeVisible({ timeout: 60000 });
      if (!hasYear) await expect(maker.getByText(`Fiscal year ${YEAR} created with twelve open monthly periods.`)).toBeVisible();
      else await expect(maker.locator('ul[aria-live="polite"] li.text-ui-fg-error').filter({ hasNotText: /^Fiscal year / })).toHaveCount(0);
    }
    await openTab(maker, 'Books');
    await expect(maker.getByRole('row').filter({ hasText: BOOK })).toHaveCount(1);

    // 2. Each journal: drafted, lined and submitted by uat.admin.
    for (const journal of JOURNALS) {
      if (!(await openDraft(maker, journal.description))) {
        await openTab(maker, 'Journal entry');
        await maker.getByRole('button', { name: 'New', exact: true }).click();
        const form = maker.locator('form').filter({ has: maker.getByRole('heading', { name: 'New Journal', exact: true }) });
        await pick(form, 'Book', 'accounting-book-id', BOOK, `${BOOK} — `);
        await form.locator('#field-posting-date').fill(journal.date);
        if (journal.kind) await form.locator('#field-entry-type').selectOption(journal.kind);
        await form.locator('#field-description').fill(journal.description);
        await save(form);
        expect(await openDraft(maker, journal.description)).toBe(true);
      }
      if ((await draftStatus(maker)) !== 'Draft') continue;
      await maker.getByRole('tab', { name: 'Lines', exact: true }).click();
      await maker.waitForLoadState('networkidle').catch(() => undefined);
      await maker.waitForTimeout(500);
      if ((await maker.getByRole('row').count()) <= 1) {
        for (const [account, debit, credit] of journal.lines) {
          await maker.getByRole('button', { name: 'New Lines', exact: true }).click();
          const line = maker.locator('form').filter({ has: maker.getByRole('heading', { name: 'New Lines', exact: true }) });
          await pick(line, 'Account', 'account-id', account, `· ${BOOK}`);
          if (debit) await line.locator('#field-debit-amount-minor').fill(debit);
          if (credit) await line.locator('#field-credit-amount-minor').fill(credit);
          await save(line);
        }
      }
      expect(await act(maker, 'Submit for approval')).toBe('Submit for approval: done.');
    }

    // 3. uat.admin may not approve their own journal.
    expect(await openDraft(maker, JOURNALS[1]!.description)).toBe(true);
    if ((await draftStatus(maker)) === 'Submitted for approval') {
      expect(await act(maker, 'Approve and post', 'My own journal')).toMatch(/cannot approve/);
    }

    // 4. uat.approver approves and posts each one.
    for (const journal of JOURNALS) {
      expect(await openDraft(checker, journal.description)).toBe(true);
      if ((await draftStatus(checker)) !== 'Submitted for approval') continue;
      expect(await act(checker, 'Approve and post', 'Checked against the source document')).toBe('Approve and post: done.');
    }
    await openTab(checker, 'Posted journals');
    for (const journal of JOURNALS) await expect(checker.getByRole('row').filter({ hasText: journal.description }).first()).toBeVisible();

    // 5. The reports, from posted journals only.
    await openTab(maker, 'Reports');
    const reports = maker.getByRole('form', { name: 'Run a report' });
    const book = reports.locator('#report-book option', { hasText: `${BOOK} — ` }).first();
    await reports.locator('#report-book').selectOption({ label: (await book.textContent()) ?? BOOK });
    for (const [kind, label] of [['tb', 'Trial balance'], ['is', 'Income statement'], ['bs', 'Balance sheet']] as const) {
      await reports.locator('#report-kind').selectOption(kind);
      if (kind === 'is') await reports.locator('#report-from').fill(`${YEAR}-09-01`);
      await reports.locator('#report-to').fill(`${YEAR}-09-30`);
      await reports.getByRole('button', { name: 'Run report' }).click();
      if (kind === 'is') await expect(maker.getByText('Net income', { exact: true })).toBeVisible({ timeout: 15000 });
      else await expect(maker.getByText('Balanced', { exact: true })).toBeVisible({ timeout: 15000 });
      await testInfo.attach(label, { body: await maker.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });
});
