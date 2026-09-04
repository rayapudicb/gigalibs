import type { ObjectDiff } from './types.js';

export class AuditDiffCalculator {
  /**
   * Calculates shallow diff between two records (e.g. before update and after update).
   */
  static diff(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null): ObjectDiff[] {
    if (!before && !after) return [];
    if (!before) {
      return Object.entries(after ?? {}).map(([field, val]) => ({
        field,
        before: undefined,
        after: val,
      }));
    }
    if (!after) {
      return Object.entries(before).map(([field, val]) => ({
        field,
        before: val,
        after: undefined,
      }));
    }

    const diffs: ObjectDiff[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const valBefore = before[key];
      const valAfter = after[key];

      if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
        diffs.push({
          field: key,
          before: valBefore,
          after: valAfter,
        });
      }
    }

    return diffs;
  }
}
