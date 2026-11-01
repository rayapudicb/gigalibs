/** WI-OI-133: live UAT API and admin journey. Physical scan, photo and offline device proof are separate gates. */
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { signInToUat, uatTenantName } from './uat-session.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enabled = process.env.RUN_ROUNDS_CERTIFICATION === '1';
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running the Rounds UAT journey.`);
  return value;
};
const credential = (role: string) => ({
  email: required(`ROUNDS_${role}_EMAIL`), password: required(`ROUNDS_${role}_PASSWORD`),
});

async function body<T>(response: Awaited<ReturnType<APIRequestContext['get']>>, status = 200): Promise<T> {
  expect(response.status(), new URL(response.url()).pathname).toBe(status);
  return response.json() as Promise<T>;
}

async function webActor(browser: Browser, base: string, role: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  await signInToUat(page, base, credential(role));
  return { context, page };
}

async function mobileOperator(request: APIRequestContext, base: string) {
  const installationId = crypto.randomUUID();
  const profile = process.env.ROUNDS_APP_PROFILE?.trim() || 'gigalibs-universal';
  const version = process.env.ROUNDS_APP_VERSION?.trim() || '1.0.0';
  const headers: Record<string, string> = {
    'x-gigalibs-installation-id': installationId,
    'x-gigalibs-app-version': version,
  };
  const signIn = await request.post(`${base}/mobile/v1/auth/password`, {
    headers, data: { contractVersion: 'mobile-password-sign-in.v1', ...credential('OPERATOR'), appProfile: profile },
  });
  const token = await body<{ binding: string; accessToken: string }>(signIn);
  if (token.binding === 'PRE_TENANT') {
    const memberships = await body<{ items: { selectionId: string; tenantDisplayName: string }[] }>(
      await request.get(`${base}/mobile/v1/memberships`, {
        headers: { ...headers, authorization: `Bearer ${token.accessToken}` },
      }),
    );
    const selected = memberships.items.find((item) => item.tenantDisplayName.toLowerCase() === uatTenantName.toLowerCase());
    if (!selected) throw new Error(`Operator has no mobile workspace named ${uatTenantName}.`);
    const idempotencyKey = crypto.randomUUID();
    const bound = await body<{ binding: string; accessToken: string }>(
      await request.post(`${base}/mobile/v1/session/switch`, {
        headers: { ...headers, authorization: `Bearer ${token.accessToken}`, 'idempotency-key': idempotencyKey },
        data: { contractVersion: 'mobile-membership-selection.v1', selectionId: selected.selectionId, idempotencyKey },
      }),
    );
    token.binding = bound.binding;
    token.accessToken = bound.accessToken;
  }
  expect(token.binding).toBe('TENANT_BOUND');
  headers.authorization = `Bearer ${token.accessToken}`;
  const session = await body<{ user: { id: string }; tenant: { displayName?: string; name?: string } }>(
    await request.get(`${base}/mobile/v1/session`, { headers }),
  );
  const tenantName = session.tenant.displayName ?? session.tenant.name;
  if (tenantName && tenantName.toLowerCase() !== uatTenantName.toLowerCase())
    throw new Error(`Mobile operator is in ${tenantName}; expected ${uatTenantName}.`);
  return { headers, userId: session.user.id, installationId };
}

test.describe('Operator Rounds UAT API and admin journey', () => {
  test.skip(!enabled, 'Run only with pnpm e2e:uat:rounds after the owner deploys.');

  test('route, assignment, mobile sync, CMMS settlement and review', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const base = required('ROUNDS_BASE_URL').replace(/\/$/, '');
    const url = new URL(base);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      throw new Error('ROUNDS_BASE_URL must use HTTPS, except for localhost UAT.');
    const assetId = required('ROUNDS_ASSET_ID');
    const workforceResourceId = required('ROUNDS_WORKFORCE_RESOURCE_ID');
    if (!UUID.test(assetId) || !UUID.test(workforceResourceId))
      throw new Error('ROUNDS_ASSET_ID and ROUNDS_WORKFORCE_RESOURCE_ID must be existing UUIDs.');
    if (credential('AUTHOR').email.toLowerCase() === credential('PUBLISHER').email.toLowerCase())
      throw new Error('Route author and publisher must be different users.');
    credential('SUPERVISOR');
    const mobile = await mobileOperator(request, base);
    const api = `${base}/api/operator-rounds/v1`;
    const mobileApi = `${base}/mobile/v1/rounds`;
    const routeCode = `CERT-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
    const tag1 = `${routeCode}-TEMP`;
    const tag2 = `${routeCode}-OIL`;
    const contexts: BrowserContext[] = [];
    try {
      const author = await webActor(browser, base, 'AUTHOR'); contexts.push(author.context);
      const route = await body<{ id: string; version: number; state: string }>(
        await author.page.request.post(`${api}/routes`, {
          headers: { Origin: base },
          data: { requestKey: crypto.randomUUID(), code: routeCode, title: 'Certification: compressor walk',
            description: 'WI-OI-133 UAT API journey', owningUnitId: null, placeRef: null,
            schedule: { cadence: 'DAILY', timeZone: 'UTC', localTime: '06:00', graceMinutes: 15, windowMinutes: 90 } },
        }), 201,
      );
      expect(route.state).toBe('DRAFT');
      const points = await body<{ version: number; revision: number }>(
        await author.page.request.post(`${api}/routes/${route.id}/checkpoints`, {
          headers: { Origin: base },
          data: { routeVersion: route.version, checkpoints: [
            { position: 1, label: 'Inlet temperature', assetRef: assetId, meterRef: null, tagCode: tag1,
              proofMode: 'BARCODE', readingKind: 'NUMERIC', unitCode: 'degC', nominal: '35',
              amberLow: '28', amberHigh: '42', redLow: '20', redHigh: '50', choices: [], branchRules: [],
              instructions: 'Read gauge.', photoOnException: false },
            { position: 2, label: 'Oil level', assetRef: assetId, meterRef: null, tagCode: tag2,
              proofMode: 'BARCODE', readingKind: 'BOOLEAN', unitCode: null, nominal: null,
              amberLow: null, amberHigh: null, redLow: null, redHigh: null, choices: [], branchRules: [],
              instructions: 'Check sight glass.', photoOnException: false },
          ] },
        }),
      );
      const publisher = await webActor(browser, base, 'PUBLISHER'); contexts.push(publisher.context);
      const published = await body<{ state: string; revision: number }>(
        await publisher.page.request.post(`${api}/routes/${route.id}/publish`, {
          headers: { Origin: base }, data: { version: points.version },
        }),
      );
      expect(published.state).toBe('PUBLISHED');

      const supervisor = await webActor(browser, base, 'SUPERVISOR'); contexts.push(supervisor.context);
      const roster = await body<{ version: number }>(
        await supervisor.page.request.post(`${api}/routes/${route.id}/roster`, {
          headers: { Origin: base },
          data: { expectedVersion: 0, entries: [{ workforceResourceRef: workforceResourceId, operatorSubject: mobile.userId }] },
        }),
      );
      expect(roster.version).toBe(1);
      const startAt = new Date(Date.now() + 60_000);
      const dueAt = new Date(startAt.getTime() + 30 * 60_000);
      const assignment = await body<{ id: string; routeRevision: number }>(
        await supervisor.page.request.post(`${api}/routes/${route.id}/assignments`, {
          headers: { Origin: base },
          data: { requestKey: crypto.randomUUID(), workforceResourceRef: workforceResourceId,
            operatorSubject: mobile.userId, scheduledStart: startAt.toISOString(), dueAt: dueAt.toISOString() },
        }), 201,
      );
      const mine = await body<{ items: { id: string }[] }>(
        await request.get(`${mobileApi}/assignments`, { headers: mobile.headers }),
      );
      expect(mine.items.some((item) => item.id === assignment.id)).toBe(true);
      const bundle = await body<{ assignment: { routeRevision: number }; checkpoints: { id: string; position: number }[] }>(
        await request.get(`${mobileApi}/assignments/${assignment.id}/bundle`, { headers: mobile.headers }),
      );
      expect(bundle.checkpoints).toHaveLength(2);
      expect(bundle.assignment.routeRevision).toBe(assignment.routeRevision);
      const history = await body<{ contractVersion: string; assignmentId: string;
        routeRevision: number; items: { checkpointId: string; readings: unknown[] }[] }>(
        await request.get(`${mobileApi}/assignments/${assignment.id}/history`, { headers: mobile.headers }),
      );
      expect(history).toMatchObject({ contractVersion: 'round-checkpoint-history.v1',
        assignmentId: assignment.id, routeRevision: assignment.routeRevision });
      expect(history.items.map((item) => item.checkpointId).sort()).toEqual(
        bundle.checkpoints.map((point) => point.id).sort(),
      );
      expect(history.items.every((item) => item.readings.length === 0)).toBe(true);
      const grant = await body<{ assignmentId: string; installationId: string; routeRevision: number }>(
        await request.get(`${mobileApi}/assignments/${assignment.id}/offline-grant`, { headers: mobile.headers }),
      );
      expect(grant).toMatchObject({ assignmentId: assignment.id,
        installationId: mobile.installationId, routeRevision: assignment.routeRevision });
      const first = bundle.checkpoints.find((point) => point.position === 1);
      const second = bundle.checkpoints.find((point) => point.position === 2);
      expect(first).toBeTruthy(); expect(second).toBeTruthy();
      const runId = crypto.randomUUID();
      const readingOperationId = crypto.randomUUID();
      const commands = [
        { type: 'START', payload: { requestKey: crypto.randomUUID(), runId,
          assignmentId: assignment.id, routeRevision: assignment.routeRevision } },
        { type: 'READING', payload: { clientOperationId: readingOperationId, runId,
          checkpointId: first!.id, routeRevision: assignment.routeRevision, expectedRunVersion: 1,
          capturedAt: new Date().toISOString(), source: 'MANUAL', proofMethod: 'BARCODE',
          scannedTag: tag1, numericValue: '58', choiceValue: null, evidenceId: null } },
        { type: 'READING', payload: { clientOperationId: crypto.randomUUID(), runId,
          checkpointId: second!.id, routeRevision: assignment.routeRevision, expectedRunVersion: 2,
          capturedAt: new Date().toISOString(), source: 'MANUAL', proofMethod: 'BARCODE',
          scannedTag: tag2, numericValue: null, choiceValue: 'PASS', evidenceId: null } },
        { type: 'COMPLETE', payload: { clientOperationId: crypto.randomUUID(), runId, expectedRunVersion: 3 } },
      ];
      type Result = { accepted: boolean; operationId: string; replayed?: boolean; result?: { status?: string; exceptionId?: string | null } };
      const sync = await body<{ results: Result[]; stopped: boolean }>(
        await request.post(`${mobileApi}/sync`, { headers: mobile.headers, data: { commands } }),
      );
      expect(sync.stopped, JSON.stringify(sync.results)).toBe(false);
      expect(sync.results).toHaveLength(4);
      expect(sync.results.every((item) => item.accepted && !item.replayed)).toBe(true);
      expect(sync.results[1]?.result?.status).toBe('RED');
      const exceptionId = sync.results[1]?.result?.exceptionId;
      expect(exceptionId).toBeTruthy();
      const receipt = await body<{ accepted: boolean; status: string; exceptionId: string }>(
        await request.get(`${mobileApi}/receipts/${readingOperationId}`, { headers: mobile.headers }),
      );
      expect(receipt).toMatchObject({ accepted: true, status: 'RED', exceptionId });
      const replay = await body<{ results: Result[]; stopped: boolean }>(
        await request.post(`${mobileApi}/sync`, { headers: mobile.headers, data: { commands } }),
      );
      expect(replay.stopped).toBe(false);
      expect(replay.results.map((item) => item.operationId)).toEqual(sync.results.map((item) => item.operationId));
      expect(replay.results.every((item) => item.accepted && item.replayed)).toBe(true);

      const board = await body<{ items: { id: string; readingCount: number; exceptionCount: number }[] }>(
        await supervisor.page.request.get(`${api}/assignments/board`),
      );
      expect(board.items.find((item) => item.id === assignment.id)).toMatchObject({ readingCount: 2, exceptionCount: 1 });
      type Exception = { id: string; routeCode: string; state: string; version: number; cmmsWorkOrderRef: string | null };
      const list = async () => body<{ items: Exception[] }>(await supervisor.page.request.get(`${api}/exceptions?limit=100`));
      const exception = (await list()).items.find((item) => item.id === exceptionId);
      expect(exception?.routeCode).toBe(routeCode);
      expect(['ACTION_PENDING', 'ACTION_ACCEPTED']).toContain(exception?.state);
      const ack = await body<Exception>(await supervisor.page.request.patch(`${api}/exceptions/${exceptionId}`, {
        headers: { Origin: base },
        data: { version: exception!.version, note: 'UAT: operator red reading reviewed.', resolution: 'ACKNOWLEDGED' },
      }));
      await expect.poll(async () => (await list()).items.find((item) => item.id === exceptionId)?.state,
        { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe('ACTION_ACCEPTED');
      const settled = (await list()).items.find((item) => item.id === exceptionId);
      expect(settled?.version).toBeGreaterThanOrEqual(ack.version);
      expect(settled?.cmmsWorkOrderRef).toBeTruthy();
      const resolved = await body<Exception>(await supervisor.page.request.patch(`${api}/exceptions/${exceptionId}`, {
        headers: { Origin: base },
        data: { version: settled!.version, note: 'UAT: corrective action accepted by CMMS.', resolution: 'RESOLVED' },
      }));
      expect(resolved.state).toBe('RESOLVED');

      const pageErrors: string[] = [];
      supervisor.page.on('pageerror', (error) => pageErrors.push(error.message));
      await supervisor.page.goto(`${base}/operator-rounds`);
      await expect(supervisor.page.getByRole('heading', { name: 'Operator inspection rounds' })).toBeVisible();
      expect(pageErrors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
