// node --test scripts/uat/wi-oi-120al/lib.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlan, parseCopy, parsePgTextArray, renderApplySql, renderCheckSql, sqlText, validatePlan, OWNER_RUN_ACTOR } from './lib.mjs';

const reference = {
  members: [
    { id: 'm1', permissions: '{cmms:*}' },
    { id: 'm2', permissions: '{*}' },
    { id: 'm4', permissions: '{cmms:read}' },
  ],
  entitlements: [
    { tenantId: 't1', moduleKey: 'asset-maintenance', status: 'ENABLED', source: 'TRIAL', startsAt: '2026-09-01 00:00:00+00', endsAt: '2026-10-20 00:00:00+00', reason: 'trial', updatedById: 'u1' },
    { tenantId: 't1', moduleKey: 'tax-configuration', status: 'DISABLED', source: 'TRIAL', startsAt: '2026-09-01 00:00:00+00', endsAt: '2026-10-20 00:00:00+00', reason: 'off', updatedById: 'u1' },
  ],
  tenants: [{ id: 't1', features: '{asset-maintenance}' }],
};
const BOOT = 'local-development-bootstrap';
const live = {
  members: [
    { id: 'm1', tenantId: 't1', permissions: ['cmms:*', '*', 'assistant:*', 'assistant:read', 'assistant:action', 'assistant:preview'] },
    { id: 'm2', tenantId: 't1', permissions: ['*', 'assistant:*'] },
    { id: 'm3', tenantId: 't1', permissions: ['assistant:preview', 'workforce:read'] },
    { id: 'm4', tenantId: 't1', permissions: ['cmms:read'] },
  ],
  entitlements: [
    { id: 'e1', tenantId: 't1', moduleKey: 'asset-maintenance', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', startsAt: '2026-09-01T00:00:00+00:00', endsAt: null, reason: 'Automated local enablement', updatedById: BOOT, createdAt: '2026-09-01T00:00:00+00:00' },
    { id: 'e2', tenantId: 't1', moduleKey: 'tax-configuration', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', startsAt: '2026-09-01T00:00:00+00:00', endsAt: null, reason: 'Automated local enablement', updatedById: BOOT, createdAt: '2026-09-01T00:00:00+00:00' },
    { id: 'e3', tenantId: 't1', moduleKey: 'esignature', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', startsAt: '2026-10-09T06:47:00+00:00', endsAt: null, reason: 'Automated local enablement', updatedById: BOOT, createdAt: '2026-10-09T06:47:00+00:00' },
    { id: 'e4', tenantId: 't1', moduleKey: 'gigalibs-assistant', status: 'ENABLED', source: 'TRIAL', startsAt: '2026-10-10T00:00:00+00:00', endsAt: null, reason: 'trial', updatedById: 'dev-server', createdAt: '2026-10-10T00:00:00+00:00' },
    { id: 'e5', tenantId: 't1', moduleKey: 'gigaops', status: 'ENABLED', source: 'PLAN', startsAt: '2026-10-12T00:00:00+00:00', endsAt: null, reason: 'chosen', updatedById: 'admin', createdAt: '2026-10-12T00:00:00+00:00' },
    { id: 'e6', tenantId: 't1', moduleKey: 'operational-ontology', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', startsAt: '2026-10-05T00:00:00+00:00', endsAt: null, reason: 'Automated local enablement', updatedById: BOOT, createdAt: '2026-10-05T00:00:00+00:00' },
  ],
  tenants: [{ id: 't1', features: ['asset-maintenance', 'esignature', 'tax-configuration', 'gigalibs-assistant', 'gigaops'] }],
};

test('reads COPY rows and array literals', () => {
  const rows = parseCopy('SET x;\nCOPY public.t (id, "tenantId", permissions) FROM stdin;\na\t\\N\t{*,"a b","c,d"}\nb\tt\\tx\t{}\n\\.\n');
  assert.deepEqual(rows, [
    { id: 'a', tenantId: null, permissions: '{*,"a b","c,d"}' },
    { id: 'b', tenantId: 't\tx', permissions: '{}' },
  ]);
  assert.deepEqual(parsePgTextArray('{*,"a b","c,d"}'), ['*', 'a b', 'c,d']);
  assert.deepEqual(parsePgTextArray('{}'), []);
  assert.deepEqual(parsePgTextArray(null), []);
});

test('classifies every entitlement and never changes what it cannot place', () => {
  const plan = buildPlan({ reference, live });
  const byId = Object.fromEntries(plan.entitlements.map((c) => [c.id, c]));
  // e1 overwritten: the trial source and end date come back.
  assert.equal(byId.e1.class, 'B');
  assert.deepEqual(
    { status: byId.e1.after.status, source: byId.e1.after.source, endsAt: byId.e1.after.endsAt, updatedById: byId.e1.after.updatedById },
    { status: 'ENABLED', source: 'TRIAL', endsAt: '2026-10-20 00:00:00+00', updatedById: 'u1' },
  );
  // e2 overwritten: it was switched off before the script.
  assert.equal(byId.e2.after.status, 'DISABLED');
  // e3 created by the script: switched off, row kept.
  assert.equal(byId.e3.class, 'A');
  assert.equal(byId.e3.after.status, 'DISABLED');
  assert.equal(byId.e3.after.updatedById, OWNER_RUN_ACTOR);
  // e4 the Assistant from another flow: switched off.
  assert.equal(byId.e4.class, 'X');
  assert.equal(byId.e4.after.status, 'DISABLED');
  // e5 a real actor's choice: untouched. e6 outside the script's dates and not in the reference: unplaced.
  assert.equal(byId.e5, undefined);
  assert.equal(byId.e6, undefined);
  assert.deepEqual(plan.unplaced.map((u) => u.id), ['e6']);
  assert.deepEqual(plan.summary.entitlements, {
    createdByScriptDisabled: 1, overwrittenRestored: 2, assistantDisabled: 1, notWrittenByScriptLeftAlone: 1, unplaced: 1, workspaces: 1,
  });
});

test('removes only the codes the script added; an older wildcard stays unless the owner chooses otherwise', () => {
  const plan = buildPlan({ reference, live });
  const byId = Object.fromEntries(plan.members.map((c) => [c.id, c.after]));
  assert.deepEqual(byId.m1, ['cmms:*']);
  assert.deepEqual(byId.m2, ['*']);
  assert.deepEqual(byId.m3, ['workforce:read']);
  assert.equal(byId.m4, undefined);
  assert.equal(plan.summary.members.legacyWildcardKept, 1);
  const q3 = buildPlan({ reference, live, options: { removeLegacyWildcard: true } });
  assert.deepEqual(Object.fromEntries(q3.members.map((c) => [c.id, c.after])).m2, []);
  assert.equal(q3.summary.members.legacyWildcardKept, 0);
});

test('feature lists lose the script keys the workspace never had, and the Assistant', () => {
  const plan = buildPlan({ reference, live });
  assert.deepEqual(plan.tenants, [
    { id: 't1', before: live.tenants[0].features, after: ['asset-maintenance', 'gigaops'] },
  ]);
});

test('the SQL checks every planned row before changing it and stops otherwise', () => {
  const plan = buildPlan({ reference, live });
  const check = renderCheckSql(plan);
  assert.match(check, /SELECT 'entitlements', 4, count\(\*\)/);
  assert.match(check, /SELECT 'members', 3, count\(\*\)/);
  assert.match(check, /SELECT 'tenants', 1, count\(\*\)/);
  assert.doesNotMatch(check, /UPDATE|INSERT|DELETE/);
  const apply = renderApplySql(plan, { planSha256: 'abc' });
  assert.match(apply, /IF changed <> 4 THEN\s+RAISE EXCEPTION/);
  assert.match(apply, /IF changed <> 3 THEN\s+RAISE EXCEPTION/);
  assert.match(apply, /IF changed <> 1 THEN\s+RAISE EXCEPTION/);
  assert.match(apply, /'PERMISSION_CHANGE'::"AuditAction"/);
  assert.match(apply, /'tenant\.entitlements\.changed\.v1'/);
  assert.doesNotMatch(apply, /DELETE /);
  assert.equal(sqlText("it's"), "'it''s'");
});

test('refuses a plan whose values could end the SQL block early', () => {
  const plan = buildPlan({ reference, live });
  plan.entitlements[0].after.reason = 'x $w120al$; DROP TABLE tenants; --';
  assert.throws(() => renderApplySql(plan, { planSha256: 'abc' }), /block tag/);
});

test('reads exactly one COPY block and compares dates as instants', () => {
  assert.throws(() => parseCopy('COPY public.a (id) FROM stdin;\nx\n\\.\nCOPY public.b (id) FROM stdin;\ny\n\\.\n'), /exactly one COPY block/);
  // 2026-10-08T23:30-01:00 is 2026-10-09T00:30Z, inside the script's days; a string comparison would place it outside.
  const late = { ...live, entitlements: live.entitlements.map((e) => (e.id === 'e6' ? { ...e, createdAt: '2026-10-08T23:30:00-01:00' } : e)) };
  const plan = buildPlan({ reference, live: late });
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.entitlements.find((c) => c.id === 'e6').class, 'A');
});

test('leaves a switched-off Assistant row alone and forces a restored Assistant row off', () => {
  const ref = { ...reference, entitlements: [...reference.entitlements, { tenantId: 't1', moduleKey: 'gigalibs-assistant', status: 'ENABLED', source: 'TRIAL', startsAt: '2026-09-01 00:00:00+00', endsAt: null, reason: 'x', updatedById: 'u1' }] };
  const rows = live.entitlements.filter((e) => e.id !== 'e4').concat([
    { id: 'e7', tenantId: 't1', moduleKey: 'gigalibs-assistant', status: 'ENABLED', source: 'PLATFORM_OVERRIDE', startsAt: '2026-09-01T00:00:00+00:00', endsAt: null, reason: 'Automated local enablement', updatedById: 'local-development-bootstrap', createdAt: '2026-09-01T00:00:00+00:00' },
    { id: 'e8', tenantId: 't2', moduleKey: 'gigalibs-assistant', status: 'DISABLED', source: 'TRIAL', startsAt: '2026-10-10T00:00:00+00:00', endsAt: null, reason: 'off', updatedById: 'dev-server', createdAt: '2026-10-10T00:00:00+00:00' },
  ]);
  const plan = buildPlan({ reference: ref, live: { ...live, entitlements: rows } });
  const byId = Object.fromEntries(plan.entitlements.map((c) => [c.id, c]));
  assert.equal(byId.e7.class, 'B');
  assert.equal(byId.e7.after.status, 'DISABLED');
  assert.equal(byId.e8, undefined);
});

test('the older wildcard option removes it in the generated SQL too', () => {
  const plan = buildPlan({ reference, live, options: { removeLegacyWildcard: true } });
  const m2 = plan.members.find((m) => m.id === 'm2');
  assert.deepEqual(m2.after, []);
  assert.match(renderApplySql(plan, { planSha256: 'abc' }), /\('m2', ARRAY\['\*','assistant:\*'\]::text\[\], ARRAY\[\]::text\[\]\)/);
});

test('quotes backslashes and psql variable text as plain literals', () => {
  assert.equal(sqlText('a\\b'), "'a\\b'");
  assert.equal(sqlText(':var and :\'x\''), "':var and :''x'''");
  const plan = buildPlan({ reference, live });
  plan.entitlements[0].after.reason = ':evil \\ text';
  // One backslash stays one backslash: standard_conforming_strings is on, so nothing inside quotes is an escape.
  assert.match(renderApplySql(plan, { planSha256: 'abc' }), /':evil \\ text'/);
});

test('validatePlan accepts the reviewed shape and refuses anything else', () => {
  const plan = buildPlan({ reference, live });
  plan.unplaced = [];
  assert.deepEqual(validatePlan(plan), []);
  const bad = JSON.parse(JSON.stringify(plan));
  bad.members[0].after = [];
  assert.match(validatePlan(bad).join(';'), /removes cmms:\*/);
  const bad2 = JSON.parse(JSON.stringify(plan));
  bad2.tenants[0].after = [];
  assert.match(validatePlan(bad2).join(';'), /removes feature gigaops/);
  const bad3 = JSON.parse(JSON.stringify(plan));
  bad3.entitlements.find((e) => e.class === 'A').after.status = 'ENABLED';
  assert.match(validatePlan(bad3).join(';'), /must end DISABLED/);
  const bad4 = JSON.parse(JSON.stringify(plan));
  bad4.entitlements[0].before.updatedById = 'admin';
  assert.match(validatePlan(bad4).join(';'), /not written by the script/);
  assert.match(validatePlan({ ...plan, unplaced: [{ id: 'x' }] }).join(';'), /unplaced/);
});

