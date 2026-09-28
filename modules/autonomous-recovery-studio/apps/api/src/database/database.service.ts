import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import pg from 'pg';
import { RECOVERY_CONFIG } from '../config.provider.js';
import type { RecoveryRuntimeConfig } from '../runtime-config.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: pg.Pool;

  constructor(@Inject(RECOVERY_CONFIG) private readonly config: RecoveryRuntimeConfig) {}

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
        await client.query('SET search_path TO gigalibs_recovery, public;');
        this.logger.log('Connected to PostgreSQL (schema: gigalibs_recovery)');
        await this.bootstrapCheck(client);
      } finally {
        client.release();
      }
    } catch (err) {
      this.logger.error('Failed to initialize PostgreSQL pool for Recovery API', err);
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
      await client.query('SET search_path TO gigalibs_recovery, public;');
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  /** Execute a single query with the tenant context set for RLS evaluation. */
  async queryWithTenant<T extends pg.QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_recovery, public;');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_recovery, public;');
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

  /**
   * Begin a transaction with the tenant context set as a LOCAL session variable
   * so that RLS policies evaluate correctly for all statements in the transaction.
   */
  async withTenantTransaction<T>(
    tenantId: string,
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SET search_path TO gigalibs_recovery, public;');
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
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM gigalibs_recovery.schema_migrations`,
      );
      const count = Number(result.rows[0]?.count ?? 0);
      if (count < 3) {
        throw new Error(
          `Recovery schema is not fully migrated. Expected 3 ledger entries, found ${count}. ` +
            `Run all migrations in modules/autonomous-recovery-studio/db/migrations/ before starting.`,
        );
      }
      this.logger.log(`Recovery schema migration check passed (${count}/3 versions applied).`);
    } catch (err: any) {
      if (err.message?.includes('does not exist')) {
        throw new Error(
          'Recovery schema_migrations table not found. Run all three migrations before starting.',
        );
      }
      throw err;
    }
  }
}

