import { Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import type { DatabaseService } from '../database/database.service.js';
import type { ExportJobPayload, ExportFilters, ImportableEntityType, ExportJob } from './types.js';
import { XlsxStreamWriter } from './xlsx-stream-writer.js';
import { XlsxMultiSheetWriter } from './xlsx-multisheet-writer.js';
import { sanitizeSheetName } from './xlsx-multisheet-writer.js';
import { ImportStorageService } from './import-storage.service.js';

@Injectable()
export class ExportJobService {
  private readonly logger = new Logger(ExportJobService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: ImportStorageService,
  ) {}

  // ─── Initiate export ─────────────────────────────────────────────────────

  async initiateExport(
    tenantId: string,
    actorId: string,
    entityType: ImportableEntityType,
    filters: ExportFilters,
  ): Promise<{ jobId: string }> {
    const { rows } = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_cmms.export_jobs
         (tenant_id, entity_type, status, filters, exported_by)
       VALUES ($1, $2, 'PENDING', $3, $4)
       RETURNING id`,
      [tenantId, entityType, JSON.stringify(filters), actorId],
    );
    const jobId = rows[0]?.id;
    if (!jobId) throw new Error('Failed to create export job');
    return { jobId };
  }

  // ─── BullMQ worker entry point ───────────────────────────────────────────

  async processExportJob(payload: ExportJobPayload): Promise<void> {
    const { tenantId, jobId, entityType, filters, allowedColumns, departmentScope } = payload;
    this.logger.log(`Processing export job ${jobId} for ${entityType}`);

    await this.updateExportStatus(tenantId, jobId, 'PROCESSING');

    const s3Key = this.storage.buildExportKey(tenantId, jobId, entityType);
    const uploadId = await this.storage.startMultipartUpload(s3Key);

    const useMultiSheet = filters.multiSheet === true && entityType === 'workforce_resources';

    try {
      const passthrough = new PassThrough();
      const parts: Array<{ PartNumber: number; ETag: string }> = [];
      let partNumber = 1;
      let bufferAccumulator = Buffer.alloc(0);
      let rowCount = 0;
      const pageSize = 1000;

      if (useMultiSheet) {
        // ── Multi-sheet path: one worksheet per department ──────────────────
        const writer = new XlsxMultiSheetWriter(entityType, allowedColumns, []);
        await writer.open(passthrough);

        // Fetch distinct departments in scope
        const departments = await this.fetchWorkforceDepartments(
          tenantId, departmentScope,
        );

        for (const dept of departments) {
          const sheetLabel = dept.name ?? 'Unassigned';
          await writer.startSheet(sheetLabel);

          let lastId: string | null = null;
          let hasMore = true;
          while (hasMore) {
            const rows = await this.fetchEntityPage(
              tenantId, entityType,
              { ...filters, departmentId: dept.id },
              null, pageSize, lastId,
            );
            for (const row of rows) {
              await writer.writeRow(row);
              rowCount++;
            }
            hasMore = rows.length === pageSize;
            if (rows.length > 0) lastId = rows[rows.length - 1]?.id as string ?? null;
          }
        }

        // Also emit an "Unassigned" sheet for workforce without a department
        await writer.startSheet('Unassigned');
        let lastId: string | null = null;
        let hasMore = true;
        while (hasMore) {
          const rows = await this.fetchEntityPage(
            tenantId, entityType,
            { ...filters, departmentId: '__NULL__' },
            null, pageSize, lastId,
          );
          for (const row of rows) {
            await writer.writeRow(row);
            rowCount++;
          }
          hasMore = rows.length === pageSize;
          if (rows.length > 0) lastId = rows[rows.length - 1]?.id as string ?? null;
        }

        await writer.close();
      } else {
        // ── Single-sheet path (all other entities + non-multiSheet workforce) ─
        const writer = new XlsxStreamWriter(entityType, allowedColumns, []);
        await writer.open(passthrough);

        let lastId: string | null = null;
        let hasMore = true;
        while (hasMore) {
          const rows = await this.fetchEntityPage(
            tenantId, entityType, filters, departmentScope, pageSize, lastId,
          );
          for (const row of rows) {
            await writer.writeRow(row);
            rowCount++;
          }
          hasMore = rows.length === pageSize;
          if (rows.length > 0) lastId = rows[rows.length - 1]?.id as string ?? null;
        }
        await writer.close();
      }

      // Collect all passthrough data and upload in chunks
      const chunks: Buffer[] = [];
      for await (const chunk of passthrough) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        bufferAccumulator = Buffer.concat(chunks);

        while (bufferAccumulator.byteLength >= this.storage.partSize) {
          const part = bufferAccumulator.slice(0, this.storage.partSize);
          bufferAccumulator = bufferAccumulator.slice(this.storage.partSize);
          const uploaded = await this.storage.uploadPart(s3Key, uploadId, partNumber++, part);
          parts.push(uploaded);
        }
      }

      // Upload remaining bytes as final part (must be ≥5 MB unless it's the only part)
      if (bufferAccumulator.byteLength > 0) {
        const uploaded = await this.storage.uploadPart(s3Key, uploadId, partNumber, bufferAccumulator);
        parts.push(uploaded);
      }

      await this.storage.completeMultipartUpload(s3Key, uploadId, parts);

      const { downloadUrl, expiresAt } = await this.storage.createPresignedDownload(s3Key);

      await this.db.queryWithTenant(tenantId,
        `UPDATE gigalibs_cmms.export_jobs
            SET status = 'COMPLETED', s3_key = $2, row_count = $3,
                download_url_expires_at = $4, completed_at = transaction_timestamp(),
                updated_at = transaction_timestamp()
          WHERE id = $1`,
        [jobId, s3Key, rowCount, expiresAt],
      );

      this.logger.log(`Export job ${jobId} done: ${rowCount} rows`);
      void downloadUrl; // returned via presign — stored in DB for retrieval
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Export job ${jobId} failed: ${message}`);
      await this.storage.abortMultipartUpload(s3Key, uploadId);
      await this.updateExportStatus(tenantId, jobId, 'FAILED');
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getJob(tenantId: string, jobId: string): Promise<ExportJob | null> {
    const { rows } = await this.db.queryWithTenant<ExportJob>(
      tenantId,
      `SELECT * FROM gigalibs_cmms.export_jobs WHERE id = $1`,
      [jobId],
    );
    const job = rows[0];
    if (!job) return null;

    // Refresh presigned URL if needed
    if (job.s3Key && job.status === 'COMPLETED') {
      const { downloadUrl, expiresAt } = await this.storage.createPresignedDownload(job.s3Key);
      return { ...job, downloadUrl, downloadUrlExpiresAt: expiresAt };
    }
    return job;
  }

  async listJobs(tenantId: string, entityType?: ImportableEntityType, limit = 25): Promise<ExportJob[]> {
    const conditions = [`tenant_id = $1`];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(entityType);
    }
    params.push(limit);

    const { rows } = await this.db.queryWithTenant<ExportJob>(
      tenantId,
      `SELECT * FROM gigalibs_cmms.export_jobs
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIdx}`,
      params,
    );
    return rows;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async updateExportStatus(tenantId: string, jobId: string, status: string): Promise<void> {
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.export_jobs
          SET status = $2, updated_at = transaction_timestamp()
        WHERE id = $1`,
      [jobId, status],
    );
  }

  private async fetchEntityPage(
    tenantId: string,
    entityType: ImportableEntityType,
    filters: ExportFilters,
    departmentScope: string[] | null,
    limit: number,
    afterId: string | null,
  ): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ['NOT is_deleted'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (afterId) {
      conditions.push(`id > $${paramIdx++}`);
      params.push(afterId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (departmentScope && departmentScope.length > 0) {
      conditions.push(`department_id = ANY($${paramIdx++}::uuid[])`);
      params.push(departmentScope);
    }
    if (filters.departmentId !== undefined) {
      if (filters.departmentId === '__NULL__') {
        conditions.push('department_id IS NULL');
      } else {
        conditions.push(`department_id = $${paramIdx++}::uuid`);
        params.push(filters.departmentId);
      }
    }
    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.dateTo);
    }

    params.push(limit);
    const { rows } = await this.db.queryWithTenant<Record<string, unknown>>(
      tenantId,
      `SELECT * FROM gigalibs_cmms.${entityType}
        WHERE ${conditions.join(' AND ')}
        ORDER BY id
        LIMIT $${paramIdx}`,
      params,
    );
    return rows;
  }

  private async fetchWorkforceDepartments(
    tenantId: string,
    departmentScope: string[] | null | undefined,
  ): Promise<Array<{ id: string; name: string }>> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (departmentScope && departmentScope.length > 0) {
      conditions.push(`id = ANY($${paramIdx++}::uuid[])`);
      params.push(departmentScope);
    }

    const { rows } = await this.db.queryWithTenant<{ id: string; name: string }>(
      tenantId,
      `SELECT id, name FROM gigalibs_cmms.departments
        WHERE ${conditions.join(' AND ')}
        ORDER BY name`,
      params,
    );
    return rows;
  }
}
