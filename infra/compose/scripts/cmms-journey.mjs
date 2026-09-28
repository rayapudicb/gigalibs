// WI-OI-038 CMMS journey phases, executed inside the CMMS API container by verify-cmms-journey.sh (no module
// port is published). Reads signed tokens and ids from the environment; prints a JSON result on success.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const env = process.env;
const base = 'http://127.0.0.1:4200/v1';

async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': `wi-oi-038-journey-${env.RUN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null), replayed: response.headers.get('idempotency-replayed') };
}

async function expect(label, promise, ...statuses) {
  const result = await promise;
  if (!statuses.includes(result.status)) {
    throw new Error(`${label}: expected ${statuses.join('/')}, received ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

const A = (method, path, body) => call(env.TOKEN_A, method, path, body);
const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();

async function create() {
  const run = env.RUN;
  const [siteX, siteY] = [env.SITE_X, env.SITE_Y];

  // Assets at two sites and two departments; tags are unique; the hierarchy refuses cycles.
  const pump = await expect('create pump', A('POST', '/assets', {
    assetTag: `CERT-PUMP-${run}`, name: `Cert pump ${run}`, siteRef: siteX, departmentId: 'dept-cert-1',
    criticality: 'HIGH', acquisitionCost: 12000, currencyCode: 'USD',
  }), 201);
  assert.equal(pump.version, 1);
  const motor = await expect('create motor', A('POST', '/assets', {
    assetTag: `CERT-MOTOR-${run}`, name: `Cert motor ${run}`, siteRef: siteX, departmentId: 'dept-cert-1', parentAssetId: pump.id,
  }), 201);
  const compressor = await expect('create compressor', A('POST', '/assets', {
    assetTag: `CERT-COMP-${run}`, name: `Cert compressor ${run}`, siteRef: siteY, departmentId: 'dept-cert-2',
  }), 201);
  await expect('create tenant-wide asset', A('POST', '/assets', { assetTag: `CERT-SHARED-${run}`, name: `Cert shared tool ${run}` }), 201);
  await expect('duplicate tag', A('POST', '/assets', { assetTag: `cert-pump-${run}`, name: 'Duplicate' }), 409);
  await expect('cost without currency', A('POST', '/assets', { assetTag: `CERT-X-${run}`, name: 'x', acquisitionCost: 5 }), 400);
  await expect('hierarchy cycle', A('PATCH', `/assets/${pump.id}`, { expectedVersion: 1, parentAssetId: motor.id }), 400);
  await expect('caller-supplied tenant', A('POST', '/assets', { assetTag: `CERT-T-${run}`, name: 'x', tenantId: 'other' }), 400);

  // Part with an opening balance recorded as a ledger receipt.
  const bearing = await expect('create part', A('POST', '/parts', {
    partNumber: `CERT-BRG-${run}`, name: 'Certification bearing', currencyCode: 'USD', unitCost: 12.5,
    openingQuantity: 5, reorderPoint: 2, siteRef: siteX,
  }), 201);
  assert.equal(bearing.quantityOnHand, 5);

  // Counter meter: out-of-order readings are kept but never replace a newer latest value.
  const meter = await expect('create meter', A('POST', '/meters', { assetId: pump.id, name: 'Run hours', unit: 'h', readingType: 'COUNTER', maxThreshold: 10000 }), 201);
  await expect('reading 100', A('POST', `/meters/${meter.id}/readings`, { requestKey: randomUUID(), value: 100, readAt: hoursAgo(2) }), 200);
  const key150 = randomUUID();
  await expect('reading 150', A('POST', `/meters/${meter.id}/readings`, { requestKey: key150, value: 150, readAt: hoursAgo(1) }), 200);
  const late = await expect('late reading 120', A('POST', `/meters/${meter.id}/readings`, { requestKey: randomUUID(), value: 120, readAt: hoursAgo(1.5) }), 200);
  assert.equal(late.meter.lastValue, 150, 'an older reading must not replace the latest value');
  await expect('counter regression', A('POST', `/meters/${meter.id}/readings`, { requestKey: randomUUID(), value: 90 }), 400);
  await expect('counter above a later reading', A('POST', `/meters/${meter.id}/readings`, { requestKey: randomUUID(), value: 130, readAt: hoursAgo(1.75) }), 400);
  const replay = await expect('reading replay', A('POST', `/meters/${meter.id}/readings`, { requestKey: key150, value: 150, readAt: hoursAgo(1) }), 200);
  assert.equal(replay.replayed, true);
  await expect('future reading', A('POST', `/meters/${meter.id}/readings`, { requestKey: randomUUID(), value: 200, readAt: new Date(Date.now() + 86_400_000).toISOString() }), 400);

  // Preventive schedule: one due occurrence yields exactly one work order and advances the schedule.
  const schedule = await expect('create schedule', A('POST', '/pm-schedules', {
    name: `Cert monthly lubrication ${run}`, assetId: pump.id, intervalCount: 1, intervalUnit: 'MONTH',
    timeZone: 'Asia/Tokyo', firstDueAt: hoursAgo(24), woTitle: `Lubricate pump ${run}`, requiresSignature: true,
    taskLabels: ['Grease bearings', 'Check alignment'],
  }), 201);
  assert.equal(schedule.overdue, true);
  const generated = await expect('generate due work', A('POST', `/pm-schedules/${schedule.id}/generate`, { expectedVersion: 1 }), 200);
  const preventive = generated.workOrder;
  assert.equal(preventive.triggerSource, 'PM_SCHEDULE');
  assert.equal(preventive.tasks.length, 2);
  assert.equal(preventive.siteRef, siteX, 'work order inherits the asset site');
  assert.equal(new Date(generated.schedule.nextDueAt).getTime() > Date.now(), true, 'schedule advanced past now');
  await expect('stale generate', A('POST', `/pm-schedules/${schedule.id}/generate`, { expectedVersion: 1 }), 409);

  // Manual work order: a repeated request key returns the original.
  const requestKey = randomUUID();
  const manual = await call(env.TOKEN_A, 'POST', '/work-orders', { requestKey, type: 'REACTIVE', priority: 'HIGH', title: `Cert leak ${run}`, assetId: compressor.id });
  assert.equal(manual.status, 201, JSON.stringify(manual.body));
  const again = await call(env.TOKEN_A, 'POST', '/work-orders', { requestKey, type: 'REACTIVE', title: 'different' });
  assert.equal(again.status, 200);
  assert.equal(again.replayed, 'true');
  assert.equal(again.body.id, manual.body.id);
  assert.match(manual.body.woNumber, /^WO-\d{6}$/);

  // Execution and completion proof on the preventive work order.
  const wo = preventive.id;
  await expect('complete from OPEN', A('POST', `/work-orders/${wo}/status`, { expectedVersion: preventive.version, status: 'COMPLETED' }), 409);
  await expect('labour before start', A('POST', `/work-orders/${wo}/labour`, { workerRef: 'wi-oi-038-tech', hours: 1, performedOn: '2026-09-27' }), 409);
  let current = await expect('start', A('POST', `/work-orders/${wo}/status`, { expectedVersion: preventive.version, status: 'IN_PROGRESS' }), 200);
  assert.ok(current.startedAt);
  await expect('stale status change', A('POST', `/work-orders/${wo}/status`, { expectedVersion: preventive.version, status: 'ON_HOLD' }), 409);
  await expect('complete with pending tasks', A('POST', `/work-orders/${wo}/status`, { expectedVersion: current.version, status: 'COMPLETED', signatureData: 'typed:Cert' }), 409);
  for (const task of current.tasks) {
    current = await expect(`record ${task.label}`, A('PATCH', `/work-orders/${wo}/tasks/${task.id}`, { expectedVersion: task.version, status: 'DONE', resultValue: 1 }), 200);
  }
  current = await expect('log labour', A('POST', `/work-orders/${wo}/labour`, {
    workerRef: 'wi-oi-038-tech', hours: 2.5, hourlyRate: 40, currencyCode: 'USD', performedOn: '2026-09-27',
  }), 200);
  const issueKey = randomUUID();
  current = await expect('issue 2', A('POST', `/work-orders/${wo}/parts`, { partId: bearing.id, quantity: 2, idempotencyKey: issueKey }), 200);
  await expect('issue replay', A('POST', `/work-orders/${wo}/parts`, { partId: bearing.id, quantity: 2, idempotencyKey: issueKey }), 200);
  const afterIssue = await expect('part after issue', A('GET', `/parts/${bearing.id}`), 200);
  assert.equal(afterIssue.quantityOnHand, 3, 'a replayed issue must not move stock twice');

  // Five concurrent issues of one against three on hand: exactly three succeed; stock never goes negative.
  const racers = await Promise.all(
    Array.from({ length: 5 }, () => call(env.TOKEN_A, 'POST', `/work-orders/${wo}/parts`, { partId: bearing.id, quantity: 1, idempotencyKey: randomUUID() })),
  );
  const won = racers.filter((result) => result.status === 200).length;
  const refused = racers.filter((result) => result.status === 409 && result.body?.code === 'CMMS_INSUFFICIENT_STOCK').length;
  assert.equal(won, 3, `concurrent issues: ${racers.map((result) => result.status).join(',')}`);
  assert.equal(refused, 2);

  await expect('return 1', A('POST', `/parts/${bearing.id}/movements`, { movementType: 'RETURN', idempotencyKey: randomUUID(), quantity: 1, workOrderId: wo }), 200);
  await expect('return more than issued', A('POST', `/parts/${bearing.id}/movements`, { movementType: 'RETURN', idempotencyKey: randomUUID(), quantity: 10, workOrderId: wo }), 400);
  await expect('adjust -1', A('POST', `/parts/${bearing.id}/movements`, { movementType: 'ADJUSTMENT', idempotencyKey: randomUUID(), quantityDelta: -1, reason: 'Cycle count' }), 200);
  await expect('adjust below zero', A('POST', `/parts/${bearing.id}/movements`, { movementType: 'ADJUSTMENT', idempotencyKey: randomUUID(), quantityDelta: -1, reason: 'Cycle count' }), 409);
  await expect('adjust without reason', A('POST', `/parts/${bearing.id}/movements`, { movementType: 'ADJUSTMENT', idempotencyKey: randomUUID(), quantityDelta: 1 }), 400);

  current = await expect('read before completion', A('GET', `/work-orders/${wo}`), 200);
  await expect('complete without signature', A('POST', `/work-orders/${wo}/status`, { expectedVersion: current.version, status: 'COMPLETED' }), 400);
  const completed = await expect('complete with signature', A('POST', `/work-orders/${wo}/status`, {
    expectedVersion: current.version, status: 'COMPLETED', notes: 'Lubricated and aligned', signatureData: 'typed:WI-OI-038 Certifier',
  }), 200);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.signed, true);
  assert.equal(completed.labourHours, 2.5);
  assert.deepEqual(completed.costs, [{ currencyCode: 'USD', amount: 150 }], 'labour 2.5 h x 40 + 4 bearings x 12.5');
  await expect('terminal state', A('POST', `/work-orders/${wo}/status`, { expectedVersion: completed.version, status: 'IN_PROGRESS' }), 409);
  await expect('no labour after completion', A('POST', `/work-orders/${wo}/labour`, { workerRef: 'x', hours: 1, performedOn: '2026-09-27' }), 409);
  await expect('note after completion', A('POST', `/work-orders/${wo}/notes`, { body: 'Follow-up: order spare bearings.' }), 200);

  // Department scope: dept-cert-1 sees its own and tenant-wide rows only; scoped writes stay in scope.
  const DEPT = (method, path, body) => call(env.TOKEN_DEPT, method, path, body);
  const deptAssets = await expect('dept search', DEPT('POST', '/assets/search', { q: run }), 200);
  assert.deepEqual(deptAssets.items.map((asset) => asset.assetTag).sort(), [`CERT-MOTOR-${run}`, `CERT-PUMP-${run}`, `CERT-SHARED-${run}`]);
  await expect('dept read other department', DEPT('GET', `/assets/${compressor.id}`), 404);
  await expect('dept write other department', DEPT('POST', '/assets', { assetTag: `CERT-D2-${run}`, name: 'x', departmentId: 'dept-cert-2' }), 403);
  await expect('dept write tenant-wide', DEPT('POST', '/assets', { assetTag: `CERT-D0-${run}`, name: 'x' }), 403);

  // Place scope is exact: only site Y records, never unsited or tenant-wide ones.
  const PLACE = (method, path, body) => call(env.TOKEN_PLACE, method, path, body);
  const placeAssets = await expect('place search', PLACE('POST', '/assets/search', { q: run }), 200);
  assert.deepEqual(placeAssets.items.map((asset) => asset.assetTag), [`CERT-COMP-${run}`]);
  await expect('place read other site', PLACE('GET', `/work-orders/${wo}`), 404);
  await expect('place write other site', PLACE('POST', '/assets', { assetTag: `CERT-P2-${run}`, name: 'x', siteRef: siteX }), 403);
  const placeWork = await expect('place work search', PLACE('POST', '/work-orders/search', { q: run }), 200);
  assert.deepEqual(placeWork.items.map((item) => item.id), [manual.body.id]);

  const empty = await expect('empty scope', call(env.TOKEN_EMPTY, 'POST', '/assets/search', { q: run }), 200);
  assert.equal(empty.total, 0, 'an empty department scope sees nothing, not even tenant-wide assets');

  const overview = await expect('overview', A('GET', '/analytics/work-orders/overview'), 200);
  assert.ok(overview.completedLast30Days >= 1 && overview.averageCycleHours !== null);
  const inventory = await expect('inventory', A('GET', '/analytics/inventory/summary'), 200);
  assert.ok(inventory.valuation.every((total) => /^[A-Z]{3}$/.test(total.currencyCode)));

  process.stdout.write(JSON.stringify({
    pumpId: pump.id, compressorId: compressor.id, partId: bearing.id, meterId: meter.id, scheduleId: schedule.id,
    workOrderId: wo, manualId: manual.body.id, scheduleNextDue: generated.schedule.nextDueAt,
  }));
}

async function verify() {
  const ids = JSON.parse(env.IDS);
  const B = (method, path, body) => call(env.TOKEN_B, method, path, body);
  const wo = await expect('work order after restart', A('GET', `/work-orders/${ids.workOrderId}`), 200);
  assert.equal(wo.status, 'COMPLETED');
  assert.equal(wo.signed, true);
  assert.deepEqual(wo.costs, [{ currencyCode: 'USD', amount: 150 }]);
  assert.equal(wo.notes.length, 1);
  const part = await expect('part after restart', A('GET', `/parts/${ids.partId}`), 200);
  assert.equal(part.quantityOnHand, 0);
  const movements = await expect('ledger after restart', A('GET', `/parts/${ids.partId}/movements`), 200);
  assert.equal(movements.items.reduce((sum, movement) => sum + movement.quantityDelta, 0), part.quantityOnHand, 'ledger sum equals balance');
  const schedules = await expect('schedules after restart', A('GET', '/pm-schedules'), 200);
  assert.equal(schedules.items.find((item) => item.id === ids.scheduleId)?.nextDueAt, ids.scheduleNextDue);
  const meters = await expect('meters after restart', A('GET', `/meters?assetId=${ids.pumpId}`), 200);
  assert.equal(meters.items[0]?.lastValue, 150);

  // A second tenant can neither see nor change tenant A records.
  assert.equal((await expect('tenant B assets', B('POST', '/assets/search', { q: env.RUN }), 200)).total, 0);
  assert.equal((await expect('tenant B work', B('POST', '/work-orders/search', {}), 200)).total, 0);
  await expect('tenant B read work order', B('GET', `/work-orders/${ids.workOrderId}`), 404);
  await expect('tenant B read asset', B('GET', `/assets/${ids.pumpId}`), 404);
  await expect('tenant B change status', B('POST', `/work-orders/${ids.manualId}/status`, { expectedVersion: 1, status: 'IN_PROGRESS' }), 404);
  await expect('tenant B note', B('POST', `/work-orders/${ids.manualId}/notes`, { body: 'cross-tenant' }), 404);
  await expect('tenant B read part', B('GET', `/parts/${ids.partId}`), 404);
  await expect('tenant B stock movement', B('POST', `/parts/${ids.partId}/movements`, { movementType: 'RECEIPT', idempotencyKey: randomUUID(), quantity: 1 }), 404);
  await expect('tenant B reading', B('POST', `/meters/${ids.meterId}/readings`, { requestKey: randomUUID(), value: 999 }), 404);
  await expect('tenant B generate', B('POST', `/pm-schedules/${ids.scheduleId}/generate`, { expectedVersion: 2 }), 404);
  await expect('tenant B work order on A asset', B('POST', '/work-orders', { requestKey: randomUUID(), type: 'REACTIVE', title: 'x', assetId: ids.pumpId }), 404);
  process.stdout.write('verified');
}

(env.PHASE === 'create' ? create() : verify()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
