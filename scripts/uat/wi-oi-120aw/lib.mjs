// WI-OI-120aw: the pure parts of the owner-run suspension (plan, SQL, the sign-in cookie jar). Tested by lib.test.mjs.

/** The plan the owner approved on 2026-10-16 ("plan approved as is"); any other plan content is refused. */
export const APPROVED_PLAN_SHA256 =
  'd3df8ec6f5ee9f53a1964ac9d332503ae4f9354fb967824b1759510399f32f84';

/**
 * Dead letters whose workspace does not exist (read-only, 2026-10-16; WI-OI-120as): all FAILED, none replayable.
 * The 8 Workforce dead letters of existing workspaces stay with their (suspended) workspace.
 */
export const DEAD_LETTERS = [
  { schema: 'gigalibs_geospatial', expected: 980 },
  { schema: 'gigalibs_workforce', expected: 114 },
];

export const PLAN_HEADER = [
  'action',
  'reason',
  'id',
  'slug',
  'name',
  'status',
  'kind',
  'created',
  'active_members',
  'last_session',
];
const LIVE_STATUSES = new Set(['ACTIVE', 'TRIAL', 'PROVISIONING']);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** RFC 4180 CSV (quoted fields, doubled quotes, commas and line breaks inside quotes) into header-keyed rows. */
export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[at + 1] === '\n') at += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header = [], ...rows] = records.filter(
    (cells) => !(cells.length === 1 && cells[0] === ''),
  );
  return {
    header,
    rows: rows.map((cells) =>
      Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])),
    ),
  };
}

/** The reviewed rules every plan row must keep; returns the problems found (empty when the plan is sound). */
export function validatePlan({ header, rows }) {
  const problems = [];
  if (header.join(',') !== PLAN_HEADER.join(','))
    problems.push(`the header must be ${PLAN_HEADER.join(',')}`);
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const where = `row ${index + 2} (${row.slug || row.id || '?'})`;
    if (!ID.test(row.id)) problems.push(`${where}: the id is not a workspace id`);
    if (seen.has(row.id)) problems.push(`${where}: the id appears twice`);
    seen.add(row.id);
    if (row.action !== 'KEEP' && row.action !== 'SUSPEND')
      problems.push(`${where}: the action must be KEEP or SUSPEND`);
    if (!LIVE_STATUSES.has(row.status))
      problems.push(`${where}: the planned status must be ACTIVE, TRIAL or PROVISIONING`);
    if (row.action === 'SUSPEND' && row.reason.trim().length < 3)
      problems.push(`${where}: a suspension needs its reason`);
  }
  if (!rows.some((row) => row.action === 'KEEP')) problems.push('the plan keeps no workspace');
  return problems;
}

/** The audited reason the product records for one suspension (the contract allows 3 to 500 characters). */
export function suspendReason(row, planSha256) {
  return `WI-OI-120aw (plan ${planSha256.slice(0, 12)}): ${row.reason.trim()}`.slice(0, 500);
}

/** The prefix every reason of this run starts with; the read-back counts audit records by it. */
export const reasonPrefix = (planSha256) => `WI-OI-120aw (plan ${planSha256.slice(0, 12)}): `;

/**
 * Compares the plan with the live statuses (id -> status). A SUSPEND row is `todo` while it holds its planned status,
 * `done` once SUSPENDED, `moved` when it changed in any other way, and `missing` when the workspace is gone.
 */
export function classify(rows, live) {
  const result = { todo: [], done: [], moved: [], missing: [], keep: [], keepMoved: [] };
  for (const row of rows) {
    const status = live.get(row.id);
    if (row.action === 'KEEP') {
      result.keep.push(row);
      if (status !== row.status) result.keepMoved.push({ ...row, live: status ?? 'missing' });
    } else if (status === undefined) result.missing.push(row);
    else if (status === 'SUSPENDED') result.done.push(row);
    else if (status === row.status) result.todo.push(row);
    else result.moved.push({ ...row, live: status });
  }
  return result;
}

const idList = (ids) => {
  for (const id of ids) if (!ID.test(id)) throw new Error(`not a workspace id: ${id}`);
  return `ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::text[]`;
};

/** id|status of every planned workspace that still exists. */
export const statusSql = (ids) =>
  `SELECT id, status FROM public.tenants WHERE id = ANY(${idList(ids)}) ORDER BY id;`;

const orphaned = (schema) =>
  `FROM ${schema}.outbox_events o WHERE o.status = 'FAILED' AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = o.tenant_id)`;

/** schema|count of FAILED outbox rows whose workspace does not exist. */
export const deadLetterCountSql = () =>
  `${DEAD_LETTERS.map(({ schema }) => `SELECT '${schema}', count(*) ${orphaned(schema)}`).join('\nUNION ALL\n')};`;

/** Deletes exactly the expected dead letters, or raises and changes nothing (run with --single-transaction). */
export function deadLetterDeleteSql() {
  const steps = DEAD_LETTERS.map(
    ({ schema, expected }) => `  DELETE ${orphaned(schema)};
  GET DIAGNOSTICS deleted = ROW_COUNT;
  IF deleted <> ${expected} THEN
    RAISE EXCEPTION 'WI-OI-120aw: % dead letters in ${schema}, expected ${expected}; nothing deleted', deleted;
  END IF;`,
  );
  return `DO $$
DECLARE deleted integer;
BEGIN
${steps.join('\n')}
END $$;`;
}

/**
 * The read-back: check|expected|found rows. Suspended workspaces, untouched kept workspaces, one audited status change
 * per suspension carrying this run's reason, no live session in a suspended workspace, and no orphaned dead letter.
 */
export function verifySql(rows, planSha256) {
  const suspend = rows.filter((row) => row.action === 'SUSPEND').map((row) => row.id);
  const keep = rows.filter((row) => row.action === 'KEEP');
  const keepMatches = keep
    .map((row) => `(t.id = '${row.id}' AND t.status = '${row.status}')`)
    .join(' OR ');
  idList(keep.map((row) => row.id));
  const prefix = reasonPrefix(planSha256).replaceAll("'", "''");
  return `SELECT 'suspended', ${suspend.length}, count(*) FROM public.tenants WHERE id = ANY(${idList(suspend)}) AND status = 'SUSPENDED'
UNION ALL SELECT 'kept unchanged', ${keep.length}, count(*) FROM public.tenants t WHERE ${keepMatches}
UNION ALL SELECT 'audited', ${suspend.length}, count(DISTINCT a."resourceId") FROM public.audit_logs a
  WHERE a.action = 'STATUS_CHANGE' AND a.resource = 'platform_tenant' AND a."resourceId" = ANY(${idList(suspend)})
    AND a.after->>'status' = 'SUSPENDED' AND starts_with(a.metadata->>'reason', '${prefix}')
UNION ALL SELECT 'active sessions in suspended', 0, count(*) FROM public.sessions WHERE status = 'ACTIVE' AND "tenantId" = ANY(${idList(suspend)})
${DEAD_LETTERS.map(({ schema }) => `UNION ALL SELECT 'orphaned dead letters ${schema}', 0, count(*) ${orphaned(schema)}`).join('\n')};`;
}

/** The workspace the newest live session of a login is bound to (psql variable :'email'). */
export const sessionTenantSql = () =>
  `SELECT coalesce(s."tenantId", '') FROM public.sessions s JOIN public.users u ON u.id = s."userId"
WHERE lower(u.email) = lower(:'email') AND s.status = 'ACTIVE' AND s."expiresAt" > now() ORDER BY s."createdAt" DESC LIMIT 1;`;

/** A minimal cookie jar for the web app's session cookies: keeps name=value, drops cleared or expired cookies. */
export class CookieJar {
  #cookies = new Map();

  take(setCookies) {
    for (const line of setCookies) {
      const [pair, ...attributes] = line.split(';');
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      const cleared = attributes.some((attribute) => {
        const [key, raw = ''] = attribute.split('=');
        const lower = key.trim().toLowerCase();
        return (
          (lower === 'max-age' && Number(raw) <= 0) ||
          (lower === 'expires' && Date.parse(raw) <= Date.now())
        );
      });
      if (!value || cleared) this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get size() {
    return this.#cookies.size;
  }
}

/** Seconds to wait after a 429, from Retry-After (seconds or a date), bounded to 1..120. */
export function retryAfterSeconds(header, now = Date.now()) {
  if (!header) return 5;
  const seconds = Number(header);
  const wait = Number.isFinite(seconds) ? seconds : Math.ceil((Date.parse(header) - now) / 1000);
  return Number.isFinite(wait) ? Math.min(Math.max(wait, 1), 120) : 5;
}
