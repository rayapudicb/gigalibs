// WI-OI-070 pay readiness journey, executed inside the Workforce API container by verify-workforce-pay.sh.
// Two people work a past week (entered as reason-coded corrections), their timesheets are approved four-eyes, and
// the week is calculated, voided, recalculated, approved and verified against the golden amounts of the
// reference packs.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';
const tokens = JSON.parse(env.TOKENS);

async function call(who, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, 'X-Correlation-Id': `wi-oi-070-${env.RUN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null), replayed: response.headers.get('idempotency-replayed') };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const code = (body) => body?.message?.code ?? body?.code;
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

async function person(label, platformUserId) {
  return expect(`person ${label}`, call('admin', 'POST', '/resources', {
    referenceCode: `CERT-PAY-${label}-${env.RUN}`, displayName: `${label} ${env.RUN}`, resourceType: 'HUMAN', platformUserId,
  }), 201, 200);
}

/** Enters one shift as two reason-coded corrections by the manager. */
async function shift(resourceId, date, startHour, hours) {
  for (const [kind, hour] of [['CLOCK_IN', startHour], ['CLOCK_OUT', startHour + hours]]) {
    await expect(`${kind} ${date}`, call('mgr', 'POST', '/time-corrections', {
      resourceId, action: 'ADD', reasonCode: 'MISSED_PUNCH', note: 'Entered from the paper timesheet',
      punch: { kind, occurredAt: `${date}T${String(hour).padStart(2, '0')}:00:00Z`, timeZone: 'UTC' },
    }), 201);
  }
}

async function approvedWeek(who, resourceId, periodStart) {
  const sheet = await expect(`${who} submits`, call(who, 'POST', '/timesheets', { resourceId, periodStart }), 201);
  return expect(`${who} approved`, call('mgr', 'POST', `/timesheets/${sheet.id}/approve`, { expectedVersion: sheet.version }), 200);
}

async function create() {
  const week = env.PERIOD_START;
  const ca = await person('CA', env.W1_SUBJECT);
  const india = await person('IN', env.W2_SUBJECT);

  // A Californian week of six 6-hour days and a 10-hour seventh day; an Indian week of six 9-hour days.
  for (let day = 0; day < 6; day += 1) await shift(ca.id, addDays(week, day), 8, 6);
  await shift(ca.id, addDays(week, 6), 8, 10);
  for (let day = 0; day < 6; day += 1) await shift(india.id, addDays(week, day), 8, 9);
  const sheetCa = await approvedWeek('w1', ca.id, week);
  const sheetIn = await approvedWeek('w2', india.id, week);
  assert.equal(sheetCa.workedMinutes, 6 * 360 + 600);
  assert.equal(sheetIn.workedMinutes, 6 * 540);

  const packs = (await expect('packs', call('mgr', 'GET', '/pay-packs'), 200)).items;
  assert.deepEqual(packs.map((pack) => `${pack.code}@${pack.version}:${pack.reference}`).sort(), ['IN-48@1:true', 'US-CA-OT@1:true']);
  await expect('rate for an unknown pack', call('admin', 'POST', '/pay-rates', { resourceId: ca.id, packCode: 'XX-1', effectiveFrom: '2026-01-01', hourlyRateMinor: 1, currency: 'USD' }), 409);
  await expect('CA rate', call('admin', 'POST', '/pay-rates', { resourceId: ca.id, packCode: 'US-CA-OT', effectiveFrom: '2026-01-01', hourlyRateMinor: 2_000, currency: 'USD' }), 201);
  const missing = await expect('run without a rate for IN', call('mgr', 'POST', '/pay-runs', { requestKey: randomUUID(), periodStart: week }), 409);
  assert.equal(code(missing), 'WORKFORCE_PAY_RATE_MISSING');
  await expect('IN rate', call('admin', 'POST', '/pay-rates', { resourceId: india.id, packCode: 'IN-48', effectiveFrom: '2026-01-01', hourlyRateMinor: 20_000, currency: 'INR' }), 201);
  await expect('earlier rate refused', call('admin', 'POST', '/pay-rates', { resourceId: india.id, packCode: 'IN-48', effectiveFrom: '2025-06-01', hourlyRateMinor: 1, currency: 'INR' }), 409);

  // Calculate: golden lines and totals.
  const key = randomUUID();
  const first = await expect('calculate', call('mgr', 'POST', '/pay-runs', { requestKey: key, periodStart: week }), 201);
  assert.equal(first.status, 'CALCULATED');
  assert.equal(first.people, 2);
  assert.equal(first.lineCount, 15);
  assert.deepEqual(first.totals, [{ currency: 'INR', amountMinor: 1_200_000 }, { currency: 'USD', amountMinor: 104_000 }]);
  const seventh = first.lines.filter((line) => line.resourceId === ca.id && line.workDate === addDays(week, 6));
  assert.deepEqual(seventh.map((line) => [line.category, line.minutes, line.amountMinor, line.ruleTrace]), [
    ['SEVENTH_DAY_OVERTIME', 480, 24_000, 'US-CA-OT@1 seventh-day<=480'],
    ['SEVENTH_DAY_DOUBLE_TIME', 120, 8_000, 'US-CA-OT@1 seventh-day>480'],
  ]);
  const saturdayIn = first.lines.filter((line) => line.resourceId === india.id && line.workDate === addDays(week, 5));
  assert.deepEqual(saturdayIn.map((line) => [line.category, line.minutes, line.amountMinor]), [['REGULAR', 180, 60_000], ['WEEKLY_OVERTIME', 360, 240_000]]);
  const replay = await call('mgr', 'POST', '/pay-runs', { requestKey: key, periodStart: week });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, 'true');
  assert.equal(replay.body.id, first.id);
  assert.equal(code(await expect('second live run', call('mgr', 'POST', '/pay-runs', { requestKey: randomUUID(), periodStart: week }), 409)), 'WORKFORCE_PAY_RUN_EXISTS');

  // Four-eyes, void and an identical recalculation.
  assert.equal(code(await expect('self approval', call('mgr', 'POST', `/pay-runs/${first.id}/approve`, { expectedVersion: first.version }), 403)), 'WORKFORCE_SELF_APPROVAL');
  await expect('worker cannot approve', call('w1', 'POST', `/pay-runs/${first.id}/approve`, { expectedVersion: first.version }), 403);
  const voided = await expect('void', call('mgr', 'POST', `/pay-runs/${first.id}/void`, { expectedVersion: first.version, reason: 'Recalculate after rate check' }), 200);
  assert.equal(voided.status, 'VOIDED');
  const second = await expect('recalculate', call('mgr', 'POST', '/pay-runs', { requestKey: randomUUID(), periodStart: week }), 201);
  assert.equal(second.digest, first.digest, 'a rerun of the same inputs is identical');
  await expect('stale approval', call('approver', 'POST', `/pay-runs/${second.id}/approve`, { expectedVersion: second.version + 1 }), 409);
  const approved = await expect('approve', call('approver', 'POST', `/pay-runs/${second.id}/approve`, { expectedVersion: second.version }), 200);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(code(await expect('approve again', call('approver', 'POST', `/pay-runs/${second.id}/approve`, { expectedVersion: approved.version }), 409)), 'WORKFORCE_PAY_RUN_STATE');
  await expect('void approved', call('mgr', 'POST', `/pay-runs/${second.id}/void`, { expectedVersion: approved.version, reason: 'Too late' }), 409);

  // A rate change after approval never alters the approved run.
  await expect('new CA rate mid-week', call('admin', 'POST', '/pay-rates', { resourceId: ca.id, packCode: 'US-CA-OT', effectiveFrom: addDays(week, 3), hourlyRateMinor: 3_000, currency: 'USD' }), 201);
  const rates = (await expect('CA rates', call('mgr', 'GET', `/pay-rates?resourceId=${ca.id}`), 200)).items;
  assert.deepEqual(rates.map((rate) => [rate.effectiveFrom, rate.effectiveTo]), [[addDays(week, 3), null], ['2026-01-01', addDays(week, 2)]]);
  const verification = await expect('verify', call('mgr', 'GET', `/pay-runs/${second.id}/verification`), 200);
  assert.deepEqual([verification.identical, verification.recomputedDigest], [true, second.digest]);
  assert.deepEqual((await expect('approved run', call('mgr', 'GET', `/pay-runs/${second.id}`), 200)).totals, first.totals);
  assert.equal(code(await expect('recalculate approved week', call('mgr', 'POST', '/pay-runs', { requestKey: randomUUID(), periodStart: week }), 409)), 'WORKFORCE_PAY_RUN_EXISTS');

  // WI-OI-071: one immutable export per run, reconciled to the run and confirmed by a second person.
  assert.equal(code(await expect('export a voided run', call('mgr', 'POST', `/pay-runs/${first.id}/exports`, {}), 409)), 'WORKFORCE_PAY_RUN_NOT_APPROVED');
  const exported = await expect('export', call('mgr', 'POST', `/pay-runs/${second.id}/exports`, { format: 'PAYROLL_CSV_V1' }), 201);
  assert.deepEqual([exported.status, exported.lineCount], ['READY', 15]);
  assert.deepEqual(exported.totals, first.totals);
  const again = await call('mgr', 'POST', `/pay-runs/${second.id}/exports`, {});
  assert.deepEqual([again.status, again.replayed, again.body.id], [200, 'true', exported.id]);
  const download = await fetch(`${base}/pay-exports/${exported.id}/file`, { headers: { Authorization: `Bearer ${tokens.approver}` } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /^text\/csv/);
  assert.equal(download.headers.get('etag'), `"${exported.fileSha256}"`);
  const csv = await download.text();
  assert.equal(createHash('sha256').update(csv, 'utf8').digest('hex'), exported.fileSha256);
  assert.equal(csv.trimEnd().split('\r\n').length, 16);
  assert.ok(csv.includes(`CERT-PAY-CA-${env.RUN}`) && csv.includes(',240.00,USD,'), 'the seventh-day overtime line is in the file');
  const reconciliation = await expect('reconcile', call('approver', 'GET', `/pay-exports/${exported.id}/reconciliation`), 200);
  assert.deepEqual([reconciliation.reconciled, reconciliation.linesMatch, reconciliation.lineCount], [true, true, 15]);
  const good = { expectedVersion: exported.version, targetReference: `PR-${env.RUN}`, reportedLineCount: 15, reportedTotals: exported.totals };
  assert.equal(code(await expect('creator confirms', call('mgr', 'POST', `/pay-exports/${exported.id}/acknowledge`, good), 403)), 'WORKFORCE_SELF_ACKNOWLEDGEMENT');
  assert.equal(code(await expect('short import', call('admin', 'POST', `/pay-exports/${exported.id}/acknowledge`, { ...good, reportedLineCount: 14 }), 409)), 'WORKFORCE_EXPORT_UNRECONCILED');
  assert.equal(code(await expect('wrong total', call('admin', 'POST', `/pay-exports/${exported.id}/acknowledge`, {
    ...good, reportedTotals: [{ currency: 'INR', amountMinor: 1_200_000 }, { currency: 'USD', amountMinor: 103_999 }],
  }), 409)), 'WORKFORCE_EXPORT_UNRECONCILED');
  const confirmed = await expect('confirm', call('admin', 'POST', `/pay-exports/${exported.id}/acknowledge`, { ...good, reportedTotals: [...good.reportedTotals].reverse() }), 200);
  assert.deepEqual([confirmed.status, confirmed.targetReference], ['ACKNOWLEDGED', `PR-${env.RUN}`]);
  await expect('confirm again', call('admin', 'POST', `/pay-exports/${exported.id}/acknowledge`, { ...good, expectedVersion: confirmed.version }), 409);
  await expect('tenant B export', call('admin_b', 'GET', `/pay-exports/${exported.id}/file`), 404);

  // Scope and tenancy.
  assert.equal(code(await expect('place-scoped member', call('scoped', 'GET', '/pay-runs'), 403)), 'WORKFORCE_PAY_SCOPE');
  await expect('worker without pay scope', call('w1', 'GET', '/pay-runs'), 403);
  assert.equal((await expect('tenant B runs', call('admin_b', 'GET', '/pay-runs'), 200)).items.length, 0);
  await expect('tenant B run', call('admin_b', 'GET', `/pay-runs/${second.id}`), 404);
  await expect('tenant B rate for tenant A person', call('admin_b', 'POST', '/pay-rates', { resourceId: ca.id, packCode: 'US-CA-OT', effectiveFrom: '2026-01-01', hourlyRateMinor: 1, currency: 'USD' }), 404);

  process.stdout.write(JSON.stringify({ approvedId: second.id, voidedId: first.id, digest: second.digest, exportId: exported.id }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const verification = await expect('verify after restart', call('mgr', 'GET', `/pay-runs/${ids.approvedId}/verification`), 200);
  assert.equal(verification.identical, true);
  assert.equal(verification.storedDigest, ids.digest);
  process.stdout.write('verified');
}

const phases = { create, verify };
await phases[env.PHASE]();
