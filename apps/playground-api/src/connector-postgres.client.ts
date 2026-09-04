import { Buffer } from 'node:buffer';
import { Injectable } from '@nestjs/common';
import { Client } from 'pg';
import { ConnectorCredentialService, type ConnectorCredential } from './connector-credential.service.js';
import { ConnectorFailure } from './connector-errors.js';
import {
  resolveAllowedAddress,
  validateAllowedHostAndPort,
} from './connector-network-policy.js';
import { runtimeConfig } from './config/runtime-config.js';

export interface PostgreSqlConnectorConfiguration {
  schemaName: string;
  tableName: string;
  columns: string[];
  sampleRecordLimit: number;
  connectionTimeoutSeconds: number;
  statementTimeoutMs: number;
  sslMode: 'DISABLE' | 'VERIFY_FULL';
}

export interface PostgreSqlConnectorResult {
  statusCode: number;
  latencyMs: number;
  contentType: 'application/json';
  bytesReceived: number;
  body: unknown;
  diagnostics: {
    database: string;
    schema: string;
    table: string;
    selectedColumns: string[];
    readOnlyTransaction: true;
    sourceRoleHasWritePrivileges: boolean;
  };
}

@Injectable()
export class ConnectorPostgresClient {
  constructor(private readonly credentialService: ConnectorCredentialService) {}

  async execute(
    endpoint: string,
    configuration: PostgreSqlConnectorConfiguration,
    credential: ConnectorCredential | null,
    operation: 'TEST' | 'PROFILE',
  ): Promise<PostgreSqlConnectorResult> {
    const target = await this.resolveTarget(endpoint);
    const credentials = this.credentialService.resolveUsernamePassword(credential);
    const client = new Client({
      host: target.address,
      port: target.port,
      database: target.database,
      user: credentials.username,
      password: credentials.password,
      connectionTimeoutMillis: configuration.connectionTimeoutSeconds * 1_000,
      statement_timeout: configuration.statementTimeoutMs,
      query_timeout: configuration.statementTimeoutMs,
      application_name: 'gigalibs-readonly-connector',
      ssl:
        configuration.sslMode === 'VERIFY_FULL'
          ? { rejectUnauthorized: true, servername: target.hostname }
          : false,
    });
    const startedAt = performance.now();
    let transactionStarted = false;
    try {
      await client.connect();
      await client.query('BEGIN TRANSACTION READ ONLY');
      transactionStarted = true;
      const metadata = await this.tableMetadata(client, configuration);
      const sourceRoleHasWritePrivileges = metadata.sourceRoleHasWritePrivileges;
      const body =
        operation === 'PROFILE'
          ? await this.sampleRows(client, configuration)
          : {
              database: target.database,
              schema: configuration.schemaName,
              table: configuration.tableName,
              columns: metadata.selectedColumns,
              approximateRows: metadata.approximateRows,
              sourceRoleHasWritePrivileges,
              connectorEnforcesReadOnly: true,
            };
      await client.query('ROLLBACK');
      transactionStarted = false;
      const normalized = this.normalizeJson(body);
      const serialized = JSON.stringify(normalized);
      return {
        statusCode: 200,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        contentType: 'application/json',
        bytesReceived: Buffer.byteLength(serialized, 'utf8'),
        body: normalized,
        diagnostics: {
          database: target.database,
          schema: configuration.schemaName,
          table: configuration.tableName,
          selectedColumns: metadata.selectedColumns,
          readOnlyTransaction: true,
          sourceRoleHasWritePrivileges,
        },
      };
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ConnectorFailure) throw error;
      const databaseError = error as { code?: string };
      if (databaseError.code === '28P01' || databaseError.code === '28000') {
        throw new ConnectorFailure(
          'DATABASE_AUTHENTICATION_FAILED',
          'The database rejected the configured credential.',
        );
      }
      if (databaseError.code === '42501') {
        throw new ConnectorFailure(
          'DATABASE_PERMISSION_DENIED',
          'The database role lacks the required read permission.',
        );
      }
      if (databaseError.code === '42P01' || databaseError.code === '42703') {
        throw new ConnectorFailure(
          'DATABASE_OBJECT_NOT_FOUND',
          'The configured table or selected column does not exist.',
        );
      }
      throw new ConnectorFailure(
        'DATABASE_UNREACHABLE',
        'The PostgreSQL source could not be queried through the read-only connector.',
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async resolveTarget(endpoint: string): Promise<{
    address: string;
    hostname: string;
    port: number;
    database: string;
  }> {
    const url = new URL(endpoint);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ConnectorFailure(
        'INVALID_DATABASE_ENDPOINT',
        'The PostgreSQL endpoint is invalid or contains prohibited credential material.',
      );
    }
    const port = url.port ? Number(url.port) : 5432;
    const policy = {
      allowedHosts: runtimeConfig.connectorDatabaseAllowedHosts,
      allowedPorts: runtimeConfig.connectorDatabaseAllowedPorts,
      allowPrivateNetworks: runtimeConfig.connectorDatabaseAllowPrivateNetworks,
    };
    const hostname = validateAllowedHostAndPort(url.hostname, port, policy);
    const { address } = await resolveAllowedAddress(hostname, policy);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!database || database.length > 63 || database.includes('/')) {
      throw new ConnectorFailure(
        'INVALID_DATABASE_ENDPOINT',
        'The PostgreSQL endpoint must identify exactly one database.',
      );
    }
    return { address, hostname, port, database };
  }

  private async tableMetadata(client: Client, configuration: PostgreSqlConnectorConfiguration) {
    const qualifiedName = `${this.quoteIdentifier(configuration.schemaName)}.${this.quoteIdentifier(
      configuration.tableName,
    )}`;
    const [columns, privileges, estimate] = await Promise.all([
      client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [configuration.schemaName, configuration.tableName],
      ),
      client.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_truncate: boolean;
      }>(
        `SELECT
           has_table_privilege(current_user, $1, 'SELECT') AS can_select,
           has_table_privilege(current_user, $1, 'INSERT') AS can_insert,
           has_table_privilege(current_user, $1, 'UPDATE') AS can_update,
           has_table_privilege(current_user, $1, 'DELETE') AS can_delete,
           has_table_privilege(current_user, $1, 'TRUNCATE') AS can_truncate`,
        [qualifiedName],
      ),
      client.query<{ approximate_rows: string }>(
        `SELECT COALESCE(c.reltuples, 0)::bigint::text AS approximate_rows
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2`,
        [configuration.schemaName, configuration.tableName],
      ),
    ]);
    if (columns.rows.length === 0) {
      throw new ConnectorFailure(
        'DATABASE_OBJECT_NOT_FOUND',
        'The configured PostgreSQL table does not exist or is not visible to this role.',
      );
    }
    const available = new Set(columns.rows.map((column) => column.column_name));
    if (configuration.columns.some((column) => !available.has(column))) {
      throw new ConnectorFailure(
        'DATABASE_COLUMN_NOT_FOUND',
        'One or more configured PostgreSQL columns do not exist.',
      );
    }
    const privilege = privileges.rows[0];
    if (!privilege?.can_select) {
      throw new ConnectorFailure(
        'DATABASE_PERMISSION_DENIED',
        'The database role lacks SELECT permission on the configured table.',
      );
    }
    return {
      selectedColumns: configuration.columns,
      approximateRows: estimate.rows[0]?.approximate_rows ?? null,
      sourceRoleHasWritePrivileges: Boolean(
        privilege.can_insert ||
          privilege.can_update ||
          privilege.can_delete ||
          privilege.can_truncate,
      ),
    };
  }

  private async sampleRows(client: Client, configuration: PostgreSqlConnectorConfiguration) {
    const columns = configuration.columns.map((column) => this.quoteIdentifier(column)).join(', ');
    const table = `${this.quoteIdentifier(configuration.schemaName)}.${this.quoteIdentifier(
      configuration.tableName,
    )}`;
    const result = await client.query(`SELECT ${columns} FROM ${table} LIMIT $1`, [
      configuration.sampleRecordLimit,
    ]);
    if (result.rows.length === 0) {
      throw new ConnectorFailure(
        'DATABASE_TABLE_EMPTY',
        'The configured PostgreSQL table has no rows to profile.',
      );
    }
    return result.rows;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  private normalizeJson(value: unknown, depth = 0): unknown {
    if (depth > 32) {
      throw new ConnectorFailure(
        'DATABASE_VALUE_DEPTH_EXCEEDED',
        'A selected database value exceeds the supported nesting depth.',
      );
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new ConnectorFailure(
          'DATABASE_VALUE_UNSUPPORTED',
          'A selected database number is not finite.',
        );
      }
      return value;
    }
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (Array.isArray(value)) return value.map((child) => this.normalizeJson(child, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, this.normalizeJson(child, depth + 1)]),
      );
    }
    throw new ConnectorFailure(
      'DATABASE_VALUE_UNSUPPORTED',
      'A selected database value cannot be represented as JSON.',
    );
  }
}
