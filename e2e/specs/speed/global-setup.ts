import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { labAccounts, labOrigin } from './lab';

// Signs in once through the real sign-in page as the lab's SPEED administrator and keeps the session for every spec.
export default async function globalSetup(): Promise<void> {
  const origin = labOrigin();
  const account = labAccounts();
  process.env.SPEED_E2E_RUN ??= String(Date.now()).slice(-6);
  mkdirSync('test-results/speed-lab', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${origin}/login`);
  await page.fill('input[type="email"], input[name="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await page.context().storageState({ path: 'test-results/speed-lab/session.json' });
  await browser.close();
}
