// WI-OI-120q (R1, ADR-0034): the one rule for "does this grant cover that permission", used by the web, the
// renderer, the control plane and every module. Pure and dependency-free so each of them can import it.
//
// A code is a family followed by one to three parts, written with colons (`finance:journals:post`) or dots
// (`cmms.work-orders.write`); both spellings of the same parts are the same permission. A grant covers a required
// code when it is `*`, the same code, or its family's wildcard (`cmms:*`, also written `cmms.*`). Nothing else: no
// `all`, no `*:action`, no prefix matching, and a shorter grant never covers a longer code. A malformed code, granted
// or required, matches nothing.

const PART = /^[a-z][a-z0-9-]*$/;
const MAX_PARTS = 4;

/** The parts of a permission code, or null when it is not one. `*` alone is `['*']`. */
export function permissionParts(code: unknown): readonly string[] | null {
  if (typeof code !== 'string') return null;
  if (code === '*') return ['*'];
  const parts = code.split(/[:.]/);
  if (parts.length < 2 || parts.length > MAX_PARTS) return null;
  const last = parts.length - 1;
  for (let index = 0; index <= last; index += 1) {
    const part = parts[index]!;
    // A wildcard is only the whole action of a two-part code (`family:*`).
    if (part === '*' && index === last && parts.length === 2) continue;
    if (!PART.test(part)) return null;
  }
  return parts;
}

/** The colon spelling of a permission code (`cmms.work-orders.read` → `cmms:work-orders:read`), or null. */
export function canonicalPermission(code: unknown): string | null {
  const parts = permissionParts(code);
  return parts ? parts.join(':') : null;
}

/** Whether one granted code covers the required code. */
export function permissionMatches(granted: unknown, required: unknown): boolean {
  const need = permissionParts(required);
  const have = permissionParts(granted);
  if (!need || !have) return false;
  if (have.length === 1) return true; // `*`
  if (need.length === 1) return false; // only `*` covers `*`
  if (have.length === 2 && have[1] === '*') return have[0] === need[0];
  return have.length === need.length && have.every((part, index) => part === need[index]);
}

/** Whether any of the granted codes covers the required code. */
export function holdsPermission(granted: readonly unknown[] | null | undefined, required: unknown): boolean {
  return Array.isArray(granted) && granted.some((code) => permissionMatches(code, required));
}
