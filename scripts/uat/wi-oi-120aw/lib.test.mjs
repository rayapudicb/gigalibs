// node --test scripts/uat/wi-oi-120aw/lib.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APPROVED_PLAN_SHA256,
  CookieJar,
  classify,
  deadLetterCountSql,
  deadLetterDeleteSql,
  parseCsv,
  reasonPrefix,
  retryAfterSeconds,
  statusSql,
  suspendReason,
  validatePlan,
  verifySql,
} from './lib.mjs';

const planText = readFileSync(new URL('./plan-2026-10-15.csv', import.meta.url), 'utf8');
const plan = parseCsv(planText);

test('the committed plan is the approved one, and keeps its reviewed rules', () => {
  assert.equal(createHash('sha256').update(planText).digest('hex'), APPROVED_PLAN_SHA256);
  assert.deepEqual(validatePlan(plan), []);
  const count = (action) => plan.rows.filter((row) => row.action === action).length;
  assert.equal(count('KEEP'), 3);
  assert.equal(count('SUSPEND'), 225);
  assert.deepEqual(
    plan.rows
      .filter((row) => row.action === 'KEEP')
      .map((row) => row.slug)
      .sort(),
    ['gigalibs-global', 'uat-approver', 'uatadmin'],
  );
});

test('reads quoted CSV fields with commas, doubled quotes, line breaks and CRLF', () => {
  const parsed = parseCsv('a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\nplain,,last\n');
  assert.deepEqual(parsed.header, ['a', 'b', 'c']);
  assert.deepEqual(parsed.rows, [
    { a: 'x, y', b: 'say "hi"', c: 'two\nlines' },
    { a: 'plain', b: '', c: 'last' },
  ]);
});

test('refuses a plan with a bad action, id, status, missing reason or duplicate', () => {
  const header = plan.header;
  const row = { ...plan.rows.find((candidate) => candidate.action === 'SUSPEND') };
  const keep = { ...plan.rows.find((candidate) => candidate.action === 'KEEP') };
  const problems = validatePlan({
    header,
    rows: [
      keep,
      { ...row, action: 'DELETE' },
      { ...row, id: "x'; DROP TABLE tenants; --" },
      { ...row, id: 'other-1', status: 'CANCELLED' },
      { ...row, id: 'other-2', reason: ' ' },
      { ...row, id: 'other-2' },
    ],
  });
  assert.equal(problems.length, 5);
  assert.match(problems.join('\n'), /KEEP or SUSPEND/);
  assert.match(problems.join('\n'), /not a workspace id/);
  assert.match(problems.join('\n'), /ACTIVE, TRIAL or PROVISIONING/);
  assert.match(problems.join('\n'), /needs its reason/);
  assert.match(problems.join('\n'), /appears twice/);
  assert.match(validatePlan({ header: ['id'], rows: [] }).join('\n'), /header must be/);
});

test('the audited reason names the card and the plan, within the 500-character limit', () => {
  const row = plan.rows.find((candidate) => candidate.slug === 'paramount-pictures');
  assert.equal(
    suspendReason(row, APPROVED_PLAN_SHA256),
    'WI-OI-120aw (plan d3df8ec6f5ee): Real brand name, not a customer (closes WI-OI-120ak S7)',
  );
  assert.ok(
    suspendReason(row, APPROVED_PLAN_SHA256).startsWith(reasonPrefix(APPROVED_PLAN_SHA256)),
  );
  assert.equal(
    suspendReason({ ...row, reason: 'x'.repeat(600) }, APPROVED_PLAN_SHA256).length,
    500,
  );
  for (const candidate of plan.rows.filter((entry) => entry.action === 'SUSPEND')) {
    assert.ok(suspendReason(candidate, APPROVED_PLAN_SHA256).trim().length >= 3);
  }
});

test('classifies each planned workspace against its live status', () => {
  const rows = [
    { id: 'k1', slug: 'keep', action: 'KEEP', status: 'ACTIVE' },
    { id: 's1', slug: 'todo', action: 'SUSPEND', status: 'TRIAL' },
    { id: 's2', slug: 'done', action: 'SUSPEND', status: 'ACTIVE' },
    { id: 's3', slug: 'moved', action: 'SUSPEND', status: 'ACTIVE' },
    { id: 's4', slug: 'gone', action: 'SUSPEND', status: 'ACTIVE' },
  ];
  const live = new Map([
    ['k1', 'TRIAL'],
    ['s1', 'TRIAL'],
    ['s2', 'SUSPENDED'],
    ['s3', 'CANCELLED'],
  ]);
  const result = classify(rows, live);
  assert.deepEqual(
    result.todo.map((row) => row.slug),
    ['todo'],
  );
  assert.deepEqual(
    result.done.map((row) => row.slug),
    ['done'],
  );
  assert.deepEqual(
    result.moved.map((row) => [row.slug, row.live]),
    [['moved', 'CANCELLED']],
  );
  assert.deepEqual(
    result.missing.map((row) => row.slug),
    ['gone'],
  );
  assert.deepEqual(
    result.keepMoved.map((row) => [row.slug, row.live]),
    [['keep', 'TRIAL']],
  );
});

test('SQL embeds only checked workspace ids', () => {
  assert.equal(
    statusSql(['a1', 'b-2']),
    "SELECT id, status FROM public.tenants WHERE id = ANY(ARRAY['a1','b-2']::text[]) ORDER BY id;",
  );
  assert.throws(() => statusSql(["a'1"]), /not a workspace id/);
});

test('deletes exactly the expected dead letters of workspaces that do not exist, or nothing', () => {
  const count = deadLetterCountSql();
  assert.match(
    count,
    /gigalibs_geospatial\.outbox_events o WHERE o\.status = 'FAILED' AND NOT EXISTS/,
  );
  assert.match(count, /gigalibs_workforce\.outbox_events/);
  const remove = deadLetterDeleteSql();
  assert.match(remove, /^DO \$\$/);
  assert.match(remove, /IF deleted <> 980 THEN/);
  assert.match(remove, /IF deleted <> 114 THEN/);
  assert.match(remove, /RAISE EXCEPTION/);
  assert.equal((remove.match(/DELETE FROM/g) ?? []).length, 2);
  assert.doesNotMatch(remove, /PENDING|PUBLISHED/);
});

test('the read-back checks suspensions, kept workspaces, audit records, sessions and dead letters', () => {
  const sql = verifySql(plan.rows, APPROVED_PLAN_SHA256);
  assert.match(sql, /'suspended', 225, count\(\*\)/);
  assert.match(sql, /'kept unchanged', 3, count\(\*\)/);
  assert.match(sql, /'audited', 225, count\(DISTINCT a\."resourceId"\)/);
  assert.match(sql, /starts_with\(a\.metadata->>'reason', 'WI-OI-120aw \(plan d3df8ec6f5ee\): '\)/);
  assert.match(sql, /'active sessions in suspended', 0/);
  assert.match(sql, /'orphaned dead letters gigalibs_geospatial', 0/);
  assert.match(sql, /'orphaned dead letters gigalibs_workforce', 0/);
});

test('the cookie jar keeps session cookies and drops cleared ones', () => {
  const jar = new CookieJar();
  jar.take([
    'access=abc; Path=/; HttpOnly; SameSite=Lax',
    'refresh=def; Path=/api/auth; HttpOnly',
    'wf_session=; Max-Age=0',
  ]);
  assert.equal(jar.header(), 'access=abc; refresh=def');
  jar.take(['access=new; Path=/', 'refresh=gone; Expires=Thu, 01 Jan 1970 00:00:00 GMT']);
  assert.equal(jar.header(), 'access=new');
  assert.equal(jar.size, 1);
});

test('waits as long as Retry-After says, within bounds', () => {
  assert.equal(retryAfterSeconds(null), 5);
  assert.equal(retryAfterSeconds('7'), 7);
  assert.equal(retryAfterSeconds('0'), 1);
  assert.equal(retryAfterSeconds('9999'), 120);
  const now = Date.parse('2026-10-16T10:00:00Z');
  assert.equal(retryAfterSeconds('Fri, 16 Oct 2026 10:00:30 GMT', now), 30);
  assert.equal(retryAfterSeconds('soon'), 5);
});
