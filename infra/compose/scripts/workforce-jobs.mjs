// WI-OI-065 job profile, position and engagement journey, executed inside the Workforce API container by
// verify-workforce-jobs.sh (no module port is published). Prints a JSON result on success.
import assert from 'node:assert/strict';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';

async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': `wi-oi-065-${env.RUN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) {
    throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

const A = (method, path, body) => call(env.TOKEN_A, method, path, body);
const titleAsOf = async (profileId, asOf) => {
  const page = await expect(`profiles as of ${asOf}`, A('GET', `/job-profiles?asOf=${asOf}`), 200);
  return page.items.find((item) => item.id === profileId)?.current?.title ?? null;
};

async function create() {
  const run = env.RUN;
  const capability = await expect('capability', A('POST', '/capabilities', { code: `CERT-ELEC-${run}`, name: 'Electrical certification' }), 200, 201);
  const person = (name) => A('POST', '/resources', { referenceCode: `CERT-${name}-${run}`, displayName: `${name} ${run}`, resourceType: 'HUMAN' });
  const p1 = await expect('person 1', person('P1'), 200, 201);
  const p2 = await expect('person 2', person('P2'), 200, 201);
  const team = await expect('team', A('POST', '/resources', { referenceCode: `CERT-T1-${run}`, displayName: 'Cert team', resourceType: 'TEAM' }), 200, 201);

  // Effective-dated profile: a later revision leaves the current one in force until it starts.
  const profile = await expect('profile', A('POST', '/job-profiles', {
    code: `CERT-TECH-${run}`, effectiveFrom: '2026-01-01', title: 'Line technician', workerCategory: 'EMPLOYEE',
    requiredCapabilities: [{ capabilityDefinitionId: capability.id, minimumProficiency: 'ADVANCED' }],
  }), 201);
  assert.equal(profile.revisions.length, 1);
  assert.equal(profile.current.requiredCapabilities[0].capabilityCode, `CERT-ELEC-${run}`);
  const revised = await expect('revise', A('POST', `/job-profiles/${profile.id}/revisions`, {
    expectedVersion: 1, effectiveFrom: '2026-12-01', title: 'Senior line technician', workerCategory: 'EMPLOYEE',
  }), 201);
  assert.deepEqual(revised.revisions.map((revision) => [revision.effectiveFrom, revision.effectiveTo]), [['2026-01-01', '2026-12-01'], ['2026-12-01', null]]);
  await expect('back-dated revision', A('POST', `/job-profiles/${profile.id}/revisions`, {
    expectedVersion: 2, effectiveFrom: '2026-06-01', title: 'Back-dated', workerCategory: 'EMPLOYEE',
  }), 409);
  await expect('stale revision', A('POST', `/job-profiles/${profile.id}/revisions`, {
    expectedVersion: 1, effectiveFrom: '2027-06-01', title: 'Stale', workerCategory: 'EMPLOYEE',
  }), 409);
  assert.equal(await titleAsOf(profile.id, '2026-10-01'), 'Line technician');
  assert.equal(await titleAsOf(profile.id, '2027-01-15'), 'Senior line technician');
  assert.equal(await titleAsOf(profile.id, '2025-06-01'), null, 'no definition before the profile starts');
  await expect('unknown capability', A('POST', '/job-profiles', {
    code: `CERT-BAD-${run}`, effectiveFrom: '2026-01-01', title: 'x', workerCategory: 'EMPLOYEE',
    requiredCapabilities: [{ capabilityDefinitionId: '00000000-0000-4000-8000-000000000000' }],
  }), 400);

  // Positions at two sites; one ends at the turn of the year.
  const position = (code, siteRef, from, to) => A('POST', '/positions', { code: `CERT-${code}-${run}`, jobProfileId: profile.id, siteRef, effectiveFrom: from, effectiveTo: to });
  const posA = await expect('position A', position('POS-A', env.SITE_X, '2026-01-01', null), 201);
  const posB = await expect('position B', position('POS-B', env.SITE_Y, '2026-01-01', '2027-01-01'), 201);
  const posC = await expect('position C', position('POS-C', env.SITE_X, '2027-01-01', null), 201);
  const posD = await expect('position D', position('POS-D', env.SITE_X, '2026-01-01', null), 201);
  await expect('position before profile', position('POS-E', env.SITE_X, '2025-12-01', null), 400);
  await expect('duplicate position code', position('POS-A', env.SITE_X, '2026-01-01', null), 409);

  // One incumbent per position at any time, enforced by the database.
  const engage = (resourceId, positionId, startDate, endDate) =>
    A('POST', '/engagements', { resourceId, positionId, engagementType: 'EMPLOYEE', startDate, endDate });
  let detail = await expect('engage P1 in A', engage(p1.id, posA.id, '2026-02-01', null), 201);
  const firstEngagement = detail.engagements[0];
  await expect('second incumbent refused', engage(p2.id, posA.id, '2026-06-01', null), 409);
  await expect('team cannot be engaged', engage(team.id, posB.id, '2026-03-01', '2026-12-31'), 400);
  await expect('open-ended in an ending position', engage(p2.id, posB.id, '2026-03-01', null), 400);
  await expect('before the position starts', engage(p2.id, posC.id, '2026-12-01', null), 400);
  await expect('engage P2 in B', engage(p2.id, posB.id, '2026-03-01', '2026-12-31'), 201);
  await expect('shorten B below its engagement', A('PATCH', `/positions/${posB.id}`, { expectedVersion: 1, effectiveTo: '2026-10-01' }), 409);
  await expect('stale position update', A('PATCH', `/positions/${posA.id}`, { expectedVersion: 99, fte: 0.5 }), 409);
  detail = await expect('end P1 in A', A('POST', `/engagements/${firstEngagement.id}/end`, { expectedVersion: 1, endDate: '2026-09-01', reason: 'Transferred' }), 200);
  assert.equal(detail.engagements.find((item) => item.id === firstEngagement.id).status, 'ENDED');
  await expect('P2 follows P1 in A the day after', engage(p2.id, posA.id, '2026-09-01', null), 201);
  await expect('end twice', A('POST', `/engagements/${firstEngagement.id}/end`, { expectedVersion: 2, endDate: '2026-10-01', reason: 'x' }), 409);

  // A future engagement can be withdrawn and no longer blocks the position.
  detail = await expect('future engagement', engage(p1.id, posC.id, '2027-01-01', null), 201);
  const future = detail.engagements[0];
  await expect('withdraw future engagement', A('POST', `/engagements/${future.id}/cancel`, { expectedVersion: 1, reason: 'Offer withdrawn' }), 200);
  await expect('P2 takes C after the withdrawal', engage(p2.id, posC.id, '2027-01-01', null), 201);
  await expect('started engagement cannot be withdrawn', A('POST', `/engagements/${firstEngagement.id}/cancel`, { expectedVersion: 2, reason: 'x' }), 409);

  // As-of reads: who holds what on a date, and what is vacant.
  const onDate = async (asOf) => (await expect(`positions ${asOf}`, A('GET', `/positions?asOf=${asOf}`), 200)).items.filter((item) => item.code.endsWith(run));
  const oct = await onDate('2026-10-01');
  assert.equal(oct.find((item) => item.id === posA.id).incumbent.resourceId, p2.id);
  assert.equal(oct.find((item) => item.id === posB.id).incumbent.resourceId, p2.id);
  const july = await onDate('2026-07-01');
  assert.equal(july.find((item) => item.id === posA.id).incumbent.resourceId, p1.id, 'history is readable as of an earlier date');
  const vacant = (await expect('vacant', A('GET', '/positions?asOf=2026-10-01&vacantOnly=true'), 200)).items.filter((item) => item.code.endsWith(run));
  assert.deepEqual(vacant.map((item) => item.id), [posD.id]);
  const history = await expect('engagements of P2', A('GET', `/engagements?resourceId=${p2.id}`), 200);
  assert.equal(history.items.length, 3);

  // Place scope is exact: a member scoped to site Y sees and changes only site Y positions.
  const PLACE = (method, path, body) => call(env.TOKEN_PLACE, method, path, body);
  const scoped = (await expect('place list', PLACE('GET', '/positions?asOf=2026-10-01'), 200)).items.filter((item) => item.code.endsWith(run));
  assert.deepEqual(scoped.map((item) => item.id), [posB.id]);
  await expect('place read other site', PLACE('GET', `/positions/${posA.id}`), 404);
  await expect('place create other site', PLACE('POST', '/positions', { code: `CERT-POS-S-${run}`, jobProfileId: profile.id, siteRef: env.SITE_X, effectiveFrom: '2026-01-01' }), 403);

  process.stdout.write(JSON.stringify({ profileId: profile.id, posA: posA.id, posB: posB.id, p1: p1.id, p2: p2.id }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const B = (method, path, body) => call(env.TOKEN_B, method, path, body);
  assert.equal(await titleAsOf(ids.profileId, '2027-01-15'), 'Senior line technician', 'revisions persist across restart');
  const posA = await expect('position A after restart', A('GET', `/positions/${ids.posA}`), 200);
  assert.deepEqual(posA.engagements.map((item) => [item.resourceId, item.status]), [[ids.p2, 'ACTIVE'], [ids.p1, 'ENDED']]);

  assert.equal((await expect('tenant B profiles', B('GET', '/job-profiles'), 200)).items.length, 0);
  assert.equal((await expect('tenant B positions', B('GET', '/positions'), 200)).items.length, 0);
  await expect('tenant B read position', B('GET', `/positions/${ids.posA}`), 404);
  await expect('tenant B read profile', B('GET', `/job-profiles/${ids.profileId}`), 404);
  await expect('tenant B revise', B('POST', `/job-profiles/${ids.profileId}/revisions`, { expectedVersion: 2, effectiveFrom: '2027-06-01', title: 'x', workerCategory: 'EMPLOYEE' }), 404);
  await expect('tenant B update position', B('PATCH', `/positions/${ids.posB}`, { expectedVersion: 1, fte: 0.5 }), 404);
  await expect('tenant B engage in A position', B('POST', '/engagements', { resourceId: ids.p1, positionId: ids.posA, engagementType: 'EMPLOYEE', startDate: '2028-01-01' }), 404);
  await expect('tenant B position on A profile', B('POST', '/positions', { code: `CERT-X-${env.RUN}`, jobProfileId: ids.profileId, effectiveFrom: '2026-01-01' }), 404);
  process.stdout.write('verified');
}

(env.PHASE === 'create' ? create() : verify()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
