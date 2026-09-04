/**
 * @gigalibs/data-retention
 *
 * Automated data retention policies and scheduled purge rule evaluators.
 *
 * @module
 */

export interface RetentionPolicy {
  entityType: string;
  retentionDays: number;
  action: 'ARCHIVE_TO_COLD_STORAGE' | 'HARD_DELETE';
}

export class DataRetentionEvaluator {
  /**
   * Determine if a record is past its legal retention threshold.
   */
  static isEligibleForPurge(recordCreatedAt: Date, policy: RetentionPolicy): boolean {
    const ageMs = Date.now() - recordCreatedAt.getTime();
    const thresholdMs = policy.retentionDays * 24 * 60 * 60 * 1000;
    return ageMs >= thresholdMs;
  }
}
