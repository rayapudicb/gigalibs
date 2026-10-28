import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ArCreditInvoiceBalanceV1Schema, ArInvoiceIssuedV1Schema } from '@gigalibs/contracts';
import { OrganizationReplica } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InvoicesService } from './invoices.service.js';

const enabled = process.env.AR_ORGANIZATION_PG_PROOF === '1';
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const tenantId = randomUUID();
const entityId = randomUUID();
const seriesId = randomUUID();
const customerId = randomUUID();
const partyId = randomUUID();

describe.skipIf(!enabled)('AR organization ownership migration on isolated PostgreSQL 16', () => {
  const container = `gigalibs-ar-org-proof-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  let admin: pg.Client;
  let runtime: pg.Client;
  let adminUrl: string;
  let work: string;
  let started = false;

  beforeAll(async () => {
    execFileSync('docker', ['run', '-d', '--rm', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`,
      '-e', 'POSTGRES_DB=ar_org_proof', '-p', '127.0.0.1::5432', 'postgres:16-alpine'], { stdio: 'ignore' });
    started = true;
    const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').pop();
    adminUrl = `postgres://postgres:${password}@127.0.0.1:${port}/ar_org_proof`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      admin = new pg.Client({ connectionString: adminUrl });
      try { await admin.connect(); break; }
      catch {
        await admin.end().catch(() => undefined);
        if (attempt === 59) throw new Error('Isolated PostgreSQL did not start.');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    work = mkdtempSync(join(tmpdir(), 'ar-org-migration-'));
    mkdirSync(join(work, 'node_modules'));
    copyFileSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
    symlinkSync(join(root, 'modules/accounts-receivable/apps/api/node_modules/pg'), join(work, 'node_modules/pg'));
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = 'ar_org_proof_runtime';
    runtimeUrl.password = runtimePassword;
    const run = spawnSync(process.execPath, [join(work, 'run.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: adminUrl, MODULE_RUNTIME_DATABASE_URL: runtimeUrl.toString(),
        MODULE_MIGRATIONS_DIRECTORY: join(root, 'modules/accounts-receivable/db/migrations'),
        MODULE_SCHEMA: 'gigalibs_ar', MODULE_EXPECTED_MIGRATION_VERSION: '18',
        MODULE_APPEND_ONLY_TABLES: 'audit_events', MODULE_READ_ONLY_TABLES: 'auth_revocation_events' },
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    runtime = new pg.Client({ connectionString: runtimeUrl.toString() });
    await runtime.connect();
  }, 45_000);

  afterAll(async () => {
    await runtime?.end();
    await admin?.end();
    if (work) rmSync(work, { recursive: true, force: true });
    if (started) execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
  });

  it('installs version 18 and forces tenant RLS on organization and credit tables', async () => {
    const version = await admin.query('SELECT max(version)::int AS version FROM gigalibs_ar.schema_migrations');
    expect(version.rows[0]?.version).toBe(18);
    const tables = await admin.query(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'gigalibs_ar'
      AND relname IN ('org_replica_versions', 'org_replica_units', 'org_replica_closure',
        'credit_snapshot_positions', 'credit_outbox_events')`);
    expect(tables.rows).toHaveLength(5);
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it('rejects ownerless new drafts and immutable owner changes', async () => {
    await admin.query(`INSERT INTO gigalibs_ar.module_tenants
      (id, oidc_issuer, external_tenant_subject) VALUES ($1, 'urn:gigalibs:platform-context:v1', 'proof')`, [tenantId]);
    await admin.query(`INSERT INTO gigalibs_ar.billing_entities
      (tenant_id, id, legal_name, default_currency, locale, time_zone) VALUES ($1, $2, 'Proof Entity', 'USD', 'en-US', 'UTC')`, [tenantId, entityId]);
    await admin.query(`INSERT INTO gigalibs_ar.invoice_series
      (tenant_id, id, billing_entity_id, code, prefix, is_default) VALUES ($1, $2, $3, 'PROOF', 'INV-', true)`, [tenantId, seriesId, entityId]);
    await admin.query(`INSERT INTO gigalibs_ar.customers
      (tenant_id, id, legal_name, billing_email, external_reference, currency, created_by, updated_by)
      VALUES ($1, $2, 'Proof Customer', 'proof@example.test', $3, 'USD', 'proof', 'proof')`, [tenantId, customerId, partyId]);
    const draftId = randomUUID();
    const insert = `INSERT INTO gigalibs_ar.invoice_drafts
      (tenant_id, id, billing_entity_id, invoice_series_id, customer_id, org_unit_id, currency,
       issue_date, due_date, subtotal_minor, total_minor, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'USD', current_date, current_date, 100, 100, 'proof', 'proof')`;
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await expect(runtime.query(insert, [tenantId, draftId, entityId, seriesId, customerId, null])).rejects.toMatchObject({ code: 'P0001' });
    await runtime.query('ROLLBACK');
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await runtime.query(insert, [tenantId, draftId, entityId, seriesId, customerId, 'north']);
    await expect(runtime.query(`UPDATE gigalibs_ar.invoice_drafts SET org_unit_id = 'south' WHERE id = $1`, [draftId])).rejects.toMatchObject({ code: 'P0001' });
    await runtime.query('ROLLBACK');
  });

  it('issues once from a mapped Party and configured entity, and records a canonical owned credit fact', async () => {
    const service = new InvoicesService({
      withTenantTransaction: async (_tenant: string, work: (client: pg.Client) => Promise<unknown>) => {
        await runtime.query('BEGIN');
        await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
        try { const result = await work(runtime); await runtime.query('COMMIT'); return result; }
        catch (error) { await runtime.query('ROLLBACK'); throw error; }
      },
    } as never);
    const event = { fulfillmentId: randomUUID(), orderId: randomUUID(), orderNumber: 'SO-PROOF-1',
      orgUnitId: 'north', customerPartyId: partyId, currencyCode: 'USD', issueId: randomUUID(),
      dispatchedAt: new Date().toISOString(),
      lines: [{ orderLineId: randomUUID(), productId: randomUUID(), productCode: 'P1',
        productName: 'Part', quantity: '1.000000', unitPriceMinor: '100', uomId: randomUUID() }] };
    const principal = { tenantId, subject: 'orders-relay', issuer: 'urn:gigalibs:platform-context:v1', permissions: [] };
    const issued = await service.issueInvoiceFromFulfillment(principal, event, 'corr-proof-1', 'message-proof-1');
    expect(issued.duplicate).toBe(false);
    const replay = await service.issueInvoiceFromFulfillment(principal, event, 'corr-proof-1', 'message-proof-1');
    expect(replay).toMatchObject({ invoiceId: issued.invoiceId, duplicate: true });
    const invoice = await admin.query(`SELECT org_unit_id, source_fulfillment_id FROM gigalibs_ar.invoices WHERE tenant_id = $1 AND id = $2`, [tenantId, issued.invoiceId]);
    expect(invoice.rows[0]).toMatchObject({ org_unit_id: 'north', source_fulfillment_id: event.fulfillmentId });
    const outbox = await admin.query(`SELECT payload->'data' AS data FROM gigalibs_ar.outbox_events WHERE tenant_id = $1 AND aggregate_id = $2`, [tenantId, issued.invoiceId]);
    expect(ArInvoiceIssuedV1Schema.safeParse(outbox.rows[0]?.data).success).toBe(true);
    const initialCredit = await admin.query(`SELECT aggregate_version, payload FROM gigalibs_ar.credit_outbox_events
      WHERE tenant_id = $1 AND aggregate_id = $2`, [tenantId, issued.invoiceId]);
    expect(initialCredit.rows).toHaveLength(1);
    expect(initialCredit.rows[0]?.aggregate_version).toBe(1);
    expect(ArCreditInvoiceBalanceV1Schema.parse(initialCredit.rows[0]?.payload)).toMatchObject({
      customerPartyId: partyId, orgUnitId: 'north', openAmountMinor: '100', sourceVersion: 1,
    });
    const paymentId = randomUUID();
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await runtime.query(`INSERT INTO gigalibs_ar.payment_records
      (tenant_id, id, invoice_id, amount_minor, currency, payment_method, paid_at, recorded_by)
      VALUES ($1, $2, $3, 30, 'USD', 'WIRE', now(), 'proof')`, [tenantId, paymentId, issued.invoiceId]);
    await runtime.query('COMMIT');
    const voidId = randomUUID();
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await runtime.query(`INSERT INTO gigalibs_ar.void_records
      (tenant_id, id, invoice_id, reason, voided_by)
      VALUES ($1, $2, $3, 'Proof void', 'proof')`, [tenantId, voidId, issued.invoiceId]);
    await runtime.query('COMMIT');
    const credit = await admin.query(`SELECT aggregate_version, payload->>'openAmountMinor' AS balance, status
      FROM gigalibs_ar.credit_outbox_events WHERE tenant_id = $1 AND aggregate_id = $2
      ORDER BY aggregate_version`, [tenantId, issued.invoiceId]);
    expect(credit.rows.map((row) => [row.aggregate_version, row.balance])).toEqual([[1, '100'], [2, '70'], [3, '0']]);
    const leased = await runtime.query(`SELECT aggregate_version FROM gigalibs_ar.relay_lease_credit_balances(10, 60)`);
    expect(leased.rows.map((row) => row.aggregate_version)).toEqual([1]);
    await runtime.query(`SELECT gigalibs_ar.relay_settle_credit_balance($1, true, NULL, 0, 10)`,
      [(await admin.query(`SELECT id FROM gigalibs_ar.credit_outbox_events WHERE tenant_id = $1 AND aggregate_id = $2 AND aggregate_version = 1`, [tenantId, issued.invoiceId])).rows[0]?.id]);
    const next = await runtime.query(`SELECT aggregate_version FROM gigalibs_ar.relay_lease_credit_balances(10, 60)`);
    expect(next.rows.map((row) => row.aggregate_version)).toEqual([2]);
    const audit = await admin.query(`SELECT count(*)::int AS count FROM gigalibs_ar.audit_events WHERE tenant_id = $1 AND aggregate_id = $2`, [tenantId, issued.invoiceId]);
    expect(audit.rows[0]?.count).toBe(1);
    const versionId = 'ar-org-proof-version-1';
    const units = ['north', 'south'].map((unitId) => ({ unit_id: unitId, parent_unit_id: null,
      code: unitId.toUpperCase(), name: unitId, sort_order: 0, status: 'ACTIVE' as const,
      holds_records: true, type_code: 'OPERATING_UNIT' }));
    const checksum = `sha256:${createHash('sha256').update(units.map((unit) => `${unit.unit_id}>#0`).join('\n')).digest('hex')}`;
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const replica = new OrganizationReplica('gigalibs_ar');
    await replica.receivePage(runtime, tenantId, versionId, { tree_id: 'ar-org-proof', tree_kind: 'PRIMARY', version_number: 1, checksum }, units);
    await replica.complete(runtime, tenantId, versionId, { tree_id: 'ar-org-proof', tree_kind: 'PRIMARY', version_number: 1, checksum }, 2);
    await runtime.query('COMMIT');
    const north = { ...principal, organization: { mode: 'UNITS' as const, tree_version: versionId,
      read_roots: ['north'], write_roots: ['north'] } };
    const south = { ...principal, organization: { mode: 'UNITS' as const, tree_version: versionId,
      read_roots: ['south'], write_roots: ['south'] } };
    expect((await service.get(issued.invoiceId, north)).orgUnitId).toBe('north');
    expect((await service.list(north, 10)).items).toHaveLength(1);
    expect((await service.list(south, 10)).items).toHaveLength(0);
    await expect(service.get(issued.invoiceId, south)).rejects.toThrow('Invoice was not found');
    await expect(service.issueInvoiceFromFulfillment(principal, { ...event, orgUnitId: 'south' }, 'corr-proof-1', 'message-proof-1')).rejects.toThrow();
    const count = await admin.query(`SELECT count(*)::int AS count FROM gigalibs_ar.invoices WHERE tenant_id = $1`, [tenantId]);
    expect(count.rows[0]?.count).toBe(1);
  });
});
