// WI-OI-104c live proof: schedules through the web control proxy (WEB_TEST_URL, the proof web on 5190) and the
// deployed kernel worker. Uses its own throwaway tenant; revokes its sessions at the end. Run with DATABASE_URL set.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const repo = `${process.env.HOME}/dev/gigalibs`;
const [{ prisma }, { hashPassword }] = await Promise.all([
  import(`${repo}/packages/db/dist/index.js`),
  import(`${repo}/packages/auth-core/dist/index.js`),
]);
const webUrl = process.env.WEB_TEST_URL;
if (!webUrl) throw new Error('WEB_TEST_URL is required');
const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const userIds = [];
const log = (line) => console.log(`  ${line}`);

async function login(tenantId, label, role) {
  const password = `Sched-${randomBytes(18).toString('base64url')}!`;
  const email = `schedules-live.${label}.${run}@gigalibs.invalid`;
  const user = await prisma.user.create({ data: { email, name: `Schedules ${label}`, status: 'ACTIVE', passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  await prisma.tenantMember.create({ data: { userId: user.id, tenantId, role, status: 'ACTIVE' } });
  const response = await fetch(`${webUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: webUrl },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 200, `login ${label}: ${await response.text()}`);
  return { user, cookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
}

async function call(session, method, path, body, expected) {
  const response = await fetch(`${webUrl}/api/control/tenants/current/schedules${path}`, {
    method,
    headers: { Cookie: session.cookie, Origin: webUrl, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.ok([expected].flat().includes(response.status), `${method} ${path || '/'}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function settled(scheduleId) {
  for (let waited = 0; waited < 90; waited += 3) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT status::text, "lastErrorCode", "lastErrorMessage", "ownerSubjectId" FROM kernel_job_runs WHERE "correlationId" = $1`,
      `schedule:${scheduleId}`,
    );
    if (rows[0] && ['SUCCEEDED', 'DEAD_LETTER'].includes(rows[0].status)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`the worker did not settle schedule ${scheduleId} within 90 s`);
}

try {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `schedules-live-${run}`.slice(0, 63),
      name: 'Schedules live proof',
      status: 'ACTIVE',
      region: 'local',
      settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } },
    },
  });
  const admin = await login(tenant.id, 'admin', 'TENANT_ADMIN');
  const member = await login(tenant.id, 'member', 'VIEWER');
  for (const moduleKey of ['analytics-studio', 'connections']) {
    await prisma.tenantModuleEntitlement.create({
      data: { tenantId: tenant.id, moduleKey, status: 'ENABLED', source: 'PLATFORM_OVERRIDE', reason: 'WI-OI-104c schedules live proof', updatedById: admin.user.id },
    });
  }

  const report = randomUUID();
  const listed = await call(admin, 'GET', `?operation=analytics.report-run&targetId=${report}`, null, 200);
  assert.deepEqual([listed.canCreate, listed.schedules.length], [true, 0]);
  const dto = { name: 'Live proof report', operation: 'analytics.report-run', targetId: report, cron: '0 6 * * *', timeZone: 'Asia/Kolkata' };
  const reportSchedule = await call(admin, 'POST', '', dto, 201);
  const syncSchedule = await call(admin, 'POST', '', { ...dto, name: 'Live proof sync', operation: 'connector-hub.sync', targetId: `missing-${run}` }, 201);
  log(`created ${reportSchedule.id} (report run) and ${syncSchedule.id} (connector sync), next ${reportSchedule.nextRunAt}`);
  await call(admin, 'POST', '', { ...dto, cron: '*/5 * * * *' }, 400);
  await call(admin, 'POST', '', { ...dto, ownerSubjectId: member.user.id }, 400);
  await call(member, 'POST', '', dto, 403);
  // A viewer without the read permission does not even see it (404); with it, may not manage it (403).
  await call(member, 'POST', `/${reportSchedule.id}/pause`, null, [403, 404]);
  log('refused: every 5 minutes, a smuggled owner, a viewer creating or pausing');
  assert.equal((await call(admin, 'POST', `/${reportSchedule.id}/pause`, null, 200)).status, 'PAUSED');
  assert.equal((await call(admin, 'POST', `/${reportSchedule.id}/resume`, null, 200)).status, 'ACTIVE');

  // Make both due now; the deployed worker (5 s tick) must run them as the owner with a context the module accepts.
  await prisma.$executeRawUnsafe(`UPDATE kernel_job_schedules SET "nextRunAt" = now() - interval '1 second' WHERE id IN ($1, $2)`, reportSchedule.id, syncSchedule.id);
  for (const [schedule, module] of [[reportSchedule, 'Analytics'], [syncSchedule, 'Connector Hub']]) {
    const rows = await settled(schedule.id);
    assert.equal(rows.length, 1, 'one job per due time');
    assert.equal(rows[0].ownerSubjectId, admin.user.id);
    assert.equal(rows[0].lastErrorCode, 'MODULE_REFUSED', JSON.stringify(rows[0]));
    // 404 means the module verified the signed context and looked the target up in this tenant; a bad signature is 401.
    assert.match(rows[0].lastErrorMessage, /\(404\)/, rows[0].lastErrorMessage);
    log(`${module}: the worker ran it as the owner; the module accepted the signed context and answered 404 for the missing target`);
  }
  const after = await call(admin, 'GET', '?operation=analytics.report-run', null, 200);
  assert.equal(after.schedules[0].lastJob.status, 'DEAD_LETTER');
  assert.ok(new Date(after.schedules[0].nextRunAt) > new Date(), 'the schedule moved to its next time');
  const runs = await call(admin, 'GET', `/${reportSchedule.id}/runs`, null, 200);
  assert.equal(runs[0].errorCode, 'MODULE_REFUSED');
  const viewerList = await call(member, 'GET', '', null, 200);
  log(`viewer sees ${viewerList.schedules.length} schedule(s), may create: ${viewerList.canCreate}`);
  for (const schedule of [reportSchedule, syncSchedule]) await call(admin, 'POST', `/${schedule.id}/remove`, null, 200);
  assert.equal((await call(admin, 'GET', '', null, 200)).schedules.length, 0);
  log('removed both; job history kept');
  console.log('SCHEDULES LIVE PASS');
} finally {
  await prisma.session.updateMany({ where: { userId: { in: userIds }, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  await prisma.$disconnect();
}
