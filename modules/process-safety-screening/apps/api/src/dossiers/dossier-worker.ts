import { createHash, randomUUID } from 'node:crypto';
import type { SpeedDossierFormat } from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import type { DossierModelV1 } from '@gigalibs/process-safety-screening-domain';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import type { Client } from '../access.js';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { DOSSIER_CONTENT_TYPES } from './dossiers.service.js';
import { renderDocx, renderPdf } from './render.js';
import { SpeedStorage } from './storage.js';

// WI-OI-120ca (SPEED S7): the module's dossier worker, on the platform's relay pattern. The only cross-tenant read is
// the definer function listing tenants with queued dossiers; each dossier is claimed inside its tenant's transaction
// with FOR UPDATE SKIP LOCKED, so several module hosts never render the same dossier. A dossier whose worker stopped
// is claimed again after its lease; after the last attempt it fails, and a new request makes a new dossier.

const SYSTEM_ACTOR = 'system:speed-dossier-worker';
const DEFAULT_INTERVAL_MS = 5_000;
const MIN_INTERVAL_MS = 1_000;
const TENANTS_PER_PASS = 10;
const DOSSIERS_PER_TENANT = 5;
export const DOSSIER_MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 300;

export const DOSSIER_WORKER_CONFIG = Symbol('DOSSIER_WORKER_CONFIG');

export interface DossierWorkerConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

/** `SPEED_DOSSIER_WORKER_DISABLED` turns it off; `SPEED_DOSSIER_WORKER_INTERVAL_MS` sets the pass interval. */
export function loadDossierWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DossierWorkerConfig {
  const disabled = (environment.SPEED_DOSSIER_WORKER_DISABLED ?? '').trim().toLowerCase();
  const raw = environment.SPEED_DOSSIER_WORKER_INTERVAL_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MS;
  return {
    enabled: !['1', 'true', 'yes'].includes(disabled),
    intervalMs: Number.isFinite(parsed) && parsed >= MIN_INTERVAL_MS ? parsed : DEFAULT_INTERVAL_MS,
  };
}

interface ClaimedDossier {
  readonly id: string;
  readonly routeId: string;
  readonly routeVersion: number;
  readonly attempts: number;
  readonly model: DossierModelV1;
}

interface StoredFile {
  readonly key: string;
  readonly sha256: string;
  readonly bytes: number;
}

function workerContext(tenantId: string): ModuleCommandContext {
  return {
    principal: {
      tenantId,
      subject: SYSTEM_ACTOR,
      permissions: [],
      roles: [],
    } as unknown as ModulePrincipal,
    correlationId: randomUUID(),
  };
}

@Injectable()
export class DossierWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DossierWorker.name);
  private readonly config: DossierWorkerConfig;
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: SpeedStorage,
    @Optional() @Inject(DOSSIER_WORKER_CONFIG) config?: DossierWorkerConfig,
  ) {
    this.config = config ?? loadDossierWorkerConfig();
  }

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.log('The SPEED dossier worker is disabled.');
      return;
    }
    if (!this.storage.available) {
      this.logger.log(
        'The SPEED dossier worker is idle: the object store is not configured (SPEED_STORAGE_*).',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** One pass; returns how many dossiers finished (generated or failed). */
  async tick(): Promise<number> {
    if (this.running || this.stopping || !this.storage.available) return 0;
    this.running = true;
    let finished = 0;
    try {
      const tenants = await this.database.relayCall<{ tenant_id: string }>('list_dossier_tenants', [
        TENANTS_PER_PASS,
      ]);
      for (const { tenant_id: tenantId } of tenants) {
        for (let index = 0; index < DOSSIERS_PER_TENANT && !this.stopping; index += 1) {
          const claimed = await this.claim(tenantId);
          if (!claimed) break;
          await this.generate(tenantId, claimed);
          finished += 1;
        }
      }
    } catch (error) {
      this.logger.error(
        'The dossier worker pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return finished;
  }

  /**
   * The tenant's oldest queued dossier (or one whose worker stopped), marked running; a dossier whose attempts are
   * used up fails instead. Null when the tenant has nothing left to claim.
   */
  private async claim(tenantId: string): Promise<ClaimedDossier | null> {
    const context = workerContext(tenantId);
    for (;;) {
      const outcome = await this.database.withTenantTransaction(tenantId, async (client) => {
        const row = await client.query<{
          id: string;
          route_id: string;
          route_version: number;
          attempts: number;
          model: DossierModelV1;
        }>(
          `SELECT id, route_id, route_version, attempts, model FROM ${SCHEMA}.dossiers
            WHERE tenant_id = $1
              AND (status = 'QUEUED' OR (status = 'RUNNING' AND started_at < now() - make_interval(secs => $2)))
            ORDER BY requested_at, id
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
          [tenantId, LEASE_SECONDS],
        );
        const found = row.rows[0];
        if (!found) return null;
        if (found.attempts >= DOSSIER_MAX_ATTEMPTS) {
          await this.fail(client, context, found.id, found.route_id, 'SPEED_DOSSIER_RENDER_FAILED');
          return 'retry' as const;
        }
        const started = await client.query<{ version: number }>(
          `UPDATE ${SCHEMA}.dossiers SET status = 'RUNNING', attempts = attempts + 1, started_at = now(), version = version + 1
            WHERE tenant_id = $1 AND id = $2
            RETURNING version`,
          [tenantId, found.id],
        );
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'DOSSIER_STARTED',
          aggregateType: 'dossier',
          aggregateId: found.id,
          aggregateVersion: Number(started.rows[0]?.version),
          payload: { routeId: found.route_id, attempt: Number(found.attempts) + 1 },
        });
        return {
          id: found.id,
          routeId: found.route_id,
          routeVersion: Number(found.route_version),
          attempts: Number(found.attempts) + 1,
          model: found.model,
        };
      });
      if (outcome !== 'retry') return outcome;
    }
  }

  /** Renders both files from the stored model, uploads them and records their hashes; a failure retries or fails. */
  private async generate(tenantId: string, dossier: ClaimedDossier): Promise<void> {
    const context = workerContext(tenantId);
    try {
      const files: Record<SpeedDossierFormat, StoredFile> = {
        docx: await this.store(tenantId, dossier, 'docx', await renderDocx(dossier.model)),
        pdf: await this.store(tenantId, dossier, 'pdf', await renderPdf(dossier.model)),
      };
      await this.database.withTenantTransaction(tenantId, async (client) => {
        const stored = await client.query<{ version: number }>(
          `UPDATE ${SCHEMA}.dossiers
              SET status = 'DONE', docx_key = $3, docx_sha256 = $4, docx_bytes = $5, pdf_key = $6, pdf_sha256 = $7,
                  pdf_bytes = $8, completed_at = now(), version = version + 1
            WHERE tenant_id = $1 AND id = $2 AND status = 'RUNNING' AND attempts = $9
            RETURNING version`,
          [
            tenantId,
            dossier.id,
            files.docx.key,
            files.docx.sha256,
            files.docx.bytes,
            files.pdf.key,
            files.pdf.sha256,
            files.pdf.bytes,
            dossier.attempts,
          ],
        );
        // Only the worker holding the current attempt records it: one whose lease ran out lost the dossier to another.
        if (!stored.rows[0]) return;
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'DOSSIER_GENERATED',
          aggregateType: 'dossier',
          aggregateId: dossier.id,
          aggregateVersion: Number(stored.rows[0].version),
          payload: {
            routeId: dossier.routeId,
            routeVersion: dossier.routeVersion,
            watermarked: dossier.model.watermark !== null,
            docx: { sha256: files.docx.sha256, bytes: files.docx.bytes },
            pdf: { sha256: files.pdf.sha256, bytes: files.pdf.bytes },
          },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Dossier ${dossier.id} attempt ${dossier.attempts} failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
      );
      await this.database.withTenantTransaction(tenantId, async (client) => {
        if (dossier.attempts >= DOSSIER_MAX_ATTEMPTS) {
          await this.fail(
            client,
            context,
            dossier.id,
            dossier.routeId,
            'SPEED_DOSSIER_RENDER_FAILED',
            dossier.attempts,
          );
          return;
        }
        const requeued = await client.query<{ version: number }>(
          `UPDATE ${SCHEMA}.dossiers SET status = 'QUEUED', started_at = NULL, version = version + 1
            WHERE tenant_id = $1 AND id = $2 AND status = 'RUNNING' AND attempts = $3
            RETURNING version`,
          [tenantId, dossier.id, dossier.attempts],
        );
        if (!requeued.rows[0]) return;
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'DOSSIER_RETRY_QUEUED',
          aggregateType: 'dossier',
          aggregateId: dossier.id,
          aggregateVersion: Number(requeued.rows[0].version),
          payload: { routeId: dossier.routeId, attempt: dossier.attempts },
        });
      });
    }
  }

  /** Each attempt writes its own objects, so a worker that lost its lease never overwrites the files another recorded. */
  private async store(
    tenantId: string,
    dossier: ClaimedDossier,
    format: SpeedDossierFormat,
    bytes: Buffer,
  ): Promise<StoredFile> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `speed/dossiers/${tenantId}/${dossier.id}/attempt-${dossier.attempts}/dossier.${format}`;
    await this.storage.put(key, bytes, DOSSIER_CONTENT_TYPES[format], sha256);
    return { key, sha256, bytes: bytes.byteLength };
  }

  /** Fails the dossier; with `attempt`, only while that attempt still holds it. */
  private async fail(
    client: Client,
    context: ModuleCommandContext,
    id: string,
    routeId: string,
    code: string,
    attempt: number | null = null,
  ): Promise<void> {
    const failed = await client.query<{ version: number }>(
      `UPDATE ${SCHEMA}.dossiers SET status = 'FAILED', error_code = $3, completed_at = now(), version = version + 1
        WHERE tenant_id = $1 AND id = $2 AND status IN ('QUEUED', 'RUNNING') AND ($4::integer IS NULL OR attempts = $4)
        RETURNING version`,
      [context.principal.tenantId, id, code, attempt],
    );
    if (!failed.rows[0]) return;
    await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
      action: 'DOSSIER_FAILED',
      aggregateType: 'dossier',
      aggregateId: id,
      aggregateVersion: Number(failed.rows[0].version),
      payload: { routeId, errorCode: code },
    });
  }
}
