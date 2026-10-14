#!/usr/bin/env node
// WI-OI-120al: build the reviewed plan and report. Read-only towards UAT: the reference tables are read from the backup
// file in a throwaway container with no network, and the live tables are read in a read-only transaction.
//
//   node scripts/uat/wi-oi-120al/reconcile.mjs [--reference gigalibs_backup_20261008_021555Z]
//        [--backups-dir infra/compose/backups] [--out infra/compose/backups] [--remove-legacy-wildcard]
//
// Writes wi-oi-120al-plan-<stamp>.json and wi-oi-120al-report-<stamp>.md (mode 600) into --out, a folder git ignores.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlan, parseCopy } from './lib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const reference = option('--reference', 'gigalibs_backup_20261008_021555Z');
const backupsDir = resolve(option('--backups-dir', 'infra/compose/backups'));
const outDir = resolve(option('--out', 'infra/compose/backups'));
const removeLegacyWildcard = argv.includes('--remove-legacy-wildcard');
// --container is for the rehearsal on an isolated copy; the owner's run uses the UAT database container.
const POSTGRES_CONTAINER = option('--container', 'gigalibs-postgres');

const dump = `${backupsDir}/${reference}.dump`;
if (!/^gigalibs_backup_\d{8}_\d{6}Z$/.test(reference) || !existsSync(dump)) throw new Error(`No reference backup ${dump}`);
const expectedSha = readFileSync(`${dump}.sha256`, 'utf8').trim().split(/\s+/)[0];
const actualSha = createHash('sha256').update(readFileSync(dump)).digest('hex');
if (expectedSha !== actualSha) throw new Error(`Reference backup checksum mismatch for ${reference}`);

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'] });

function referenceTable(table) {
  return parseCopy(
    run('docker', [
      'run', '--rm', '--network', 'none', '-v', `${backupsDir}:/b:ro`, 'postgres:16-alpine',
      'pg_restore', '--data-only', `--table=${table}`, '-f', '-', `/b/${reference}.dump`,
    ]),
  );
}

// Security review L4: the four live reads are one snapshot (one REPEATABLE READ, READ ONLY transaction).
function liveSnapshot() {
  const out = run('docker', [
    'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', POSTGRES_CONTAINER,
    'psql', '-X', '-q', '-U', 'gigalibs', '-d', 'gigalibs', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-',
  ], `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'S|' || to_json(now())::text;
SELECT 'M|' || row_to_json(t)::text FROM (SELECT id, role, permissions, "tenantId" FROM public.tenant_members) t;
SELECT 'E|' || row_to_json(t)::text FROM (SELECT id, "tenantId", "moduleKey", status, source, "startsAt", "endsAt", reason, "updatedById", "createdAt" FROM public.tenant_module_entitlements) t;
SELECT 'T|' || row_to_json(t)::text FROM (SELECT id, slug, name, status, features FROM public.tenants) t;
COMMIT;
`);
  const take = (tag) => out.split('\n').filter((line) => line.startsWith(`${tag}|`)).map((line) => JSON.parse(line.slice(2)));
  return { snapshotAt: take('S')[0], members: take('M'), entitlements: take('E'), tenants: take('T') };
}

const ref = {
  members: referenceTable('tenant_members'),
  entitlements: referenceTable('tenant_module_entitlements'),
  tenants: referenceTable('tenants'),
};
const { snapshotAt, ...live } = liveSnapshot();
if (!snapshotAt || !live.members.length || !live.entitlements.length || !live.tenants.length) throw new Error('The live snapshot is empty');

const plan = buildPlan({ reference: ref, live, options: { removeLegacyWildcard } });
plan.reference = { backup: reference, sha256: actualSha };
plan.liveSnapshotAt = snapshotAt;
plan.options = { removeLegacyWildcard };

const stamp = snapshotAt.replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '_') + 'Z';
const planFile = `${outDir}/wi-oi-120al-plan-${stamp}.json`;
const planText = `${JSON.stringify(plan, null, 2)}\n`;
writeFileSync(planFile, planText, { mode: 0o600 });
chmodSync(planFile, 0o600);
const planSha = createHash('sha256').update(planText).digest('hex');

// The report the owner reads: totals, then every workspace that changes, active and trial ones first.
const tenantsById = new Map(live.tenants.map((t) => [t.id, t]));
const enabledBefore = new Map();
for (const row of live.entitlements) if (row.status === 'ENABLED') enabledBefore.set(row.tenantId, (enabledBefore.get(row.tenantId) ?? 0) + 1);
const delta = new Map();
for (const change of plan.entitlements) {
  const d = (change.after.status === 'ENABLED' ? 1 : 0) - (change.before.status === 'ENABLED' ? 1 : 0);
  delta.set(change.tenantId, (delta.get(change.tenantId) ?? 0) + d);
}
const featuresAfter = new Map(plan.tenants.map((c) => [c.id, c.after.length]));
const membersChanged = new Map();
for (const change of plan.members) membersChanged.set(change.tenantId, (membersChanged.get(change.tenantId) ?? 0) + 1);
const order = { ACTIVE: 0, TRIAL: 1, PROVISIONING: 2, CANCELLED: 3 };
const rows = [...new Set([...delta.keys(), ...membersChanged.keys()])]
  .map((id) => ({ id, t: tenantsById.get(id) }))
  .sort((a, b) => (order[a.t?.status] ?? 9) - (order[b.t?.status] ?? 9) || String(a.t?.name).localeCompare(String(b.t?.name)));
const s = plan.summary;
const report = [
  `# WI-OI-120al reconciliation report`,
  ``,
  `- Live snapshot: ${snapshotAt} (read-only). Reference: \`${reference}\` (sha256 \`${actualSha}\`).`,
  `- Plan: \`${planFile}\` (sha256 \`${planSha}\`). Option: remove the older wildcard = ${removeLegacyWildcard}.`,
  ``,
  `| Change | Rows |`,
  `| --- | --- |`,
  `| Entitlements the script created: switched off, row kept | ${s.entitlements.createdByScriptDisabled} |`,
  `| Entitlements it overwrote: restored from the reference | ${s.entitlements.overwrittenRestored} |`,
  `| Assistant entitlements switched on by other development flows: switched off | ${s.entitlements.assistantDisabled} |`,
  `| Entitlements the script did not write: left alone | ${s.entitlements.notWrittenByScriptLeftAlone} |`,
  `| Rows the plan cannot place (never changed) | ${s.entitlements.unplaced} |`,
  `| Workspaces whose modules change | ${s.entitlements.workspaces} |`,
  `| Members whose own permissions change | ${s.members.changed} |`,
  ...Object.entries(s.members.removed).map(([code, n]) => `| … \`${code}\` removed | ${n} |`),
  `| Members keeping an older \`*\` that predates the script (decision Q3) | ${s.members.legacyWildcardKept} |`,
  `| Workspaces whose feature list changes | ${s.tenantFeatures.changed} |`,
  ``,
  `## Workspaces that change`,
  ``,
  `The web opens a module when the workspace's feature list has it, as well as by entitlement. "Features after" can be`,
  `higher than "Entitlements after" where the feature list predates the script (security review M4; follow-up card).`,
  ``,
  `| Workspace | Status | Entitlements enabled now | Entitlements after | Features now | Features after | Members changed |`,
  `| --- | --- | --- | --- | --- | --- | --- |`,
  ...rows.map(({ id, t }) => {
    const now = enabledBefore.get(id) ?? 0;
    const features = (t?.features ?? []).length;
    return `| ${t?.name ?? id} (\`${t?.slug ?? '?'}\`) | ${t?.status ?? '?'} | ${now} | ${now + (delta.get(id) ?? 0)} | ${features} | ${featuresAfter.get(id) ?? features} | ${membersChanged.get(id) ?? 0} |`;
  }),
  ``,
].join('\n');
const reportFile = `${outDir}/wi-oi-120al-report-${stamp}.md`;
writeFileSync(reportFile, report, { mode: 0o600 });
chmodSync(reportFile, 0o600);

console.log(JSON.stringify({ planFile, planSha256: planSha, reportFile, unplaced: plan.unplaced.length, summary: plan.summary }, null, 2));
