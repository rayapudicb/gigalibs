import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { TAX_CONFIG } from '../config.provider.js';
import type { TaxRuntimeConfig } from '../runtime-config.js';

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private readonly config: TaxRuntimeConfig;

  constructor(@Inject(TAX_CONFIG) config: TaxRuntimeConfig) {
    this.config = config;
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-tax-api',
    });
    this.pool.on('error', (error: Error) => {
      this.logger.error('An idle PostgreSQL client failed.', error.stack);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.bootstrapCheck();
  }

  async bootstrapCheck(): Promise<void> {
    const result = await this.pool.query<{
      migration_count: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM gigalibs_tax.schema_migrations) AS migration_count,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const count = Number(state?.migration_count ?? 0);
    if (count < 2) {
      throw new Error(`Tax database migrations through 000002 are not installed. Found ${count} migrations.`);
    }
    if (this.config.nodeEnv === 'production' && (state?.is_superuser || state?.bypasses_rls)) {
      throw new Error('Tax runtime database role must not be superuser or BYPASSRLS.');
    } else if (state?.is_superuser || state?.bypasses_rls) {
      this.logger.warn('Tax API running with superuser/BYPASSRLS privileges in non-production mode.');
    }
    this.logger.log(`Tax database ready — ${count} migrations verified.`);
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ready: boolean }>(`
        SELECT to_regclass('gigalibs_tax.tax_jurisdictions') IS NOT NULL
          AND to_regclass('gigalibs_tax.schema_migrations') IS NOT NULL AS ready
      `);
      return result.rows[0]?.ready === true;
    } catch {
      return false;
    }
  }

  async queryWithTenant<T extends import('pg').QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<import('pg').QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
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

  async query<T extends import('pg').QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<import('pg').QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
