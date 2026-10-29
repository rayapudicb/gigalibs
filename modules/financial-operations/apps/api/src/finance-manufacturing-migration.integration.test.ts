import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { bootstrapFinanceProofSchema } from '../../../../../scripts/lib/bootstrap-finance-proof-schema.mjs';

describe.skipIf(process.env.FINANCE_MANUFACTURING_PG_PROOF !== '1')(
  'Finance manufacturing account migration on disposable PostgreSQL 16', () => {
    it('applies v16, preserves the preceding ledger, and refuses a cross-tenant WIP account', async () => {
      const container = `gigalibs-finance-manufacturing-proof-${process.pid}`;
      const password = randomBytes(18).toString('hex');
      let admin: pg.Client | undefined;
      execFileSync('docker', ['run', '-d', '--rm', '--name', container,
        '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=finance_manufacturing_proof',
        '-p', '127.0.0.1::5432', 'postgres:16-alpine'], { stdio: 'ignore' });
      try {
        const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
          .trim().split(':').pop();
        const url = `postgres://postgres:${password}@127.0.0.1:${port}/finance_manufacturing_proof`;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          admin = new pg.Client({ connectionString: url });
          try { await admin.connect(); break; }
          catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
        }
        if (!admin) throw new Error('Disposable PostgreSQL did not start.');
        await admin.query('CREATE TABLE public.manufacturing_upgrade_sentinel (value text NOT NULL)');
        await admin.query("INSERT INTO public.manufacturing_upgrade_sentinel VALUES ('preserve-me')");
        const proof = await bootstrapFinanceProofSchema(url);
        expect(proof.migrationVersion).toBeGreaterThanOrEqual(16);
        const version = await admin.query('SELECT MAX(version)::int AS version FROM gigalibs_finance.schema_migrations');
        expect(version.rows[0].version).toBeGreaterThanOrEqual(16);
        const sentinel = await admin.query('SELECT value FROM public.manufacturing_upgrade_sentinel');
        expect(sentinel.rows[0].value).toBe('preserve-me');

        const bookId = randomUUID();
        const ownAccountId = randomUUID();
        const otherAccountId = randomUUID();
        const profileId = randomUUID();
        for (const [tenantId, id, accountId] of [
          ['manufacturing-a', bookId, ownAccountId],
          ['manufacturing-b', randomUUID(), otherAccountId],
        ]) {
          await admin.query(
            `INSERT INTO gigalibs_finance.accounting_books
               (id, tenant_id, book_code, book_name, legal_entity_party_id, currency_code)
             VALUES ($1,$2,'PRIMARY','Primary', $3,'USD')`, [id, tenantId, randomUUID()],
          );
          await admin.query(
            `INSERT INTO gigalibs_finance.chart_of_accounts
               (id, tenant_id, accounting_book_id, account_code, account_name,
                account_class, account_subtype, normal_balance)
             VALUES ($1,$2,$3,'1000','Proof asset','ASSET','INVENTORY','DEBIT')`,
            [accountId, tenantId, id],
          );
        }
        await expect(admin.query(
          `INSERT INTO gigalibs_finance.cost_profiles
             (id, tenant_id, code, name, costing_method, inventory_gl_account_id,
              grni_gl_account_id, cogs_gl_account_id, landed_cost_clearing_gl_account_id,
              purchase_price_variance_gl_account_id, scrap_gl_account_id, valuation_loss_gl_account_id,
              manufacturing_wip_gl_account_id, manufacturing_variance_gl_account_id)
           VALUES ($1,'manufacturing-a','PROOF','Proof','STANDARD',$2,$2,$2,$2,$2,$2,$2,$3,$2)`,
          [profileId, ownAccountId, otherAccountId],
        )).rejects.toMatchObject({ code: '23503' });
        const count = await admin.query('SELECT COUNT(*)::int AS count FROM gigalibs_finance.cost_profiles WHERE id=$1',
          [profileId]);
        expect(count.rows[0].count).toBe(0);
      } finally {
        await admin?.end().catch(() => undefined);
        execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
      }
    }, 120_000);
  },
);
