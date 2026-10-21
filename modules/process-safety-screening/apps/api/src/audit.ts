// WI-OI-120bw/120bx: what a change did, field by field, for the audit row (FR-AUD-01).

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export function changes<T extends object>(
  before: T | null,
  after: T,
  fields: readonly (keyof T)[],
): FieldChanges {
  const changed: FieldChanges = {};
  for (const field of fields) {
    const from = before ? before[field] : null;
    if (from !== after[field]) changed[String(field)] = { from, to: after[field] };
  }
  return changed;
}

/** Escapes LIKE wildcards in a search term. */
export function likePattern(search: string): string {
  return `%${search.toLocaleLowerCase('en-US').replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
