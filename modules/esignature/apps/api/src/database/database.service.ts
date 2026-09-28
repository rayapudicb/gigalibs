import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { ESIGN_CONFIG } from '../config.provider.js';
import type { EsignRuntimeConfig } from '../runtime-config.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: pg.Pool;

  constructor(@Inject(ESIGN_CONFIG) private readonly config: EsignRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await this.pool.connect();
      try {
        await client.query('SET search_path TO gigalibs_esign, public;');
        this.logger.log('Connected to PostgreSQL (schema: gigalibs_esign)');
        await this.bootstrapCheck(client);
      } finally {
        client.release();
      }
    } catch (err) {
      this.logger.error('Failed to initialize PostgreSQL pool for E-Signature API', err);
      throw err;
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
      await client.query('SET search_path TO gigalibs_esign, public;');
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
      await client.query('SET search_path TO gigalibs_esign, public;');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_esign, public;');
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
      await client.query('SET search_path TO gigalibs_esign, public;');
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
        (SELECT COUNT(*)::text FROM gigalibs_esign.schema_migrations) AS migration_count,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const count = Number(state?.migration_count ?? 0);
    if (count < 2) {
      throw new Error(
        `E-Signature schema is not fully migrated. Expected at least 2 ledger entries, found ${count}. ` +
          `Run all migrations in modules/esignature/db/migrations/ before starting.`,
      );
    }
    if (this.config.nodeEnv === 'production' && (state?.is_superuser || state?.bypasses_rls)) {
      throw new Error('E-Signature runtime database role must not be superuser or BYPASSRLS in production.');
    } else if (state?.is_superuser || state?.bypasses_rls) {
      this.logger.warn('E-Signature API running with superuser/BYPASSRLS privileges in non-production mode.');
    }
    this.logger.log(`E-Signature database ready — ${count} migrations verified.`);
  }
}
