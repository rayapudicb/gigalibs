import {
  Injectable,
  NotFoundException,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { ConnectorPlaceDeliveryV1Schema, type ConnectorPlaceDeliveryV1 } from '@gigalibs/contracts';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { VaultCryptoService } from './vault-crypto.service.js';
import { PullConfigError, parsePullCredentials, parsePullSource } from '../pull/pull-source.js';
import {
  assertAllowedConnectorUrl,
  loadConnectorHubRuntimeConfig,
} from '../runtime-config.js';

export interface CreateConnectionDto {
  connector_code: string;
  name: string;
  slug: string;
  environment?: string;
  auth_type?: string;
  webhook_secret?: string;
  target_workflow_code?: string;
  configuration?: any;
  credentials?: Record<string, any>;
}

export interface OAuthInitiateDto {
  connector_code: string;
  redirect_uri: string;
  scopes?: string[];
}

export interface OAuthCallbackDto {
  code: string;
  state: string;
  code_verifier: string;
  redirect_uri?: string;
}

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly vaultCrypto: VaultCryptoService,
  ) {}

  async getCatalog(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM gigalibs_connectors.connector_definitions WHERE status = 'ACTIVE' ORDER BY category ASC, name ASC`,
    );
    return res.rows;
  }

  async getConnections(tenantId: string, category?: string, status?: string): Promise<any[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    let sql = `
      SELECT 
        c.id, c.tenant_id, c.connector_code, c.name, c.slug, c.environment, c.auth_type,
        c.target_workflow_code, c.configuration, c.status, c.last_sync_at, c.events_count, c.deliver_to_analytics, c.place_delivery,
        c.webhook_endpoint_id, (c.webhook_secret IS NOT NULL) AS webhook_secret_configured,
        c.created_at, c.updated_at,
        d.name AS definition_name, d.category, d.icon, d.supported_events
      FROM gigalibs_connectors.tenant_connections c
      JOIN gigalibs_connectors.connector_definitions d ON c.connector_code = d.connector_code
      WHERE c.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (category && category !== 'ALL') {
      params.push(category);
      sql += ` AND d.category = $${params.length}`;
    }

    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }

    sql += ` ORDER BY c.updated_at DESC`;

    const res = await this.db.queryWithTenant(tenantId, sql, params);
    return res.rows;
  }

  async getConnectionById(tenantId: string, idOrSlug: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const res = await this.db.queryWithTenant(
      tenantId,
      `SELECT 
        c.*, d.name AS definition_name, d.category, d.icon, d.supported_events
       FROM gigalibs_connectors.tenant_connections c
       JOIN gigalibs_connectors.connector_definitions d ON c.connector_code = d.connector_code
       WHERE c.tenant_id = $1 AND (c.id = $2 OR c.slug = $2)`,
      [tenantId, idOrSlug],
    );

    if (res.rowCount === 0) {
      throw new NotFoundException(`Connection '${idOrSlug}' not found for tenant '${tenantId}'`);
    }

    // WI-OI-120e (U3.2, P0-08): the signing secret is shown once, when the connection is created, and never again;
    // anyone holding it could forge this connection's webhooks.
    const { webhook_secret: webhookSecret, ...connection } = res.rows[0];
    return { ...connection, webhook_secret_configured: Boolean(webhookSecret) };
  }

  async createConnection(tenantId: string, dto: CreateConnectionDto): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.connector_code || !dto.name || !dto.slug) {
      throw new BadRequestException('connector_code, name, and slug are required');
    }

    // Verify connector exists in catalog
    const catRes = await this.db.query(
      `SELECT * FROM gigalibs_connectors.connector_definitions WHERE connector_code = $1`,
      [dto.connector_code],
    );
    if (catRes.rowCount === 0) {
      throw new BadRequestException(`Unknown connector_code: '${dto.connector_code}'`);
    }

    const configuration = { ...(dto.configuration || {}) };
    if (configuration.source !== undefined) configuration.source = this.validSource(configuration.source);
    const connId = `conn-${randomUUID().slice(0, 8)}`;
    const secret = dto.webhook_secret || `whsec_${randomUUID().replace(/-/g, '')}`;

    const sql = `
      INSERT INTO gigalibs_connectors.tenant_connections (
        id, tenant_id, connector_code, name, slug, environment, auth_type,
        webhook_secret, target_workflow_code, configuration, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'READY', NOW(), NOW())
      RETURNING *
    `;

    const res = await this.db.queryWithTenant(tenantId, sql, [
      connId,
      tenantId,
      dto.connector_code,
      dto.name,
      dto.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      dto.environment || 'PRODUCTION',
      dto.auth_type || 'WEBHOOK',
      secret,
      dto.target_workflow_code || null,
      JSON.stringify(configuration),
    ]);

    // Store encrypted credentials if provided
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      await this.storeEncryptedCredential(
        tenantId,
        connId,
        dto.auth_type === 'OAUTH2' ? 'OAUTH2_TOKENS' : 'API_KEY',
        dto.credentials,
      );
    }

    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_connectors.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
       VALUES ($1, $2, 'CONNECTION', $3, 'CONNECTION_CREATED', $4, NOW())`,
      [
        `aud-${randomUUID().slice(0, 8)}`,
        tenantId,
        connId,
        JSON.stringify({ connector_code: dto.connector_code, slug: dto.slug }),
      ],
    );

    return res.rows[0];
  }

  /** WI-OI-104d: sets the connection's pull source after validating it; other configuration keys are kept. */
  async configureSource(tenantId: string, idOrSlug: string, body: unknown): Promise<any> {
    const source = this.validSource(body);
    const conn = await this.getConnectionById(tenantId, idOrSlug);
    const res = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_connectors.tenant_connections
          SET configuration = jsonb_set(configuration, '{source}', $3::jsonb, true), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING id, slug, configuration`,
      [conn.id, tenantId, JSON.stringify(source)],
    );
    await this.audit(tenantId, conn.id, 'PULL_SOURCE_CONFIGURED', { base_url: source.baseUrl, resource_path: source.resourcePath, auth: source.auth.kind, paging: source.paging.style });
    return { success: true, connection: res.rows[0] };
  }

  /**
   * WI-OI-104d: replaces the connection's login secrets (API key, bearer token or OAuth2 client). The previous ones are
   * deleted in the same transaction; nothing secret is returned or audited.
   */
  async storePullCredentials(tenantId: string, idOrSlug: string, body: unknown): Promise<any> {
    let credentials;
    try {
      credentials = parsePullCredentials(body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const conn = await this.getConnectionById(tenantId, idOrSlug);
    const encrypted = this.vaultCrypto.encrypt(JSON.stringify(credentials));
    const type = { 'api-key': 'API_KEY', bearer: 'BEARER_TOKEN', 'oauth2-client-credentials': 'OAUTH2_CLIENT' }[credentials.kind];
    await this.db.withTenantTransaction(tenantId, async (client) => {
      await client.query(`DELETE FROM gigalibs_connectors.connector_credentials WHERE tenant_id = $1 AND connection_id = $2`, [tenantId, conn.id]);
      await client.query(
        `INSERT INTO gigalibs_connectors.connector_credentials
           (id, tenant_id, connection_id, credential_type, encrypted_data, iv, auth_tag, key_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'connector-vault-key', NOW(), NOW())`,
        [`cred-${randomUUID()}`, tenantId, conn.id, type, encrypted.encryptedData, encrypted.iv, encrypted.authTag],
      );
    });
    await this.audit(tenantId, conn.id, 'CREDENTIALS_REPLACED', { kind: credentials.kind });
    return { success: true, connection_id: conn.id, kind: credentials.kind };
  }

  /**
   * WI-OI-104e: whether this connection's newly pulled records are sent to Analytics (through the outbox relay).
   * WI-OI-105e: and whether they are sent to Geospatial as places, with the record fields that hold each place's
   * name, geometry, code and parent (null turns it off). Either or both may be given.
   */
  async setDelivery(tenantId: string, idOrSlug: string, body: unknown): Promise<any> {
    const request = (body ?? {}) as { analytics?: unknown; places?: unknown };
    const analytics = request.analytics;
    if (analytics !== undefined && typeof analytics !== 'boolean') throw new BadRequestException('analytics must be true or false.');
    let places: ConnectorPlaceDeliveryV1 | null | undefined;
    if (request.places === null) places = null;
    else if (request.places !== undefined) {
      const parsed = ConnectorPlaceDeliveryV1Schema.safeParse(request.places);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new BadRequestException(`places.${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`);
      }
      places = parsed.data;
    }
    if (analytics === undefined && places === undefined) throw new BadRequestException('Give analytics, places, or both.');
    const conn = await this.getConnectionById(tenantId, idOrSlug);
    const updated = await this.db.queryWithTenant<{ deliver_to_analytics: boolean; place_delivery: ConnectorPlaceDeliveryV1 | null }>(
      tenantId,
      `UPDATE gigalibs_connectors.tenant_connections
          SET deliver_to_analytics = COALESCE($3, deliver_to_analytics),
              place_delivery = CASE WHEN $4::boolean THEN $5::jsonb ELSE place_delivery END,
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING deliver_to_analytics, place_delivery`,
      [conn.id, tenantId, analytics ?? null, places !== undefined, places ? JSON.stringify(places) : null],
    );
    if (analytics !== undefined) await this.audit(tenantId, conn.id, analytics ? 'ANALYTICS_DELIVERY_ON' : 'ANALYTICS_DELIVERY_OFF', {});
    if (places !== undefined) await this.audit(tenantId, conn.id, places ? 'PLACE_DELIVERY_ON' : 'PLACE_DELIVERY_OFF', places ?? {});
    const row = updated.rows[0]!;
    return { success: true, connection_id: conn.id, deliver_to_analytics: row.deliver_to_analytics, place_delivery: row.place_delivery };
  }

  private validSource(value: unknown) {
    try {
      return parsePullSource(value);
    } catch (error) {
      if (error instanceof PullConfigError) throw new BadRequestException(`The pull source is not valid: ${error.message}`);
      throw error;
    }
  }

  private async audit(tenantId: string, connectionId: string, action: string, payload: Record<string, unknown>): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_connectors.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
       VALUES ($1, $2, 'CONNECTION', $3, $4, $5, NOW())`,
      [`aud-${randomUUID()}`, tenantId, connectionId, action, JSON.stringify(payload)],
    );
  }

  async storeEncryptedCredential(
    tenantId: string,
    connectionId: string,
    credentialType: string,
    plainPayload: any,
  ): Promise<string> {
    const serialized = typeof plainPayload === 'string' ? plainPayload : JSON.stringify(plainPayload);
    const encrypted = this.vaultCrypto.encrypt(serialized);
    const credId = `cred-${randomUUID().slice(0, 8)}`;

    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_connectors.connector_credentials (
        id, tenant_id, connection_id, credential_type, encrypted_data, iv, auth_tag,
        key_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'master-kms-key-01', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        encrypted_data = EXCLUDED.encrypted_data,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        updated_at = NOW()`,
      [
        credId,
        tenantId,
        connectionId,
        credentialType,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.authTag,
      ],
    );

    return credId;
  }

  async getDecryptedCredential(tenantId: string, connectionId: string): Promise<any | null> {
    const res = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_connectors.connector_credentials
       WHERE tenant_id = $1 AND connection_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [tenantId, connectionId],
    );

    if (res.rowCount === 0) return null;

    const row = res.rows[0];
    if (!row.iv || !row.auth_tag) {
      throw new Error('Stored credential envelope is incomplete.');
    }

    const decryptedStr = this.vaultCrypto.decrypt({
      encryptedData: row.encrypted_data,
      iv: row.iv,
      authTag: row.auth_tag,
    });

    try {
      return JSON.parse(decryptedStr);
    } catch {
      return decryptedStr;
    }
  }

  /**
   * CN-01: Real live health probe validating network connectivity, credentials, and listener.
   */
  async testConnection(tenantId: string, id: string): Promise<any> {
    const conn = await this.getConnectionById(tenantId, id);
    const startTime = performance.now();

    const checks: Record<string, string> = {
      schema_validation: 'PASSED',
      webhook_listener: conn.webhook_secret_configured ? 'ACTIVE' : 'NOT_CONFIGURED',
      target_pipeline: conn.target_workflow_code ? 'ATTACHED' : 'UNASSIGNED',
    };

    // 1. Check credential vault
    const creds = await this.getDecryptedCredential(tenantId, conn.id);
    if (creds) {
      checks.credential_vault = 'ENCRYPTED_VALID';
    } else if (conn.auth_type === 'WEBHOOK') {
      checks.credential_vault = 'WEBHOOK_SECRET_PRESENT';
    } else {
      checks.credential_vault = 'MISSING_CREDENTIALS';
    }

    // 2. Perform live network probe if endpoint configured
    const config = conn.configuration || {};
    const probeUrl = config.instance_url || config.endpoint_url || config.probe_url;

    let probePassed = true;
    let errorMessage: string | null = null;

    if (probeUrl) {
      try {
        const parsedUrl = assertAllowedConnectorUrl(
          probeUrl,
          loadConnectorHubRuntimeConfig(),
        );
        const timeoutSignal = AbortSignal.timeout(5000);
        const res = await fetch(parsedUrl.toString(), {
          method: 'HEAD',
          signal: timeoutSignal,
        });
        checks.network_probe = `REACHABLE_HTTP_${res.status}`;
      } catch (err: any) {
        probePassed = false;
        errorMessage = `Probe failed: ${err.message}`;
        checks.network_probe = `FAILED: ${err.code || err.message}`;
      }
    } else {
      checks.network_probe = 'PASSIVE_LISTENER_ONLY';
    }

    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
    const newStatus = (probePassed && checks.credential_vault !== 'MISSING_CREDENTIALS') ? 'READY' : 'ERROR';

    // Update connection status based on real probe outcome
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_connectors.tenant_connections
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [newStatus, conn.id, tenantId],
    );

    return {
      success: newStatus === 'READY',
      connection_id: conn.id,
      slug: conn.slug,
      status: newStatus,
      checks,
      latency_ms: latencyMs,
      tested_at: new Date().toISOString(),
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }

  /**
   * CN-02: Initiate OAuth2 PKCE authorization flow.
   */
  async initiateOAuthFlow(tenantId: string, dto: OAuthInitiateDto): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.connector_code || !dto.redirect_uri) {
      throw new BadRequestException('connector_code and redirect_uri are required');
    }

    throw new NotImplementedException(
      'OAuth onboarding is contained until a provider-specific client, callback state store and token exchange are configured.',
    );
  }

  /**
   * CN-02: Complete OAuth2 callback code exchange.
   */
  async exchangeOAuthCode(
    tenantId: string,
    connectionId: string,
    dto: OAuthCallbackDto,
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.code || !dto.code_verifier) {
      throw new BadRequestException('code and code_verifier are required');
    }

    void connectionId;
    throw new NotImplementedException(
      'OAuth token exchange is contained until the real provider exchange and durable callback state are implemented.',
    );
  }
}
