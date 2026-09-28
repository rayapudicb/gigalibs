import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { ImportableEntityType, ValidatedRow, BatchResult } from './types.js';
import { getWritableColumnDefs, getFkColumnDefs } from './column-registry.js';

const BATCH_SIZE = 200;

@Injectable()
export class BatchWriterService {
  private readonly logger = new Logger(BatchWriterService.name);

  /**
   * Writes rows in 200-row transactional batches using ON CONFLICT DO UPDATE.
   * For ≤500 rows: all-or-nothing (single transaction wrapping all batches).
   * For >500 rows: partial commit — each 200-row batch commits independently.
   */
  async writeBatches(
    tenantId: string,
    entityType: ImportableEntityType,
    rows: ValidatedRow[],
    allOrNothing: boolean,
    withTransaction: (op: (client: PoolClient) => Promise<BatchResult>) => Promise<BatchResult>,
  ): Promise<BatchResult> {
    if (allOrNothing) {
      // Single transaction, all batches inside
      return withTransaction((client) => this.writeAllBatches(client, tenantId, entityType, rows));
    }

    // Partial commit: batch by batch
    let totalCommitted = 0;
    const totalFailed: BatchResult['failed'] = [];

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + BATCH_SIZE);
      const result = await withTransaction((client) =>
        this.writeAllBatches(client, tenantId, entityType, chunk),
      ).catch((err: unknown) => {
        // If a whole batch transaction fails, mark all rows in chunk as failed
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Batch at offset ${offset} failed: ${message}`);
        return {
          committed: 0,
          failed: chunk.map((r) => ({ rowNumber: r.rowNumber, error: message })),
        };
      });

      totalCommitted += result.committed;
      totalFailed.push(...result.failed);
    }

    return { committed: totalCommitted, failed: totalFailed };
  }

  private async writeAllBatches(
    client: PoolClient,
    tenantId: string,
    entityType: ImportableEntityType,
    rows: ValidatedRow[],
  ): Promise<BatchResult> {
    const writableDefs = getWritableColumnDefs(entityType);
    const fkDefs = getFkColumnDefs(entityType);

    // Columns to insert: db-direct writables + resolved FK columns (stored as _id)
    const dbColumns = writableDefs
      .map((d) => d.dbColumn!)
      .filter((col, idx, arr) => arr.indexOf(col) === idx); // deduplicate

    let committed = 0;
    const failed: BatchResult['failed'] = [];

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + BATCH_SIZE);
      try {
        await this.insertChunk(client, tenantId, entityType, chunk, dbColumns, fkDefs);
        committed += chunk.length;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push(...chunk.map((r) => ({ rowNumber: r.rowNumber, error: message })));
        throw err; // propagate to trigger transaction rollback
      }
    }

    return { committed, failed };
  }

  private async insertChunk(
    client: PoolClient,
    tenantId: string,
    entityType: ImportableEntityType,
    chunk: ValidatedRow[],
    dbColumns: string[],
    _fkDefs: ReturnType<typeof getFkColumnDefs>,
  ): Promise<void> {
    if (chunk.length === 0) return;

    // Build multi-row INSERT ... ON CONFLICT DO UPDATE
    // tenant_id + external_id as upsert key (or tenant_id + name if no external_id)
    const valueRows: string[] = [];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    const allCols = ['tenant_id', ...dbColumns, 'custom_attributes', 'spec_attributes'];
    const updateCols = dbColumns.map((c) => `${c} = EXCLUDED.${c}`);
    updateCols.push('custom_attributes = EXCLUDED.custom_attributes');
    updateCols.push('spec_attributes = EXCLUDED.spec_attributes');
    updateCols.push('updated_at = transaction_timestamp()');
    updateCols.push('version = gigalibs_cmms.' + entityType + '.version + 1');

    for (const row of chunk) {
      const placeholders: string[] = ['$1']; // tenant_id
      for (const col of dbColumns) {
        params.push(row.dbValues[col] ?? null);
        placeholders.push(`$${paramIdx++}`);
      }
      // custom_attributes JSONB
      params.push(Object.keys(row.customValues).length > 0 ? JSON.stringify(row.customValues) : '{}');
      placeholders.push(`$${paramIdx++}`);
      // spec_attributes JSONB (if table has it; stored in custom_attributes for spec_ cols)
      params.push(Object.keys(row.specValues).length > 0 ? JSON.stringify(row.specValues) : '{}');
      placeholders.push(`$${paramIdx++}`);

      valueRows.push(`(${placeholders.join(', ')})`);
    }

    const conflictTarget = 'tenant_id, external_id';
    const sql = `
      INSERT INTO gigalibs_cmms.${entityType} (${allCols.join(', ')})
      VALUES ${valueRows.join(',\n')}
      ON CONFLICT (${conflictTarget}) DO UPDATE SET
        ${updateCols.join(',\n        ')}
    `;

    await client.query(sql, params);
  }
}
