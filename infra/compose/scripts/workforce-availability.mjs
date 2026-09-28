// WI-OI-066 availability, absence and calendar journey, executed inside the Workforce API container by
// verify-workforce-availability.sh. The window 2026-10-19..31 crosses the end of European summer time
// (2026-10-25), so a 09:00 Berlin slot is 07:00Z before the change and 08:00Z after it.
import assert from 'node:assert/strict';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';
const WINDOW = { from: '2026-10-19T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' };

async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'X-Correlation-Id': `wi-oi-066-${env.RUN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const A = (method, path, body) => call(env.TOKEN_A, method, path, body);
const APPROVER = (method, path, body) => call(env.TOKEN_APPROVER, method, path, body);
const hours = (minutes) => minutes / 60;
const availability = (resourceId) => expect('availability', A('GET', `/availability?${new URLSearchParams({ resourceId, ...WINDOW })}`), 200);

async function create() {
  const run = env.RUN;
  const person = await expect('person', A('POST', '/resources', { referenceCode: `CERT-AV-${run}`, displayName: `Availability ${run}`, resourceType: 'HUMAN' }), 201, 200);
  const nightWorker = await expect('night worker', A('POST', '/resources', { referenceCode: `CERT-NW-${run}`, displayName: `Night ${run}`, resourceType: 'HUMAN' }), 201, 200);
  const team = await expect('team', A('POST', '/resources', { referenceCode: `CERT-AT-${run}`, displayName: 'Team', resourceType: 'TEAM' }), 201, 200);

  // The person holds a position at site X from October, so site X closures apply to them.
  const profile = await expect('profile', A('POST', '/job-profiles', { code: `CERT-AVP-${run}`, effectiveFrom: '2026-01-01', title: 'Operator', workerCategory: 'EMPLOYEE' }), 201);
  const position = await expect('position', A('POST', '/positions', { code: `CERT-AVS-${run}`, jobProfileId: profile.id, siteRef: env.SITE_X, effectiveFrom: '2026-01-01' }), 201);
  await expect('engagement', A('POST', '/engagements', { resourceId: person.id, positionId: position.id, engagementType: 'EMPLOYEE', startDate: '2026-10-01' }), 201);

  const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((day) => ({ day, start: '09:00', end: '17:00' }));
  const pattern = await expect('pattern', A('POST', '/availability-patterns', { resourceId: person.id, effectiveFrom: '2026-10-01', timeZone: 'Europe/Berlin', weeklySlots: weekdays }), 201);
  assert.equal(pattern.weeklyMinutes, 40 * 60);
  await expect('overlapping pattern', A('POST', '/availability-patterns', { resourceId: person.id, effectiveFrom: '2026-11-01', timeZone: 'Europe/Berlin', weeklySlots: weekdays }), 409);
  await expect('team pattern', A('POST', '/availability-patterns', { resourceId: team.id, effectiveFrom: '2026-10-01', timeZone: 'UTC', weeklySlots: weekdays }), 400);
  await expect('overnight pattern', A('POST', '/availability-patterns', {
    resourceId: nightWorker.id, effectiveFrom: '2026-10-01', timeZone: 'Asia/Tokyo', weeklySlots: [{ day: 'SATURDAY', start: '22:00', end: '06:00' }],
  }), 201);

  // Daylight saving: ten weekdays of 8 h; 09:00 Berlin is 07:00Z before 25 October and 08:00Z after it.
  let window = await availability(person.id);
  assert.equal(window.scheduledMinutes, 80 * 60);
  const starts = window.available.map((interval) => interval.start);
  assert.ok(starts.includes('2026-10-22T07:00:00.000Z'), `summer-time start missing: ${starts.join(',')}`);
  assert.ok(starts.includes('2026-10-29T08:00:00.000Z'), `winter-time start missing: ${starts.join(',')}`);
  const night = await expect('overnight availability', A('GET', `/availability?${new URLSearchParams({ resourceId: nightWorker.id, from: '2026-10-24T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' })}`), 200);
  assert.deepEqual(night.available, [{ start: '2026-10-24T13:00:00.000Z', end: '2026-10-24T21:00:00.000Z' }], 'Saturday 22:00–Sunday 06:00 in Tokyo');

  // Absence types and the four-eyes decision.
  const annual = await expect('annual type', A('POST', '/absence-types', { code: `CERT-ANNUAL-${run}`, name: 'Annual leave', paid: true, requiresApproval: true }), 201);
  const sick = await expect('sick type', A('POST', '/absence-types', { code: `CERT-SICK-${run}`, name: 'Sick leave', paid: true, requiresApproval: false }), 201);
  const leave = await expect('request annual leave', A('POST', '/absences', {
    resourceId: person.id, absenceTypeId: annual.id, startsAt: '2026-10-26T23:00:00.000Z', endsAt: '2026-10-28T23:00:00.000Z', note: 'Family visit',
  }), 201);
  assert.equal(leave.status, 'REQUESTED');
  window = await availability(person.id);
  assert.equal(window.availableMinutes, 80 * 60, 'a request does not block until approved');
  assert.equal(window.pendingAbsences.length, 1);
  await expect('self-approval refused', A('POST', `/absences/${leave.id}/approve`, { expectedVersion: 1 }), 403);
  await expect('reject needs a reason', APPROVER('POST', `/absences/${leave.id}/reject`, { expectedVersion: 1 }), 400);
  const approved = await expect('approve', APPROVER('POST', `/absences/${leave.id}/approve`, { expectedVersion: 1 }), 200);
  assert.equal(approved.status, 'APPROVED');
  await expect('approve twice', APPROVER('POST', `/absences/${leave.id}/approve`, { expectedVersion: 2 }), 409);
  await expect('overlapping request', A('POST', '/absences', {
    resourceId: person.id, absenceTypeId: annual.id, startsAt: '2026-10-28T08:00:00.000Z', endsAt: '2026-10-28T12:00:00.000Z',
  }), 409);
  const sickDay = await expect('sick leave (no approval)', A('POST', '/absences', {
    resourceId: person.id, absenceTypeId: sick.id, startsAt: '2026-10-30T08:00:00.000Z', endsAt: '2026-10-30T12:00:00.000Z',
  }), 201);
  assert.equal(sickDay.status, 'APPROVED');
  const rejected = await expect('request to reject', A('POST', '/absences', {
    resourceId: nightWorker.id, absenceTypeId: annual.id, startsAt: '2026-10-24T12:00:00.000Z', endsAt: '2026-10-25T00:00:00.000Z',
  }), 201);
  await expect('reject', APPROVER('POST', `/absences/${rejected.id}/reject`, { expectedVersion: 1, reason: 'Minimum staffing' }), 200);

  // Calendars: the tenant calendar applies to everyone, the site X calendar only to people holding a position there.
  const tenantCalendar = await expect('tenant calendar', A('POST', '/working-calendars', { code: `CERT-ORG-${run}`, name: 'Organisation' }), 201, 409);
  const orgCalendar = tenantCalendar.id
    ? tenantCalendar
    : (await expect('calendars', A('GET', '/working-calendars'), 200)).items.find((calendar) => calendar.siteRef === null);
  await expect('second tenant-wide calendar', A('POST', '/working-calendars', { code: `CERT-ORG2-${run}`, name: 'Duplicate' }), 409);
  await expect('tenant closure', A('POST', `/working-calendars/${orgCalendar.id}/closures`, { closureDate: '2026-10-26', label: 'Bank holiday' }), 201);
  await expect('duplicate closure', A('POST', `/working-calendars/${orgCalendar.id}/closures`, { closureDate: '2026-10-26', label: 'Again' }), 409);
  const siteCalendar = await expect('site calendar', A('POST', '/working-calendars', { code: `CERT-SITE-${run}`, name: 'Site X', siteRef: env.SITE_X }), 201);
  const withSiteClosure = await expect('site closure', A('POST', `/working-calendars/${siteCalendar.id}/closures`, { closureDate: '2026-10-23', label: 'Site shutdown' }), 201);
  const siteClosure = withSiteClosure.closures[0];

  window = await availability(person.id);
  const blocked = (reason) => window.blocked.filter((item) => item.reason === reason).reduce((sum, item) => sum + (Date.parse(item.end) - Date.parse(item.start)) / 60_000, 0);
  assert.equal(hours(blocked('CLOSURE')), 16, 'site closure (Fri 23) and bank holiday (Mon 26)');
  assert.equal(hours(blocked('ABSENCE')), 16 + 4, 'annual leave Tue 27–Wed 28 and a half sick day');
  assert.equal(hours(window.availableMinutes), 80 - 36);

  await expect('withdraw site closure', A('POST', `/working-calendars/${siteCalendar.id}/closures/${siteClosure.id}/withdraw`, {}), 200);
  await expect('cancel approved leave before it starts', A('POST', `/absences/${leave.id}/cancel`, { expectedVersion: 2, reason: 'Plans changed' }), 200);
  window = await availability(person.id);
  assert.equal(hours(window.availableMinutes), 80 - 8 - 4, 'only the bank holiday and the sick half-day remain');

  await expect('window too long', A('GET', `/availability?${new URLSearchParams({ resourceId: person.id, from: '2026-10-01T00:00:00Z', to: '2027-02-01T00:00:00Z' })}`), 400);
  process.stdout.write(JSON.stringify({ personId: person.id, leaveId: leave.id, sickId: sickDay.id, calendarId: siteCalendar.id, availableMinutes: window.availableMinutes }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const B = (method, path, body) => call(env.TOKEN_B, method, path, body);
  const window = await availability(ids.personId);
  assert.equal(window.availableMinutes, ids.availableMinutes, 'availability is identical after a restart');
  const absences = await expect('absences after restart', A('GET', `/absences?resourceId=${ids.personId}`), 200);
  assert.deepEqual(absences.items.map((item) => item.status).sort(), ['APPROVED', 'CANCELLED']);

  assert.equal((await expect('tenant B absences', B('GET', '/absences'), 200)).items.length, 0);
  assert.equal((await expect('tenant B calendars', B('GET', '/working-calendars'), 200)).items.length, 0);
  await expect('tenant B availability', B('GET', `/availability?${new URLSearchParams({ resourceId: ids.personId, ...WINDOW })}`), 404);
  await expect('tenant B approve', B('POST', `/absences/${ids.leaveId}/approve`, { expectedVersion: 3 }), 404);
  await expect('tenant B cancel', B('POST', `/absences/${ids.sickId}/cancel`, { expectedVersion: 1 }), 404);
  await expect('tenant B closure', B('POST', `/working-calendars/${ids.calendarId}/closures`, { closureDate: '2026-12-24', label: 'x' }), 404);
  await expect('tenant B pattern', B('POST', '/availability-patterns', { resourceId: ids.personId, effectiveFrom: '2027-01-01', timeZone: 'UTC', weeklySlots: [{ day: 'MONDAY', start: '09:00', end: '10:00' }] }), 404);
  process.stdout.write('verified');
}

(env.PHASE === 'create' ? create() : verify()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
