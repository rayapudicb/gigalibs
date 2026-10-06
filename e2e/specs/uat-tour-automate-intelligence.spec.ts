/**
 * A guided tour, in a visible browser, of the "Automate & Run" and "Intelligence" screens and Value and Data Contracts:
 * each screen is opened and a caption at the top says what it is, what feeds it, and its state in this UAT instance.
 * It only opens screens; it changes nothing. WI-OI-120k (QF1): asked for by the owner to see how these areas work.
 */
import { test, type Page } from '@playwright/test';
// Run it visible and slow: bash e2e/run-uat-walkthrough.sh --tour (or add --headed with UAT_SLOWMO=250).
import { hasUatLogin, signInToUat } from './uat-session';

const STEPS: { route: string; title: string; text: string }[] = [
  { route: '/runs', title: 'Automate & Run → Execution Telemetry',
    text: 'Every workflow run: what started it, each step, and its outcome. Empty here because runs are started from Workflow Studio, which is not deployed in this UAT instance yet (U29).' },
  { route: '/exceptions', title: 'Automate & Run → Exceptions & Quarantine',
    text: 'Records or run steps that failed a rule wait here for a person to fix, release or discard. It fills when workflows run.' },
  { route: '/actions', title: 'Automate & Run → Approval Queues',
    text: 'Run steps that need a person’s approval (maker-checker). It fills when workflows reach an approval step.' },
  { route: '/workflows', title: 'Workflow Studio (where runs come from)',
    text: 'Design workflows and start them. Today it is refused: the permission/module is not set for this tenant and its service is not deployed (U29). This is why Automate & Run is empty.' },
  { route: '/value', title: 'Value',
    text: 'Measured benefit, for example minutes saved by automation, from outcome definitions and published formulas (the forms below). It works; there are no value events yet.' },
  { route: '/analytics', title: 'Intelligence → Operational Intelligence & KPIs',
    text: 'Cross-module KPIs (AR, spend, FX, recovery). They show “Unavailable — no certified dataset” on purpose: the figures wait for certified analytical data (WI-OI-043) instead of showing invented numbers.' },
  { route: '/analytics/explore', title: 'Intelligence → Explore',
    text: 'Ad-hoc questions over the analytics sources that are connected. It works; results depend on connected sources.' },
  { route: '/data-contracts', title: 'Data Contracts',
    text: 'Schema contracts between modules: drift, field mappings, lineage. The page draws, but its data comes from the Data Studio service, which is not deployed in this UAT instance (U29), so its lists cannot load.' },
];

async function caption(page: Page, index: number, step: (typeof STEPS)[number]) {
  await page.evaluate(({ title, text, at, of }) => {
    document.getElementById('uat-tour')?.remove();
    const box = document.createElement('div');
    box.id = 'uat-tour';
    box.setAttribute('style', 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:760px;padding:14px 18px;border-radius:12px;background:#111827;color:#f9fafb;font:15px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)');
    box.innerHTML = `<div style="font-size:12px;opacity:.7">Tour ${at} of ${of}</div><div style="font-weight:700;margin:2px 0 6px">${title}</div><div>${text}</div>`;
    document.body.appendChild(box);
  }, { title: step.title, text: step.text, at: index + 1, of: STEPS.length });
}

test.use({ launchOptions: { slowMo: Number(process.env.UAT_SLOWMO ?? 0) }, viewport: { width: 1400, height: 860 } });
const pause = Number(process.env.UAT_TOUR_PAUSE_MS ?? 9000);

test('Automate & Run, Intelligence, Value and Data Contracts', async ({ page, baseURL }) => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD.');
  await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
  for (const [index, step] of STEPS.entries()) {
    await page.goto(step.route);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await caption(page, index, step);
    await page.waitForTimeout(pause);
  }
});
