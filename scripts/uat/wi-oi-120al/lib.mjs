// WI-OI-120al: undo the old enable-all-features script's writes on the UAT database.
// Pure functions only. reconcile.mjs gathers the data and apply.mjs talks to the database.
//
// The reference is a backup taken before the first write (2026-10-08 02:15Z). The script ran on 2026-10-09 and
// 2026-10-11, and wrote three things:
// - it added `*`, `assistant:*`, `assistant:read` and `assistant:action` to every member's own permissions;
//   other development flows added `assistant:preview` the same way;
// - it ENABLED every module for every workspace (source PLATFORM_OVERRIDE, endsAt NULL, actor
//   `local-development-bootstrap`);
// - it added every module key to `tenants.features`.

export const CARD = 'WI-OI-120al';
export const SCRIPT_ACTOR = 'local-development-bootstrap';
export const OWNER_RUN_ACTOR = 'owner-run:wi-oi-120al';
export const SCRIPT_CODES = Object.freeze(['*', 'assistant:*', 'assistant:read', 'assistant:action', 'assistant:preview']);
export const ASSISTANT_MODULE = 'gigalibs-assistant';
export const REASON_CREATED =
  'WI-OI-120al: switched on by a development script on 2026-10-09; the workspace never chose it';
export const REASON_ASSISTANT = 'WI-OI-120al: the Assistant was never released';
/** The 27 module keys the script switched on (`trialModuleKeys` of scripts/enable-all-features.mjs at e0ec197). */
export const SCRIPT_MODULE_KEYS = Object.freeze([
  'tenant-access', 'personal-security', 'workflow-definitions', 'execution-runs', 'exceptions-recovery', 'approval-queue',
  'value-ledger', 'data-contracts', 'connections', 'invoice-matching', 'accounts-receivable', 'spend-management',
  'tax-configuration', 'multi-currency', 'autonomous-recovery', 'rule-studio', 'dynamic-forms', 'connector-hub',
  'analytics-studio', 'asset-maintenance', 'esignature', 'operational-ontology', 'saga-orchestrator', 'master-data',
  'solution-packs', 'communications-textfly', 'gigalibs-assistant',
]);
const SCRIPT_FIRST_RUN = Date.parse('2026-10-09T00:00:00Z');
const SCRIPT_LAST_DAY_END = Date.parse('2026-10-12T00:00:00Z');

/** Rows of one table from `pg_restore --data-only --table=<t> -f -` output (COPY text format). */
export function parseCopy(text) {
  const lines = text.split('\n');
  const blocks = lines.filter((line) => line.startsWith('COPY '));
  if (blocks.length !== 1) throw new Error(`Expected exactly one COPY block in the reference extract, found ${blocks.length}`);
  const start = lines.findIndex((line) => line.startsWith('COPY '));
  const match = lines[start].match(/\((.*)\) FROM stdin;$/);
  if (!match) throw new Error(`Unreadable COPY header: ${lines[start].slice(0, 120)}`);
  const columns = match[1].split(', ').map((column) => column.replace(/^"|"$/g, ''));
  const rows = [];
  for (let index = start + 1; index < lines.length && lines[index] !== '\\.'; index += 1) {
    const values = lines[index].split('\t');
    if (values.length !== columns.length) throw new Error(`Row ${index} has ${values.length} fields, expected ${columns.length}`);
    rows.push(Object.fromEntries(columns.map((column, at) => [column, unescapeCopy(values[at])])));
  }
  return rows;
}

function unescapeCopy(value) {
  if (value === '\\N') return null;
  return value.replace(/\\(.)/g, (_, char) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[char] ?? char);
}

/** A PostgreSQL text[] literal as written by COPY (`{a,"b c",*}`) to an array of strings. */
export function parsePgTextArray(value) {
  if (value == null) return [];
  if (!value.startsWith('{') || !value.endsWith('}')) throw new Error(`Not an array literal: ${value.slice(0, 40)}`);
  const body = value.slice(1, -1);
  const items = [];
  let current = '';
  let quoted = false;
  let wasQuoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '\\') current += body[++index];
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (char === ',') {
      items.push(wasQuoted || current !== 'NULL' ? current : null);
      current = '';
      wasQuoted = false;
    } else current += char;
  }
  if (body.length) items.push(wasQuoted || current !== 'NULL' ? current : null);
  return items;
}

const sameInstant = (a, b) => (a == null || b == null ? a == null && b == null : Date.parse(a) === Date.parse(b));
const entitlementState = (row) => ({
  status: row.status,
  source: row.source,
  startsAt: row.startsAt ?? null,
  endsAt: row.endsAt ?? null,
  reason: row.reason ?? null,
  updatedById: row.updatedById ?? null,
});

/**
 * The plan: every row to change, with its current value (`before`, checked again when it is applied) and its target
 * (`after`). Rows the plan cannot place are returned in `unplaced` and never changed.
 */
export function buildPlan({ reference, live, options = {} }) {
  const removeLegacyWildcard = options.removeLegacyWildcard === true;
  const refMembers = new Map(reference.members.map((row) => [row.id, parsePgTextArray(row.permissions)]));
  const refEntitlements = new Map(reference.entitlements.map((row) => [`${row.tenantId}|${row.moduleKey}`, row]));
  const refTenants = new Map(reference.tenants.map((row) => [row.id, parsePgTextArray(row.features)]));
  // Compared as instants, whatever the offset the timestamp is written with.
  const scriptWindow = (timestamp) => {
    const at = Date.parse(timestamp);
    return at >= SCRIPT_FIRST_RUN && at < SCRIPT_LAST_DAY_END;
  };

  const entitlements = [];
  const unplaced = [];
  const keptByRealActor = new Set();
  for (const row of live.entitlements) {
    const key = `${row.tenantId}|${row.moduleKey}`;
    if (row.updatedById !== SCRIPT_ACTOR) {
      if (row.moduleKey === ASSISTANT_MODULE && row.status === 'ENABLED') {
        entitlements.push({
          id: row.id, tenantId: row.tenantId, moduleKey: row.moduleKey, class: 'X',
          before: entitlementState(row),
          after: { ...entitlementState(row), status: 'DISABLED', reason: REASON_ASSISTANT, updatedById: OWNER_RUN_ACTOR },
        });
      } else if (row.status === 'ENABLED') keptByRealActor.add(key);
      continue;
    }
    const ref = refEntitlements.get(key);
    if (ref) {
      const restored = entitlementState(ref);
      // The Assistant stays switched off even where the reference had it (it never had it on 2026-10-08).
      if (row.moduleKey === ASSISTANT_MODULE) restored.status = 'DISABLED';
      entitlements.push({ id: row.id, tenantId: row.tenantId, moduleKey: row.moduleKey, class: 'B', before: entitlementState(row), after: restored });
    } else if (scriptWindow(row.createdAt)) {
      entitlements.push({
        id: row.id, tenantId: row.tenantId, moduleKey: row.moduleKey, class: 'A',
        before: entitlementState(row),
        after: { ...entitlementState(row), status: 'DISABLED', reason: REASON_CREATED, updatedById: OWNER_RUN_ACTOR },
      });
    } else {
      unplaced.push({ table: 'tenant_module_entitlements', id: row.id, tenantId: row.tenantId, moduleKey: row.moduleKey, createdAt: row.createdAt });
    }
  }
  // An entitlement whose target equals its current state needs no write.
  const entitlementChanges = entitlements.filter(
    (change) =>
      change.before.status !== change.after.status ||
      change.before.source !== change.after.source ||
      !sameInstant(change.before.startsAt, change.after.startsAt) ||
      !sameInstant(change.before.endsAt, change.after.endsAt) ||
      change.before.reason !== change.after.reason ||
      change.before.updatedById !== change.after.updatedById,
  );

  const members = [];
  let legacyWildcardKept = 0;
  for (const row of live.members) {
    const current = row.permissions ?? [];
    const held = new Set(refMembers.get(row.id) ?? []);
    const remove = new Set(
      current.filter((code) => SCRIPT_CODES.includes(code) && (!held.has(code) || (code === '*' && removeLegacyWildcard))),
    );
    if (current.includes('*') && held.has('*') && !remove.has('*')) legacyWildcardKept += 1;
    if (remove.size) members.push({ id: row.id, tenantId: row.tenantId, before: current, after: current.filter((code) => !remove.has(code)) });
  }

  const scriptKeys = new Set(SCRIPT_MODULE_KEYS);
  const tenants = [];
  for (const row of live.tenants) {
    const current = row.features ?? [];
    const refFeatures = new Set(refTenants.get(row.id) ?? []);
    const remove = new Set(
      current.filter(
        (key) =>
          key === ASSISTANT_MODULE ||
          (scriptKeys.has(key) && !refFeatures.has(key) && !keptByRealActor.has(`${row.id}|${key}`)),
      ),
    );
    if (remove.size) tenants.push({ id: row.id, before: current, after: current.filter((key) => !remove.has(key)) });
  }

  const count = (list, cls) => list.filter((change) => change.class === cls).length;
  return {
    card: CARD,
    entitlements: entitlementChanges,
    members,
    tenants,
    unplaced,
    summary: {
      entitlements: {
        createdByScriptDisabled: count(entitlementChanges, 'A'),
        overwrittenRestored: count(entitlementChanges, 'B'),
        assistantDisabled: count(entitlementChanges, 'X'),
        notWrittenByScriptLeftAlone: live.entitlements.filter((row) => row.updatedById !== SCRIPT_ACTOR).length - count(entitlementChanges, 'X'),
        unplaced: unplaced.length,
        workspaces: new Set(entitlementChanges.map((change) => change.tenantId)).size,
      },
      members: {
        changed: members.length,
        legacyWildcardKept,
        removed: Object.fromEntries(
          SCRIPT_CODES.map((code) => [code, members.filter((m) => m.before.includes(code) && !m.after.includes(code)).length]),
        ),
      },
      tenantFeatures: { changed: tenants.length },
    },
  };
}

/**
 * What a reviewed plan may do (Security review M2). apply.mjs refuses a plan that breaks any rule, whatever made it:
 * members only lose the five script codes and keep everything else in order; workspaces only lose the script's module
 * keys; only rows the script wrote, or Assistant rows, change; created-by-script and Assistant rows end DISABLED.
 */
export function validatePlan(plan) {
  const errors = [];
  if (plan?.card !== CARD) errors.push('not a WI-OI-120al plan');
  if (plan?.unplaced?.length) errors.push(`${plan.unplaced.length} unplaced rows`);
  const ids = new Set();
  const isSubsequence = (after, before) => {
    let at = 0;
    for (const item of before) if (item === after[at]) at += 1;
    return at === after.length;
  };
  for (const m of plan.members ?? []) {
    if (ids.has(`m:${m.id}`)) errors.push(`member ${m.id} twice`);
    ids.add(`m:${m.id}`);
    const removed = m.before.filter((code) => !m.after.includes(code));
    if (!isSubsequence(m.after, m.before)) errors.push(`member ${m.id}: after is not the before list minus removals`);
    for (const code of removed) if (!SCRIPT_CODES.includes(code)) errors.push(`member ${m.id}: removes ${code}`);
  }
  for (const t of plan.tenants ?? []) {
    if (ids.has(`t:${t.id}`)) errors.push(`workspace ${t.id} twice`);
    ids.add(`t:${t.id}`);
    if (!isSubsequence(t.after, t.before)) errors.push(`workspace ${t.id}: after is not the before list minus removals`);
    for (const key of t.before.filter((k) => !t.after.includes(k))) if (!SCRIPT_MODULE_KEYS.includes(key)) errors.push(`workspace ${t.id}: removes feature ${key}`);
  }
  for (const e of plan.entitlements ?? []) {
    if (ids.has(`e:${e.id}`)) errors.push(`entitlement ${e.id} twice`);
    ids.add(`e:${e.id}`);
    if (!['A', 'B', 'X'].includes(e.class)) errors.push(`entitlement ${e.id}: class ${e.class}`);
    if (e.before.updatedById !== SCRIPT_ACTOR && e.moduleKey !== ASSISTANT_MODULE) errors.push(`entitlement ${e.id}: not written by the script`);
    if (e.class === 'X' && e.moduleKey !== ASSISTANT_MODULE) errors.push(`entitlement ${e.id}: class X outside the Assistant`);
    if ((e.class === 'A' || e.class === 'X') && e.after.status !== 'DISABLED') errors.push(`entitlement ${e.id}: class ${e.class} must end DISABLED`);
    if (e.moduleKey === ASSISTANT_MODULE && e.after.status !== 'DISABLED') errors.push(`entitlement ${e.id}: the Assistant must end DISABLED`);
  }
  return errors;
}

// --- SQL ---------------------------------------------------------------------------------------------------------

export const sqlText = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
export const sqlTimestamp = (value) => (value == null ? 'NULL::timestamptz' : `${sqlText(value)}::timestamptz`);
export const sqlTextArray = (values) =>
  values.length ? `ARRAY[${values.map(sqlText).join(',')}]::text[]` : 'ARRAY[]::text[]';

function entitlementValues(plan) {
  return plan.entitlements
    .map(
      (change) =>
        `(${[
          sqlText(change.id),
          sqlText(change.before.status), sqlText(change.before.source), sqlTimestamp(change.before.startsAt),
          sqlTimestamp(change.before.endsAt), sqlText(change.before.reason), sqlText(change.before.updatedById),
          sqlText(change.after.status), sqlText(change.after.source), sqlTimestamp(change.after.startsAt),
          sqlTimestamp(change.after.endsAt), sqlText(change.after.reason), sqlText(change.after.updatedById),
        ].join(', ')})`,
    )
    .join(',\n    ');
}
const ENTITLEMENT_COLUMNS =
  'id, b_status, b_source, b_starts, b_ends, b_reason, b_actor, a_status, a_source, a_starts, a_ends, a_reason, a_actor';
const ENTITLEMENT_MATCH = `e.status::text = p.b_status AND e.source::text = p.b_source
     AND e."startsAt" IS NOT DISTINCT FROM p.b_starts AND e."endsAt" IS NOT DISTINCT FROM p.b_ends
     AND e.reason IS NOT DISTINCT FROM p.b_reason AND e."updatedById" IS NOT DISTINCT FROM p.b_actor`;
const memberValues = (plan) =>
  plan.members.map((change) => `(${sqlText(change.id)}, ${sqlTextArray(change.before)}, ${sqlTextArray(change.after)})`).join(',\n    ');
const tenantValues = (plan) =>
  plan.tenants.map((change) => `(${sqlText(change.id)}, ${sqlTextArray(change.before)}, ${sqlTextArray(change.after)})`).join(',\n    ');

/** Read-only: how many planned rows still hold exactly their planned `before` value. Runs in a read-only transaction. */
export function renderCheckSql(plan) {
  const parts = [];
  parts.push(plan.entitlements.length
    ? `SELECT 'entitlements', ${plan.entitlements.length}, count(*) FROM public.tenant_module_entitlements e
  JOIN (VALUES
    ${entitlementValues(plan)}
  ) AS p(${ENTITLEMENT_COLUMNS}) ON e.id = p.id
 WHERE ${ENTITLEMENT_MATCH}`
    : `SELECT 'entitlements', 0, 0::bigint`);
  parts.push(plan.members.length
    ? `SELECT 'members', ${plan.members.length}, count(*) FROM public.tenant_members m
  JOIN (VALUES
    ${memberValues(plan)}
  ) AS p(id, b_perms, a_perms) ON m.id = p.id
 WHERE m.permissions = p.b_perms`
    : `SELECT 'members', 0, 0::bigint`);
  parts.push(plan.tenants.length
    ? `SELECT 'tenants', ${plan.tenants.length}, count(*) FROM public.tenants t
  JOIN (VALUES
    ${tenantValues(plan)}
  ) AS p(id, b_features, a_features) ON t.id = p.id
 WHERE t.features = p.b_features`
    : `SELECT 'tenants', 0, 0::bigint`);
  return `${parts.join('\nUNION ALL\n')};\n`;
}

/**
 * The change, for `psql -v ON_ERROR_STOP=1 --single-transaction`. Each section updates only rows that still hold their
 * planned `before` value and stops the whole transaction if any planned row does not. Writes one audit record per
 * changed workspace and member, and the `tenant.entitlements.changed.v1` event (as `recordEntitlementsChanged` does) for
 * every workspace whose modules changed.
 */
export function renderApplySql(plan, { planSha256, mode = 'apply' }) {
  // Every value is a quoted literal inside a $w120al$ block; a value containing the tag could end the block early.
  if (JSON.stringify(plan).includes('$w120al$')) throw new Error(`${CARD}: a planned value contains the SQL block tag; refusing`);
  const workspaceIds = [...new Set([...plan.entitlements.map((c) => c.tenantId), ...plan.tenants.map((c) => c.id)])];
  const metadata = `jsonb_build_object('workItem', ${sqlText(CARD)}, 'actor', ${sqlText(OWNER_RUN_ACTOR)}, 'mode', ${sqlText(mode)}, 'planSha256', ${sqlText(planSha256)}, 'reason', ${sqlText(
    'Undo the writes of a development script run against this database on 2026-10-09 and 2026-10-11',
  )})`;
  const lines = [
    `-- ${CARD} (${mode}): generated from plan ${planSha256}. Run with: psql -X -v ON_ERROR_STOP=1 --single-transaction`,
    `SET LOCAL lock_timeout = '10s';`,
    `SET LOCAL statement_timeout = '300s';`,
    `CREATE TEMP TABLE w120al_before ON COMMIT DROP AS
  SELECT t.id AS tenant_id,
         COALESCE((SELECT array_agg(e."moduleKey" ORDER BY e."moduleKey") FROM public.tenant_module_entitlements e
                    WHERE e."tenantId" = t.id AND e.status = 'ENABLED'), ARRAY[]::text[]) AS module_keys,
         t.features
    FROM public.tenants t WHERE t.id = ANY(${sqlTextArray(workspaceIds)});`,
  ];
  if (plan.entitlements.length) {
    lines.push(`DO $w120al$
DECLARE changed bigint;
BEGIN
  UPDATE public.tenant_module_entitlements e
     SET status = p.a_status::"TenantModuleEntitlementStatus",
         source = p.a_source::"TenantModuleEntitlementSource",
         "startsAt" = COALESCE(p.a_starts, e."startsAt"),
         "endsAt" = p.a_ends,
         reason = p.a_reason,
         "updatedById" = p.a_actor,
         "updatedAt" = now()
    FROM (VALUES
    ${entitlementValues(plan)}
    ) AS p(${ENTITLEMENT_COLUMNS})
   WHERE e.id = p.id
     AND ${ENTITLEMENT_MATCH};
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> ${plan.entitlements.length} THEN
    RAISE EXCEPTION '${CARD}: % of ${plan.entitlements.length} planned entitlement rows still match the plan; nothing was changed. Rebuild the plan.', changed;
  END IF;
END
$w120al$;`);
  }
  if (plan.members.length) {
    lines.push(`DO $w120al$
DECLARE changed bigint;
BEGIN
  WITH p(id, b_perms, a_perms) AS (VALUES
    ${memberValues(plan)}
  ), u AS (
    UPDATE public.tenant_members m SET permissions = p.a_perms, "updatedAt" = now()
      FROM p WHERE m.id = p.id AND m.permissions = p.b_perms
    RETURNING m.id, m."tenantId", p.b_perms, p.a_perms
  ), a AS (
    INSERT INTO public.audit_logs (id, action, resource, "resourceId", "tenantId", before, after, metadata)
    SELECT 'aud_w120al_' || md5(gen_random_uuid()::text), 'PERMISSION_CHANGE'::"AuditAction", 'tenant_member', u.id, u."tenantId",
           jsonb_build_object('permissions', u.b_perms), jsonb_build_object('permissions', u.a_perms), ${metadata}
      FROM u
    RETURNING 1
  )
  SELECT count(*) INTO changed FROM a;
  IF changed <> ${plan.members.length} THEN
    RAISE EXCEPTION '${CARD}: % of ${plan.members.length} planned members still match the plan; nothing was changed. Rebuild the plan.', changed;
  END IF;
END
$w120al$;`);
  }
  if (plan.tenants.length) {
    lines.push(`DO $w120al$
DECLARE changed bigint;
BEGIN
  UPDATE public.tenants t SET features = p.a_features, "updatedAt" = now()
    FROM (VALUES
    ${tenantValues(plan)}
    ) AS p(id, b_features, a_features)
   WHERE t.id = p.id AND t.features = p.b_features;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> ${plan.tenants.length} THEN
    RAISE EXCEPTION '${CARD}: % of ${plan.tenants.length} planned workspaces still match the plan; nothing was changed. Rebuild the plan.', changed;
  END IF;
END
$w120al$;`);
  }
  lines.push(`WITH after_state AS (
  SELECT b.tenant_id, b.module_keys AS before_keys, b.features AS before_features,
         COALESCE((SELECT array_agg(e."moduleKey" ORDER BY e."moduleKey") FROM public.tenant_module_entitlements e
                    WHERE e."tenantId" = b.tenant_id AND e.status = 'ENABLED'), ARRAY[]::text[]) AS after_keys,
         (SELECT t.features FROM public.tenants t WHERE t.id = b.tenant_id) AS after_features
    FROM w120al_before b
), audit AS (
  INSERT INTO public.audit_logs (id, action, resource, "resourceId", "tenantId", before, after, metadata)
  SELECT 'aud_w120al_' || md5(gen_random_uuid()::text), 'PERMISSION_CHANGE'::"AuditAction", 'tenant_module_entitlement', s.tenant_id, s.tenant_id,
         jsonb_build_object('moduleKeys', s.before_keys, 'features', s.before_features),
         jsonb_build_object('moduleKeys', s.after_keys, 'features', s.after_features), ${metadata}
    FROM after_state s
   WHERE s.before_keys IS DISTINCT FROM s.after_keys OR s.before_features IS DISTINCT FROM s.after_features
  RETURNING 1
)
INSERT INTO public.control_outbox_events (id, "eventId", "tenantId", "aggregateType", "aggregateId", "eventType", payload)
SELECT 'coe_w120al_' || md5(gen_random_uuid()::text), gen_random_uuid()::text, s.tenant_id, 'tenant-module-entitlements', s.tenant_id,
       'tenant.entitlements.changed.v1', jsonb_build_object('tenantId', s.tenant_id, 'enabledModuleKeys', to_jsonb(s.after_keys))
  FROM after_state s
 WHERE s.before_keys IS DISTINCT FROM s.after_keys;`);
  return `${lines.join('\n\n')}\n`;
}
