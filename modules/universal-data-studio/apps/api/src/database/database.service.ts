import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';

const { Pool } = pg;

export type TenantTransaction<T> = (client: pg.PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool;

  constructor() {
    // WI-OI-120am: no fallback address or password in code; the deployment supplies the URL.
    const connectionString = process.env.DATA_STUDIO_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATA_STUDIO_DATABASE_URL or DATABASE_URL is required');

    this.pool = new Pool({
      connectionString,
      max: parseInt(process.env.DATA_STUDIO_DATABASE_POOL_SIZE || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      application_name: 'gigalibs-data-studio-api',
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query<{
          schema_present: boolean;
          migration_present: boolean;
          is_superuser: boolean;
          bypasses_rls: boolean;
        }>(`
          SELECT
            to_regclass('gigalibs_data_studio.data_contracts') IS NOT NULL AS schema_present,
            CASE
              WHEN to_regclass('gigalibs_data_studio.schema_migrations') IS NOT NULL
              THEN EXISTS (
                SELECT 1 FROM gigalibs_data_studio.schema_migrations
                WHERE version = 2
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
          this.logger.warn('Data Studio migrations through 000002 not detected. Ensure migrations are applied.');
        } else {
          this.logger.log('PostgreSQL 16 persistence verified (schema: gigalibs_data_studio, migrations: 2)');
        }
      } finally {
        client.release();
      }
    } catch (err) {
      this.logger.warn(`PostgreSQL pool deferred connection: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
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

  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }
}
