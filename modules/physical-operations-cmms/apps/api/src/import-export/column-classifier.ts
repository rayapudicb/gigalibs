import type { ImportableEntityType, ColumnKind, ColumnWarning } from './types.js';
import { getImportColumnDefs } from './column-registry.js';

export type ColumnClass =
  | { kind: 'known'; key: string; columnKind: ColumnKind }
  | { kind: 'alias'; key: string; resolvedKey: string; columnKind: ColumnKind }
  | { kind: 'spec-jsonb'; key: string }
  | { kind: 'custom-jsonb'; key: string }
  | { kind: 'unrecognized'; key: string };

/**
 * Classifies a single incoming header name for an entity type.
 *
 * Priority order:
 *  1. Exact match against column registry (db-direct, fk-resolve, hierarchy, computed, etc.)
 *  2. Alias map match (passed in as resolvedAliases: externalName → registryKey)
 *  3. "spec_" prefix → spec-jsonb
 *  4. "custom_" prefix → custom-jsonb
 *  5. Unrecognized
 */
export function classifyHeader(
  header: string,
  entityType: ImportableEntityType,
  resolvedAliases: Map<string, string>,
): ColumnClass {
  const normalized = normalizeHeader(header);
  const defs = getImportColumnDefs(entityType);

  // 1. Exact match
  const exact = defs.find((d) => normalizeHeader(d.key) === normalized);
  if (exact) {
    return { kind: 'known', key: header, columnKind: exact.kind };
  }

  // 2. Alias map match
  const aliasTarget = resolvedAliases.get(normalized);
  if (aliasTarget !== undefined) {
    const target = defs.find((d) => normalizeHeader(d.key) === normalizeHeader(aliasTarget));
    if (target) {
      return { kind: 'alias', key: header, resolvedKey: target.key, columnKind: target.kind };
    }
  }

  // 3. spec_ prefix
  if (normalized.startsWith('spec_')) {
    return { kind: 'spec-jsonb', key: header };
  }

  // 4. custom_ prefix
  if (normalized.startsWith('custom_')) {
    return { kind: 'custom-jsonb', key: header };
  }

  // 5. Unrecognized
  return { kind: 'unrecognized', key: header };
}

/**
 * Classifies an entire header row and produces:
 *  - classifications array (parallel to headers)
 *  - warnings for unrecognized columns
 */
export function classifyHeaders(
  headers: string[],
  entityType: ImportableEntityType,
  resolvedAliases: Map<string, string>,
): { classifications: ColumnClass[]; warnings: ColumnWarning[] } {
  const classifications: ColumnClass[] = [];
  const warnings: ColumnWarning[] = [];

  const seen = new Set<string>();

  for (const header of headers) {
    const cls = classifyHeader(header, entityType, resolvedAliases);
    classifications.push(cls);

    if (cls.kind === 'unrecognized') {
      warnings.push({
        column: header,
        reason: 'UNRECOGNIZED',
        suggestion: suggestSimilar(normalizeHeader(header), entityType),
      });
    } else if (cls.kind === 'alias') {
      warnings.push({
        column: header,
        reason: 'ALIAS_RESOLVED',
        resolvedTo: cls.resolvedKey,
      });
    }

    // Track duplicates (informational — duplicates are silently skipped at import)
    const resolvedKey = cls.kind === 'alias' ? cls.resolvedKey : cls.kind === 'known' ? cls.key : header;
    seen.add(resolvedKey);
  }

  return { classifications, warnings };
}

/**
 * Detects formula injection: cells starting with =, +, -, @ (OWASP CSV injection).
 */
export function isFormulaInjection(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[=+\-@\t\r]/.test(value);
}

/**
 * Strips formula injection prefix from a string value, returns cleaned value and a flag.
 */
export function stripFormulaInjection(value: string): { cleaned: string; wasFormula: boolean } {
  if (!isFormulaInjection(value)) return { cleaned: value, wasFormula: false };
  // Prepend a single quote to defuse, then return the raw value trimmed of leading trigger char
  return { cleaned: value.replace(/^[=+\-@\t\r]+/, '').trim(), wasFormula: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function suggestSimilar(normalized: string, entityType: ImportableEntityType): string | undefined {
  const defs = getImportColumnDefs(entityType);
  let bestKey: string | undefined;
  let bestScore = 0;
  for (const def of defs) {
    const score = jaroWinkler(normalized, def.key);
    if (score > bestScore && score > 0.82) {
      bestScore = score;
      bestKey = def.key;
    }
  }
  return bestKey;
}

/** Jaro-Winkler similarity in [0, 1]. */
function jaroWinkler(s: string, t: string): number {
  if (s === t) return 1;
  const sLen = s.length;
  const tLen = t.length;
  if (sLen === 0 || tLen === 0) return 0;

  const matchDist = Math.floor(Math.max(sLen, tLen) / 2) - 1;
  const sMatches = new Array<boolean>(sLen).fill(false);
  const tMatches = new Array<boolean>(tLen).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < sLen; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, tLen);
    for (let j = start; j < end; j++) {
      if (tMatches[j] || s[i] !== t[j]) continue;
      sMatches[i] = true;
      tMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < sLen; i++) {
    if (!sMatches[i]) continue;
    while (!tMatches[k]) k++;
    if (s[i] !== t[k]) transpositions++;
    k++;
  }

  const jaro = (matches / sLen + matches / tLen + (matches - transpositions / 2) / matches) / 3;
  const prefix = commonPrefixLen(s, t, 4);
  return jaro + prefix * 0.1 * (1 - jaro);
}

function commonPrefixLen(s: string, t: string, maxLen: number): number {
  let i = 0;
  while (i < maxLen && i < s.length && i < t.length && s[i] === t[i]) i++;
  return i;
}
