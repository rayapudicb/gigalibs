// WI-OI-068 CMMS ↔ Workforce handshake journey (ADR-0007 option A), executed inside the CMMS API container by
// verify-cmms-workforce-handshake.sh: CMMS reaches itself on 127.0.0.1 and Workforce on the Compose network.
// Neither module is called with the other's credentials; only the relays cross between them.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const env = process.env;
const CMMS = 'http://127.0.0.1:4200';
const WORKFORCE = 'http://workforce-api:4700';

async function call(origin, token, method, path, body, raw) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': `wi-oi-068-${env.RUN}`,
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

/** Polls until the check returns a value; the relays run every second. */
async function until(label, check, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label}: not reached within ${timeoutMs} ms`);
}

const C = (method, path, body) => call(CMMS, env.CMMS_TOKEN_A, method, `/v1${path}`, body);
const W = (method, path, body) => call(WORKFORCE, env.WORKFORCE_TOKEN_A, method, `/v1${path}`, body);
const workOrder = (id) => expect(`work order ${id}`, C('GET', `/work-orders/${id}`), 200);
const ALWAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => ({ day, start: '00:00', end: '24:00' }));

async function newWorkOrder(title) {
  return expect(`create ${title}`, C('POST', '/work-orders', { requestKey: randomUUID(), type: 'REACTIVE', priority: 'HIGH', title: `${title} ${env.RUN}` }), 201);
}

async function staffed(id, status) {
  return until(`${id} staffing ${status}`, async () => {
    const detail = await workOrder(id);
    return detail.staffing?.status === status ? detail : null;
  });
}

async function create() {
  const run = env.RUN;
  const code = `CERT-HS-MECH-${run}`.toUpperCase();

  // Workforce master data (tenant A): one qualified, always-available person.
  const capability = await expect('capability', W('POST', '/capabilities', { code, name: 'Mechanical' }), 201, 200);
  const person = await expect('person', W('POST', '/resources', { referenceCode: `CERT-HS-P1-${run}`, displayName: `Handshake Tech ${run}`, resourceType: 'HUMAN' }), 201, 200);
  await expect('pattern', W('POST', '/availability-patterns', { resourceId: person.id, effectiveFrom: '2026-01-01', timeZone: 'UTC', weeklySlots: ALWAYS }), 201);
  await expect('qualify', W('POST', `/resources/${person.id}/capabilities`, { capabilityDefinitionId: capability.id, proficiency: 'ADVANCED', validFrom: '2026-01-01T00:00:00Z' }), 201, 200);

  // 1. CMMS asks for staffing; Workforce opens a requirement; CMMS records it as accepted.
  const wo1 = await newWorkOrder('Handshake pump');
  let detail = await expect('request staffing', C('POST', `/work-orders/${wo1.id}/staffing`, {
    startsAt: '2026-11-02T08:00:00Z', endsAt: '2026-11-02T12:00:00Z', headcount: 1, capabilityCodes: [code.toLowerCase()],
  }), 200);
  assert.equal(detail.staffing.status, 'REQUESTED');
  assert.deepEqual(detail.staffing.capabilityCodes, [code]);
  await expect('second live request', C('POST', `/work-orders/${wo1.id}/staffing`, { startsAt: '2026-11-02T08:00:00Z', endsAt: '2026-11-02T12:00:00Z' }), 409);
  detail = await staffed(wo1.id, 'ACCEPTED');
  const requirementId = detail.staffing.requirementRef;
  assert.ok(requirementId, 'the accepted request carries the Workforce requirement id');
  const requirement = await expect('requirement', W('GET', `/work-requirements/${requirementId}`), 200);
  assert.equal(requirement.sourceType, 'CMMS_WORK_ORDER');
  assert.equal(requirement.sourceRef, wo1.id);
  assert.ok(requirement.title.startsWith(wo1.woNumber));
  assert.equal(requirement.requiredCapabilities.length, 1);

  // 2. Workforce books and confirms the person; CMMS projects the booking (name and window only).
  const candidates = (await expect('candidates', W('GET', `/work-requirements/${requirementId}/candidates`), 200)).items;
  assert.ok(candidates.some((item) => item.resourceId === person.id && item.qualified && item.available));
  const booking = await expect('book', W('POST', '/bookings', { requestKey: randomUUID(), requirementId, resourceId: person.id }), 201);
  await expect('confirm', W('POST', `/bookings/${booking.id}/status`, { expectedVersion: booking.version, status: 'CONFIRMED' }), 200);
  detail = await until('booking projected as CONFIRMED', async () => {
    const current = await workOrder(wo1.id);
    return current.bookings.some((item) => item.bookingRef === booking.id && item.status === 'CONFIRMED') ? current : null;
  });
  const projected = detail.bookings.find((item) => item.bookingRef === booking.id);
  assert.equal(projected.resourceRef, person.id);
  assert.equal(projected.resourceName, person.displayName);
  assert.deepEqual(Object.keys(projected).sort(), ['bookingRef', 'endsAt', 'resourceName', 'resourceRef', 'startsAt', 'status', 'updatedAt']);

  // 3. An unknown capability is refused by Workforce and shown in CMMS with the reason; nothing is live to cancel.
  const wo2 = await newWorkOrder('Handshake unknown skill');
  await expect('request unknown capability', C('POST', `/work-orders/${wo2.id}/staffing`, {
    startsAt: '2026-11-02T08:00:00Z', endsAt: '2026-11-02T10:00:00Z', capabilityCodes: [`NOPE-${run}`],
  }), 200);
  const refused = await staffed(wo2.id, 'REJECTED');
  assert.match(refused.staffing.rejectionReason, /no active capability/);
  await expect('cancel refused staffing', C('POST', `/work-orders/${wo2.id}/staffing/cancel`, { reason: 'Nothing live' }), 409);

  // 4. Cancelling the work order withdraws staffing; Workforce cancels the requirement and its booking; CMMS
  //    projects the cancelled booking.
  const wo3 = await newWorkOrder('Handshake cancelled');
  await expect('request WO3', C('POST', `/work-orders/${wo3.id}/staffing`, { startsAt: '2026-11-03T08:00:00Z', endsAt: '2026-11-03T12:00:00Z', capabilityCodes: [code] }), 200);
  const accepted3 = await staffed(wo3.id, 'ACCEPTED');
  const booking3 = await expect('book WO3', W('POST', '/bookings', { requestKey: randomUUID(), requirementId: accepted3.staffing.requirementRef, resourceId: person.id }), 201);
  await until('WO3 booking projected', async () => (await workOrder(wo3.id)).bookings.some((item) => item.bookingRef === booking3.id));
  const cancelled = await expect('cancel WO3', C('POST', `/work-orders/${wo3.id}/status`, { expectedVersion: accepted3.version, status: 'CANCELLED' }), 200);
  assert.equal(cancelled.staffing.status, 'CANCELLED');
  await until('Workforce requirement cancelled', async () => {
    const current = await expect('WO3 requirement', W('GET', `/work-requirements/${accepted3.staffing.requirementRef}`), 200);
    return current.status === 'CANCELLED' && current.bookings.every((item) => item.status === 'CANCELLED');
  });
  await until('cancelled booking projected', async () => (await workOrder(wo3.id)).bookings.every((item) => item.status === 'CANCELLED'));

  // 5. A request withdrawn before Workforce answers is never resurrected by the late acceptance; a new request
  //    for the same work order gets its own requirement.
  const wo4 = await newWorkOrder('Handshake withdrawn');
  await expect('request WO4', C('POST', `/work-orders/${wo4.id}/staffing`, { startsAt: '2026-11-04T08:00:00Z', endsAt: '2026-11-04T10:00:00Z', capabilityCodes: [code] }), 200);
  const withdrawn = await expect('withdraw WO4', C('POST', `/work-orders/${wo4.id}/staffing/cancel`, { reason: 'Planned elsewhere' }), 200);
  assert.equal(withdrawn.staffing.status, 'CANCELLED');
  const firstRequest = withdrawn.staffing.id;
  await until('first WO4 request settled in both modules', async () => {
    const current = await workOrder(wo4.id);
    const events = (await expect('WO4 history', C('GET', `/work-orders/${wo4.id}/history`), 200)).items;
    const relayed = events.filter((event) => event.actorSubject === 'relay:workforce').map((event) => event.details.workforceEvent);
    return current.staffing.status === 'CANCELLED' && relayed.includes('WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1') && relayed.includes('WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1');
  });
  await expect('request WO4 again', C('POST', `/work-orders/${wo4.id}/staffing`, { startsAt: '2026-11-04T08:00:00Z', endsAt: '2026-11-04T10:00:00Z', capabilityCodes: [code] }), 200);
  const second = await staffed(wo4.id, 'ACCEPTED');
  assert.notEqual(second.staffing.id, firstRequest);

  // 6. Tenant B sees and changes nothing of tenant A.
  const B = (method, path, body) => call(CMMS, env.CMMS_TOKEN_B, method, `/v1${path}`, body);
  await expect('tenant B read', B('GET', `/work-orders/${wo1.id}`), 404);
  await expect('tenant B staffing', B('POST', `/work-orders/${wo1.id}/staffing`, { startsAt: '2026-11-02T08:00:00Z', endsAt: '2026-11-02T12:00:00Z' }), 404);
  await expect('tenant B withdraw', B('POST', `/work-orders/${wo1.id}/staffing/cancel`, { reason: 'x' }), 404);
  await expect('tenant B requirement', call(WORKFORCE, env.WORKFORCE_TOKEN_B, 'GET', `/v1/work-requirements/${requirementId}`), 404);

  // 7. User contexts never reach an inbox; relay tokens never reach a user route.
  await expect('CMMS inbox with a user context', call(CMMS, env.CMMS_TOKEN_A, 'POST', '/internal/v1/inbox', { messageId: 'x', tenantId: 'x' }), 401);
  await expect('Workforce inbox with a user context', call(WORKFORCE, env.WORKFORCE_TOKEN_A, 'POST', '/internal/v1/inbox', { messageId: 'x', tenantId: 'x' }), 401);
  await expect('Workforce inbox unauthenticated', call(WORKFORCE, '', 'POST', '/internal/v1/inbox', {}), 401);

  process.stdout.write(JSON.stringify({ wo1: wo1.id, wo2: wo2.id, wo3: wo3.id, wo4: wo4.id, requirementId, bookingId: booking.id, personId: person.id }));
}

/** Direct deliveries signed on the host: a stale fact, its redelivery, and forged or mismatched tokens. */
async function inbox() {
  const ids = JSON.parse(env.IDS);
  const deliveries = JSON.parse(env.DELIVERIES);
  const post = (origin, delivery) => call(origin, delivery.token, 'POST', '/internal/v1/inbox', undefined, delivery.body);

  const first = await expect('stale booking fact', post(CMMS, deliveries.stale), 202);
  assert.equal(first.status, 'PROCESSED');
  const again = await expect('redelivered fact', post(CMMS, deliveries.stale), 202);
  assert.equal(again.status, 'DUPLICATE');
  const projected = (await workOrder(ids.wo1)).bookings.find((item) => item.bookingRef === ids.bookingId);
  assert.equal(projected.status, 'CONFIRMED', 'an older Workforce version never overwrites a newer projection');

  await expect('wrong audience', post(CMMS, deliveries.wrongAudience), 401);
  await expect('tenant mismatch', post(CMMS, deliveries.tenantMismatch), 401);
  await expect('tampered body', post(CMMS, deliveries.tampered), 401);
  await expect('forged key', post(CMMS, deliveries.forged), 401);
  await expect('CMMS-sourced token at CMMS', post(CMMS, deliveries.wrongSource), 401);
  await expect('relay token on a user route', call(CMMS, deliveries.stale.token, 'GET', `/v1/work-orders/${ids.wo1}`), 401);
  await expect('relay token on a Workforce user route', call(WORKFORCE, deliveries.stale.token, 'GET', `/v1/work-requirements/${ids.requirementId}`), 401);
  process.stdout.write('inbox-verified');
}

/** After both containers restart: the handshake state persisted and the relays still deliver. */
async function verify() {
  const ids = JSON.parse(env.IDS);
  const detail = await workOrder(ids.wo1);
  assert.equal(detail.staffing.status, 'ACCEPTED');
  assert.equal(detail.staffing.requirementRef, ids.requirementId);
  assert.equal(detail.bookings.find((item) => item.bookingRef === ids.bookingId)?.status, 'CONFIRMED');
  const booking = (await expect('requirement', W('GET', `/work-requirements/${ids.requirementId}`), 200)).bookings.find((item) => item.id === ids.bookingId);
  await expect('dispatch after restart', W('POST', `/bookings/${ids.bookingId}/status`, { expectedVersion: booking.version, status: 'DISPATCHED' }), 200);
  await until('dispatch projected after restart', async () => (await workOrder(ids.wo1)).bookings.some((item) => item.bookingRef === ids.bookingId && item.status === 'DISPATCHED'));
  assert.equal((await workOrder(ids.wo2)).staffing.status, 'REJECTED');
  await expect('tenant B after restart', call(CMMS, env.CMMS_TOKEN_B, 'GET', `/v1/work-orders/${ids.wo1}`), 404);
  process.stdout.write('verified');
}

const phases = { create, inbox, verify };
await phases[env.PHASE]();
