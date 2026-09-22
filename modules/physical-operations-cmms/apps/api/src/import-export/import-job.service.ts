import { Injectable, Logger } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service.js';
import type { ImportJobPayload, ImportableEntityType, ImportJob, ColumnWarning, ValidatedRow } from './types.js';
import { AliasResolverService } from './alias-resolver.js';
import { FkResolverService } from './fk-resolver.js';
import { HierarchyResolverService } from './hierarchy-resolver.js';
import { RowValidatorService } from './row-validator.js';
import { BatchWriterService } from './batch-writer.js';
import { ImportStorageService } from './import-storage.service.js';
import { XlsxStreamReader } from './xlsx-stream-reader.js';
import { XlsxMultiSheetReader } from './xlsx-multisheet-reader.js';
import { classifyHeaders } from './column-classifier.js';
import type { PoolClient } from 'pg';

const ALL_OR_NOTHING_THRESHOLD = 500;

@Injectable()
export class ImportJobService {
  private readonly logger = new Logger(ImportJobService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly aliasResolver: AliasResolverService,
    private readonly fkResolver: FkResolverService,
    private readonly hierarchyResolver: HierarchyResolverService,
    private readonly rowValidator: RowValidatorService,
    private readonly batchWriter: BatchWriterService,
    private readonly storage: ImportStorageService,
  ) {}

  // ─── Step 1: Create job record and return presigned URL ──────────────────

  async initiateImport(
    tenantId: string,
    actorId: string,
    entityType: ImportableEntityType,
    filename: string,
    options: { historical?: boolean; columnMappingOverrides?: Record<string, string> } = {},
  ): Promise<{ jobId: string; uploadUrl: string; uploadMethod: 'PUT'; expiresAt: string }> {
    const { rows } = await this.db.queryWithTenant<{ id: string }>(
      tenantId,
      `INSERT INTO gigalibs_cmms.import_jobs
         (tenant_id, entity_type, status, options, created_by)
       VALUES ($1, $2, 'PENDING', $3, $4)
       RETURNING id`,
      [
        tenantId,
        entityType,
        JSON.stringify({
          allOrNothingThreshold: ALL_OR_NOTHING_THRESHOLD,
          historical: options.historical ?? false,
          columnMappingOverrides: options.columnMappingOverrides ?? {},
        }),
        actorId,
      ],
    );

    const jobId = rows[0]?.id;
    if (!jobId) throw new Error('Failed to create import job');

    const presign = await this.storage.createPresignedUpload(tenantId, jobId, filename);
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.import_jobs SET s3_key = $2 WHERE id = $1`,
      [jobId, this.storage.buildImportKey(tenantId, jobId, filename)],
    );

    return presign;
  }

  // ─── Step 2: BullMQ worker entry point ───────────────────────────────────

  async processImportJob(payload: ImportJobPayload): Promise<void> {
    const { tenantId, jobId, entityType, s3Key, options } = payload;
    this.logger.log(`Processing import job ${jobId} for ${entityType}`);

    const useMultiSheet = options.multiSheet === true;

    try {
      await this.updateJobStatus(tenantId, jobId, 'PARSING');

      // FK pre-resolution (same for both paths)
      const fkMaps = await this.fkResolver.buildFkMaps(tenantId, entityType);

      const allValidRows: ValidatedRow[] = [];
      const failedRows: Array<{ rowNumber: number; error: string }> = [];
      let totalRows = 0;
      let columnWarnings: ColumnWarning[] = [];

      if (useMultiSheet) {
        // ── Multi-sheet path: process each worksheet as a department sub-batch ──
        const msStream = await this.storage.downloadAsStream(s3Key);
        const msReader = new XlsxMultiSheetReader(msStream);

        const aliasMap = await this.aliasResolver.loadAliasMap(tenantId, entityType);
        const overrideMap = new Map(Object.entries(options.columnMappingOverrides ?? {}));
        const mergedAliases = new Map([...aliasMap, ...overrideMap]);

        // Determine sheets to process (selectedSheets filter or all sheets)
        const allSheetNames = await msReader.listSheetNames();
        const sheetsToProcess = options.selectedSheets && options.selectedSheets.length > 0
          ? allSheetNames.filter((n) => options.selectedSheets!.includes(n))
          : allSheetNames;

        let globalRowOffset = 0;

        for await (const sheet of msReader.sheets()) {
          if (!sheetsToProcess.includes(sheet.name)) continue;

          const sheetRows: Array<Record<string, unknown>> = [];
          for await (const row of sheet.rows()) {
            sheetRows.push(row.data);
          }

          if (sheetRows.length === 0) continue;

          // Derive headers from first row keys
          const sheetHeaders = Object.keys(sheetRows[0]);
          if (columnWarnings.length === 0) {
            // Classify headers once from the first non-empty sheet
            const classified = classifyHeaders(sheetHeaders, entityType, mergedAliases);
            columnWarnings = classified.warnings;
            await this.updateJobColumns(tenantId, jobId, columnWarnings);
          }

          const { classifications } = classifyHeaders(sheetHeaders, entityType, mergedAliases);

          for (let idx = 0; idx < sheetRows.length; idx++) {
            const rowNumber = globalRowOffset + idx + 2; // 1-indexed + header
            totalRows++;
            const result = this.rowValidator.validateRow(
              rowNumber,
              sheetRows[idx],
              entityType,
              classifications,
              sheetHeaders,
              fkMaps,
            );
            if (result.valid) {
              allValidRows.push(result.valid);
            } else {
              failedRows.push({
                rowNumber,
                error: result.error
                  ? `[${result.error.code}] ${result.error.message}`
                  : 'Unknown validation error',
              });
            }
          }
          globalRowOffset += sheetRows.length;
        }
      } else {
        // ── Single-sheet path ─────────────────────────────────────────────────
        // 1. Download from S3
        const fileStream = await this.storage.downloadAsStream(s3Key);
        const reader = new XlsxStreamReader(fileStream);

        // 2. Header pass — classify columns
        const headerStream = await this.storage.downloadAsStream(s3Key);
        const headerReader = new XlsxStreamReader(headerStream);
        const headers = await headerReader.readHeaders();

        const aliasMap = await this.aliasResolver.loadAliasMap(tenantId, entityType);
        const overrideMap = new Map(Object.entries(options.columnMappingOverrides ?? {}));
        const mergedAliases = new Map([...aliasMap, ...overrideMap]);
        const { classifications, warnings } = classifyHeaders(headers, entityType, mergedAliases);
        columnWarnings = warnings;

        await this.updateJobColumns(tenantId, jobId, columnWarnings);

        for await (const { rowNumber, data } of reader.rows()) {
          totalRows++;
          const result = this.rowValidator.validateRow(
            rowNumber,
            data,
            entityType,
            classifications,
            headers,
            fkMaps,
          );

          if (result.valid) {
            allValidRows.push(result.valid);
          } else {
            failedRows.push({
              rowNumber,
              error: result.error
                ? `[${result.error.code}] ${result.error.message}`
                : 'Unknown validation error',
            });
          }
        }
      }

      // ── Common path: hierarchy, batch write, finalize ──────────────────────
      await this.updateJobStatus(tenantId, jobId, 'VALIDATING');
      const validRows = allValidRows;

      await this.db.queryWithTenant(tenantId,
        `UPDATE gigalibs_cmms.import_jobs SET total_rows = $2 WHERE id = $1`,
        [jobId, totalRows],
      );

      // 5. Hierarchy sort
      const { sorted, cycleRows } = this.hierarchyResolver.sortByHierarchy(entityType, validRows);
      for (const cycleRow of cycleRows) {
        failedRows.push({ rowNumber: cycleRow.rowNumber, error: 'CYCLE_DETECTED: circular hierarchy reference' });
      }

      // 6. Determine commit strategy
      const allOrNothing = totalRows <= options.allOrNothingThreshold;

      // 7. If failures exist and all-or-nothing, abort now before write
      if (failedRows.length > 0 && allOrNothing) {
        await this.finalizeJob(tenantId, jobId, 0, failedRows.length, 'FAILED');
        await this.writeErrorReport(tenantId, jobId, failedRows);
        return;
      }

      // 8. Batch write
      await this.updateJobStatus(tenantId, jobId, 'COMMITTING');
      const batchResult = await this.batchWriter.writeBatches(
        tenantId,
        entityType,
        sorted,
        allOrNothing,
        (op: (client: PoolClient) => Promise<{ committed: number; failed: Array<{ rowNumber: number; error: string }> }>) =>
          this.db.withTenantTransaction(tenantId, op),
      );

      failedRows.push(...batchResult.failed);
      const successRows = batchResult.committed;
      const finalStatus = failedRows.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';

      await this.finalizeJob(tenantId, jobId, successRows, failedRows.length, finalStatus);

      if (failedRows.length > 0) {
        await this.writeErrorReport(tenantId, jobId, failedRows);
      }

      this.logger.log(`Import job ${jobId} done: ${successRows} committed, ${failedRows.length} failed`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Import job ${jobId} failed: ${message}`);
      await this.updateJobStatus(tenantId, jobId, 'FAILED');
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getJob(tenantId: string, jobId: string): Promise<ImportJob | null> {
    const { rows } = await this.db.queryWithTenant<ImportJob>(
      tenantId,
      `SELECT * FROM gigalibs_cmms.import_jobs WHERE id = $1`,
      [jobId],
    );
    return rows[0] ?? null;
  }

  async downloadFileStream(tenantId: string, s3Key: string) {
    return this.storage.downloadAsStream(s3Key);
  }

  async listJobs(
    tenantId: string,
    entityType?: ImportableEntityType,
    limit = 25,
    offset = 0,
  ): Promise<ImportJob[]> {
    const conditions = [`tenant_id = $1`];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(entityType);
    }

    params.push(limit, offset);
    const { rows } = await this.db.queryWithTenant<ImportJob>(
      tenantId,
      `SELECT * FROM gigalibs_cmms.import_jobs
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params,
    );
    return rows;
  }

  async cancelJob(tenantId: string, jobId: string): Promise<void> {
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.import_jobs SET status = 'CANCELLED', updated_at = transaction_timestamp()
        WHERE id = $1 AND status IN ('PENDING', 'AWAITING_REVIEW')`,
      [jobId],
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async updateJobStatus(tenantId: string, jobId: string, status: string): Promise<void> {
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.import_jobs
          SET status = $2, updated_at = transaction_timestamp()
        WHERE id = $1`,
      [jobId, status],
    );
  }

  private async updateJobColumns(tenantId: string, jobId: string, warnings: ColumnWarning[]): Promise<void> {
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.import_jobs
          SET column_warnings = $2, updated_at = transaction_timestamp()
        WHERE id = $1`,
      [jobId, JSON.stringify(warnings)],
    );
  }

  private async finalizeJob(
    tenantId: string,
    jobId: string,
    successRows: number,
    failedRows: number,
    status: string,
  ): Promise<void> {
    await this.db.queryWithTenant(tenantId,
      `UPDATE gigalibs_cmms.import_jobs
          SET status = $2, success_rows = $3, failed_rows = $4,
              completed_at = transaction_timestamp(), updated_at = transaction_timestamp()
        WHERE id = $1`,
      [jobId, status, successRows, failedRows],
    );
  }

  private async writeErrorReport(
    tenantId: string,
    jobId: string,
    failedRows: Array<{ rowNumber: number; error: string }>,
  ): Promise<void> {
    // Error report is a simple JSON blob stored as an S3 object
    const key = this.storage.buildErrorReportKey(tenantId, jobId);
    const body = Buffer.from(JSON.stringify({ errors: failedRows }, null, 2));
    // Use single-part upload for error reports (typically small)
    const uploadId = await this.storage.startMultipartUpload(key);
    try {
      const part = await this.storage.uploadPart(key, uploadId, 1, body);
      await this.storage.completeMultipartUpload(key, uploadId, [part]);
      await this.db.queryWithTenant(tenantId,
        `UPDATE gigalibs_cmms.import_jobs SET error_report_s3_key = $2 WHERE id = $1`,
        [jobId, key],
      );
    } catch {
      await this.storage.abortMultipartUpload(key, uploadId);
    }
  }
}
