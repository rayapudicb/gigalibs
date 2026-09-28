import { Injectable } from '@nestjs/common';
import type { ImportableEntityType } from './types.js';
import { getHierarchyColumnDefs } from './column-registry.js';
import type { ValidatedRow } from './types.js';

/**
 * Topological sort for self-referencing hierarchy imports (assets, locations, departments).
 *
 * Algorithm: Kahn's algorithm (BFS-based topological sort).
 * Input: validated rows with parentKey field resolved to a row's own externalId / name value.
 * Output: rows in dependency order (parents before children).
 *
 * If a cycle is detected, the rows involved are flagged with an error rather than silently
 * reordered — this surfaces the data problem to the user.
 */
@Injectable()
export class HierarchyResolverService {
  /**
   * Returns rows sorted so parents appear before children.
   * Rows with no hierarchy column are returned as-is (stable order preserved).
   */
  sortByHierarchy(
    entityType: ImportableEntityType,
    rows: ValidatedRow[],
  ): { sorted: ValidatedRow[]; cycleRows: ValidatedRow[] } {
    const hierarchyDefs = getHierarchyColumnDefs(entityType);
    if (hierarchyDefs.length === 0) {
      return { sorted: rows, cycleRows: [] };
    }

    // Use first hierarchy def (entities have at most one self-referencing hierarchy)
    const hierarchyDef = hierarchyDefs[0];
    if (!hierarchyDef) return { sorted: rows, cycleRows: [] };

    const parentKey = hierarchyDef.key; // e.g. 'parent_asset_tag'
    const matchCol = hierarchyDef.hierarchyParentMatchColumn ?? 'name'; // e.g. 'asset_tag'

    // Build lookup: matchValue → row index
    const rowByMatchValue = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const matchValue = row.dbValues[matchCol];
      if (matchValue != null && matchValue !== '') {
        rowByMatchValue.set(String(matchValue).toLowerCase(), i);
      }
    }

    // Build adjacency: parentIndex → [childIndex, ...]
    const children = new Map<number, number[]>();
    const inDegree = new Array<number>(rows.length).fill(0);

    for (let i = 0; i < rows.length; i++) {
      children.set(i, []);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const parentVal = row.dbValues[parentKey];
      if (parentVal == null || parentVal === '') continue;

      const parentIdx = rowByMatchValue.get(String(parentVal).toLowerCase());
      if (parentIdx === undefined) {
        // Parent references an existing DB record — not within this batch, skip in-batch ordering
        continue;
      }

      const parentChildren = children.get(parentIdx);
      if (parentChildren !== undefined) {
        parentChildren.push(i);
      }
      inDegree[i] = (inDegree[i] ?? 0) + 1;
    }

    // Kahn's BFS
    const queue: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if ((inDegree[i] ?? 0) === 0) queue.push(i);
    }

    const sorted: ValidatedRow[] = [];
    while (queue.length > 0) {
      const idx = queue.shift()!;
      const row = rows[idx];
      if (row) sorted.push(row);
      const childList = children.get(idx) ?? [];
      for (const childIdx of childList) {
        inDegree[childIdx] = (inDegree[childIdx] ?? 1) - 1;
        if ((inDegree[childIdx] ?? 0) === 0) queue.push(childIdx);
      }
    }

    // Cycle detection: rows not in sorted output
    const sortedSet = new Set(sorted.map((r) => r.rowNumber));
    const cycleRows = rows.filter((r) => !sortedSet.has(r.rowNumber));

    return { sorted, cycleRows };
  }
}
