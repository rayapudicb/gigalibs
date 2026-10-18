/**
 * WI-OI-120m: the tenant-to-value discovery journey, as a new customer would live it, on screen, as five people.
 *
 * A new customer administrator signs up and creates a workspace; builds the organization (unit types, sites, the
 * structure and access); invites a site supervisor, a technician, an approver and an auditor, who each sign up in
 * their own browser and accept with the one-time link; adds workers in Workforce; then runs maintenance in CMMS
 * (sites, an asset, a request, a work order assigned, started, completed and closed), with every step tried by the
 * right role and, where it matters, a wrong one. The recorder notes bugs, data flow, UX, layout and accessibility
 * findings at every step; the journey carries on past a blocked step where it can and says what it could not reach.
 *
 * Writes only inside the workspace it creates (sign-ups `journey.<role>.<run>@gigalibs.test`). The password comes from
 * E2E_JOURNEY_PASSWORD (its own, not the admin's) and is never written anywhere. Board: test-results/journey/.
 */
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { join } from 'node:path';
import { JourneyRecorder } from './journey-recorder';

const RUN = Date.now().toString(36).slice(-6);
const PASSWORD = process.env.E2E_JOURNEY_PASSWORD ?? '';
const WORKSPACE = `Journey Works ${RUN}`;
/** WI-OI-120u: the technician's day off, a weekday about two weeks ahead. */
const DAY_OFF = (() => {
  const day = new Date(Date.now() + 14 * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
})();
const SLUG = `journey-${RUN}`;
const OUT = process.env.JOURNEY_OUT ?? join(__dirname, '..', 'test-results', 'journey');

interface Persona {
  readonly key: string;
  readonly name: string;
  readonly role: string;
  readonly email: string;
  page?: Page;
  invite?: string;
}

const people: Record<string, Persona> = Object.fromEntries(
  [
    ['admin', 'Ada Admin', 'TENANT_ADMIN'],
    ['supervisor', 'Sam Supervisor', 'MANAGER'],
    ['technician', 'Tia Technician', 'MEMBER'],
    ['approver', 'Abe Approver', 'MANAGER'],
    ['auditor', 'Aud Auditor', 'VIEWER'],
  ].map(([key, name, role]) => [key, { key: key!, name: `${name} ${RUN}`, role: role!, email: `journey.${key}.${RUN}@gigalibs.test` }]),
);

test.describe.configure({ mode: 'serial', timeout: 40 * 60 * 1000 });
// A stuck control fails its step after 15 s (recorded as a blocker) instead of holding the journey for its whole limit.
test.use({ video: process.env.UAT_VIDEO === 'on' ? 'on' : 'retain-on-failure', actionTimeout: 15000, navigationTimeout: 30000 });

// ─── Screen helpers: as a person would use the screens, with what goes wrong recorded, not hidden ──────────────────

async function newPerson(browser: Browser, baseURL: string, recorder: JourneyRecorder, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', (dialog) => void dialog.accept());
  recorder.attach(page, `${persona.key} (${persona.role})`);
  persona.page = page;
  return page;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

/**
 * Clicks the first visible button, link or tab whose name matches; answers false when there is none. WI-OI-120ao
 * (journey 8cho6n): a control can appear a moment after the previous answer (for example "Clock out" once "Clock in"
 * is recorded), and `settle` cannot see that wait in a page already idle once, so a missing control is waited for
 * briefly, as a person would, before it counts as missing.
 */
async function press(scope: Page | Locator, name: RegExp, waitMs = 5000): Promise<boolean> {
  const find = async (): Promise<Locator | null> => {
    for (const role of ['button', 'link', 'tab'] as const) {
      const control = scope.getByRole(role, { name }).filter({ visible: true }).first();
      if (await control.count()) return control;
    }
    return null;
  };
  let control = await find();
  if (!control && waitMs > 0) {
    await scope
      .getByRole('button', { name })
      .or(scope.getByRole('link', { name }))
      .or(scope.getByRole('tab', { name }))
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible', timeout: waitMs })
      .catch(() => undefined);
    control = await find();
  }
  if (!control) return false;
  await control.click({ timeout: 8000 });
  return true;
}

/** The label a person sees for a control. */
async function labelOf(control: Locator): Promise<string> {
  return control.evaluate((element) => {
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    const id = element.id;
    const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
    if (forLabel) return forLabel;
    const wrapping = element.closest('label')?.textContent;
    if (wrapping) return wrapping;
    return element.getAttribute('placeholder') ?? element.getAttribute('name') ?? '';
  });
}

/**
 * Fills a form as a person would: controls whose label matches a key get that value; any other required, empty
 * control gets a plausible value. Select values match option text. Answers what was filled.
 */
async function fill(form: Locator, values: ReadonlyArray<[RegExp, string]>): Promise<string[]> {
  const filled: string[] = [];
  // By role, as a person (or a screen reader) finds them: styled checkboxes are buttons with role=checkbox beside a
  // hidden native input that takes no clicks; ticking that input timed out (2026-10-06, Unit types).
  const boxes = form.getByRole('checkbox');
  for (let index = 0; index < (await boxes.count()); index += 1) {
    const box = boxes.nth(index);
    if (!(await box.isVisible()) || !(await box.isEnabled())) continue;
    const label = (await labelOf(box)).replace(/\s+/g, ' ').trim();
    if (values.some(([pattern, value]) => value === 'check' && pattern.test(label)) && !(await box.isChecked())) {
      await box.check();
      filled.push(`${label}=checked`);
    }
  }
  const controls = form.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea');
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
    const label = (await labelOf(control)).replace(/\s+/g, ' ').trim();
    const tag = await control.evaluate((element) => element.tagName);
    const type = (await control.getAttribute('type')) ?? '';
    const required = (await control.getAttribute('required')) !== null || /\*/.test(label);
    const match = values.find(([pattern]) => pattern.test(label));
    if (tag === 'SELECT') {
      const options = (await control.locator('option').allTextContents()).map((text) => text.trim());
      const wanted = match ? options.find((option) => option.toLowerCase().includes(match[1].toLowerCase())) : undefined;
      const current = await control.inputValue();
      if (wanted) await control.selectOption({ label: wanted });
      else if (!current && required) {
        const first = options.find((option) => option && !/^(select|choose|none|no |all |any )/i.test(option));
        if (first) await control.selectOption({ label: first });
      } else continue;
      filled.push(`${label}=${await control.inputValue()}`);
      continue;
    }
    if ((await control.inputValue()) && !match) continue;
    let value = match?.[1];
    if (!value && !required) continue;
    if (!value) {
      value =
        type === 'email' ? `journey.extra.${RUN}@gigalibs.test`
        : type === 'number' ? '1'
        : type === 'date' ? new Date().toISOString().slice(0, 10)
        : type === 'datetime-local' ? new Date().toISOString().slice(0, 16)
        : type === 'time' ? '09:00'
        : `${label.split(' ')[0] || 'Value'} ${RUN}`;
    }
    await control.fill(value);
    filled.push(`${label}=${value}`);
    // A metadata window's picker is a search box and a list; the list fills once the search has answered (WI-OI-120u).
    if (/^search /i.test(label)) await settle(form.page());
  }
  return filled;
}

/** The form or dialog that opened last. */
function lastForm(page: Page): Locator {
  return page.locator('[role=dialog] form, [role=dialog], form').filter({ visible: true }).last();
}

/** Marks the visible forms, so the one a button opens can be told apart from forms already on the page. */
async function markForms(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('form, [role=dialog]').forEach((element) => element.setAttribute('data-journey-seen', '1')));
}

/**
 * The form a button just opened: a new dialog or form, else the last visible one. It is pinned with its own marker:
 * a query for "the first unseen form" can move to another form that appears later (2026-10-06, Unit types).
 */
async function openedForm(page: Page): Promise<Locator> {
  const fresh = page.locator('[role=dialog]:not([data-journey-seen]), form:not([data-journey-seen])').filter({ visible: true });
  return pin(page, (await fresh.count()) ? fresh.first() : await lastForm(page));
}

let pinned = 0;
async function pin(page: Page, form: Locator): Promise<Locator> {
  pinned += 1;
  const id = `form-${pinned}`;
  await form.evaluate((element, value) => element.setAttribute('data-journey-form', value), id);
  return page.locator(`[data-journey-form="${id}"]`);
}

/**
 * Submits a form with its own button, as a person would. A button hidden under another element is recorded and the
 * form is then submitted directly so the journey can carry on. Answers any error message the form shows.
 */
async function submit(page: Page, form: Locator, recorder: JourneyRecorder, button: RegExp = /^(save|create|submit|register|add|send|invite|confirm|grant|place|start)/i): Promise<string> {
  const control = form.getByRole('button', { name: button }).filter({ visible: true }).last();
  if (await control.count()) {
    try {
      await control.click({ timeout: 5000 });
    } catch {
      recorder.add('LAYOUT', 'A form button could not be clicked (covered or off screen)', `${await control.textContent()}`, page);
      await form.evaluate((element) => (element instanceof HTMLFormElement ? element.requestSubmit() : element.querySelector('form')?.requestSubmit()));
    }
  } else {
    recorder.add('UX', 'A form without a visible submit button', (await form.textContent())?.slice(0, 80) ?? '', page);
    await form.evaluate((element) => (element instanceof HTMLFormElement ? element.requestSubmit() : element.querySelector('form')?.requestSubmit()));
  }
  await settle(page);
  const error = page.locator('[role=alert], .text-ui-fg-error, [class*="error"]').filter({ visible: true }).filter({ hasText: /\w/ });
  return (await error.count()) ? ((await error.first().textContent()) ?? '').trim().slice(0, 300) : '';
}

/** Opens a create form with the first matching button, fills it and submits it; throws with the screen's message on failure. */
async function create(page: Page, recorder: JourneyRecorder, opener: RegExp, values: ReadonlyArray<[RegExp, string]>, button?: RegExp): Promise<string> {
  // A page with nothing in it yet may show its form already (Unit types does); pressing the opener would close it.
  // Use the open form when it has the first field; whether it is open depends on load timing (2026-10-06).
  const alreadyOpen = page.locator('form').filter({ visible: true }).filter({ has: page.getByLabel(values[0]![0]) });
  let form: Locator;
  if (values.length > 0 && (await alreadyOpen.count()) === 1) {
    form = await pin(page, alreadyOpen.first());
  } else {
    await markForms(page);
    if (!(await press(page, opener))) throw new Error(`No "${opener.source}" control on ${new URL(page.url()).pathname}`);
    await settle(page);
    form = await openedForm(page);
  }
  const filled = await fill(form, values);
  const before = recorder.failedWrites(page).length;
  const error = await submit(page, form, recorder, button);
  const refused = recorder.failedWrites(page).slice(before);
  if (refused.length) throw new Error(`The server refused the save: ${refused.map((call) => `${call.method} ${call.path.split('?')[0]} ${call.status} ${call.message}`).join('; ')}${error ? ` (screen: ${error})` : ''}`);
  if (error) throw new Error(`Refused: ${error} (filled ${filled.join(', ')})`);
  return `filled ${filled.join(', ')}`;
}

/** After a reload, is this text still on the page? A save that does not survive a reload is a data-flow finding. */
async function survivesReload(page: Page, recorder: JourneyRecorder, text: string, what: string, reopen?: () => Promise<void>): Promise<boolean> {
  await page.reload();
  await settle(page);
  let found = (await page.getByText(text, { exact: false }).count()) > 0;
  if (!found && reopen) {
    // A reload that returns to the first tab is a usability finding, not lost data: go back and look again.
    recorder.add('UX', 'A reload loses the tab you were on', `after reloading ${new URL(page.url()).pathname} the page opened on its first tab`, page);
    await reopen();
    await settle(page);
    found = (await page.getByText(text, { exact: false }).count()) > 0;
  }
  if (!found) recorder.add('DATA FLOW', `${what} is not shown after a reload`, `looked for "${text}"`, page);
  return found;
}

/** The workspace role each person is given on Settings → Team (WI-OI-120n module roles). */
// WI-OI-120w (R2 slice 2a): a person may hold several roles; the technician repairs and clocks in.
const MODULE_ROLE: Readonly<Record<string, readonly string[]>> = {
  supervisor: ['Maintenance planner'],
  technician: ['Maintenance technician', 'Workforce member'],
  approver: ['Workforce supervisor'],
  auditor: ['Maintenance viewer'],
};

/** Back into the workspace: signs in again when a role change ended the session, and records that it did. */
async function ensureSignedIn(page: Page, persona: Persona, recorder: JourneyRecorder): Promise<void> {
  await page.goto('/modules');
  await settle(page);
  if (new URL(page.url()).pathname.startsWith('/login')) {
    recorder.add('UX', 'A role change signs the person out', 'they must sign in again before the new role applies', page);
    await page.locator('#email').fill(persona.email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
    await settle(page);
  }
  if (new URL(page.url()).pathname.startsWith('/select-tenant')) {
    await page.getByRole('button', { name: new RegExp(WORKSPACE) }).or(page.getByRole('link', { name: new RegExp(WORKSPACE) })).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/select-tenant'), { timeout: 20000 });
    await settle(page);
  }
}

/** The left menu as a person sees it: what is offered to this role. */
async function menu(page: Page): Promise<string[]> {
  return (await page.locator('nav a').filter({ visible: true }).allTextContents()).map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ─── The journey ────────────────────────────────────────────────────────────────────────────────────────────────

test('a new customer from sign-up to maintenance work, as five people', async ({ browser, baseURL }, testInfo) => {
  test.skip(!PASSWORD, 'Set E2E_JOURNEY_PASSWORD for the new sign-ups; it is never stored.');
  const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
  const recorder = new JourneyRecorder(OUT, RUN, testInfo);
  const write = () => recorder.write({ origin, workspace: `${WORKSPACE} (${SLUG})`, when: new Date().toISOString() });
  const admin = await newPerson(browser, origin, recorder, people.admin!);

  try {
    // 1. Sign-up and workspace.
    const S1 = '1. Sign-up and workspace';
    await recorder.do(S1, 'Sign up as the customer administrator', admin, async () => {
      await admin.goto('/register');
      await admin.locator('#name').fill(people.admin!.name);
      await admin.locator('#email').fill(people.admin!.email);
      await admin.locator('#password').fill(PASSWORD);
      await admin.getByRole('button', { name: /create account/i }).click();
      await admin.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 15000 });
      return `landed on ${new URL(admin.url()).pathname}`;
    });
    const hasWorkspace = await recorder.do(S1, 'Create the workspace', admin, async () => {
      if (!new URL(admin.url()).pathname.startsWith('/select-tenant')) await admin.goto('/select-tenant');
      await settle(admin);
      await press(admin, /create (new )?workspace/i);
      await admin.locator('#ws-name').fill(WORKSPACE);
      await admin.locator('#ws-slug').fill(SLUG);
      await admin.getByRole('button', { name: /^create workspace$/i }).last().click();
      await admin.waitForURL((url) => !url.pathname.startsWith('/select-tenant'), { timeout: 20000 });
      await settle(admin);
      return `landed on ${new URL(admin.url()).pathname}`;
    });
    if (!hasWorkspace) throw new Error('No workspace: nothing else can be reached.');
    await recorder.do(S1, 'First screen and menu a new customer sees', admin, async () => {
      const items = await menu(admin);
      if (items.length === 0) recorder.add('UX', 'A new customer sees no menu', '', admin);
      return `${items.length} menu items: ${items.join(', ').slice(0, 600)}`;
    });
    await recorder.do(S1, 'Modules the trial switched on', admin, async () => {
      await admin.goto('/modules');
      await settle(admin);
      return `page heading: ${(await admin.locator('h1').first().textContent())?.trim() ?? ''}`;
    });

    // 2. Workspace settings and the organization.
    const S2 = '2. Settings and organization';
    for (const tab of ['Team', 'Organization', 'Plan & Entitlements', 'General & Localization', 'Security & SSO']) {
      await recorder.do(S2, `Settings: ${tab}`, admin, async () => {
        await admin.goto('/settings');
        await settle(admin);
        if (!(await press(admin, new RegExp(tab.replace(/[&]/g, '.'), 'i')))) throw new Error(`No "${tab}" tab`);
        await settle(admin);
      });
    }
    await recorder.do(S2, 'Unit types: Site and Area', admin, async () => {
      await admin.goto('/settings');
      await settle(admin);
      await press(admin, /organization/i);
      await settle(admin);
      await press(admin, /^unit types$/i);
      await settle(admin);
      const notes: string[] = [];
      for (const [code, name] of [['SITE', 'Site'], ['AREA', 'Area']]) {
        await settle(admin);
        // A Site sits at the top; an Area sits under a Site, a checkbox labelled with the parent type's code.
        notes.push(await create(admin, recorder, /add unit type/i, [[/code/i, code!], [/^name|name$/i, name!], [/description/i, `${name} (journey ${RUN})`], [/top|root/i, code === 'SITE' ? 'check' : ''], [/^SITE$/, code === 'AREA' ? 'check' : '']]));
        await settle(admin);
      }
      return notes.join(' · ');
    });
    await recorder.do(S2, 'Units: two sites and an area', admin, async () => {
      await press(admin, /^units$/i);
      await settle(admin);
      const notes: string[] = [];
      for (const [type, code, name, parent] of [
        ['Site', `N${RUN}`, `North plant ${RUN}`, ''],
        ['Site', `S${RUN}`, `South plant ${RUN}`, ''],
        ['Area', `NW${RUN}`, `North workshop ${RUN}`, `North plant ${RUN}`],
      ] as const) {
        notes.push(await create(admin, recorder, /add unit/i, [[/type/i, type], [/code/i, code], [/^name|name$/i, name], ...(parent ? ([[/parent|under/i, parent]] as [RegExp, string][]) : [])]));
      }
      await survivesReload(admin, recorder, `North plant ${RUN}`, 'A new organization unit', async () => {
        await press(admin, /organization/i);
        await settle(admin);
        await press(admin, /^units$/i);
      });
      return notes.join(' · ');
    });
    await recorder.do(S2, 'Structure: the primary tree, a draft and placing units', admin, async () => {
      await admin.goto('/settings');
      await settle(admin);
      await press(admin, /organization/i);
      await settle(admin);
      await press(admin, /^structure$/i);
      await settle(admin);
      const notes: string[] = [];
      await markForms(admin);
      if (await press(admin, /create the primary tree/i)) {
        await settle(admin);
        // The primary tree may be created in one step (no form) or through a short form.
        if (await admin.locator('[role=dialog] form, [role=dialog], form').filter({ visible: true }).count()) {
          const form = await openedForm(admin);
          await fill(form, [[/code/i, `MAIN${RUN}`], [/name/i, `Main structure ${RUN}`]]);
          const error = await submit(admin, form, recorder, /^create$/i);
          notes.push(error ? `tree refused: ${error}` : 'tree created');
        } else {
          notes.push('tree created in one step');
        }
      }
      if (await press(admin, /start a draft/i)) {
        await settle(admin);
        notes.push('draft started');
      }
      for (const unit of [`North plant ${RUN}`, `South plant ${RUN}`]) {
        await markForms(admin);
        if (!(await press(admin, /place a unit/i))) break;
        await settle(admin);
        const form = await openedForm(admin);
        await fill(form, [[/unit/i, unit]]);
        const error = await submit(admin, form, recorder, /^(place|save|add)/i);
        notes.push(error ? `placing ${unit} refused: ${error}` : `${unit} placed`);
      }
      for (const name of [/preview impact/i, /^validate$/i]) {
        if (await press(admin, name)) {
          await settle(admin);
          notes.push(`${name.source} pressed`);
        }
      }
      // WI-OI-120ax: Submit records a reason, so it must wait for one; the journey then gives one, as a person would.
      const submitStep = admin.getByRole('button', { name: /^submit/i }).filter({ visible: true }).first();
      if (await submitStep.count()) {
        if (await submitStep.isEnabled()) {
          recorder.add('BUG', 'Submit is offered before a reason is given', 'the server refuses a structure step without a reason', admin);
        }
        await admin.getByLabel(/^reason$/i).filter({ visible: true }).first().fill(`Journey ${RUN}: first structure for review`);
        if (await press(admin, /^submit/i)) {
          await settle(admin);
          const done = admin.getByRole('status').filter({ hasText: /submitted for approval/i });
          const refused = admin.getByRole('alert').filter({ visible: true });
          notes.push(
            (await done.count())
              ? 'submitted for approval'
              : `submit refused: ${(await refused.first().innerText().catch(() => 'no message shown')).replace(/\s+/g, ' ').slice(0, 160)}`,
          );
        }
      }
      return notes.length ? notes.join(' · ') : 'PARTIAL: no structure controls were offered';
    });

    // 3. People: invitations, sign-ups and acceptance, each in their own browser.
    const S3 = '3. People and roles';
    for (const persona of [people.supervisor!, people.technician!, people.approver!, people.auditor!]) {
      await recorder.do(S3, `Invite ${persona.name} as ${persona.role}`, admin, async () => {
        await admin.goto('/settings');
        await settle(admin);
        await press(admin, /team/i);
        await settle(admin);
        const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: /create invitation/i }) }).first();
        await form.getByLabel(/email/i).fill(persona.email);
        // The option's value is the role code; its label is the role's name in words (WI-OI-120n).
        await form.getByLabel(/role/i).selectOption(persona.role);
        const error = await submit(admin, form, recorder, /create invitation/i);
        if (error) throw new Error(error);
        const link = admin.getByLabel('One-time invitation link');
        await expect(link).toBeVisible({ timeout: 10000 });
        persona.invite = (await link.inputValue()) || ((await link.textContent()) ?? '');
        return persona.invite ? 'one-time link shown to the administrator' : 'PARTIAL: no link text found';
      });
      if (!persona.invite) continue;
      const invitePath = persona.invite.replace(origin, '');
      const page = await newPerson(browser, origin, recorder, persona);
      // WI-OI-120az: the first invitee takes the usual real path: the link first, signed out, then "Create an account".
      // The others sign up first and then open the link in the same tab.
      const fromLink = persona === people.supervisor;
      await recorder.do(S3, fromLink ? `${persona.name} opens the link signed out, then signs up` : `${persona.name} signs up`, page, async () => {
        if (fromLink) {
          await page.goto(invitePath);
          await settle(page);
          if (!(await press(page, /create an account/i))) {
            recorder.add('UX', 'A signed-out invitee is not offered a way to sign up', 'the invitation page shows no sign-up link', page);
            await page.goto('/register');
          }
          await page.waitForURL((url) => url.pathname.startsWith('/register'), { timeout: 15000 });
        } else {
          await page.goto('/register');
        }
        await page.locator('#name').fill(persona.name);
        await page.locator('#email').fill(persona.email);
        await page.locator('#password').fill(PASSWORD);
        await page.getByRole('button', { name: /create account/i }).click();
        await page.waitForURL((url) => !url.pathname.startsWith('/register'), { timeout: 15000 });
        return fromLink ? `signed up from the invitation link; now on ${new URL(page.url()).pathname}` : 'signed up';
      });
      await recorder.do(S3, `${persona.name} accepts with the one-time link`, page, async () => {
        if (!fromLink || !new URL(page.url()).pathname.startsWith('/select-tenant')) {
          if (fromLink) {
            recorder.add('UX', 'Signing up from the invitation link does not lead back to the invitation', `ended on ${new URL(page.url()).pathname}`, page);
          }
          await page.goto(invitePath);
        }
        await settle(page);
        const token = page.getByLabel('Invitation token');
        if ((await token.count()) && !(await token.inputValue())) {
          recorder.add('UX', 'The invitation link does not fill in its token', 'the person must paste it by hand', page);
          const link = new URL(persona.invite!);
          await token.fill(new URLSearchParams(link.hash.slice(1)).get('invite') ?? link.searchParams.get('invite') ?? '');
        }
        // WI-OI-120ba: before accepting, the person sees which workspace and role the invitation is for.
        const shown = await page
          .locator('output')
          .filter({ hasText: `Join ${WORKSPACE} as` })
          .first()
          .waitFor({ state: 'visible', timeout: 10000 })
          .then(
            () => true,
            () => false,
          );
        if (!shown) recorder.add('UX', 'The invitation does not say what it is for', 'no workspace or role was shown before Accept', page);
        if (!(await press(page, /accept|join/i))) throw new Error('No accept button');
        // Accepting takes the person into the workspace (WI-OI-120n); wait for that, or for the chooser to offer the
        // workspace, before deciding which happened. Reading the address at once raced the move (2026-10-06).
        // The chooser can show the workspace for a moment while the move happens, so only a person still there after
        // the wait is "not taken into the workspace".
        const entered = await page.waitForURL((url) => !url.pathname.startsWith('/select-tenant'), { timeout: 15000 }).then(
          () => true,
          () => false,
        );
        if (!entered) {
          recorder.add('UX', 'After accepting, the person is not taken into the workspace', 'they must find and click the workspace on the chooser', page);
          await page.getByRole('button', { name: new RegExp(WORKSPACE) }).or(page.getByRole('link', { name: new RegExp(WORKSPACE) })).first().click();
        }
        await page.waitForURL((url) => !url.pathname.startsWith('/select-tenant'), { timeout: 20000 });
        await settle(page);
        const items = await menu(page);
        return `in the workspace; menu for ${persona.role}: ${items.join(', ').slice(0, 400)}`;
      });
    }
    await recorder.do(S3, 'Members list shows everyone with their roles', admin, async () => {
      await admin.goto('/settings');
      await settle(admin);
      await press(admin, /team/i);
      await settle(admin);
      const missing = Object.values(people).filter((persona) => persona.key !== 'admin').filter(() => true);
      const text = (await admin.locator('main').textContent()) ?? '';
      const absent = missing.filter((persona) => !text.includes(persona.email) && !text.includes(persona.name));
      if (absent.length) recorder.add('DATA FLOW', 'Invited people who accepted are not in the members list', absent.map((p) => p.email).join(', '), admin);
      return `${missing.length - absent.length} of ${missing.length} invitees listed`;
    });
    for (const persona of [people.supervisor!, people.technician!, people.approver!, people.auditor!]) {
      for (const role of MODULE_ROLE[persona.key]!) {
        await recorder.do(S3, `Give ${persona.name} the role "${role}"`, admin, async () => {
          await admin.goto('/settings');
          await settle(admin);
          await press(admin, /team/i);
          await settle(admin);
          const select = admin.getByLabel(`Add a role for ${persona.email}`);
          const offered = (await select.locator('option').allTextContents()).map((option) => option.trim());
          if (!offered.includes(role)) throw new Error(`"${role}" is not offered on Settings → Team (offered: ${offered.join(', ')})`);
          await select.selectOption({ label: role });
          await admin.getByLabel(`Reason for the role change for ${persona.email}`).fill(`Journey ${RUN}: ${role}`);
          const before = recorder.failedWrites(admin).length;
          await admin.getByRole('row').filter({ hasText: persona.email }).getByRole('button', { name: 'Add role' }).click();
          await settle(admin);
          const refused = recorder.failedWrites(admin).slice(before);
          if (refused.length) throw new Error(`The server refused the role: ${refused.map((call) => `${call.status} ${call.message}`).join('; ')}`);
          await expect(admin.getByRole('list', { name: `Roles of ${persona.email}` })).toContainText(role);
          return `roles: ${(await admin.getByRole('list', { name: `Roles of ${persona.email}` }).innerText()).replace(/×/g, '').replace(/\s+/g, ' ').trim()}`;
        });
      }
      const page = persona.page;
      if (!page) continue;
      await recorder.do(S3, `${persona.name} opens the workspace with the new role`, page, async () => {
        await ensureSignedIn(page, persona, recorder);
        return `menu: ${(await menu(page)).join(', ').slice(0, 400)}`;
      });
    }
    await recorder.do(S3, 'Access: the supervisor manages North plant', admin, async () => {
      await press(admin, /organization/i);
      await settle(admin);
      await press(admin, /^access$/i);
      await settle(admin);
      return create(admin, recorder, /^grant/i, [[/member/i, people.supervisor!.name.split(' ')[0]!], [/unit/i, `North plant ${RUN}`], [/access/i, 'Read and write']], /^grant/i);
    });

    // 4. Workers.
    const S4 = '4. Workforce';
    // WI-OI-120u Slice 3 (owner "retire all"): the WFO worker registry is retired; people are added on People.
    // WI-OI-120u: People is a metadata window; the login is a picker of workspace members only administrators change.
    for (const persona of [people.technician!, people.supervisor!]) {
      await recorder.do(S4, `Add ${persona.name} on People, linked to their login`, admin, async () => {
        await admin.goto('/gigaops/resources');
        await settle(admin);
        const note = await create(admin, recorder, /^new$/i, [[/reference/i, `${persona.key.slice(0, 4).toUpperCase()}-${RUN}`], [/display name/i, persona.name], [/^type/i, 'Human'], [/login/i, persona.email]], /^save$/i);
        await survivesReload(admin, recorder, persona.name, 'A new Workforce person');
        return note;
      });
    }
    // WI-OI-120u Slice 2: absence types are kept on the Availability page; a person asks for their own absence there.
    await recorder.do(S4, 'Add an absence type', admin, async () => {
      await admin.goto('/gigaops/availability');
      await settle(admin);
      await press(admin, /^absence types$/i);
      await settle(admin);
      return create(admin, recorder, /^new$/i, [[/code/i, `VAC${RUN}`.slice(0, 16).toUpperCase()], [/name/i, `Vacation ${RUN}`]], /^save$/i);
    });
    // WI-OI-120ah: 'attendance' redirects to 'time', the real Time & Attendance screen.
    for (const section of ['overview', 'resources', 'jobs', 'availability', 'bookings', 'scheduling', 'time']) {
      await recorder.do(S4, `Workforce: ${section}, as the administrator`, admin, async () => {
        await admin.goto(section === 'overview' ? '/gigaops' : `/gigaops/${section}`);
        await settle(admin);
      });
    }
    const technician = people.technician!.page;
    if (technician) {
      await recorder.do(S4, 'The technician clocks in and out', technician, async () => {
        await technician.goto('/gigaops/time');
        await settle(technician);
        if (await technician.getByText(/not linked to a (person in Workforce|Workforce person)/i).count()) throw new Error('The technician is told their user is not linked to a Workforce person');
        for (const kind of [/^clock in$/i, /^clock out$/i]) {
          if (!(await press(technician, kind))) throw new Error(`No "${kind.source}" button`);
          await settle(technician);
        }
        if (recorder.failedWrites(technician).length) throw new Error(`A punch was refused: ${recorder.failedWrites(technician).map((call) => `${call.status} ${call.message}`).join('; ')}`);
      });
      await recorder.do(S4, 'The technician submits their week', technician, async () => {
        if (!(await press(technician, /^submit week$/i))) throw new Error('No "Submit week" button');
        await settle(technician);
        if (recorder.failedWrites(technician).length) throw new Error(`The week was refused: ${recorder.failedWrites(technician).map((call) => `${call.status} ${call.message}`).join('; ')}`);
        const own = await technician.getByRole('button', { name: /^approve$/i }).count();
        if (own) recorder.add('BUG', 'A technician is offered "Approve" on timesheets', 'a Maintenance technician cannot approve timesheets', technician);
      });
      await recorder.do(S4, 'The technician asks for a day off', technician, async () => {
        await technician.goto('/gigaops/availability');
        await settle(technician);
        // Shown as a tab only when the person may also see other parts of Availability.
        await press(technician, /^my absences$/i);
        await settle(technician);
        const note = await create(technician, recorder, /^new$/i, [[/^absence type/i, `Vacation ${RUN}`], [/^from/i, `${DAY_OFF}T09:00`], [/^until/i, `${DAY_OFF}T17:00`], [/note/i, `Journey ${RUN}`]], /^save$/i);
        if (await technician.getByRole('button', { name: /^approve$/i }).count()) recorder.add('BUG', 'A person is offered "Approve" on their own absence', 'someone else must decide it', technician);
        return note;
      });
    }

    // 5. CMMS: sites, asset, request, work order through to closure.
    const S5 = '5. Maintenance (CMMS)';
    await recorder.do(S5, 'Create the first site and a space', admin, async () => {
      await admin.goto('/cmms/spaces');
      await settle(admin);
      const notes = [await create(admin, recorder, /create first site|new top|create space|^add/i, [[/name/i, `North plant ${RUN}`], [/code/i, `NP${RUN}`], [/type|kind/i, 'site']])];
      notes.push(await create(admin, recorder, /create space|^add/i, [[/name/i, `Compressor room ${RUN}`], [/code/i, `CR${RUN}`], [/type|kind/i, 'room']]).catch((error: Error) => `space: ${error.message}`));
      await survivesReload(admin, recorder, `North plant ${RUN}`, 'A new CMMS site');
      return notes.join(' · ');
    });
    await recorder.do(S5, 'Register an asset', admin, async () => {
      await admin.goto('/cmms/assets');
      await settle(admin);
      const note = await create(admin, recorder, /register asset|register|new asset|add asset/i, [[/name/i, `Air compressor ${RUN}`], [/tag|code|number/i, `AC-${RUN}`], [/space|location|site/i, `North plant ${RUN}`], [/criticality/i, 'high']], /^(register|save|create)/i);
      await survivesReload(admin, recorder, `Air compressor ${RUN}`, 'A new asset');
      return note;
    });
    if (technician) {
      await recorder.do(S5, 'The technician raises a request', technician, async () => {
        await technician.goto('/cmms/requests');
        await settle(technician);
        return create(technician, recorder, /new request|raise|submit a request|create request|^new/i, [[/title|summary|subject/i, `Compressor leaking oil ${RUN}`], [/description|details/i, 'Oil under the compressor since this morning.'], [/asset/i, `Air compressor ${RUN}`], [/priority/i, 'high']]);
      });
    }
    const supervisor = people.supervisor!.page;
    let workOrderTitle = `Fix compressor oil leak ${RUN}`;
    if (supervisor) {
      await recorder.do(S5, 'The supervisor raises a work order and assigns the technician', supervisor, async () => {
        await supervisor.goto('/cmms/work-orders');
        await settle(supervisor);
        const note = await create(supervisor, recorder, /new work order|create work order/i, [[/title|summary/i, workOrderTitle], [/description/i, 'Replace the drain-valve seal.'], [/asset/i, `Air compressor ${RUN}`], [/assign|technician|worker/i, people.technician!.name.split(' ')[0]!], [/priority/i, 'high'], [/type/i, 'corrective']], /^(create|save|submit)/i);
        await survivesReload(supervisor, recorder, workOrderTitle, 'A new work order');
        return note;
      });
    } else workOrderTitle = '';
    const auditor = people.auditor!.page;
    if (auditor && workOrderTitle) {
      await recorder.do(S5, 'The auditor (viewer) can read but not change work orders', auditor, async () => {
        await auditor.goto('/cmms/work-orders');
        await settle(auditor);
        const sees = (await auditor.getByText(workOrderTitle).count()) > 0;
        const offered = (await auditor.getByRole('button', { name: /new work order|create work order/i }).filter({ visible: true }).count()) > 0;
        if (offered) recorder.add('UX', 'A viewer is offered "New work order"', 'the button should be hidden for read-only roles', auditor);
        // The screen hiding a button is not enough: the API must refuse the auditor too.
        recorder.expectRefusal(auditor, 'POST', /\/api\/cmms\/v1\/work-orders$/);
        const direct = await auditor.evaluate(async () => {
          const response = await fetch('/api/cmms/v1/work-orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ title: 'Auditor attempt' }) });
          return response.status;
        });
        if (direct < 400) recorder.add('BUG', 'The API lets a viewer create a work order', `POST /api/cmms/v1/work-orders answered ${direct}`, auditor);
        return `${sees ? 'sees the work order' : 'does not see the work order'}; ${offered ? 'is offered New work order' : 'no create button'}`;
      });
    }
    if (technician && workOrderTitle) {
      for (const [action, label] of [[/start work|^start/i, 'starts'], [/log labour|log time/i, 'logs labour'], [/^complete/i, 'completes']] as const) {
        await recorder.do(S5, `The technician ${label} the work order`, technician, async () => {
          await technician.goto('/cmms/work-orders');
          await settle(technician);
          const row = technician.getByText(workOrderTitle).first();
          if (!(await row.count())) throw new Error('The technician does not see the work order assigned to them');
          await row.click();
          await settle(technician);
          if (!(await press(technician, action))) throw new Error(`No "${label}" action for the technician`);
          await settle(technician);
          const dialog = technician.locator('[role=dialog]').filter({ visible: true });
          const form = (await dialog.count()) ? dialog.last().locator('form').last() : lastForm(technician);
          if (await form.count()) {
            await fill(form, [[/hours|duration|minutes/i, '2'], [/note|comment|description|summary|resolution/i, `Journey ${label} ${RUN}`]]);
            const error = await submit(technician, form, recorder);
            if (error) throw new Error(error);
          }
        });
      }
    }
    if (supervisor && workOrderTitle) {
      // The status shown in this work order's own detail panel (not another row, a filter option or a header).
      const shownAs = (status: RegExp) =>
        supervisor
          .getByRole('complementary', { name: /work order details/i })
          .filter({ has: supervisor.getByRole('heading', { name: workOrderTitle }) })
          .locator('*')
          .filter({ hasText: status })
          .count();
      const showCompleted = async () => {
        const statusSelect = supervisor.getByLabel(/status/i);
        if (await statusSelect.count()) {
          await statusSelect.selectOption({ label: 'All statuses' });
          await settle(supervisor);
        }
      };
      // WI-OI-120bi: sign-off is real; reopen the detail panel after reload before looking for Sign off.
      await recorder.do(S5, 'The supervisor reviews the completed work order', supervisor, async () => {
        await supervisor.goto('/cmms/work-orders');
        await settle(supervisor);
        await showCompleted();
        await supervisor.getByText(workOrderTitle).first().click();
        await settle(supervisor);
        if (!(await shownAs(/^\s*completed\s*$/i))) throw new Error('The work order is not shown as completed');
        await survivesReload(supervisor, recorder, workOrderTitle, 'The completed work order', showCompleted);
      });
      await recorder.do(S5, 'The supervisor signs off and closes the work order', supervisor, async () => {
        await supervisor.goto('/cmms/work-orders');
        await settle(supervisor);
        await showCompleted();
        await supervisor.getByText(workOrderTitle).first().click();
        await settle(supervisor);
        if (!(await shownAs(/^\s*completed\s*$/i))) throw new Error('The work order is not shown as completed before sign-off');
        if (!(await press(supervisor, /^sign off$/i))) throw new Error('No sign-off action on the completed work order');
        await settle(supervisor);
        const dialog = supervisor.locator('[role=dialog]').filter({ visible: true });
        const form = (await dialog.count()) ? dialog.last().locator('form').last() : lastForm(supervisor);
        if (await form.count()) {
          await fill(form, [[/note|comment|reason/i, `Checked on site ${RUN}`]]);
          const error = await submit(supervisor, form, recorder, /^(confirm|save|submit)/i);
          if (error) throw new Error(error);
        }
        if (!(await shownAs(/^\s*closed\s*$/i))) throw new Error('The work order is not shown as closed after sign-off');
        await survivesReload(supervisor, recorder, workOrderTitle, 'The closed work order', async () => {
          await showCompleted();
          await supervisor.getByText(workOrderTitle).first().click();
          await settle(supervisor);
        });
      });
    }
    for (const section of ['schedules', 'meters', 'inventory', 'people', 'calendar', 'workload', 'analytics']) {
      await recorder.do(S5, `CMMS: ${section}`, admin, async () => {
        await admin.goto(`/cmms/${section}`);
        await settle(admin);
      });
    }

    // 6. Approvals by role.
    const S6 = '6. Approvals';
    const approver = people.approver!.page;
    if (approver) {
      await recorder.do(S6, "The approver approves the technician's week", approver, async () => {
        await approver.goto('/gigaops/time');
        await settle(approver);
        const sheet = approver.locator('li, tr, [role=listitem], div').filter({ hasText: people.technician!.name.split(' ')[0]! }).filter({ has: approver.getByRole('button', { name: /^approve$/i }) }).last();
        if (!(await sheet.count())) throw new Error("The technician's submitted week is not in the approver's list");
        await sheet.getByRole('button', { name: /^approve$/i }).click();
        await settle(approver);
        if (recorder.failedWrites(approver).length) throw new Error(`The approval was refused: ${recorder.failedWrites(approver).map((call) => `${call.status} ${call.message}`).join('; ')}`);
      });
      await recorder.do(S6, "The approver records the technician's working week", approver, async () => {
        await approver.goto('/gigaops/resources');
        await settle(approver);
        await approver.getByRole('row').filter({ hasText: people.technician!.name }).first().click();
        await settle(approver);
        if (!(await press(approver, /^working weeks$/i))) throw new Error('No "Working weeks" tab on the person');
        await settle(approver);
        return create(approver, recorder, /^new working weeks$/i, [[/time zone/i, 'Europe/London'], [/working hours/i, 'Mon-Fri 08:00-16:00']], /^save$/i);
      });
      await recorder.do(S6, "The approver decides the technician's absence", approver, async () => {
        await approver.goto('/gigaops/availability');
        await settle(approver);
        await press(approver, /^absence requests$/i);
        await settle(approver);
        const request = approver.getByRole('row').filter({ hasText: people.technician!.name }).filter({ hasText: /requested/i }).first();
        if (!(await request.count())) throw new Error("The technician's absence request is not in the approver's list");
        await request.click();
        await settle(approver);
        if (!(await press(approver, /^approve$/i))) throw new Error('No "Approve" on the request');
        await settle(approver);
        // Approve asks for an optional reason first.
        await press(approver.locator('form[aria-label="Approve"]'), /^approve$/i);
        await settle(approver);
        if (recorder.failedWrites(approver).length) throw new Error(`The decision was refused: ${recorder.failedWrites(approver).map((call) => `${call.status} ${call.message}`).join('; ')}`);
        if (!(await approver.getByText(/approved/i).count())) throw new Error('The absence does not show as approved');
      });
      await recorder.do(S6, 'The approver opens the approval queue', approver, async () => {
        await approver.goto('/actions');
        await settle(approver);
        const items = await approver.getByRole('row').count();
        return `${Math.max(0, items - 1)} row(s) in the queue`;
      });
    }

    // 7. Boundaries: what the trial does not include, and phone width.
    const S7 = '7. Boundaries and phone width';
    for (const path of ['/finance', '/products', '/inventory']) {
      await recorder.do(S7, `A module outside the trial: ${path}`, admin, async () => {
        await admin.goto(path);
        await settle(admin);
        return `heading: ${(await admin.locator('h1').first().textContent().catch(() => ''))?.trim()}`;
      });
    }
    await admin.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/dashboard', '/settings', '/cmms/work-orders', '/gigaops/resources']) {
      await recorder.do(S7, `Phone width: ${path}`, admin, async () => {
        await admin.goto(path);
        await settle(admin);
      });
    }
  } finally {
    write();
  }
  const blockers = recorder.findings.filter((finding) => finding.kind === 'BLOCKER').length;
  console.log(`Journey ${RUN}: ${recorder.findings.length} findings (${blockers} blockers) in ${recorder.steps.length} steps. Board: ${join(OUT, 'index.html')}`);
});
