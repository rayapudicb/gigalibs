import { Logger } from '@nestjs/common';
import pg from 'pg';

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

// Calendar dates stay calendar dates (YYYY-MM-DD) instead of becoming local-midnight Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export type TenantTransaction<T> = (client: pg.PoolClient) => Promise<T>;

/**
 * How a transaction binds the verified tenant. Both are transaction-local; each module keeps the statements its
 * certification pins. `set-local`: `SET LOCAL search_path` then `set_config('app.tenant_id')` (two round trips).
 * `set-config`: one `set_config` statement for both settings.
 */
export type TenantBinding = 'set-local' | 'set-config';

export interface ModuleDatabaseOptions<F extends string> {
  /** Used in log and error messages, for example "CMMS" or "Workforce". */
  readonly label: string;
  /** The schema the module owns; every table carries forced RLS on `app.tenant_id`. */
  readonly schema: string;
  readonly databaseUrl: string;
  readonly poolSize: number;
  /** The image's schema contract: the database must be at exactly this migration. */
  readonly expectedMigrationVersion: number;
  /** SECURITY DEFINER functions the runtime role may call outside a tenant transaction (relay and retention). */
  readonly definerFunctions: readonly F[];
  readonly tenantBinding: TenantBinding;
  readonly poolOptions?: Pick<pg.PoolConfig, 'statement_timeout' | 'application_name'>;
}

/**
 * Canonical module PostgreSQL runtime (ADR-0013 core, extracted from CMMS and Workforce in WI-OI-082). Every
 * tenant statement runs inside a transaction bound to the verified tenant through `app.tenant_id`, which the forced
 * RLS policies evaluate. The runtime role must not be superuser or BYPASSRLS, and the schema must be exactly at the
 * image's contract version. The only cross-tenant access is the module's allow-listed definer functions.
 */
export class ModuleDatabase<F extends string = string> {
  protected readonly logger = new Logger(this.constructor.name);
  private pool!: pg.Pool;

  constructor(private readonly moduleOptions: ModuleDatabaseOptions<F>) {
    const names = [moduleOptions.schema, ...moduleOptions.definerFunctions];
    if (!names.every((name) => IDENTIFIER_PATTERN.test(name))) {
      throw new Error(
        'Module schema and definer function names must be lowercase SQL identifiers.',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    const { databaseUrl, poolSize, poolOptions, label } = this.moduleOptions;
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      max: poolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ...poolOptions,
    });
    this.pool.on('error', (error: Error) =>
      this.logger.error('An idle PostgreSQL client failed.', error.stack),
    );
    const state = await this.assertReady();
    this.logger.log(
      `Canonical ${label} PostgreSQL runtime is ready at migration ${state.migrationVersion}.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async readiness(): Promise<{ readonly migrationVersion: number }> {
    return this.assertReady();
  }

  async withTenantTransaction<T>(tenantId: string, operation: TenantTransaction<T>): Promise<T> {
    if (!TENANT_ID_PATTERN.test(tenantId))
      throw new Error('The verified tenant identifier is invalid.');
    const { schema, tenantBinding } = this.moduleOptions;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantBinding === 'set-local') {
        await client.query(`SET LOCAL search_path TO ${schema}, public`);
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      } else {
        // One round trip binds both transaction-local settings (the tenant for RLS and the search path).
        await client.query(
          `SELECT set_config('search_path', '${schema}, public', true), set_config('app.tenant_id', $1, true)`,
          [tenantId],
        );
      }
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

  /** Calls one of the module's allow-listed SECURITY DEFINER functions (outbox relay and retention). */
  async relayCall<T extends pg.QueryResultRow>(fn: F, values: readonly unknown[]): Promise<T[]> {
    if (!this.moduleOptions.definerFunctions.includes(fn)) {
      throw new Error(`${fn} is not an allow-listed definer function.`);
    }
    const placeholders = values.map((_value, index) => `$${index + 1}`).join(', ');
    const result = await this.pool.query<T>(
      `SELECT * FROM ${this.moduleOptions.schema}.${fn}(${placeholders})`,
      [...values],
    );
    return result.rows;
  }

  /** Proves the tenant binding inside a transaction (used by runtime certification). */
  async currentTenantScope(tenantId: string): Promise<string> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{ tenant_id: string | null }>(
        "SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id",
      );
      const boundTenantId = result.rows[0]?.tenant_id;
      if (boundTenantId !== tenantId)
        throw new Error(`${this.moduleOptions.label} tenant transaction binding failed.`);
      return boundTenantId;
    });
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
             FROM ${this.moduleOptions.schema}.auth_revocation_events
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
    const { schema, label, expectedMigrationVersion } = this.moduleOptions;
    const result = await this.pool.query<{
      migration_version: number | string | null;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        CASE WHEN to_regclass('${schema}.schema_migrations') IS NOT NULL
             THEN (SELECT MAX(version) FROM ${schema}.schema_migrations)
        END AS migration_version,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const state = result.rows[0];
    const migrationVersion = Number(state?.migration_version ?? 0);
    if (migrationVersion !== expectedMigrationVersion) {
      throw new Error(
        `${label} schema must be exactly migration ${expectedMigrationVersion}; found ${migrationVersion}.`,
      );
    }
    if (state?.is_superuser || state?.bypasses_rls) {
      throw new Error(`${label} runtime role must not be superuser or BYPASSRLS.`);
    }
    return Object.freeze({ migrationVersion });
  }
}
