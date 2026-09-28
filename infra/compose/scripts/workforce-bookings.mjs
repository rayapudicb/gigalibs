// WI-OI-067 demand and booking journey, executed inside the Workforce API container by
// verify-workforce-bookings.sh: guards (qualification, availability with override, headcount, double booking),
// lifecycle, idempotency, CMMS-sourced demand, and 1,000 concurrent booking attempts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';

async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'X-Correlation-Id': `wi-oi-067-${env.RUN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null), replayed: response.headers.get('idempotency-replayed') };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const A = (method, path, body) => call(env.TOKEN_A, method, path, body);
const ALWAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => ({ day, start: '00:00', end: '24:00' }));

async function person(label, capability) {
  const resource = await expect(`person ${label}`, A('POST', '/resources', { referenceCode: `CERT-BK-${label}-${env.RUN}`, displayName: `${label} ${env.RUN}`, resourceType: 'HUMAN' }), 201, 200);
  await expect(`pattern ${label}`, A('POST', '/availability-patterns', { resourceId: resource.id, effectiveFrom: '2026-01-01', timeZone: 'UTC', weeklySlots: ALWAYS }), 201);
  if (capability) {
    await expect(`qualify ${label}`, A('POST', `/resources/${resource.id}/capabilities`, {
      capabilityDefinitionId: capability.id, proficiency: capability.proficiency, validFrom: '2026-01-01T00:00:00Z', expiresAt: capability.expiresAt ?? null,
    }), 201, 200);
  }
  return resource;
}

async function create() {
  const run = env.RUN;
  const electrical = await expect('capability', A('POST', '/capabilities', { code: `CERT-BK-ELEC-${run}`, name: 'Electrical' }), 201, 200);
  const p1 = await person('P1', { id: electrical.id, proficiency: 'ADVANCED' });
  const p2 = await person('P2', { id: electrical.id, proficiency: 'STANDARD' });
  const p3 = await person('P3', null);
  const p4 = await person('P4', { id: electrical.id, proficiency: 'EXPERT', expiresAt: '2026-10-06T00:00:00Z' });
  const p5 = await person('P5', { id: electrical.id, proficiency: 'MASTER' });

  const requirement = (title, startsAt, endsAt, headcount, extra = {}) =>
    A('POST', '/work-requirements', { requestKey: randomUUID(), title: `${title} ${run}`, siteRef: env.SITE_X, startsAt, endsAt, headcount, ...extra });
  const booking = (requirementId, resourceId, extra = {}) => A('POST', '/bookings', { requestKey: randomUUID(), requirementId, resourceId, ...extra });

  const r1 = await expect('requirement R1', requirement('Pump overhaul', '2026-10-05T08:00:00Z', '2026-10-05T16:00:00Z', 2, {
    requiredCapabilities: [{ capabilityDefinitionId: electrical.id, minimumProficiency: 'ADVANCED' }],
  }), 201);

  // Candidates are ranked: qualified and available first.
  const candidates = (await expect('candidates', A('GET', `/work-requirements/${r1.id}/candidates`), 200)).items.filter((item) => item.resourceName.endsWith(run));
  const fit = candidates.filter((item) => item.qualified && item.available).map((item) => item.resourceId).sort();
  assert.deepEqual(fit, [p1.id, p4.id, p5.id].sort());
  assert.deepEqual(candidates.find((item) => item.resourceId === p2.id).missingCapabilities, [`CERT-BK-ELEC-${run}`]);

  await expect('proficiency too low', booking(r1.id, p2.id), 422);
  await expect('no capability', booking(r1.id, p3.id), 422);
  const key = randomUUID();
  const first = await expect('book P1', A('POST', '/bookings', { requestKey: key, requirementId: r1.id, resourceId: p1.id }), 201);
  assert.equal(first.status, 'DRAFT');
  const replay = await call(env.TOKEN_A, 'POST', '/bookings', { requestKey: key, requirementId: r1.id, resourceId: p1.id });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, 'true');
  assert.equal(replay.body.id, first.id);

  // Availability guard with an audited override.
  const leave = await expect('absence type', A('POST', '/absence-types', { code: `CERT-BK-LV-${run}`, name: 'Leave', requiresApproval: false }), 201);
  await expect('P4 away mid-shift', A('POST', '/absences', { resourceId: p4.id, absenceTypeId: leave.id, startsAt: '2026-10-05T10:00:00Z', endsAt: '2026-10-05T12:00:00Z' }), 201);
  await expect('P4 not available', booking(r1.id, p4.id), 409);
  const overridden = await expect('P4 with override', booking(r1.id, p4.id, { overrideReason: 'Covers the afternoon; absence agreed' }), 201);
  assert.equal(overridden.overrideReason, 'Covers the afternoon; absence agreed');
  let detail = await expect('R1 filled', A('GET', `/work-requirements/${r1.id}`), 200);
  assert.equal(detail.status, 'FILLED');
  assert.equal(detail.bookedCount, 2);
  await expect('fully staffed', booking(r1.id, p5.id), 409);

  // No person holds two overlapping live bookings, across requirements.
  const r2 = await expect('requirement R2', requirement('Valve check', '2026-10-05T12:00:00Z', '2026-10-05T14:00:00Z', 1), 201);
  await expect('double booking refused', booking(r2.id, p1.id), 409);
  await expect('outside requirement window', booking(r2.id, p5.id, { startsAt: '2026-10-05T11:00:00Z', endsAt: '2026-10-05T13:00:00Z' }), 400);
  const partial = await expect('partial window', booking(r2.id, p5.id, { startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-05T13:00:00Z' }), 201);

  // Lifecycle, stale versions and terminal states.
  let current = first;
  for (const status of ['CONFIRMED', 'DISPATCHED', 'ON_SITE']) {
    current = await expect(`P1 ${status}`, A('POST', `/bookings/${first.id}/status`, { expectedVersion: current.version, status }), 200);
  }
  await expect('stale status', A('POST', `/bookings/${first.id}/status`, { expectedVersion: 1, status: 'COMPLETED' }), 409);
  await expect('cancel on site refused', A('POST', `/bookings/${first.id}/status`, { expectedVersion: current.version, status: 'CANCELLED', reason: 'x' }), 409);
  await expect('cancel requirement while on site', A('POST', `/work-requirements/${r1.id}/cancel`, { expectedVersion: detail.version, reason: 'x' }), 409);
  current = await expect('P1 completed', A('POST', `/bookings/${first.id}/status`, { expectedVersion: current.version, status: 'COMPLETED' }), 200);
  await expect('P4 cancelled', A('POST', `/bookings/${overridden.id}/status`, { expectedVersion: overridden.version, status: 'CANCELLED', reason: 'Replaced' }), 200);
  detail = await expect('R1 reopened', A('GET', `/work-requirements/${r1.id}`), 200);
  assert.equal(detail.status, 'OPEN', 'cancelling a booking reopens a filled requirement');
  const r2detail = await expect('R2', A('GET', `/work-requirements/${r2.id}`), 200);
  const cancelledR2 = await expect('cancel R2', A('POST', `/work-requirements/${r2.id}/cancel`, { expectedVersion: r2detail.version, reason: 'Postponed' }), 200);
  assert.equal(cancelledR2.bookings.find((item) => item.id === partial.id).status, 'CANCELLED');

  // CMMS-sourced demand: one live requirement per work order.
  const cmms = { sourceType: 'CMMS_WORK_ORDER', sourceRef: `WO-${run}` };
  await expect('CMMS requirement', requirement('From CMMS', '2026-10-07T08:00:00Z', '2026-10-07T12:00:00Z', 1, cmms), 201);
  await expect('second live requirement for the same work order', requirement('Duplicate', '2026-10-07T08:00:00Z', '2026-10-07T12:00:00Z', 1, cmms), 409);

  // 1,000 concurrent attempts: 20 people, two overlapping requirements (headcount 10 and 20).
  const pool = [];
  for (let index = 0; index < 20; index += 1) pool.push(await person(`C${index}`, null));
  const rc = await expect('RC', requirement('Shutdown A', '2026-10-12T08:00:00Z', '2026-10-12T16:00:00Z', 10), 201);
  const rc2 = await expect('RC2', requirement('Shutdown B', '2026-10-12T12:00:00Z', '2026-10-12T20:00:00Z', 20), 201);
  const attempts = Array.from({ length: 1000 }, (_, index) => ({ requirementId: index % 2 === 0 ? rc.id : rc2.id, resourceId: pool[(index * 7) % pool.length].id }));
  const statuses = new Map();
  const started = Date.now();
  for (let offset = 0; offset < attempts.length; offset += 100) {
    const wave = await Promise.all(attempts.slice(offset, offset + 100).map((attempt) => call(env.TOKEN_A, 'POST', '/bookings', { requestKey: randomUUID(), ...attempt })));
    for (const result of wave) statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
  }
  const elapsedMs = Date.now() - started;
  assert.ok(![...statuses.keys()].some((status) => status >= 500), `server errors under load: ${JSON.stringify(Object.fromEntries(statuses))}`);
  const rcDetail = await expect('RC after load', A('GET', `/work-requirements/${rc.id}`), 200);
  const rc2Detail = await expect('RC2 after load', A('GET', `/work-requirements/${rc2.id}`), 200);
  assert.equal(rcDetail.bookedCount, 10, 'RC staffed to exactly its headcount');
  assert.equal(rcDetail.status, 'FILLED');
  assert.equal(rcDetail.bookedCount + rc2Detail.bookedCount, 20, 'each of the 20 people booked exactly once across the overlapping requirements');
  assert.equal(statuses.get(201), 20);

  process.stdout.write(JSON.stringify({
    r1: r1.id, firstBooking: first.id, p1: p1.id, rc: rc.id, rc2: rc2.id,
    load: { attempts: 1000, created: statuses.get(201), refused: 1000 - statuses.get(201), elapsedMs, statuses: Object.fromEntries(statuses) },
  }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const B = (method, path, body) => call(env.TOKEN_B, method, path, body);
  const r1 = await expect('R1 after restart', A('GET', `/work-requirements/${ids.r1}`), 200);
  assert.equal(r1.bookings.find((item) => item.id === ids.firstBooking).status, 'COMPLETED');
  const rc = await expect('RC after restart', A('GET', `/work-requirements/${ids.rc}`), 200);
  assert.equal(rc.bookedCount, 10);

  assert.equal((await expect('tenant B requirements', B('GET', '/work-requirements'), 200)).items.length, 0);
  assert.equal((await expect('tenant B bookings', B('GET', '/bookings'), 200)).items.length, 0);
  await expect('tenant B read requirement', B('GET', `/work-requirements/${ids.r1}`), 404);
  await expect('tenant B candidates', B('GET', `/work-requirements/${ids.r1}/candidates`), 404);
  await expect('tenant B book A requirement', B('POST', '/bookings', { requestKey: randomUUID(), requirementId: ids.rc2, resourceId: ids.p1 }), 404);
  await expect('tenant B change A booking', B('POST', `/bookings/${ids.firstBooking}/status`, { expectedVersion: 5, status: 'CONFIRMED' }), 404);
  await expect('tenant B cancel A requirement', B('POST', `/work-requirements/${ids.rc2}/cancel`, { expectedVersion: 1, reason: 'x' }), 404);
  process.stdout.write('verified');
}

(env.PHASE === 'create' ? create() : verify()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
