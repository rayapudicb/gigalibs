/**
 * @gigalibs/archival-core
 *
 * Cold data lifecycle management: batch record compression,
 * S3 Glacier/R2 migration packaging, and on-demand restore contracts.
 *
 * @module
 */

import { generateId } from '@gigalibs/crypto';

export interface ArchiveJob {
  id: string;
  tenantId: string;
  entityType: string;
  recordsCount: number;
  archiveStorageKey: string;
  status: 'PENDING' | 'ARCHIVED' | 'RESTORED';
  archivedAt: Date;
}

export class DataArchiver {
  static createArchiveManifest<T extends Record<string, any>>(
    tenantId: string,
    entityType: string,
    records: T[],
  ): { job: ArchiveJob; payloadJson: string } {
    const job: ArchiveJob = {
      id: generateId(),
      tenantId,
      entityType,
      recordsCount: records.length,
      archiveStorageKey: `archives/${tenantId}/${entityType}/${Date.now()}.json.gz`,
      status: 'ARCHIVED',
      archivedAt: new Date(),
    };

    return {
      job,
      payloadJson: JSON.stringify(records),
    };
  }
}
