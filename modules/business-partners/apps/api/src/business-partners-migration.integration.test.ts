import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PartyInboxService } from './party/party-inbox.service.js';
import { PartnerAccountsService } from './accounts/accounts.service.js';
import { CreditInboxService } from './credit/credit-inbox.service.js';
import { CreditHoldsService } from './credit/holds.service.js';
import { CreditStatusService } from './credit/status.service.js';
import { calculateCreditExposure } from './credit/exposure.js';
import { PartnerCreditHoldV1Schema } from '@gigalibs/contracts';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';

// Run explicitly against an anonymous-volume container. Never use the owner's local UAT database.
const enabled = process.env.BUSINESS_PARTNERS_PG_PROOF === '1';
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const schema = 'gigalibs_business_partners';

describe.skipIf(!enabled)('Business Partner migration on isolated PostgreSQL 16', () => {
  const container = `gigalibs-partners-proof-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  let adminUrl: string;
  let admin: pg.Client;
  let runtime: pg.Client;
  let work: string;
  let started = false;

  beforeAll(async () => {
    execFileSync('docker', [
      'run', '-d', '--rm', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`,
      '-e', 'POSTGRES_DB=business_partners_proof', '-p', '127.0.0.1::5432', 'postgres:16-alpine',
    ], { stdio: 'ignore' });
    started = true;
    const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').pop();
    adminUrl = `postgres://postgres:${password}@127.0.0.1:${port}/business_partners_proof`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      admin = new pg.Client({ connectionString: adminUrl });
      try {
        await admin.connect();
        break;
      } catch {
        await admin.end().catch(() => undefined);
        if (attempt === 59) throw new Error('Isolated PostgreSQL did not start.');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    work = mkdtempSync(join(tmpdir(), 'business-partners-migration-'));
    mkdirSync(join(work, 'node_modules'));
    copyFileSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
    symlinkSync(join(root, 'modules/business-partners/apps/api/node_modules/pg'), join(work, 'node_modules/pg'));
  }, 30_000);

  afterAll(async () => {
    await runtime?.end();
    await admin?.end();
    if (work) rmSync(work, { recursive: true, force: true });
    if (started) execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
  });

  it('installs all four migrations and grants a least-privilege runtime role', async () => {
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = 'business_partners_proof_runtime';
    runtimeUrl.password = runtimePassword;
    const run = spawnSync(process.execPath, [join(work, 'run.mjs')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: adminUrl,
        MODULE_RUNTIME_DATABASE_URL: runtimeUrl.toString(),
        MODULE_MIGRATIONS_DIRECTORY: join(root, 'modules/business-partners/db/migrations'),
        MODULE_SCHEMA: schema,
        MODULE_EXPECTED_MIGRATION_VERSION: '4',
        MODULE_APPEND_ONLY_TABLES: 'audit_events,credit_status',
        MODULE_READ_ONLY_TABLES: 'auth_revocation_events',
      },
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const ledger = await admin.query(`SELECT max(version)::int AS version FROM ${schema}.schema_migrations`);
    expect(ledger.rows[0]?.version).toBe(4);
    const tables = await admin.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`, [schema],
    );
    expect(tables.rows.length).toBeGreaterThanOrEqual(13);
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    runtime = new pg.Client({ connectionString: runtimeUrl.toString() });
    await runtime.connect();
  }, 30_000);

  it('isolates tenants and denies ledger updates at the database role', async () => {
    const partyId = randomUUID();
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', 'tenant-a', true)`);
    await runtime.query(
      `INSERT INTO ${schema}.party_references
       (tenant_id, party_id, source_version, code, display_name, party_type, status)
       VALUES ('tenant-a', $1, 1, 'A', 'Alpha', 'ORGANIZATION', 'ACTIVE')`, [partyId],
    );
    await runtime.query(
      `INSERT INTO ${schema}.credit_status
       (tenant_id, id, party_id, org_unit_id, currency_code, component, delta_minor,
        source_module, source_document_id, source_version, source_event_id, occurred_at)
       VALUES ('tenant-a', $1, $2, 'north', 'USD', 'OPEN_AR', 100,
               'accounts-receivable', 'invoice-a', 1, 'event-a', now())`, [randomUUID(), partyId],
    );
    await runtime.query('COMMIT');

    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', 'tenant-b', true)`);
    expect((await runtime.query(`SELECT * FROM ${schema}.credit_status`)).rowCount).toBe(0);
    await expect(runtime.query(`INSERT INTO ${schema}.party_references
      (tenant_id, party_id, source_version, code, display_name, party_type, status)
      VALUES ('tenant-a', $1, 1, 'BAD', 'Bad', 'ORGANIZATION', 'ACTIVE')`, [randomUUID()])).rejects.toMatchObject({ code: '42501' });
    await runtime.query('ROLLBACK');

    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', 'tenant-a', true)`);
    await expect(runtime.query(`UPDATE ${schema}.credit_status SET delta_minor = 1 WHERE tenant_id = 'tenant-a'`))
      .rejects.toMatchObject({ code: '42501' });
    await runtime.query('ROLLBACK');
  });

  it('projects ordered Party facts once and leaves an out-of-order fact for retry', async () => {
    const partyId = randomUUID();
    const database = {
      withTenantTransaction: async <T>(tenantId: string, work: (client: pg.Client) => Promise<T>): Promise<T> => {
        await runtime.query('BEGIN');
        try {
          await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
          const result = await work(runtime);
          await runtime.query('COMMIT');
          return result;
        } catch (error) {
          await runtime.query('ROLLBACK');
          throw error;
        }
      },
    };
    const inbox = new PartyInboxService(database as never);
    const envelope = (eventType: string, aggregateVersion: number, payload: Record<string, unknown>) => ({
      messageId: randomUUID(), tenantId: 'tenant-a', eventType, aggregateType: 'party', aggregateId: partyId,
      aggregateVersion, correlationId: randomUUID(), causationId: null, schemaVersion: 1,
      payload, occurredAt: new Date().toISOString(),
    });
    const receive = (fact: ReturnType<typeof envelope>) => inbox.receive(fact, JSON.stringify(fact));
    const update = envelope('party.updated.v1', 2, {
      partyId, code: 'PARTNER-A', legalName: 'Partner A Ltd', displayName: 'Partner A Updated',
      status: 'ACTIVE', version: 2, previousVersion: 1,
    });
    await expect(receive(update)).rejects.toMatchObject({ status: 503 });
    const created = envelope('party.created.v1', 1, {
      partyId, code: 'PARTNER-A', legalName: 'Partner A Ltd', displayName: 'Partner A',
      partyType: 'ORGANIZATION', status: 'ACTIVE', version: 1,
    });
    expect(await receive(created)).toMatchObject({ status: 'PROCESSED' });
    expect(await receive(update)).toMatchObject({ status: 'PROCESSED' });
    expect(await receive(update)).toMatchObject({ status: 'DUPLICATE' });
    const roleId = randomUUID();
    const roleAdded = envelope('party.role.changed.v1', 1, {
      partyId, roleId, roleType: 'CUSTOMER', action: 'ADDED', status: 'ACTIVE', version: 1,
      effectiveFrom: null, effectiveTo: null,
    });
    expect(await receive(roleAdded)).toMatchObject({ status: 'PROCESSED' });
    const roleUpdated = envelope('party.role.changed.v1', 2, {
      partyId, roleId, roleType: 'CUSTOMER', action: 'UPDATED', status: 'SUSPENDED', version: 2,
      effectiveFrom: null, effectiveTo: null,
    });
    expect(await receive(roleUpdated)).toMatchObject({ status: 'PROCESSED' });
    const archived = envelope('party.archived.v1', 3, {
      partyId, reason: 'Closed', archivedAt: new Date().toISOString(), version: 3,
    });
    expect(await receive(archived)).toMatchObject({ status: 'PROCESSED' });

    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', 'tenant-a', true)`);
    const projected = await runtime.query(
      `SELECT source_version, display_name, status FROM ${schema}.party_references WHERE tenant_id = 'tenant-a' AND party_id = $1`,
      [partyId],
    );
    const receipts = await runtime.query(
      `SELECT count(*)::int AS n FROM ${schema}.inbox_receipts WHERE tenant_id = 'tenant-a' AND consumer_name = 'business-partners.party'`,
    );
    const role = await runtime.query(
      `SELECT source_version, status FROM ${schema}.party_role_references WHERE tenant_id = 'tenant-a' AND role_id = $1`,
      [roleId],
    );
    await runtime.query('COMMIT');
    expect(projected.rows[0]).toMatchObject({ source_version: 3, display_name: 'Partner A Updated', status: 'ARCHIVED' });
    expect(receipts.rows[0]?.n).toBe(5);
    expect(role.rows[0]).toMatchObject({ source_version: 2, status: 'SUSPENDED' });
  });

  it('creates a scoped customer account once, validates the Party role and hides sibling units', async () => {
    const tenantId = 'tenant-a';
    const partyId = randomUUID();
    const accountId = randomUUID();
    const bookId = randomUUID();
    const key = randomUUID();
    const database = {
      withTenantTransaction: async <T>(tenant: string, work: (client: pg.Client) => Promise<T>): Promise<T> => {
        await runtime.query('BEGIN');
        try {
          await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
          const result = await work(runtime);
          await runtime.query('COMMIT');
          return result;
        } catch (error) {
          await runtime.query('ROLLBACK');
          throw error;
        }
      },
    };
    await database.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO ${schema}.org_replica_versions
         (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
         VALUES ($1, 'version-1', 'tree-1', 'PRIMARY', 1, $2, 'READY', 2, now())`,
        [tenantId, `sha256:${'a'.repeat(64)}`],
      );
      await client.query(
        `INSERT INTO ${schema}.org_replica_units
         (tenant_id, version_id, unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1, 'version-1', 'north', 'N', 'North', 0, 'ACTIVE', true, 'BRANCH'),
                ($1, 'version-1', 'south', 'S', 'South', 0, 'ACTIVE', true, 'BRANCH')`, [tenantId],
      );
      await client.query(
        `INSERT INTO ${schema}.org_replica_closure
         (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
         VALUES ($1, 'version-1', 'north', 'north', 0), ($1, 'version-1', 'south', 'south', 0)`, [tenantId],
      );
      await client.query(
        `INSERT INTO ${schema}.party_references
         (tenant_id, party_id, source_version, code, display_name, party_type, status)
         VALUES ($1, $2, 1, 'CREDIT-PARTNER', 'Credit Partner', 'ORGANIZATION', 'ACTIVE')`, [tenantId, partyId],
      );
      await client.query(
        `INSERT INTO ${schema}.party_role_references
         (tenant_id, role_id, party_id, role_type, status, source_version)
         VALUES ($1, $2, $3, 'CUSTOMER', 'ACTIVE', 1)`, [tenantId, randomUUID(), partyId],
      );
    });
    const finance = { check: async (_tenant: string, id: string, accountClass: string) => ({
      accountId: id, accountingBookId: bookId, accountClass, version: 2,
    }) };
    const service = new PartnerAccountsService(database as never, finance as never);
    const principal: ModulePrincipal = {
      tenantId, subject: 'credit-admin', sessionId: 'session-1', authVersion: 1,
      permissions: ['business-partners.accounts.manage', 'business-partners.accounts.read'],
      roles: ['TENANT_ADMIN'], persona: 'TENANT_ADMIN',
      organization: { mode: 'UNITS', tree_version: 'version-1', read_roots: ['north'], write_roots: ['north'] },
      departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
    };
    const context: ModuleCommandContext = { principal, correlationId: randomUUID() };
    const input = {
      requestKey: key, orgUnitId: 'north', currencyCode: 'USD', accountId,
      termsVersion: 'terms-v1', creditLimitMinor: '10000',
    };
    expect(await service.createCustomer(context, partyId, input)).toMatchObject({ replayed: false, account: { creditLimitMinor: '10000' } });
    expect(await service.createCustomer(context, partyId, input)).toMatchObject({ replayed: true });
    await expect(service.createCustomer(context, partyId, { ...input, creditLimitMinor: '20000' }))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.createCustomer(context, partyId, { ...input, requestKey: randomUUID(), orgUnitId: 'south' }))
      .rejects.toMatchObject({ code: 'ORGANIZATION_OUT_OF_SCOPE' });
    expect((await service.list(principal, partyId)).items).toHaveLength(1);
    const counts = await database.withTenantTransaction(tenantId, async (client) => {
      const audit = await client.query(`SELECT count(*)::int AS n FROM ${schema}.audit_events WHERE tenant_id = $1 AND entity_type = 'customer_account'`, [tenantId]);
      const outbox = await client.query(`SELECT count(*)::int AS n FROM ${schema}.outbox_events WHERE tenant_id = $1 AND aggregate_type = 'customer_account'`, [tenantId]);
      return { audit: audit.rows[0]?.n, outbox: outbox.rows[0]?.n };
    });
    expect(counts).toEqual({ audit: 1, outbox: 1 });
  });

  it('turns ordered AR snapshots into immutable credit deltas and refuses gaps or conflicting replay', async () => {
    const tenantId = 'tenant-credit-proof';
    const partyId = randomUUID();
    const invoiceId = randomUUID();
    const database = {
      withTenantTransaction: async <T>(tenant: string, work: (client: pg.Client) => Promise<T>): Promise<T> => {
        await runtime.query('BEGIN');
        try {
          await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
          const result = await work(runtime);
          await runtime.query('COMMIT');
          return result;
        } catch (error) { await runtime.query('ROLLBACK'); throw error; }
      },
    };
    await database.withTenantTransaction(tenantId, (client) => client.query(
      `INSERT INTO ${schema}.party_references
       (tenant_id, party_id, source_version, code, display_name, party_type, status)
       VALUES ($1, $2, 1, 'CREDIT-SOURCE', 'Credit Source', 'ORGANIZATION', 'ACTIVE')`, [tenantId, partyId],
    ));
    const service = new CreditInboxService(database as never);
    const envelope = (version: number, amount: string, messageId = randomUUID()) => ({
      messageId, tenantId, eventType: 'ar.credit.invoice-balance.v1', aggregateType: 'invoice',
      aggregateId: invoiceId, aggregateVersion: version, correlationId: randomUUID(),
      causationId: null, schemaVersion: 1, occurredAt: new Date().toISOString(),
      payload: { invoiceId, customerPartyId: partyId, orgUnitId: 'north', currencyCode: 'USD',
        openAmountMinor: amount, sourceVersion: version },
    });
    const receive = (event: ReturnType<typeof envelope>) => service.receive(event, JSON.stringify(event));
    const gap = envelope(2, '70');
    await expect(receive(gap)).rejects.toMatchObject({ status: 503 });
    const issued = envelope(1, '100');
    expect(await receive(issued)).toMatchObject({ status: 'PROCESSED' });
    expect(await receive(issued)).toMatchObject({ status: 'DUPLICATE' });
    await expect(receive({ ...issued, payload: { ...issued.payload, openAmountMinor: '99' } }))
      .rejects.toMatchObject({ status: 409 });
    expect(await receive(gap)).toMatchObject({ status: 'PROCESSED' });
    await expect(receive(envelope(1, '100'))).rejects.toMatchObject({ status: 409 });
    await expect(receive(envelope(2, '70'))).rejects.toMatchObject({ status: 409 });
    await expect(receive(envelope(2, '80'))).rejects.toMatchObject({ status: 409 });
    await expect(receive({ ...envelope(3, '60'), payload: { ...envelope(3, '60').payload, orgUnitId: 'south' } }))
      .rejects.toMatchObject({ status: 409 });
    const state = await database.withTenantTransaction(tenantId, async (client) => {
      const position = await client.query(`SELECT source_version, balance_minor::text FROM ${schema}.credit_source_positions
        WHERE tenant_id = $1 AND source_document_id = $2`, [tenantId, invoiceId]);
      const deltas = await client.query<{ component: 'OPEN_AR'; delta_minor: string }>(
        `SELECT component, delta_minor::text FROM ${schema}.credit_status
         WHERE tenant_id = $1 AND source_document_id = $2 ORDER BY source_version`, [tenantId, invoiceId]);
      return { position: position.rows[0], deltas: deltas.rows };
    });
    expect(state.position).toMatchObject({ source_version: 2, balance_minor: '70' });
    expect(state.deltas.map((row) => row.delta_minor)).toEqual(['100', '-30']);
    expect(calculateCreditExposure(state.deltas.map((row) => ({ component: row.component,
      deltaMinor: BigInt(row.delta_minor) })), 1000n).openArMinor).toBe(70n);
    await runtime.query('BEGIN');
    await runtime.query(`SELECT set_config('app.tenant_id', 'tenant-other', true)`);
    expect((await runtime.query(`SELECT * FROM ${schema}.credit_source_positions`)).rowCount).toBe(0);
    await runtime.query('ROLLBACK');
  });

  it('places and releases a manual hold with scoped idempotent document actions and no invented exposure', async () => {
    const tenantId = 'tenant-manual-hold-proof';
    const partyId = randomUUID();
    const bookId = randomUUID();
    const accountId = randomUUID();
    const database = {
      withTenantTransaction: async <T>(tenant: string, work: (client: pg.Client) => Promise<T>): Promise<T> => {
        await runtime.query('BEGIN');
        try {
          await runtime.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
          const result = await work(runtime);
          await runtime.query('COMMIT');
          return result;
        } catch (error) { await runtime.query('ROLLBACK'); throw error; }
      },
    };
    await database.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO ${schema}.org_replica_versions
         (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
         VALUES ($1, 'hold-v1', 'hold-tree', 'PRIMARY', 1, $2, 'READY', 2, now())`,
        [tenantId, `sha256:${'b'.repeat(64)}`],
      );
      await client.query(
        `INSERT INTO ${schema}.org_replica_units
         (tenant_id, version_id, unit_id, code, name, sort_order, status, holds_records, type_code)
         VALUES ($1, 'hold-v1', 'north', 'N', 'North', 0, 'ACTIVE', true, 'BRANCH'),
                ($1, 'hold-v1', 'south', 'S', 'South', 0, 'ACTIVE', true, 'BRANCH')`, [tenantId],
      );
      await client.query(
        `INSERT INTO ${schema}.org_replica_closure
         (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
         VALUES ($1, 'hold-v1', 'north', 'north', 0), ($1, 'hold-v1', 'south', 'south', 0)`, [tenantId],
      );
      await client.query(
        `INSERT INTO ${schema}.party_references
         (tenant_id, party_id, source_version, code, display_name, party_type, status)
         VALUES ($1, $2, 1, 'HOLD-PARTNER', 'Hold Partner', 'ORGANIZATION', 'ACTIVE')`, [tenantId, partyId],
      );
      await client.query(
        `INSERT INTO ${schema}.partner_customer_acct
         (tenant_id, party_id, org_unit_id, currency_code, receivable_account_ref,
          receivable_account_version, accounting_book_id, credit_limit_minor, terms_version, status, updated_by)
         VALUES ($1, $2, 'north', 'USD', $3, 1, $4, 1000, 'terms-v1', 'ACTIVE', 'proof')`,
        [tenantId, partyId, accountId, bookId],
      );
    });
    const service = new CreditHoldsService(database as never);
    const status = new CreditStatusService(database as never);
    const principal: ModulePrincipal = {
      tenantId, subject: 'credit-manager', sessionId: 'hold-session', authVersion: 1,
      permissions: ['business-partners.credit.read', 'business-partners.credit.manage'],
      roles: ['TENANT_ADMIN'], persona: 'TENANT_ADMIN',
      organization: { mode: 'UNITS', tree_version: 'hold-v1', read_roots: ['north'], write_roots: ['north'] },
      departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
    };
    const context: ModuleCommandContext = { principal, correlationId: randomUUID() };
    const create = { requestKey: randomUUID(), orgUnitId: 'north', currencyCode: 'USD', reason: 'Manual review' };
    const first = await service.createManual(context, partyId, create);
    expect(first).toMatchObject({ replayed: false, hold: { status: 'ACTIVE', origin: 'MANUAL',
      exposureMinor: null, creditLimitMinor: null, version: 1 } });
    expect(await status.get(principal, partyId, 'north', 'USD')).toMatchObject({
      decision: 'ACTIVE_HOLD', complete: false, activeHoldId: first.hold.id,
      creditLimitMinor: '1000', exposureMinor: '0',
    });
    expect(await service.createManual(context, partyId, create)).toMatchObject({ replayed: true, hold: { id: first.hold.id } });
    await expect(service.createManual(context, partyId, { ...create, reason: 'Changed reason' }))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.createManual(context, partyId, { ...create, requestKey: randomUUID() }))
      .rejects.toMatchObject({ status: 409 });
    const sibling: ModulePrincipal = { ...principal,
      organization: { mode: 'UNITS', tree_version: 'hold-v1', read_roots: ['south'], write_roots: ['south'] } };
    expect((await service.list(sibling, partyId)).items).toHaveLength(0);
    await expect(status.get(sibling, partyId, 'north', 'USD')).rejects.toMatchObject({ status: 404 });
    await expect(service.release({ principal: sibling, correlationId: randomUUID() }, partyId, first.hold.id,
      { requestKey: randomUUID(), expectedVersion: 1, reason: 'Not my unit' })).rejects.toThrow();
    const release = { requestKey: randomUUID(), expectedVersion: 1, reason: 'Review completed' };
    await expect(service.release(context, partyId, first.hold.id,
      { ...release, expectedVersion: 2 })).rejects.toMatchObject({ status: 409 });
    const released = await service.release(context, partyId, first.hold.id, release);
    expect(released).toMatchObject({ status: 'RELEASED', version: 2, releaseReason: 'Review completed' });
    expect(await service.release(context, partyId, first.hold.id, release)).toMatchObject({ id: first.hold.id, version: 2 });
    expect(await status.get(principal, partyId, 'north', 'USD')).toMatchObject({
      decision: 'SOURCE_INCOMPLETE', complete: false, activeHoldId: null,
    });
    await expect(service.release(context, partyId, first.hold.id,
      { ...release, reason: 'Different replay' })).rejects.toMatchObject({ status: 409 });
    const evidence = await database.withTenantTransaction(tenantId, async (client) => ({
      holds: (await client.query(`SELECT origin, exposure_minor, credit_limit_minor FROM ${schema}.credit_holds
        WHERE tenant_id = $1 AND id = $2`, [tenantId, first.hold.id])).rows,
      audit: (await client.query(`SELECT count(*)::int AS n FROM ${schema}.audit_events
        WHERE tenant_id = $1 AND entity_type = 'credit_hold'`, [tenantId])).rows[0]?.n,
      outbox: (await client.query(`SELECT payload FROM ${schema}.outbox_events
        WHERE tenant_id = $1 AND aggregate_type = 'credit_hold' ORDER BY aggregate_version`, [tenantId])).rows,
    }));
    expect(evidence.holds[0]).toMatchObject({ origin: 'MANUAL', exposure_minor: null, credit_limit_minor: null });
    expect(evidence.audit).toBe(2);
    expect(evidence.outbox).toHaveLength(2);
    expect(evidence.outbox.every((row) => PartnerCreditHoldV1Schema.safeParse(row.payload).success)).toBe(true);
  });
});
