import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { SCANNER_CONFIG } from '../config.provider.js';
import type { ScannerRuntimeConfig } from '../runtime-config.js';

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private readonly config: ScannerRuntimeConfig;

  constructor(@Inject(SCANNER_CONFIG) config: ScannerRuntimeConfig) {
    this.config = config;
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolSize,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-scanner-api',
    });
    this.pool.on('error', (error: Error) => {
      this.logger.error('An idle PostgreSQL client encountered an error.', error.stack);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.bootstrapCheck();
  }

  async bootstrapCheck(): Promise<void> {
    try {
      const result = await this.pool.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'gigalibs_scanner' AND table_name = 'document_uploads'
        ) AS exists;
      `);
      if (result.rows[0]?.exists) {
        this.logger.log('Document Scanner schema verified.');
      } else {
        this.logger.warn('Document Scanner tables not found; verify schema migrations have been applied.');
      }
    } catch (err: any) {
      this.logger.warn(`Database connection check warning: ${err?.message}`);
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }

  /** Execute a query with tenant context set for Row Level Security */
  async queryWithTenant<T extends import('pg').QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<import('pg').QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, true), set_config('app.tenant_id', $1, true)", [tenantId]);
      return await client.query<T>(text, params);
    } finally {
      client.release();
    }
  }

  /** Scoped tenant transaction */
  async withTenantTransaction<T>(tenantId: string, operation: TenantTransaction<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true), set_config('app.tenant_id', $1, true)", [tenantId]);
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

  getPool(): Pool {
    return this.pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
