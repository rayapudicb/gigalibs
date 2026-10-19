import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { AR_CONFIG } from '../config.provider.js';
import type { ArRuntimeConfig } from '../runtime-config.js';

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

// WI-OI-113: authoritative count of applied AR migrations (versions 1-13 + 14 = 14 rows).
const REQUIRED_MIGRATION_COUNT = 16;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly _pool: Pool;

  private readonly config: ArRuntimeConfig;

  /** Expose the pool for shared modules that need direct pg access. */
  get pool(): Pool { return this._pool; }

  constructor(@Inject(AR_CONFIG) config: ArRuntimeConfig) {
    this.config = config;
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
    await this.bootstrapCheck();
  }

  /**
   * Validates that the AR schema has all required migrations applied and that
   * the runtime role is not superuser/BYPASSRLS. Throws on failure so the
   * process exits before serving any request.
   */
  async bootstrapCheck(): Promise<void> {
    const result = await this._pool.query<{
      migration_count: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM gigalibs_ar.schema_migrations) AS migration_count,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const count = Number(state?.migration_count ?? 0);
    if (count !== REQUIRED_MIGRATION_COUNT) {
      throw new Error(
        `AR schema_migrations has ${count} rows; expected exactly ${REQUIRED_MIGRATION_COUNT}. ` +
        `Run all migrations through 000016 before starting the service.`,
      );
    }
    if (this.config.nodeEnv === 'production' && ((state?.is_superuser) || (state?.bypasses_rls))) {
      throw new Error('AR runtime database role must not be superuser or BYPASSRLS in production.');
    } else if ((state?.is_superuser) || (state?.bypasses_rls)) {
      this.logger.warn('AR API running with superuser/BYPASSRLS privileges in non-production mode.');
    }
    this.logger.log(`AR database ready — ${count} migrations verified.`);
  }


  /**
   * Executes a tenant-scoped read query. Sets app.tenant_id for the duration of
   * the connection checkout so any RESTRICTIVE RLS policies are satisfied.
   */
  async queryWithTenant<R extends QueryResultRow>(
    tenantId: string,
    sql: string,
    params?: unknown[],
  ): Promise<R[]> {
    const client = await this._pool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<R>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Executes a tenant-scoped write operation inside a serialized transaction.
   * Sets app.tenant_id LOCAL to the transaction before any DML so RESTRICTIVE
   * RLS policies are enforced atomically.
   */
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

  async isReady(): Promise<boolean> {
    try {
      const result = await this._pool.query<{ count: string; max_version: string }>(
        `SELECT COUNT(*)::text AS count, COALESCE(MAX(version)::text, '0') AS max_version FROM gigalibs_ar.schema_migrations`,
      );
      const count = Number(result.rows[0]?.count);
      const maxVersion = Number(result.rows[0]?.max_version);
      return count === REQUIRED_MIGRATION_COUNT && maxVersion === REQUIRED_MIGRATION_COUNT;
    } catch {
      return false;
    }
  }

  async isContextRevoked(input: {
    readonly tenantId: string;
    readonly subject: string;
    readonly sessionId: string;
    readonly authVersion: number;
  }): Promise<boolean> {
    return this.withTenantTransaction(input.tenantId, async (client) => {
      const result = await client.query<{ revoked: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM gigalibs_ar.auth_revocation_events
            WHERE tenant_id = $1
              AND ((revocation_type = 'SESSION' AND session_id = $2)
                OR (revocation_type = 'SUBJECT_AUTH_VERSION'
                    AND subject_id = $3
                    AND invalid_through_auth_version >= $4))
         ) AS revoked`,
        [input.tenantId, input.sessionId, input.subject, input.authVersion],
      );
      return result.rows[0]?.revoked === true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this._pool.end();
  }
}
