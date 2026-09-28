import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import pg from 'pg';

const { Pool } = pg;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool;

  constructor() {
    const connectionString =
      process.env.PLATFORM_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs';

    this.pool = new Pool({
      connectionString,
      max: 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SET search_path TO gigalibs_platform, public');
        this.logger.log('Connected to PostgreSQL 16 (schema: gigalibs_platform)');
        await this.bootstrapCheck(client);
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.logger.error(`Database connection failed: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query(text: string, params?: any[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  /** Execute a single query with tenant context set for RLS evaluation. */
  async queryWithTenant<T extends pg.QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_platform, public');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  /** Execute a transaction with tenant context set for RLS evaluation. */
  async withTenantTransaction<T>(
    tenantId: string,
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_platform, public');
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async bootstrapCheck(client: pg.PoolClient): Promise<void> {
    const result = await client.query<{
      migration_count: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM gigalibs_platform.schema_migrations) AS migration_count,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const count = Number(state?.migration_count ?? 0);
    if (count < 3) {
      throw new Error(
        `Platform schema is not fully migrated. Expected at least 3 ledger entries, found ${count}. ` +
          `Run all migrations in modules/platform-rbac/db/migrations/ before starting.`,
      );
    }
    if (process.env.NODE_ENV === 'production' && (state?.is_superuser || state?.bypasses_rls)) {
      throw new Error('Platform runtime database role must not be superuser or BYPASSRLS in production.');
    } else if (state?.is_superuser || state?.bypasses_rls) {
      this.logger.warn('Platform RBAC running with superuser/BYPASSRLS privileges in non-production mode.');
    }
    this.logger.log(`Platform RBAC database ready — ${count} migrations verified.`);
  }

  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }
}
