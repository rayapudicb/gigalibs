import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { SPEND_CONFIG } from '../config.provider.js';
import type { SpendRuntimeConfig } from '../runtime-config.js';

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(@Inject(SPEND_CONFIG) config: SpendRuntimeConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-spend-api',
    });
    this.pool.on('error', (error: Error) => {
      this.logger.error('An idle PostgreSQL client failed.', error.stack);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.pool.query<{
      schema_present: boolean;
      migration_present: boolean;
    }>(`
      SELECT
        to_regclass('gigalibs_spend.cost_centers') IS NOT NULL AS schema_present,
        CASE
          WHEN to_regclass('gigalibs_spend.schema_migrations') IS NOT NULL
          THEN (
            SELECT COUNT(*) = 2 FROM gigalibs_spend.schema_migrations
            WHERE (version = 1 AND name = '000001_spend_foundation')
               OR (version = 2 AND name = '000002_spend_rls_and_ledger')
          )
          ELSE false
        END AS migration_present
    `);
    const state = result.rows[0];
    if (!state?.schema_present || !state.migration_present) {
      throw new Error('Spend database migrations through 000002 are not installed.');
    }
  }

  async isReady(): Promise<boolean> {
    const result = await this.pool.query<{ ready: boolean }>(`
      SELECT
        to_regclass('gigalibs_spend.cost_centers') IS NOT NULL
        AND to_regclass('gigalibs_spend.schema_migrations') IS NOT NULL AS ready
    `);
    return result.rows[0]?.ready === true;
  }

  async withTenantTransaction<T>(tenantId: string, operation: TenantTransaction<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getPool(): Pool {
    return this.pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
