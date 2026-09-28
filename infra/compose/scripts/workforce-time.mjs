// WI-OI-069 time and attendance journey, executed inside the Workforce API container by verify-workforce-time.sh.
// Geofence evidence is supplied the way the BFF does after reading the place boundary; the BFF composition
// itself is covered by the web boundary tests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';
const tokens = JSON.parse(env.TOKENS);

async function call(who, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, 'X-Correlation-Id': `wi-oi-069-${env.RUN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    replayed: response.headers.get('idempotency-replayed'),
    retryAfter: response.headers.get('retry-after'),
  };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const code = (body) => body?.message?.code ?? body?.code;
const mondayOf = (date) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const SITE_X = env.SITE_X;
const SITE_Y = env.SITE_Y;
const HERE = { latitude: 52.52, longitude: 13.405, accuracyMeters: 8 };
const fence = (result, placeRef = SITE_X, distance = 12) => ({ result, placeRef, distanceToEdgeMeters: distance, reason: null });

function punch(kind, occurredAt, extra = {}) {
  return { deviceId: `cert-device-${env.RUN}`, deviceEventId: randomUUID(), kind, occurredAt, timeZone: 'UTC', siteRef: SITE_X, ...extra };
}

async function person(label, platformUserId) {
  return expect(`person ${label}`, call('admin', 'POST', '/resources', {
    referenceCode: `CERT-TA-${label}-${env.RUN}`, displayName: `${label} ${env.RUN}`, resourceType: 'HUMAN', platformUserId,
  }), 201, 200);
}

async function resolveAll(who, resourceId, note) {
  const open = (await expect('open exceptions', call(who, 'GET', `/time-exceptions?status=OPEN&resourceId=${resourceId}`), 200)).items;
  for (const item of open) {
    await expect(`resolve ${item.kind}`, call(who, 'POST', `/time-exceptions/${item.id}/resolve`, { expectedVersion: item.version, resolution: 'ACCEPTED', note }), 200);
  }
  return open.length;
}

async function create() {
  const w1 = await person('W1', env.W1_SUBJECT);
  const w2 = await person('W2', env.W2_SUBJECT);
  const w3 = await person('W3', env.W3_SUBJECT);
  const mgr = await person('M2', env.M2_SUBJECT);

  // 1. Device punches: fence evidence recorded, problems flagged, never refused.
  const first = punch('CLOCK_IN', ago(100), { location: HERE, geofence: fence('INSIDE') });
  const clockIn = await expect('clock in', call('w1', 'POST', '/punches', first), 201);
  assert.equal(clockIn.geofence, 'INSIDE');
  assert.deepEqual(clockIn.exceptions, []);
  const resend = await call('w1', 'POST', '/punches', first);
  assert.equal(resend.status, 200);
  assert.equal(resend.replayed, 'true');
  assert.equal(resend.body.id, clockIn.id);
  assert.equal(code(await expect('event id reused by another person', call('w2', 'POST', '/punches', first), 409)), 'WORKFORCE_DEVICE_EVENT_REUSED');
  const outside = await expect('break outside', call('w1', 'POST', '/punches', punch('BREAK_START', ago(90), { location: HERE, geofence: fence('OUTSIDE', SITE_X, 250) })), 201);
  assert.equal(outside.geofence, 'OUTSIDE');
  assert.equal(outside.distanceToEdgeMeters, 250);
  assert.deepEqual(outside.exceptions, ['OUT_OF_FENCE']);
  const noLocation = await expect('break end without location', call('w1', 'POST', '/punches', punch('BREAK_END', ago(80))), 201);
  assert.deepEqual([noLocation.geofence, noLocation.exceptions], ['NO_LOCATION', ['LOCATION_MISSING']]);
  const wrongPlace = await expect('clock out, evidence for another place', call('w1', 'POST', '/punches', punch('CLOCK_OUT', ago(70), { location: HERE, geofence: fence('INSIDE', SITE_Y) })), 201);
  assert.deepEqual([wrongPlace.geofence, wrongPlace.exceptions], ['NOT_CHECKED', ['GEOFENCE_UNVERIFIED']]);
  assert.equal(code(await expect('future punch', call('w1', 'POST', '/punches', punch('CLOCK_IN', new Date(Date.now() + 300_000).toISOString())), 400)), 'WORKFORCE_PUNCH_IN_FUTURE');
  assert.equal(code(await expect('stale punch', call('w1', 'POST', '/punches', punch('CLOCK_IN', ago(40 * 86_400))), 400)), 'WORKFORCE_PUNCH_TOO_OLD');
  assert.equal(code(await expect('unlinked user', call('scoped', 'POST', '/punches', punch('CLOCK_IN', ago(10))), 403)), 'WORKFORCE_NOT_A_WORKER');

  // Late (offline resend) punches are accepted and flagged.
  const lateIn = await expect('late clock in', call('w2', 'POST', '/punches', punch('CLOCK_IN', ago(3 * 3600), { location: HERE, geofence: fence('INSIDE') })), 201);
  assert.equal(lateIn.late, true);
  assert.deepEqual(lateIn.exceptions, ['LATE_PUNCH']);
  const lateOut = await expect('late clock out', call('w2', 'POST', '/punches', punch('CLOCK_OUT', ago(2 * 3600), { location: HERE, geofence: fence('INSIDE') })), 201);

  // 2. Admission control: 300 concurrent punches for one person; refused ones retried with the same event ids.
  const burst = Array.from({ length: 300 }, (_, index) => punch(index % 2 ? 'CLOCK_OUT' : 'CLOCK_IN', ago(60 - index / 10), { siteRef: null }));
  let pending = burst;
  let refused = 0;
  let retryAfterOk = true;
  let rounds = 0;
  while (pending.length && rounds < 20) {
    rounds += 1;
    const results = await Promise.all(pending.map((item) => call('w3', 'POST', '/punches', item)));
    const again = [];
    results.forEach((result, index) => {
      if (result.status === 429) {
        refused += 1;
        retryAfterOk &&= result.retryAfter === '1';
        again.push(pending[index]);
      } else if (result.status !== 201 && result.status !== 200) {
        throw new Error(`burst punch: ${result.status} ${JSON.stringify(result.body)}`);
      }
    });
    pending = again;
    if (pending.length) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(pending.length, 0, 'every refused punch was admitted on retry');
  assert.ok(refused > 0, 'admission control refused part of a 300-punch burst');
  assert.ok(retryAfterOk, '429 responses carry Retry-After: 1');
  const resent = await Promise.all(burst.slice(0, 50).map((item) => call('w3', 'POST', '/punches', item)));
  assert.ok(resent.every((result) => result.status === 200 && result.replayed === 'true'));

  // 3. The week: exceptions block submission; a manager resolves them; four-eyes rules apply.
  const week = clockIn.workDate;
  const periodStart = mondayOf(week);
  const periodW2 = mondayOf(lateIn.workDate);
  let preview = await expect('W1 preview', call('w1', 'GET', `/timesheets/preview?periodStart=${periodStart}`), 200);
  assert.equal(preview.lines.length, 1);
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.openExceptions, 3);
  assert.equal(code(await expect('submit with open exceptions', call('w1', 'POST', '/timesheets', { resourceId: w1.id, periodStart }), 409)), 'WORKFORCE_TIMESHEET_EXCEPTIONS_OPEN');
  await expect('worker cannot resolve', call('w1', 'POST', `/time-exceptions/${randomUUID()}/resolve`, { expectedVersion: 1, resolution: 'ACCEPTED', note: 'mine' }), 403);
  const ownLate = await expect('manager own late punch', call('mgr', 'POST', '/punches', punch('CLOCK_IN', ago(3600))), 201);
  const ownException = (await expect('manager exceptions', call('mgr', 'GET', `/time-exceptions?status=OPEN&resourceId=${mgr.id}`), 200)).items[0];
  assert.equal(ownException.punchId, ownLate.id);
  assert.equal(code(await expect('self resolution', call('mgr', 'POST', `/time-exceptions/${ownException.id}/resolve`, { expectedVersion: 1, resolution: 'DISMISSED', note: 'mine' }), 403)), 'WORKFORCE_SELF_RESOLUTION');
  assert.equal(code(await expect('self correction', call('mgr', 'POST', '/time-corrections', { resourceId: mgr.id, action: 'VOID', punchId: ownLate.id, reasonCode: 'DEVICE_FAULT', note: 'mine' }), 403)), 'WORKFORCE_SELF_CORRECTION');
  const stale = (await expect('W1 exceptions', call('mgr', 'GET', `/time-exceptions?status=OPEN&resourceId=${w1.id}`), 200)).items[0];
  await expect('resolve', call('mgr', 'POST', `/time-exceptions/${stale.id}/resolve`, { expectedVersion: stale.version, resolution: 'ACCEPTED', note: 'Crew was at the gate' }), 200);
  await expect('stale resolve', call('mgr', 'POST', `/time-exceptions/${stale.id}/resolve`, { expectedVersion: stale.version, resolution: 'DISMISSED', note: 'again' }), 409);
  assert.equal(await resolveAll('mgr', w1.id, 'Verified with the supervisor'), 2);
  const submitted = await expect('W1 submits', call('w1', 'POST', '/timesheets', { resourceId: w1.id, periodStart }), 201);
  assert.equal(submitted.status, 'SUBMITTED');
  assert.equal(submitted.lines.length, 1);
  assert.equal(code(await expect('double submission', call('w1', 'POST', '/timesheets', { resourceId: w1.id, periodStart }), 409)), 'WORKFORCE_TIMESHEET_STATE');

  // A punch after submission is kept and flagged; the week cannot be corrected until returned.
  const after = await expect('punch after submission', call('w1', 'POST', '/punches', punch('CLOCK_IN', ago(20), { location: HERE, geofence: fence('INSIDE') })), 201);
  assert.deepEqual(after.exceptions, ['AFTER_SUBMISSION']);
  assert.equal(code(await expect('correct a submitted week', call('mgr', 'POST', '/time-corrections', {
    resourceId: w1.id, action: 'VOID', punchId: after.id, reasonCode: 'WRONG_KIND', note: 'Tapped by mistake',
  }), 409)), 'WORKFORCE_PERIOD_LOCKED');
  await expect('worker cannot approve', call('w1', 'POST', `/timesheets/${submitted.id}/approve`, { expectedVersion: submitted.version }), 403);
  assert.equal(code(await expect('approve with open exception', call('mgr', 'POST', `/timesheets/${submitted.id}/approve`, { expectedVersion: submitted.version }), 409)), 'WORKFORCE_TIMESHEET_EXCEPTIONS_OPEN');
  assert.equal(await resolveAll('mgr', w1.id, 'Belongs to the next shift'), 1);
  const approved = await expect('approve', call('mgr', 'POST', `/timesheets/${submitted.id}/approve`, { expectedVersion: submitted.version }), 200);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(code(await expect('approve again', call('mgr', 'POST', `/timesheets/${submitted.id}/approve`, { expectedVersion: approved.version }), 409)), 'WORKFORCE_TIMESHEET_STATE');
  await expect('reject approved', call('mgr', 'POST', `/timesheets/${submitted.id}/reject`, { expectedVersion: approved.version, reason: 'Too late' }), 409);

  // 4. W2: submitted on their behalf, never approved by the submitter; returned, corrected, resubmitted.
  await resolveAll('mgr', w2.id, 'Offline at the pump house');
  const onBehalf = await expect('admin submits for W2', call('admin', 'POST', '/timesheets', { resourceId: w2.id, periodStart: periodW2 }), 201);
  assert.equal(code(await expect('submitter approves', call('admin', 'POST', `/timesheets/${onBehalf.id}/approve`, { expectedVersion: onBehalf.version }), 403)), 'WORKFORCE_SELF_APPROVAL');
  const returned = await expect('return', call('mgr', 'POST', `/timesheets/${onBehalf.id}/reject`, { expectedVersion: onBehalf.version, reason: 'Clock-out was 30 minutes late' }), 200);
  assert.equal(returned.status, 'REJECTED');
  const replacement = await expect('replace clock-out', call('mgr', 'POST', '/time-corrections', {
    resourceId: w2.id, action: 'REPLACE', punchId: lateOut.id,
    punch: { kind: 'CLOCK_OUT', occurredAt: new Date(Date.parse(lateOut.occurredAt) - 1_800_000).toISOString(), timeZone: 'UTC', siteRef: SITE_X },
    reasonCode: 'WRONG_TIME', note: 'Supervisor confirmed the end of shift',
  }), 201);
  await expect('void again', call('mgr', 'POST', '/time-corrections', { resourceId: w2.id, action: 'VOID', punchId: lateOut.id, reasonCode: 'WRONG_TIME', note: 'again' }), 409);
  const punches = (await expect('W2 punches', call('mgr', 'GET', `/punches?resourceId=${w2.id}&from=${periodW2}&to=${lateOut.workDate}`), 200)).items;
  assert.ok(punches.find((item) => item.id === lateOut.id).voided);
  assert.equal(punches.find((item) => item.id === replacement.newPunchId).source, 'CORRECTION');
  const resubmitted = await expect('W2 resubmits', call('w2', 'POST', '/timesheets', { resourceId: w2.id, periodStart: periodW2 }), 201);
  assert.equal(resubmitted.version, 3);
  assert.equal(resubmitted.lines[0].clockOutPunchId, replacement.newPunchId);
  const approvedW2 = await expect('approve W2', call('mgr', 'POST', `/timesheets/${onBehalf.id}/approve`, { expectedVersion: resubmitted.version }), 200);
  assert.equal(approvedW2.workedMinutes, 30);

  // 5. Scope and tenancy.
  const scopedExceptions = (await expect('scoped exceptions', call('scoped', 'GET', '/time-exceptions'), 200)).items;
  assert.ok(scopedExceptions.every((item) => item.siteRef === SITE_Y));
  await expect('scoped preview of a site X week', call('scoped', 'GET', `/timesheets/preview?resourceId=${w1.id}&periodStart=${periodStart}`), 404);
  await expect('scoped timesheet read', call('scoped', 'GET', `/timesheets/${submitted.id}`), 404);
  assert.equal((await expect('tenant B timesheets', call('admin_b', 'GET', '/timesheets'), 200)).items.length, 0);
  assert.equal((await expect('tenant B exceptions', call('admin_b', 'GET', '/time-exceptions'), 200)).items.length, 0);
  await expect('tenant B timesheet', call('admin_b', 'GET', `/timesheets/${submitted.id}`), 404);
  await expect('tenant B correction', call('admin_b', 'POST', '/time-corrections', { resourceId: w1.id, action: 'VOID', punchId: clockIn.id, reasonCode: 'DEVICE_FAULT', note: 'forged' }), 404);
  await expect('W2 cannot read W1 time', call('w2', 'GET', `/punches?resourceId=${w1.id}&from=${periodStart}&to=${week}`), 404);

  process.stdout.write(JSON.stringify({ periodStart, week, w1: w1.id, w2: w2.id, w3: w3.id, first, approvedId: submitted.id, refused, rounds }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const resend = await call('w1', 'POST', '/punches', ids.first);
  assert.equal(resend.status, 200);
  assert.equal(resend.replayed, 'true');
  const sheet = await expect('approved after restart', call('mgr', 'GET', `/timesheets/${ids.approvedId}`), 200);
  assert.equal(sheet.status, 'APPROVED');
  assert.equal(sheet.lines.length, 1);
  process.stdout.write('verified');
}

const phases = { create, verify };
await phases[env.PHASE]();
