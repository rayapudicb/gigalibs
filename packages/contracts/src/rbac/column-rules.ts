import { z } from 'zod';
import { holdsPermission } from './permission-match.js';

// WI-OI-120 (Phase 4, R9 column rules): field-level access. A column may require a permission to be SEEN and/or a
// (usually higher) permission to be EDITED; a column with neither rule is open to everyone who can open the record.
// Pure and dependency-free so a list, a form and the export path hide and lock the same columns. You can never edit a
// column you cannot view.

export const ColumnRuleSchema = z
  .object({
    column: z.string().trim().min(1).max(128),
    /** Permission required to see the column's value; absent = visible to anyone with the record. */
    requiredToView: z.string().trim().min(1).max(128).optional(),
    /** Permission required to change it; absent = editable by anyone who can view it. */
    requiredToEdit: z.string().trim().min(1).max(128).optional(),
  })
  .strict();
export type ColumnRule = z.infer<typeof ColumnRuleSchema>;

export interface ColumnAccess {
  readonly column: string;
  readonly canView: boolean;
  readonly canEdit: boolean;
}

/** Resolve each column's view/edit access for the holder of `grantedCodes`. Edit implies — and requires — view. */
export function resolveColumnAccess(
  rules: readonly ColumnRule[],
  grantedCodes: readonly string[],
): ColumnAccess[] {
  return rules.map((rule) => {
    const canView =
      rule.requiredToView === undefined || holdsPermission(grantedCodes, rule.requiredToView);
    const canEdit =
      canView &&
      (rule.requiredToEdit === undefined || holdsPermission(grantedCodes, rule.requiredToEdit));
    return { column: rule.column, canView, canEdit };
  });
}

/** The columns a holder may see — a convenience over {@link resolveColumnAccess} for projecting a row or an export. */
export function visibleColumns(
  rules: readonly ColumnRule[],
  grantedCodes: readonly string[],
): string[] {
  return resolveColumnAccess(rules, grantedCodes)
    .filter((access) => access.canView)
    .map((access) => access.column);
}
