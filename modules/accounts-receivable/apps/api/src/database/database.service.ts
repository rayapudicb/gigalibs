import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AR_CONFIG } from '../config.provider.js';
import type { ArRuntimeConfig } from '../runtime-config.js';

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly _pool: Pool;

  /** Expose the pool for shared modules that need direct pg access. */
  get pool(): Pool { return this._pool; }

  constructor(@Inject(AR_CONFIG) config: ArRuntimeConfig) {
    this._pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-ar-api',
    });
    this._pool.on('error', (error) => {
      this.logger.error('An idle PostgreSQL client failed.', error.stack);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const result = await this._pool.query<{
      schema_present: boolean;
      migration_present: boolean;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        to_regclass('gigalibs_ar.module_tenants') IS NOT NULL AS schema_present,
        CASE
          WHEN to_regclass('gigalibs_ar.schema_migrations') IS NOT NULL
          THEN EXISTS (
            SELECT 1 FROM gigalibs_ar.schema_migrations
            WHERE version = 2 AND name = '000002_ar_outbox_delivery'
          )
          ELSE false
        END AS migration_present,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    if (!state?.schema_present || !state.migration_present) {
      throw new Error('AR database migrations through 000002 are not installed.');
    }
    if (state.is_superuser || state.bypasses_rls) {
      throw new Error('AR runtime database role must not be superuser or BYPASSRLS.');
    }
  }

  async isReady(): Promise<boolean> {
    const result = await this._pool.query<{ ready: boolean }>(`
      SELECT
        to_regclass('gigalibs_ar.module_tenants') IS NOT NULL
        AND to_regclass('gigalibs_ar.schema_migrations') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM gigalibs_ar.schema_migrations
          WHERE version = 2 AND name = '000002_ar_outbox_delivery'
        ) AS ready
    `);
    return result.rows[0]?.ready === true;
  }

  async withTenantTransaction<T>(tenantId: string, operation: TenantTransaction<T>): Promise<T> {
    const client = await this._pool.connect();
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

  async onModuleDestroy(): Promise<void> {
    await this._pool.end();
  }
}
