import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import pg from 'pg';
import { loadConnectorHubRuntimeConfig } from '../runtime-config.js';

const { Pool } = pg;

export type TenantTransaction<T> = (client: pg.PoolClient) => Promise<T>;

export const HUB_DEFINER_FUNCTIONS = [
  'relay_lease_analytics_records',
  'relay_settle_analytics_record',
  'relay_lease_geospatial_places',
  'relay_settle_geospatial_place',
  'outbox_sweep',
] as const;
export type HubDefinerFunction = (typeof HUB_DEFINER_FUNCTIONS)[number];

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool;
  private readonly expectedMigrationVersion: number;

  constructor() {
    const config = loadConnectorHubRuntimeConfig();
    this.expectedMigrationVersion = config.expectedMigrationVersion;

    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      application_name: 'gigalibs-connectors-api',
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err.stack);
    });
  }

  async onModuleInit() {
    const state = await this.readiness();
    this.logger.log(
      `PostgreSQL persistence verified (schema: gigalibs_connectors, migration: ${state.migrationVersion})`,
    );
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query(text: string, params?: any[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  async queryWithTenant<T extends pg.QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<pg.QueryResult<T>> {
    if (!tenantId) throw new Error('Tenant context is required for a tenant-scoped query.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
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

  async readiness(): Promise<{ migrationVersion: number }> {
    const result = await this.pool.query<{
      schema_present: boolean;
      migration_version: string | null;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        to_regclass('gigalibs_connectors.tenant_connections') IS NOT NULL AS schema_present,
        CASE
          WHEN to_regclass('gigalibs_connectors.schema_migrations') IS NOT NULL
          THEN (SELECT MAX(version)::text FROM gigalibs_connectors.schema_migrations)
          ELSE NULL
        END AS migration_version,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const migrationVersion = Number(state?.migration_version ?? 0);
    if (!state?.schema_present || migrationVersion < this.expectedMigrationVersion) {
      throw new Error(
        `Connector Hub schema is not ready. Expected migration ${this.expectedMigrationVersion}, found ${migrationVersion}.`,
      );
    }
    if (state.is_superuser || state.bypasses_rls) {
      throw new Error('Connector Hub runtime database role must not be superuser or BYPASSRLS.');
    }
    return { migrationVersion };
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

  /**
   * WI-OI-104e: calls one of the allow-listed SECURITY DEFINER functions of the Analytics relay (lease, settle,
   * retention sweep), the relay's only cross-tenant access.
   */
  async relayCall<T extends pg.QueryResultRow>(fn: HubDefinerFunction, values: readonly unknown[]): Promise<T[]> {
    if (!HUB_DEFINER_FUNCTIONS.includes(fn)) throw new Error(`${fn} is not an allow-listed definer function.`);
    const placeholders = values.map((_value, index) => `$${index + 1}`).join(', ');
    const result = await this.pool.query<T>(`SELECT * FROM gigalibs_connectors.${fn}(${placeholders})`, [...values]);
    return result.rows;
  }

  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  /** True when the session or the subject's auth version was revoked (WI-OI-104a, as the other module services). */
  async isContextRevoked(input: {
    readonly tenantId: string;
    readonly subject: string;
    readonly sessionId: string;
    readonly authVersion: number;
  }): Promise<boolean> {
    return this.withTenantTransaction(input.tenantId, async (client) => {
      const result = await client.query<{ revoked: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM gigalibs_connectors.auth_revocation_events
            WHERE tenant_id = $1
              AND ((revocation_type = 'SESSION' AND session_id = $2)
                OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND subject_id = $3
                    AND invalid_through_auth_version >= $4))
         ) AS revoked`,
        [input.tenantId, input.sessionId, input.subject, input.authVersion],
      );
      return result.rows[0]?.revoked === true;
    });
  }
}
