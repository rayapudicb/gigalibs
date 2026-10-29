import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { bootstrapFinanceProofSchema } from '../../../../../scripts/lib/bootstrap-finance-proof-schema.mjs';

describe.skipIf(process.env.FINANCE_LANDED_COST_PG_PROOF !== '1')(
  'Finance landed cost inventory relay migration on disposable PostgreSQL 16',
  () => {
    it('applies v17 and leases finance.inventory.landed-cost-adjusted.v1 events', async () => {
      const container = `gigalibs-finance-landed-cost-proof-${process.pid}`;
      const password = randomBytes(18).toString('hex');
      let admin: pg.Client | undefined;
      execFileSync(
        'docker',
        [
          'run',
          '-d',
          '--rm',
          '--name',
          container,
          '-e',
          `POSTGRES_PASSWORD=${password}`,
          '-e',
          'POSTGRES_DB=finance_landed_cost_proof',
          '-p',
          '127.0.0.1::5432',
          'postgres:16-alpine',
        ],
        { stdio: 'ignore' },
      );
      try {
        const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
          .trim()
          .split(':')
          .pop();
        const url = `postgres://postgres:${password}@127.0.0.1:${port}/finance_landed_cost_proof`;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          admin = new pg.Client({ connectionString: url });
          try {
            await admin.connect();
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        if (!admin) throw new Error('Disposable PostgreSQL did not start.');
        const proof = await bootstrapFinanceProofSchema(url);
        expect(proof.migrationVersion).toBeGreaterThanOrEqual(17);
        const version = await admin.query('SELECT MAX(version)::int AS version FROM gigalibs_finance.schema_migrations');
        expect(version.rows[0].version).toBeGreaterThanOrEqual(17);
        const fn = await admin.query<{ prosrc: string }>(
          `SELECT prosrc FROM pg_proc WHERE proname = 'relay_lease_finance_inventory_events'`,
        );
        expect(fn.rows[0]?.prosrc).toContain('finance.inventory.landed-cost-adjusted.v1');
      } finally {
        await admin?.end().catch(() => undefined);
        execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
      }
    }, 120_000);
  },
);
