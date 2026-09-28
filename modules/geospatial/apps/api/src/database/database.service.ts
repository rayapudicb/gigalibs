import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { GEOSPATIAL_CONFIG } from '../config.provider.js';
import type { GeospatialRuntimeConfig } from '../runtime-config.js';

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

@Injectable()
export class GeospatialDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeospatialDatabaseService.name);
  private pool!: pg.Pool;

  constructor(@Inject(GEOSPATIAL_CONFIG) private readonly config: GeospatialRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl,
      max: this.config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    await this.assertReady();
    this.logger.log('Canonical Geospatial PostgreSQL runtime is ready.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async readiness(): Promise<{ readonly migrationVersion: number }> {
    return this.assertReady();
  }

  async withTenantTransaction<T>(
    tenantId: string,
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    assertTenantId(tenantId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path TO gigalibs_geospatial, public');
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async currentTenantScope(tenantId: string): Promise<string> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{ tenant_id: string | null }>(
        "SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id",
      );
      const boundTenantId = result.rows[0]?.tenant_id;
      if (boundTenantId !== tenantId) {
        throw new Error('Geospatial tenant transaction binding failed.');
      }
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
           FROM gigalibs_geospatial.auth_revocation_events
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
    });
  }

  private async assertReady(): Promise<{ readonly migrationVersion: number }> {
    const result = await this.pool.query<{
      migration_version: number | string | null;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        CASE
          WHEN to_regclass('gigalibs_geospatial.schema_migrations') IS NOT NULL
          THEN (SELECT MAX(version) FROM gigalibs_geospatial.schema_migrations)
          ELSE NULL
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
        `Geospatial schema must be exactly migration ${this.config.expectedMigrationVersion}; found ${migrationVersion}.`,
      );
    }
    if (state?.is_superuser || state?.bypasses_rls) {
      throw new Error('Geospatial runtime role must not be superuser or BYPASSRLS.');
    }
    return Object.freeze({ migrationVersion });
  }
}

function assertTenantId(tenantId: string): void {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error('The verified tenant identifier is invalid.');
  }
}
