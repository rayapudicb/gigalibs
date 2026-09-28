import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { CMMS_CONFIG } from '../config.provider.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Calendar dates stay calendar dates (YYYY-MM-DD) instead of becoming local-midnight Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export type TenantTransaction<T> = (client: pg.PoolClient) => Promise<T>;

/**
 * Canonical CMMS PostgreSQL runtime (WI-OI-038). Every statement runs inside a transaction bound to the
 * verified tenant through `app.tenant_id`, which the forced RLS policies of every table evaluate. The runtime
 * role must not be superuser or BYPASSRLS, and the schema must be exactly at the image's contract version.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: pg.Pool;

  constructor(@Inject(CMMS_CONFIG) private readonly config: CmmsRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-cmms-api',
    });
    this.pool.on('error', (error: Error) => this.logger.error('An idle PostgreSQL client failed.', error.stack));
    const state = await this.assertReady();
    this.logger.log(`Canonical CMMS PostgreSQL runtime is ready at migration ${state.migrationVersion}.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async readiness(): Promise<{ readonly migrationVersion: number }> {
    return this.assertReady();
  }

  async withTenantTransaction<T>(tenantId: string, operation: TenantTransaction<T>): Promise<T> {
    if (!TENANT_ID_PATTERN.test(tenantId)) throw new Error('The verified tenant identifier is invalid.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path TO gigalibs_cmms, public');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calls one of the outbox relay definer functions (WI-OI-068); the only cross-tenant access the runtime role
   * has, limited to leasing and settling handshake rows.
   */
  async relayCall<T extends pg.QueryResultRow>(
    fn: 'relay_lease_workforce_events' | 'relay_settle_workforce_event' | 'outbox_sweep',
    values: readonly unknown[],
  ): Promise<T[]> {
    const placeholders = values.map((_value, index) => `$${index + 1}`).join(', ');
    const result = await this.pool.query<T>(`SELECT * FROM gigalibs_cmms.${fn}(${placeholders})`, [...values]);
    return result.rows;
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
             FROM gigalibs_cmms.auth_revocation_events
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

  private async assertReady(): Promise<{ readonly migrationVersion: number }> {
    const result = await this.pool.query<{
      migration_version: number | string | null;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        CASE WHEN to_regclass('gigalibs_cmms.schema_migrations') IS NOT NULL
             THEN (SELECT MAX(version) FROM gigalibs_cmms.schema_migrations)
        END AS migration_version,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const migrationVersion = Number(state?.migration_version ?? 0);
    if (migrationVersion !== this.config.expectedMigrationVersion) {
      throw new Error(
        `CMMS schema must be exactly migration ${this.config.expectedMigrationVersion}; found ${migrationVersion}.`,
      );
    }
    if (state?.is_superuser || state?.bypasses_rls) {
      throw new Error('CMMS runtime role must not be superuser or BYPASSRLS.');
    }
    return Object.freeze({ migrationVersion });
  }
}
