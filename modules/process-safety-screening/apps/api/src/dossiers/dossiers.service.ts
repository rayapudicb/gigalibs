import { createHash, randomUUID } from 'node:crypto';
import type {
  RequestSpeedDossierInputV1,
  SpeedDossierFileV1,
  SpeedDossierFormat,
  SpeedDossierStatus,
  SpeedDossierV1,
  SpeedRouteDetailV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import {
  type DossierModelV1,
  dossierModel,
  routeCsv,
  speedText,
} from '@gigalibs/process-safety-screening-domain';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { type Client, readableSite, resolveAccess } from '../access.js';
import { recordAccess } from '../audit.js';
import { SCHEMA, TOPIC } from '../config.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { DatabaseService } from '../database.service.js';
import { errors } from '../errors.js';
import { LibraryService } from '../library/library.service.js';
import { ROUTE_FROM, type RouteRow, readRoute, readRouteDetail } from '../routes/route-store.js';
import { SpeedStorage } from './storage.js';

// WI-OI-120ca (SPEED S7; FR-RPT-01 to 05, plan v1.4 §4.4): the route's dossier. Requesting one stores the model as it
// is then (the eight sections from the stored results and the sets they used) and queues the files; the worker renders
// them. Every download re-computes the SHA-256 of the stored object and refuses a mismatch. The JSON and CSV exports
// carry the same model.

export const DOSSIER_CONTENT_TYPES: Readonly<Record<SpeedDossierFormat, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

interface DossierRow {
  id: string;
  route_id: string;
  route_version: number;
  status: SpeedDossierStatus;
  watermarked: boolean;
  docx_key: string | null;
  docx_sha256: string | null;
  docx_bytes: number | null;
  pdf_key: string | null;
  pdf_sha256: string | null;
  pdf_bytes: number | null;
  error_code: string | null;
  requested_by: string;
  requested_at: Date;
  completed_at: Date | null;
}

const COLUMNS = `id, route_id, route_version, status, watermarked, docx_key, docx_sha256, docx_bytes, pdf_key, pdf_sha256,
  pdf_bytes, error_code, requested_by, requested_at, completed_at`;

function toDossier(row: DossierRow): SpeedDossierV1 {
  const files: SpeedDossierFileV1[] = [];
  if (row.docx_sha256 && row.docx_bytes)
    files.push({ format: 'docx', sha256: row.docx_sha256, bytes: Number(row.docx_bytes) });
  if (row.pdf_sha256 && row.pdf_bytes)
    files.push({ format: 'pdf', sha256: row.pdf_sha256, bytes: Number(row.pdf_bytes) });
  return {
    id: row.id,
    routeId: row.route_id,
    routeVersion: Number(row.route_version),
    status: row.status,
    watermarked: row.watermarked,
    files,
    errorCode: row.error_code,
    requestedBy: row.requested_by,
    requestedAt: new Date(row.requested_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

export interface DossierDownload {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly fileName: string;
}

@Injectable()
export class DossiersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly criteria: CriteriaService,
    private readonly library: LibraryService,
    private readonly storage: SpeedStorage,
  ) {}

  /** Queues a dossier of the route as it is now; idempotent by request key. Without the object store, 503. */
  async request(
    context: ModuleCommandContext,
    routeId: string,
    input: RequestSpeedDossierInputV1,
  ): Promise<{ dossier: SpeedDossierV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    if (!this.storage.available)
      throw new ServiceUnavailableException({
        code: 'SPEED_STORAGE_UNAVAILABLE',
        message:
          'The object store is not configured on this instance, so dossiers cannot be generated.',
      });
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const route = await readRoute(client, context.principal, access, routeId);
      const replay = await client.query<DossierRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.dossiers WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, input.requestKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].route_id !== routeId)
          throw new ConflictException({
            code: 'SPEED_IDEMPOTENCY_CONFLICT',
            message: 'This request key was already used for another route.',
          });
        return { dossier: toDossier(replay.rows[0]), replayed: true };
      }
      const { model } = await this.modelOf(client, tenantId, route);
      const id = randomUUID();
      const inserted = await client.query<DossierRow>(
        `INSERT INTO ${SCHEMA}.dossiers (id, tenant_id, request_key, route_id, route_version, watermarked, model, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         RETURNING ${COLUMNS}`,
        [
          id,
          tenantId,
          input.requestKey,
          routeId,
          route.route_version,
          model.watermark !== null,
          JSON.stringify(model),
          subject,
        ],
      );
      const dossier = toDossier(inserted.rows[0] as DossierRow);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'DOSSIER_REQUESTED',
        aggregateType: 'dossier',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { routeId, routeVersion: dossier.routeVersion, watermarked: dossier.watermarked },
      });
      return { dossier, replayed: false };
    });
  }

  /** The route's dossiers, newest first. */
  list(principal: ModulePrincipal, routeId: string): Promise<{ items: SpeedDossierV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      await readRoute(client, principal, access, routeId);
      const rows = await client.query<DossierRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.dossiers WHERE tenant_id = $1 AND route_id = $2 ORDER BY requested_at DESC, id DESC LIMIT 50`,
        [principal.tenantId, routeId],
      );
      return { items: rows.rows.map(toDossier) };
    });
  }

  async get(principal: ModulePrincipal, id: string): Promise<SpeedDossierV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      toDossier(await this.readable(client, principal, id)),
    );
  }

  /**
   * A finished dossier's file, served only when the stored object's SHA-256 still matches the one recorded at
   * generation. Every download and every refusal is audited.
   */
  async download(
    context: ModuleCommandContext,
    id: string,
    format: SpeedDossierFormat,
  ): Promise<DossierDownload> {
    const { tenantId } = context.principal;
    const row = await this.database.withTenantTransaction(tenantId, (client) =>
      this.readable(client, context.principal, id),
    );
    const key = format === 'docx' ? row.docx_key : row.pdf_key;
    const recorded = format === 'docx' ? row.docx_sha256 : row.pdf_sha256;
    if (row.status !== 'DONE' || !key || !recorded)
      throw new ConflictException({
        code: 'SPEED_DOSSIER_NOT_READY',
        message: 'The dossier is not ready yet.',
      });
    const bytes = await this.storage.get(key);
    const actual = createHash('sha256').update(bytes).digest('hex');
    const intact = actual === recorded;
    await this.database.withTenantTransaction(tenantId, (client) =>
      recordAccess(client, context, {
        action: intact ? 'DOSSIER_DOWNLOADED' : 'DOSSIER_INTEGRITY_FAILED',
        entityType: 'dossier',
        entityId: id,
        payload: intact
          ? { routeId: row.route_id, format, sha256: recorded }
          : { routeId: row.route_id, format, recorded, actual },
      }),
    );
    if (!intact)
      throw new ConflictException({
        code: 'SPEED_DOSSIER_INTEGRITY',
        message: 'The stored file does not match its recorded SHA-256; it was not served.',
      });
    return {
      bytes,
      contentType: DOSSIER_CONTENT_TYPES[format],
      fileName: `speed-dossier-${row.route_id}-v${row.route_version}-${id}.${format}`,
    };
  }

  /** The dossier model of the route as it is now, with the route (FR-RPT-05: the same model as the files). */
  exportJson(
    principal: ModulePrincipal,
    routeId: string,
  ): Promise<{ model: DossierModelV1; route: SpeedRouteDetailV1 }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      return this.modelOf(
        client,
        principal.tenantId,
        await readRoute(client, principal, access, routeId),
      );
    });
  }

  /** The route's steps, materials and results as CSV, in the catalogue's words. */
  exportCsv(
    principal: ModulePrincipal,
    routeId: string,
  ): Promise<{ csv: string; fileName: string }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      const row = await readRoute(client, principal, access, routeId);
      const route = await readRouteDetail(client, principal.tenantId, row);
      return {
        csv: routeCsv(route, speedText()),
        fileName: `speed-route-${routeId}-v${row.route_version}.csv`,
      };
    });
  }

  /** A dossier the member may read: one of a route whose site their access covers. */
  private async readable(
    client: Client,
    principal: ModulePrincipal,
    id: string,
  ): Promise<DossierRow> {
    errors.assertUuid(id, 'id');
    const row = await client.query<DossierRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.dossiers WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, id],
    );
    const found = row.rows[0] ?? errors.notFound('The dossier');
    // A dossier of a route outside the member's access answers "not found", as another tenant's does.
    const values: unknown[] = [principal.tenantId, found.route_id];
    const scope = readableSite(await resolveAccess(client, principal), 'p.site_unit_id', values);
    const route = await client.query(
      `SELECT 1 FROM ${ROUTE_FROM} WHERE r.tenant_id = $1 AND r.id = $2${scope ? ` AND ${scope}` : ''}`,
      values,
    );
    return route.rows[0] ? found : errors.notFound('The dossier');
  }

  /**
   * The model from the steps' latest results and the criteria and library sets they used. Steps screened with
   * different sets cannot make one dossier: the route is recomputed first (409).
   */
  private async modelOf(
    client: Client,
    tenantId: string,
    row: RouteRow,
  ): Promise<{ model: DossierModelV1; route: SpeedRouteDetailV1 }> {
    const route = await readRouteDetail(client, tenantId, row);
    const results = route.steps.flatMap((step) => (step.latestResult ? [step.latestResult] : []));
    const criteriaIds = new Set(results.map((result) => result.criteriaSetId));
    const libraryIds = new Set(results.map((result) => result.librarySetId));
    if (criteriaIds.size > 1 || libraryIds.size > 1)
      throw new ConflictException({
        code: 'SPEED_DOSSIER_STALE',
        message:
          'The steps were screened with different criteria or library versions; recompute the route first.',
      });
    const [criteriaId] = criteriaIds;
    const [libraryId] = libraryIds;
    const model = dossierModel({
      route,
      criteria: criteriaId ? await this.criteria.byId(client, tenantId, criteriaId) : null,
      library: libraryId ? await this.library.byId(client, tenantId, libraryId) : null,
      generatedAt: new Date().toISOString(),
      approved: false,
    });
    return { model, route };
  }
}
