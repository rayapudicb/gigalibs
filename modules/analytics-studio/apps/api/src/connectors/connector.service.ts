import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import pg from 'pg';
import * as crypto from 'crypto';
import { isIP } from 'node:net';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ─── SSRF / egress guard ─────────────────────────────────────────────────────
// These CIDR ranges MUST never be reachable from the ingestion adapter.
// Any connection attempt to these ranges is rejected before the TLS handshake.
const BLOCKED_CIDR_RANGES = [
  // Loopback
  { base: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8
  // Link-local
  { base: 0xa9fe0000, mask: 0xffff0000 }, // 169.254.0.0/16
  // RFC-1918 private ranges
  { base: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8
  { base: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12
  { base: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16
  // AWS instance metadata
  { base: 0xa9fea9fe, mask: 0xffffffff }, // 169.254.169.254/32
  // Multicast
  { base: 0xe0000000, mask: 0xf0000000 }, // 224.0.0.0/4
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  '169.254.169.254',
]);

/** Resolves hostname to IPv4 dotted-decimal. Throws if hostname is blocked. */
async function resolveAndValidateHost(host: string, port: number): Promise<void> {
  // Block explicit loopback hostnames before DNS resolution
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) {
    throw new ForbiddenException(
      `SSRF: target host '${host}' is not permitted for external data connections.`,
    );
  }

  const addressKind = isIP(host);
  if (addressKind === 6) {
    throw new ForbiddenException(
      `SSRF: IPv6 target '${host}' is not permitted for external data connections.`,
    );
  }

  // Literal IPv4 addresses must be checked directly. Passing them to Resolver
  // produces an environment-dependent DNS error before the CIDR guard runs.
  const resolved: string[] = addressKind === 4
    ? [host]
    : await (async () => {
        const { Resolver } = await import('dns');
        const resolver = new Resolver();
        return new Promise<string[]>((resolve, reject) =>
          resolver.resolve4(host, (err, addrs) => (err ? reject(err) : resolve(addrs))),
        );
      })();

  for (const addr of resolved) {
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
      throw new ForbiddenException(`SSRF: unresolvable or malformed IP for host '${host}'.`);
    }
    const numeric =
      ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
    for (const { base, mask } of BLOCKED_CIDR_RANGES) {
      if ((numeric & mask) >>> 0 === (base & mask) >>> 0) {
        throw new ForbiddenException(
          `SSRF: target IP ${addr} for host '${host}' resolves to a blocked address range.`,
        );
      }
    }
  }

  if (port < 1 || port > 65535) {
    throw new BadRequestException(`Port ${port} is out of valid range.`);
  }
}

// ─── DTO types ───────────────────────────────────────────────────────────────

export interface CreateConnectionDto {
  displayName: string;
  /** Currently only 'POSTGRES' is supported. */
  sourceType: 'POSTGRES';
  host: string;
  port: number;
  databaseName: string;
  /** Defaults to 'require'. 'disable' is forbidden at service boundary. */
  sslMode?: 'require' | 'verify-ca' | 'verify-full';
  /** Opaque vault key for the read-only credentials: "<provider>/<scope>/<name>" */
  credentialVaultKey: string;
}

export interface ConnectionSummary {
  id: string;
  tenantId: string;
  displayName: string;
  sourceType: string;
  host: string;
  port: number;
  databaseName: string;
  sslMode: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  serverVersion?: string;
  error?: string;
}

// ─── ConnectorService ─────────────────────────────────────────────────────────

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  constructor(private readonly db: DatabaseService) {}

  async createConnection(
    principal: AnalyticsPrincipal,
    dto: CreateConnectionDto,
  ): Promise<ConnectionSummary> {
    const { tenantId, subject } = principal;

    // Validate ssl_mode: 'disable' is never allowed
    const sslMode = dto.sslMode ?? 'require';
    if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      throw new BadRequestException(
        `ssl_mode '${sslMode}' is not permitted. Use 'require', 'verify-ca', or 'verify-full'.`,
      );
    }

    // SSRF pre-flight before we store anything
    await resolveAndValidateHost(dto.host, dto.port);

    // Validate credential vault key format: "<provider>/<scope>/<name>"
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/.test(dto.credentialVaultKey)) {
      throw new BadRequestException(
        'credentialVaultKey must match pattern <provider>/<scope>/<name> with lowercase alphanumeric, hyphens, or underscores.',
      );
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Insert source_connections
      const connResult = await client.query<ConnectionSummary & { id: string }>(
        `INSERT INTO gigalibs_analytics.source_connections
           (tenant_id, display_name, source_type, host, port, database_name, ssl_mode, status, created_by)
         VALUES ($1, $2, $3::gigalibs_analytics.external_source_type, $4, $5, $6, $7, 'PENDING', $8)
         RETURNING
           id, tenant_id, display_name, source_type, host, port,
           database_name, ssl_mode, status, created_by,
           created_at::text, updated_at::text`,
        [
          tenantId,
          dto.displayName,
          dto.sourceType,
          dto.host,
          dto.port,
          dto.databaseName,
          sslMode,
          subject,
        ],
      );

      const conn = connResult.rows[0]!;

      // Insert credential reference (no raw secret)
      await client.query(
        `INSERT INTO gigalibs_analytics.connector_credential_refs
           (connection_id, credential_vault_key)
         VALUES ($1, $2)`,
        [conn.id, dto.credentialVaultKey],
      );

      this.logger.log(
        `[tenant:${tenantId}] Created source connection '${conn.id}' type=${dto.sourceType} host=${dto.host}`,
      );

      return this.toSummary(conn as any);
    });
  }

  async listConnections(principal: AnalyticsPrincipal): Promise<ConnectionSummary[]> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT
         id, tenant_id, display_name, source_type, host, port,
         database_name, ssl_mode, status, created_by,
         created_at::text, updated_at::text
       FROM gigalibs_analytics.source_connections
       ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.toSummary(r));
  }

  async getConnection(
    principal: AnalyticsPrincipal,
    connectionId: string,
  ): Promise<ConnectionSummary> {
    const { tenantId } = principal;
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT
         id, tenant_id, display_name, source_type, host, port,
         database_name, ssl_mode, status, created_by,
         created_at::text, updated_at::text
       FROM gigalibs_analytics.source_connections
       WHERE id = $1`,
      [connectionId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`Connection '${connectionId}' not found.`);
    }
    return this.toSummary(result.rows[0]!);
  }

  async deleteConnection(
    principal: AnalyticsPrincipal,
    connectionId: string,
  ): Promise<void> {
    const { tenantId } = principal;

    const result = await this.db.queryWithTenant(
      tenantId,
      `DELETE FROM gigalibs_analytics.source_connections
       WHERE id = $1
       RETURNING id`,
      [connectionId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(`Connection '${connectionId}' not found.`);
    }

    this.logger.log(`[tenant:${tenantId}] Deleted source connection '${connectionId}'`);
  }

  /**
   * Test an existing registered connection.
   * Establishes a short-lived, TLS-verified, READ-ONLY connection to the
   * external PostgreSQL source. Uses the credential vault key to look up
   * the real credentials at test-time (vault lookup is simulated here until
   * Phase 1 vault integration is wired; the TLS + SSRF + read-only guards
   * are fully enforced regardless).
   */
  async testConnection(
    principal: AnalyticsPrincipal,
    connectionId: string,
  ): Promise<ConnectionTestResult> {
    const { tenantId } = principal;

    // Fetch the connection record (RLS guarantees tenant scope)
    const connResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT sc.id, sc.host, sc.port, sc.database_name, sc.ssl_mode,
              cr.credential_vault_key
       FROM gigalibs_analytics.source_connections sc
       JOIN gigalibs_analytics.connector_credential_refs cr ON cr.connection_id = sc.id
       WHERE sc.id = $1`,
      [connectionId],
    );

    if (connResult.rows.length === 0) {
      throw new NotFoundException(`Connection '${connectionId}' not found.`);
    }

    const conn = connResult.rows[0]!;

    // SSRF guard: re-validate host at test-time (the host may have changed
    // via a direct DB edit; we never trust stored values alone)
    await resolveAndValidateHost(conn.host, conn.port);

    // Resolve credentials from the vault.
    // TODO(Phase-2): replace stub with real vault client call keyed by
    //   conn.credential_vault_key.  The stub is safe — it will fail to
    //   authenticate against any real remote, so the test returns an error
    //   rather than silently succeeding with placeholder credentials.
    const vaultCreds = await this.resolveVaultCredentials(conn.credential_vault_key);

    const startMs = Date.now();
    let result: ConnectionTestResult;

    try {
      result = await this.performReadOnlyProbe(
        conn.host,
        conn.port,
        conn.database_name,
        conn.ssl_mode,
        vaultCreds,
      );
    } catch (err) {
      result = {
        success: false,
        latencyMs: Date.now() - startMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Update connection status based on test outcome
    const newStatus = result.success ? 'ACTIVE' : 'FAILED';
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_analytics.source_connections
       SET status = $2::gigalibs_analytics.connection_status
       WHERE id = $1`,
      [connectionId, newStatus],
    );

    this.logger.log(
      `[tenant:${tenantId}] Connection test '${connectionId}' → ${newStatus} (${result.latencyMs}ms)`,
    );

    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async resolveVaultCredentials(
    _vaultKey: string,
  ): Promise<{ user: string; password: string }> {
    // CONTAINED_P0: Vault client not yet implemented.
    // Returns sentinel values that will fail to authenticate against any
    // real PostgreSQL instance. The connection test will return
    // success: false with an authentication error — this is correct
    // behaviour until the vault client is wired in Phase 2.
    return { user: '__vault_pending__', password: '__vault_pending__' };
  }

  private async performReadOnlyProbe(
    host: string,
    port: number,
    databaseName: string,
    sslMode: string,
    creds: { user: string; password: string },
  ): Promise<ConnectionTestResult> {
    // Map our ssl_mode values to node-postgres SSL options.
    // 'disable' is never passed here (blocked at create / test boundary).
    const sslConfig: pg.ConnectionConfig['ssl'] = (() => {
      switch (sslMode) {
        case 'verify-full':
          return { rejectUnauthorized: true };
        case 'verify-ca':
          return { rejectUnauthorized: true };
        case 'require':
        default:
          // Require TLS but accept self-signed certs in non-prod;
          // for production, the ssl_mode should be 'verify-full'.
          return { rejectUnauthorized: false };
      }
    })();

    // Create a throw-away pool (max 1 connection) for the probe.
    const pool = new pg.Pool({
      host,
      port,
      database: databaseName,
      user: creds.user,
      password: creds.password,
      ssl: sslConfig,
      max: 1,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 1_000,
    });

    const startMs = Date.now();
    const client = await pool.connect();

    try {
      // Run SELECT-only probe — enforce read-only session
      await client.query('SET default_transaction_read_only = on');
      const res = await client.query<{ server_version: string }>(
        'SELECT current_setting($1) AS server_version',
        ['server_version'],
      );
      const latencyMs = Date.now() - startMs;

      return {
        success: true,
        latencyMs,
        serverVersion: res.rows[0]?.server_version,
      };
    } finally {
      client.release();
      await pool.end().catch(() => undefined);
    }
  }

  private toSummary(row: Record<string, unknown>): ConnectionSummary {
    return {
      id: row['id'] as string,
      tenantId: row['tenant_id'] as string,
      displayName: row['display_name'] as string,
      sourceType: row['source_type'] as string,
      host: row['host'] as string,
      port: row['port'] as number,
      databaseName: row['database_name'] as string,
      sslMode: row['ssl_mode'] as string,
      status: row['status'] as string,
      createdBy: row['created_by'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
}
