/**
 * WI-OI-120: Minimal org tree for procurement/orders API tests on uat.admin tenant.
 * Starter data does not publish organization units; P2P/O2C need an ACTIVE unit id.
 * Resumes an in-flight draft (submitted/validated/…) from a prior partial run.
 */
import crypto from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { signInToUat, uatAdmin, uatApprover } from '../uat-session';

const RUN = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;

type StructureStatus = 'none' | 'draft' | 'validated' | 'submitted' | 'approved' | 'published';

async function lookupOrgUnitId(page: Page): Promise<string | undefined> {
  const response = await page.request.get('/api/control/v1/lookups/organization-units?limit=20');
  if (!response.ok()) return undefined;
  const body = (await response.json()) as { items?: { value: string }[] };
  return body.items?.[0]?.value;
}

async function waitForLookupOrgUnitId(page: Page): Promise<string | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = await lookupOrgUnitId(page);
    if (id) return id;
    await page.waitForTimeout(500);
  }
  return undefined;
}

async function listOrganizationUnitCodes(page: Page): Promise<string[]> {
  const response = await page.request.get('/api/control/tenants/current/organization/units?limit=50&status=ACTIVE');
  if (!response.ok()) return [];
  const body = (await response.json()) as { items?: { code?: string; status?: string }[] };
  return (body.items ?? [])
    .filter((unit) => unit.status !== 'ARCHIVED')
    .map((unit) => unit.code)
    .filter((code): code is string => Boolean(code));
}

/** Prefer a site-style unit from prior E2E runs; otherwise any active unit. */
async function pickUnitCodeForDraft(page: Page): Promise<string | undefined> {
  const codes = await listOrganizationUnitCodes(page);
  if (codes.length === 0) return undefined;
  const main = codes.filter((code) => code.startsWith('MAIN')).sort().at(-1);
  return main ?? codes.at(-1);
}

async function openOrgTab(page: Page, tab: 'Structure' | 'Units' | 'Unit types') {
  await page.goto('/settings?tab=hierarchy');
  await expect(page.getByRole('heading', { name: 'Organization', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('tab', { name: tab }).click();
}

function structurePanel(page: Page) {
  return page.locator('#organization-panel-structure');
}

function structureReason(page: Page) {
  return structurePanel(page).getByLabel('Reason');
}

async function fillStructureReason(page: Page, text: string) {
  const field = structureReason(page);
  await field.click();
  await field.fill('');
  await field.pressSequentially(text, { delay: 10 });
  await expect(field).toHaveValue(text, { timeout: 10000 });
}

const VERSION_BADGE = /Version \d+ [·•]/i;

async function waitForStructureSettled(page: Page) {
  const structureTab = page.getByRole('tab', { name: 'Structure' });
  if (await structureTab.isVisible()) {
    await structureTab.click();
  }
  const panel = structurePanel(page);
  await expect(page.getByText('Loading the organization…')).toHaveCount(0, { timeout: 30000 });
  await expect(async () => {
    const hasVersion = await panel.getByText(VERSION_BADGE).isVisible();
    const idle = await panel.getByText('No changes in progress').isVisible();
    const noTree = await page.getByText('There is no organization tree yet').isVisible();
    if (!hasVersion && !idle && !noTree) throw new Error('organization structure still loading');
  }).toPass({ timeout: 30000 });
}

async function readStructureStatus(page: Page): Promise<StructureStatus> {
  const panel = structurePanel(page);
  const badge = panel.getByText(VERSION_BADGE).first();
  if (!(await badge.isVisible())) return 'none';
  const text = ((await badge.textContent()) ?? '').toLowerCase();
  const match = text.match(/[·•]\s*(draft|validated|submitted|approved|published)\b/);
  return (match?.[1] as StructureStatus | undefined) ?? 'none';
}

async function draftHasPlacedUnits(page: Page): Promise<boolean> {
  const tree = structurePanel(page).getByRole('navigation', { name: /Version \d+ draft/i });
  return (await tree.locator('listitem').count()) > 0;
}

async function hasVersionInForce(page: Page): Promise<boolean> {
  const panel = structurePanel(page);
  if (await panel.getByText('No version is in force yet').isVisible()) return false;
  return panel.getByRole('navigation', { name: /Version \d+ in force/i }).isVisible();
}

async function resolveActiveOrgUnitId(page: Page): Promise<string | undefined> {
  return (await waitForLookupOrgUnitId(page)) ?? (await resolveOrgUnitIdFromUnitsApi(page));
}

async function validateStructureDraft(page: Page) {
  const panel = structurePanel(page);
  if (await panel.getByText(/Version \d+ · validated/i).isVisible()) return;
  const validate = panel.getByRole('button', { name: 'Validate', exact: true });
  if (!(await validate.isEnabled())) return;
  await validate.click();
  await expect(page.getByRole('status').filter({ hasText: /Validation finished/i })).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('The draft passes every rule and is ready to submit.')).toBeVisible({ timeout: 15000 });
}

async function submitStructureDraft(page: Page, reason: string) {
  const panel = structurePanel(page);
  if (await panel.getByText(/Version \d+ · submitted/i).isVisible()) return;
  await validateStructureDraft(page);
  await fillStructureReason(page, reason);
  const submit = panel.getByRole('button', { name: 'Submit for approval', exact: true });
  await expect(submit).toBeEnabled({ timeout: 15000 });
  await submit.click();
  await expect(page.getByRole('status').filter({ hasText: /Submitted for approval/i })).toBeVisible({ timeout: 15000 });
}

async function approveStructureDraft(page: Page, tag: string) {
  const panel = structurePanel(page);
  if (await panel.getByText(/Version \d+ · approved/i).isVisible()) return;

  const approve = panel.getByRole('button', { name: 'Approve', exact: true });
  if (await approve.isEnabled()) {
    await fillStructureReason(page, `Approve minimal org ${tag}`);
    await approve.click();
    await expect(page.getByRole('status').filter({ hasText: /Approved/i })).toBeVisible({ timeout: 15000 });
    return;
  }

  if (!uatApprover.email || !uatApprover.password) {
    throw new Error(
      'Organization structure uses maker–checker: uat.admin cannot approve their own submit. ' +
        'Add E2E_UAT_APPROVER_EMAIL and E2E_UAT_APPROVER_PASSWORD to e2e/uat.env ' +
        '(see uat.env.example; local seed user is uat.approver@gigalibs.io).',
    );
  }
  const origin = new URL(page.url()).origin;
  const approverCtx = await page.context().browser()!.newContext({ baseURL: origin, viewport: { width: 1300, height: 820 } });
  const approverPage = await approverCtx.newPage();
  approverPage.on('dialog', (dialog) => void dialog.accept());
  await signInToUat(approverPage, origin, uatApprover);
  await openOrgTab(approverPage, 'Structure');
  await fillStructureReason(approverPage, `Approve minimal org ${tag}`);
  const approveBtn = structurePanel(approverPage).getByRole('button', { name: 'Approve', exact: true });
  await expect(approveBtn).toBeEnabled({ timeout: 15000 });
  await approveBtn.click();
  await expect(approverPage.getByRole('status').filter({ hasText: /Approved/i })).toBeVisible({ timeout: 15000 });
  await approverCtx.close();
  await openOrgTab(page, 'Structure');
}

async function publishStructureVersion(page: Page, reason: string) {
  const panel = structurePanel(page);
  if (await panel.getByText(/Version \d+ · published/i).isVisible()) return;
  await fillStructureReason(page, reason);
  const publish = panel.getByRole('button', { name: 'Publish', exact: true });
  if (await publish.isEnabled()) {
    await publish.click();
    await expect(page.getByRole('status').filter({ hasText: /Published/i })).toBeVisible({ timeout: 15000 });
    return;
  }
  await completePublishAndActivateViaApi(page, reason);
}

async function activateStructureVersion(page: Page, reason: string) {
  await fillStructureReason(page, reason);
  const activate = structurePanel(page).getByRole('button', { name: 'Activate', exact: true });
  if (await activate.isEnabled()) {
    await activate.click();
    await expect(page.getByRole('status').filter({ hasText: /activated/i })).toBeVisible({ timeout: 15000 });
    return;
  }
  await completePublishAndActivateViaApi(page, reason);
}

type OrgVersionRow = { id: string; status: string; lockVersion: number };

async function listOrgVersions(page: Page, treeId: string): Promise<OrgVersionRow[]> {
  const base = '/api/control/tenants/current/organization';
  const versionsRes = await page.request.get(`${base}/trees/${treeId}/versions`);
  expect(versionsRes.ok(), await versionsRes.text()).toBeTruthy();
  const versionsBody: unknown = await versionsRes.json();
  return (Array.isArray(versionsBody)
    ? versionsBody
    : ((versionsBody as { items?: OrgVersionRow[] }).items ?? [])) as OrgVersionRow[];
}

async function openWorkflowVersion(page: Page, treeId: string): Promise<OrgVersionRow | undefined> {
  const list = await listOrgVersions(page, treeId);
  return list.find((version) => ['DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(version.status));
}

/** Maker–checker and UI timing: advance the open version through approve, then publish and activate. */
async function advanceOrganizationWorkflowViaApi(page: Page, tag: string, reason: string) {
  if (await orgHasActiveVersion(page)) return;
  const base = '/api/control/tenants/current/organization';
  const treeId = await primaryOrgTreeId(page);
  expect(treeId, 'primary organization tree').toBeTruthy();

  for (let step = 0; step < 8; step += 1) {
    if (await orgHasActiveVersion(page)) return;
    const version = await openWorkflowVersion(page, treeId!);
    if (!version) break;

    if (version.status === 'DRAFT') {
      const validate = await page.request.post(`${base}/versions/${version.id}/validate`, {
        data: { expectedVersion: version.lockVersion },
      });
      expect(validate.ok(), `validate: ${await validate.text()}`).toBeTruthy();
      continue;
    }

    if (version.status === 'VALIDATED') {
      const submit = await page.request.post(`${base}/versions/${version.id}/submit`, {
        data: { expectedVersion: version.lockVersion, reason },
      });
      expect(submit.ok(), `submit: ${await submit.text()}`).toBeTruthy();
      continue;
    }

    if (version.status === 'SUBMITTED') {
      expect(uatApprover.email && uatApprover.password, 'E2E_UAT_APPROVER_* required for organization approve').toBeTruthy();
      const origin = new URL(page.url()).origin;
      const approverCtx = await page.context().browser()!.newContext({ baseURL: origin, viewport: { width: 1300, height: 820 } });
      const approverPage = await approverCtx.newPage();
      await signInToUat(approverPage, origin, uatApprover);
      const approve = await approverPage.request.post(`${base}/versions/${version.id}/approve`, {
        data: { expectedVersion: version.lockVersion, reason: `Approve minimal org ${tag}` },
      });
      expect(approve.ok(), `approve: ${await approve.text()}`).toBeTruthy();
      await approverCtx.close();
      continue;
    }

    if (version.status === 'APPROVED' || version.status === 'PUBLISHED') {
      await completePublishAndActivateViaApi(page, reason);
      return;
    }
  }

  if (!(await orgHasActiveVersion(page))) {
    await completePublishAndActivateViaApi(page, reason);
  }
}

/** After approve, UI Publish/Activate can stay disabled (reason timing); the journey spec uses the API instead. */
async function completePublishAndActivateViaApi(page: Page, reason: string) {
  const base = '/api/control/tenants/current/organization';
  const trees = await page.request.get(`${base}/trees`);
  expect(trees.ok(), await trees.text()).toBeTruthy();
  const treeBody: unknown = await trees.json();
  const treeList = (Array.isArray(treeBody) ? treeBody : ((treeBody as { items?: { id: string; kind: string }[] }).items ?? [])) as {
    id: string;
    kind: string;
  }[];
  const primary = treeList.find((tree) => tree.kind === 'PRIMARY') ?? treeList[0];
  expect(primary?.id, 'primary organization tree').toBeTruthy();

  const active = await page.request.get(`${base}/trees/${primary!.id}/active`);
  if (active.ok()) return;

  const list = await listOrgVersions(page, primary!.id);
  let published = list.find((version) => version.status === 'PUBLISHED');
  const approved = list.find((version) => version.status === 'APPROVED');
  if (!published && approved) {
    const pub = await page.request.post(`${base}/versions/${approved.id}/publish`, {
      data: { expectedVersion: approved.lockVersion, reason },
    });
    expect(pub.ok(), `publish: ${await pub.text()}`).toBeTruthy();
    published = (await pub.json()) as { id: string; status: string; lockVersion: number };
  }
  expect(published?.id, `published version (statuses: ${list.map((v) => v.status).join(', ')})`).toBeTruthy();

  const act = await page.request.post(`${base}/activations`, {
    data: {
      versionId: published!.id,
      reason,
      idempotencyKey: `e2e-org-activate-${Date.now()}`,
    },
  });
  expect(act.ok(), `activate: ${await act.text()}`).toBeTruthy();
  const after = await page.request.get(`${base}/trees/${primary!.id}/active`);
  expect(after.ok(), await after.text()).toBeTruthy();
}

async function resolveOrgUnitIdFromUnitsApi(page: Page): Promise<string | undefined> {
  const response = await page.request.get('/api/control/tenants/current/organization/units?limit=20&status=ACTIVE');
  if (!response.ok()) return undefined;
  const body: unknown = await response.json();
  const items = (Array.isArray(body) ? body : ((body as { items?: { id: string }[] }).items ?? [])) as { id: string }[];
  return items[0]?.id;
}

async function primaryOrgTreeId(page: Page): Promise<string | undefined> {
  const base = '/api/control/tenants/current/organization';
  const trees = await page.request.get(`${base}/trees`);
  if (!trees.ok()) return undefined;
  const treeBody: unknown = await trees.json();
  const treeList = (Array.isArray(treeBody) ? treeBody : ((treeBody as { items?: { id: string; kind: string }[] }).items ?? [])) as {
    id: string;
    kind: string;
  }[];
  return (treeList.find((tree) => tree.kind === 'PRIMARY') ?? treeList[0])?.id;
}

async function orgHasActiveVersion(page: Page): Promise<boolean> {
  const treeId = await primaryOrgTreeId(page);
  if (!treeId) return false;
  const active = await page.request.get(`/api/control/tenants/current/organization/trees/${treeId}/active`);
  return active.ok();
}

async function startStructureDraftViaApi(page: Page) {
  const treeId = await primaryOrgTreeId(page);
  expect(treeId, 'primary organization tree').toBeTruthy();
  const response = await page.request.post(`/api/control/tenants/current/organization/trees/${treeId}/versions`, {
    data: {},
  });
  if (!response.ok()) {
    const text = await response.text();
    if (/open draft|already has|conflict/i.test(text)) return;
    expect(response.ok(), `start draft: ${text}`).toBeTruthy();
  }
}

async function bootstrapUnitTypeAndUnit(page: Page, typeCode: string, typeLabel: string, unitCode: string, unitName: string) {
  await openOrgTab(page, 'Unit types');
  await page.getByRole('button', { name: 'Add unit type', exact: true }).click();
  const typeForm = page.getByRole('form', { name: 'New unit type' });
  await typeForm.getByLabel('Code').fill(typeCode);
  await typeForm.getByLabel('Name (one)').fill('Site');
  await typeForm.getByLabel('Name (many)').fill('Sites');
  await typeForm.getByRole('checkbox', { name: 'Allowed at the top of a tree' }).click();
  await typeForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /created/i })).toBeVisible({ timeout: 15000 });

  await openOrgTab(page, 'Units');
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const unitForm = page.getByRole('form', { name: 'New unit' });
  await unitForm.getByLabel('Type').selectOption({ label: typeLabel });
  await unitForm.getByLabel('Code').fill(unitCode);
  await unitForm.getByLabel('Name', { exact: true }).fill(unitName);
  await unitForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /created/i })).toBeVisible({ timeout: 15000 });
}

async function ensurePrimaryTree(page: Page) {
  if (await primaryOrgTreeId(page)) return;
  await openOrgTab(page, 'Structure');
  if (await page.getByText('There is no organization tree yet').isVisible()) {
    await page.getByRole('button', { name: 'Create the primary tree', exact: true }).click();
    await expect
      .poll(async () => primaryOrgTreeId(page), { timeout: 15000 })
      .toBeTruthy();
    return;
  }
  const response = await page.request.post('/api/control/tenants/current/organization/trees', {
    data: { code: 'primary', name: 'Organization', kind: 'PRIMARY', purpose: 'AUTHORITY' },
  });
  if (!response.ok()) {
    const text = await response.text();
    if (!/one primary|conflict|already/i.test(text)) {
      expect(response.ok(), `create primary tree: ${text}`).toBeTruthy();
    }
  }
  await expect.poll(async () => primaryOrgTreeId(page), { timeout: 15000 }).toBeTruthy();
}

async function startStructureDraft(page: Page) {
  await waitForStructureSettled(page);
  if ((await readStructureStatus(page)) !== 'none') return;
  await ensurePrimaryTree(page);
  await startStructureDraftViaApi(page);
  await openOrgTab(page, 'Structure');
  await waitForStructureSettled(page);
  await expect.poll(async () => readStructureStatus(page), { timeout: 15000 }).not.toBe('none');
}

async function placeUnitInDraft(page: Page, unitCode: string) {
  const place = structurePanel(page).getByRole('button', { name: 'Place a unit', exact: true });
  await expect(place).toBeVisible({ timeout: 15000 });
  await place.click();
  const placeForm = page.getByRole('form', { name: 'Place a unit' });
  await placeForm.getByLabel('Unit', { exact: true }).fill(unitCode);
  await placeForm.getByRole('button', { name: new RegExp(unitCode) }).click();
  await placeForm.getByRole('checkbox', { name: 'At the top of the tree' }).click();
  await placeForm.getByRole('button', { name: 'Place', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /placed/i })).toBeVisible({ timeout: 15000 });
}

async function placeUnitOnDraftIfEmpty(page: Page) {
  if (await draftHasPlacedUnits(page)) return;
  const unitCode = await pickUnitCodeForDraft(page);
  if (!unitCode) {
    throw new Error('Organization has no active units to place; create one under Settings › Organization › Units.');
  }
  await placeUnitInDraft(page, unitCode);
}

async function finishStructureActivation(page: Page, tag: string) {
  for (let step = 0; step < 12; step += 1) {
    const unitId = await lookupOrgUnitId(page);
    if (unitId && (await orgHasActiveVersion(page))) return unitId;

    await openOrgTab(page, 'Structure');
    await waitForStructureSettled(page);
    const status = await readStructureStatus(page);
    switch (status) {
      case 'none':
        if ((await orgHasActiveVersion(page)) || (await hasVersionInForce(page))) {
          return await resolveActiveOrgUnitId(page);
        }
        try {
          await completePublishAndActivateViaApi(page, `Activate minimal org ${tag}`);
          if (await orgHasActiveVersion(page)) return await resolveActiveOrgUnitId(page);
        } catch {
          /* no approved version yet */
        }
        await startStructureDraft(page);
        if ((await readStructureStatus(page)) === 'draft') {
          await placeUnitOnDraftIfEmpty(page);
        }
        break;
      case 'draft':
        await placeUnitOnDraftIfEmpty(page);
        await validateStructureDraft(page);
        if ((await readStructureStatus(page)) === 'draft') {
          await advanceOrganizationWorkflowViaApi(page, tag, `Minimal P2P/O2C org bootstrap ${tag}`);
        }
        break;
      case 'validated':
        await submitStructureDraft(page, `Minimal P2P/O2C org bootstrap ${tag}`);
        if ((await readStructureStatus(page)) === 'validated') {
          await advanceOrganizationWorkflowViaApi(page, tag, `Minimal P2P/O2C org bootstrap ${tag}`);
        }
        break;
      case 'submitted':
        await approveStructureDraft(page, tag);
        if ((await readStructureStatus(page)) === 'submitted') {
          await advanceOrganizationWorkflowViaApi(page, tag, `Minimal P2P/O2C org bootstrap ${tag}`);
        }
        break;
      case 'approved':
      case 'published':
        await completePublishAndActivateViaApi(page, `Activate minimal org ${tag}`);
        return await resolveActiveOrgUnitId(page);
      default:
        throw new Error(`Unexpected organization structure status: ${String(status)}`);
    }
  }
  return waitForLookupOrgUnitId(page);
}

/** Poll until product-catalogue accepts writes (kernel-worker delivered the active org version). */
export async function waitForProductCatalogueOrgReady(page: Page, origin: string) {
  await expect
    .poll(
      async () => {
        const probe = await page.request.post('/api/product-catalogue/v1/uoms', {
          headers: {
            Accept: 'application/json',
            Origin: origin,
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          data: {
            code: `RDY${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
            name: 'Org delivery probe',
            symbol: 'rdy',
            dimension: 'COUNT',
          },
        });
        return probe.status() === 201;
      },
      { timeout: 180_000, intervals: [2000, 3000, 5000] },
    )
    .toBe(true);
}

/** Queue org delivery to modules and refresh the session so signed context carries the active tree_version. */
export async function refreshSessionAfterOrgChange(page: Page, origin: string) {
  const treeId = await primaryOrgTreeId(page);
  if (treeId && (await orgHasActiveVersion(page))) {
    const sync = await page.request.post(`/api/control/tenants/current/organization/trees/${treeId}/sync`, {
      headers: { Accept: 'application/json', Origin: origin, 'Content-Type': 'application/json' },
      data: { reason: 'E2E deliver organization to modules' },
    });
    expect(sync.ok(), `organization sync: ${await sync.text()}`).toBeTruthy();
  }
  await signInToUat(page, origin, uatAdmin);
  await waitForProductCatalogueOrgReady(page, origin);
}

/** Creates or resumes a one-unit published tree when the tenant has none (idempotent if lookup already returns a unit). */
export async function ensureActiveOrgUnit(page: Page, origin?: string): Promise<string> {
  const existing = await lookupOrgUnitId(page);
  if (existing && (await orgHasActiveVersion(page))) {
    if (origin) await refreshSessionAfterOrgChange(page, origin);
    return existing;
  }
  if (await orgHasActiveVersion(page)) {
    const activeUnit = await resolveActiveOrgUnitId(page);
    if (activeUnit) {
      if (origin) await refreshSessionAfterOrgChange(page, origin);
      return activeUnit;
    }
  }

  await openOrgTab(page, 'Structure');
  await waitForStructureSettled(page);
  let status = await readStructureStatus(page);

  if (status === 'none') {
    await ensurePrimaryTree(page);
    await waitForStructureSettled(page);
    status = await readStructureStatus(page);
  }

  if (status === 'none') {
    await ensurePrimaryTree(page);
    if ((await pickUnitCodeForDraft(page)) === undefined) {
      const typeCode = `SITE${RUN}`;
      const typeLabel = `Site (${typeCode})`;
      const unitCode = `MAIN${RUN}`;
      await bootstrapUnitTypeAndUnit(page, typeCode, typeLabel, unitCode, `Main site ${RUN}`);
    }
    await startStructureDraft(page);
    await waitForStructureSettled(page);
    status = await readStructureStatus(page);
    if (status === 'draft') {
      await placeUnitOnDraftIfEmpty(page);
    }
  }

  const unitId = await finishStructureActivation(page, RUN);
  let settled = unitId ?? (await resolveActiveOrgUnitId(page));
  if (!settled) {
    await completePublishAndActivateViaApi(page, `Activate minimal org ${RUN}`);
    settled = await resolveActiveOrgUnitId(page);
  }
  expect(settled, 'Organization unit should appear after activate (lookup or units API)').toBeTruthy();
  if (origin) {
    if (!(await orgHasActiveVersion(page))) {
      await advanceOrganizationWorkflowViaApi(page, RUN, `Minimal P2P/O2C org bootstrap ${RUN}`);
      expect(await orgHasActiveVersion(page), 'organization version should be active before module sync').toBeTruthy();
    }
    await refreshSessionAfterOrgChange(page, origin);
  }
  return settled!;
}
