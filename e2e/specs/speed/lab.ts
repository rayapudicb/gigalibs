import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Locator, type Page, expect } from '@playwright/test';

// WI-OI-120ce: the speed-lab copy's address and accounts, read from its own env files (never printed), and the steps
// every SPEED spec shares. Refuses to run against anything but speed-lab.

const composeDir = join(__dirname, '../../../infra/compose');

function env(file: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(composeDir, file), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).replace(/^"(.*)"$/, '$1')];
      }),
  );
}

export function labAccounts() {
  const accounts = env('.env.speed-lab.accounts');
  const base = env('.env.speed-lab');
  if (accounts.SPEED_LAB_TARGET !== 'speed-lab' || base.ENVIRONMENT_KEY !== 'speed-lab-preview')
    throw new Error('The SPEED suite runs only against the speed-lab copy.');
  return {
    workspace: accounts.SPEED_LAB_WORKSPACE as string,
    email: accounts.SPEED_LAB_ADMIN_EMAIL as string,
    password: accounts.SPEED_LAB_ADMIN_PASSWORD as string,
  };
}

export function labOrigin(): string {
  const base = env('.env.speed-lab');
  const origin = base.PUBLIC_ORIGIN as string;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || origin.endsWith(':5180'))
    throw new Error('The SPEED suite runs only against the speed-lab copy.');
  labAccounts();
  return origin;
}

/** A tag that makes this run's records unique, so the suite can run again on the same lab data. */
export const RUN = process.env.SPEED_E2E_RUN ?? String(Date.now()).slice(-6);

/** This run's records, shared by the specs that build on each other (project, substances, route). */
export const PROJECT_CODE = `E2E-${RUN}`;
export const PROJECT_NAME = `Pyrimidine methanol intermediate ${RUN}`;
export const ROUTE_NAME = `Pyrimidine methanol route A ${RUN}`;
export const SUBSTANCE = {
  aldehyde: `4-Fluorobenzaldehyde ${RUN}`,
  ester: `Methyl isobutyrylacetate ${RUN}`,
  enone: `Enone P1 ${RUN}`,
  water: `Water ${RUN}`,
  permanganate: `Potassium permanganate ${RUN}`,
  acetone: `Acetone ${RUN}`,
};

/** Opens a SPEED page and waits until it has settled. */
export async function openSpeed(page: Page, section: string): Promise<void> {
  await page.goto(`/speed/${section}`);
  await page.waitForLoadState('networkidle');
}

/** A searchable field (the window's combobox) by its label. */
export function picker(page: Page, label: RegExp): Locator {
  return page.getByRole('combobox', { name: label }).first();
}

/** The options of a searchable field's own list (never another control's). */
export async function pickerOptions(page: Page, field: Locator): Promise<Locator> {
  const list = await field.getAttribute('aria-controls');
  return page.locator(`[id="${list}"]`).getByRole('option');
}

/** Chooses an option in a searchable field, by typing and clicking the option in its own list. */
export async function choose(page: Page, field: Locator, search: string, option: string | RegExp): Promise<void> {
  await field.click();
  await field.fill(search);
  const item = (await pickerOptions(page, field)).filter({ hasText: option }).first();
  await expect(item).toBeVisible();
  await item.click();
}

/** Types text one key at a time, as a person does (catches fields that alter text while it is typed). */
export async function typeLikeAPerson(field: Locator, text: string): Promise<void> {
  await field.click();
  await field.fill('');
  await field.pressSequentially(text, { delay: 15 });
}

/** Collects every failed response (status ≥ 400) the page sees, for a step's evidence. */
export function failedResponses(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
  });
  return failures;
}
