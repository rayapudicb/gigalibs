import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { ANALYTICS_CONFIG } from '../config.provider.js';
import type { AnalyticsRuntimeConfig } from '../runtime-config.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: pg.Pool;

  constructor(@Inject(ANALYTICS_CONFIG) private readonly config: AnalyticsRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_analytics, public;');
      this.logger.log('Connected to PostgreSQL (schema: gigalibs_analytics)');
      await this.bootstrapCheck(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_analytics, public;');
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  /** Execute a single query with tenant context set for RLS evaluation. */
  async queryWithTenant<T extends pg.QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_analytics, public;');
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const result = await client.query<T>(text, params);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** True when the session or the subject's auth version was revoked (WI-OI-064a, mirrors Workforce). */
  async isContextRevoked(input: {
    readonly tenantId: string;
    readonly subject: string;
    readonly sessionId: string;
    readonly authVersion: number;
  }): Promise<boolean> {
    const result = await this.queryWithTenant<{ revoked: boolean }>(
      input.tenantId,
      `SELECT EXISTS (
         SELECT 1
         FROM gigalibs_analytics.auth_revocation_events
         WHERE tenant_id = $1
           AND (
             (revocation_type = 'SESSION' AND session_id = $2)
             OR (
               revocation_type = 'SUBJECT_AUTH_VERSION'
               AND subject_id = $3
               AND invalid_through_auth_version >= $4
             )
           )
       ) AS revoked`,
      [input.tenantId, input.sessionId, input.subject, input.authVersion],
    );
    return result.rows[0]?.revoked === true;
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_analytics, public;');
      await client.query('BEGIN');
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

  /** Execute a transaction with tenant context set for RLS evaluation. */
  async withTenantTransaction<T>(
    tenantId: string,
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_analytics, public;');
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

  /** WI-OI-104e: the retention sweep of relay inbox receipts, the only allow-listed definer function. */
  async relayCall<T extends pg.QueryResultRow>(fn: 'outbox_sweep', values: readonly unknown[]): Promise<T[]> {
    if (fn !== 'outbox_sweep') throw new Error(`${fn} is not an allow-listed definer function.`);
    const result = await this.pool.query<T>('SELECT * FROM gigalibs_analytics.outbox_sweep($1, $2, $3)', [...values]);
    return result.rows;
  }

  async readiness(): Promise<{ migrationVersion: number }> {
    const result = await this.pool.query<{
      migration_version: string | null;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        CASE
          WHEN to_regclass('gigalibs_analytics.schema_migrations') IS NOT NULL
          THEN (SELECT MAX(version)::text FROM gigalibs_analytics.schema_migrations)
          ELSE NULL
        END AS migration_version,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const migrationVersion = Number(state?.migration_version ?? 0);
    if (migrationVersion < this.config.expectedMigrationVersion) {
      throw new Error(
        `Analytics schema is not ready. Expected migration ${this.config.expectedMigrationVersion}, found ${migrationVersion}.`,
      );
    }
    if (state?.is_superuser || state?.bypasses_rls) {
      throw new Error('Analytics runtime database role must not be superuser or BYPASSRLS.');
    }
    return { migrationVersion };
  }

  private async bootstrapCheck(client: pg.PoolClient): Promise<void> {
    const result = await client.query<{
      migration_count: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM gigalibs_analytics.schema_migrations) AS migration_count,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const count = Number(state?.migration_count ?? 0);
    if (count < this.config.expectedMigrationVersion) {
      throw new Error(
        `Analytics schema is not fully migrated. Expected at least ${this.config.expectedMigrationVersion} ledger entries, found ${count}. ` +
          `Run all migrations in modules/analytics-studio/db/migrations/ before starting.`,
      );
    }
    if (state?.is_superuser || state?.bypasses_rls) {
      throw new Error('Analytics runtime database role must not be superuser or BYPASSRLS.');
    }
    this.logger.log(`Analytics database ready — ${count} migrations verified.`);
  }
}
