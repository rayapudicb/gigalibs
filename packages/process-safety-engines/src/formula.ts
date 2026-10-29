import type { ElementCounts, ElementTable, EngineMessage } from './types.js';

export type FormulaResult =
  | { readonly ok: true; readonly counts: ElementCounts }
  | { readonly ok: false; readonly error: EngineMessage };

const formulaError = (code: string, params?: EngineMessage['params']): FormulaResult => ({
  ok: false,
  error: params ? { code, requirement: 'FR-GATE-01', params } : { code, requirement: 'FR-GATE-01' },
});

function addInto(
  target: Record<string, number>,
  source: Readonly<Record<string, number>>,
  factor: number,
): void {
  for (const [element, count] of Object.entries(source))
    target[element] = (target[element] ?? 0) + count * factor;
}

function readDigits(
  text: string,
  start: number,
): { readonly value: number | null; readonly next: number } {
  let index = start;
  while (index < text.length && /\d/.test(text.charAt(index))) index += 1;
  return {
    value: index > start ? Number.parseInt(text.slice(start, index), 10) : null,
    next: index,
  };
}

/** One part of a formula, without hydrate dots: elements, counts and nested () or [] groups. */
function parseGroup(text: string, elements: ElementTable): FormulaResult {
  const stack: Record<string, number>[] = [{}];
  let index = 0;
  while (index < text.length) {
    const ch = text.charAt(index);
    if (ch === '(' || ch === '[') {
      stack.push({});
      index += 1;
      continue;
    }
    if (ch === ')' || ch === ']') {
      const group = stack.pop();
      const parent = stack[stack.length - 1];
      if (!group || !parent) return formulaError('FORMULA_UNMATCHED_BRACKET', { bracket: ch });
      const digits = readDigits(text, index + 1);
      addInto(parent, group, digits.value ?? 1);
      index = digits.next;
      continue;
    }
    if (/[A-Z]/.test(ch)) {
      let symbol = ch;
      index += 1;
      while (index < text.length && /[a-z]/.test(text.charAt(index))) {
        symbol += text.charAt(index);
        index += 1;
      }
      if (!(symbol in elements.elements))
        return formulaError('FORMULA_UNKNOWN_ELEMENT', { element: symbol });
      const digits = readDigits(text, index);
      const current = stack[stack.length - 1] as Record<string, number>;
      current[symbol] = (current[symbol] ?? 0) + (digits.value ?? 1);
      index = digits.next;
      continue;
    }
    return formulaError('FORMULA_UNEXPECTED_CHARACTER', { character: ch });
  }
  if (stack.length !== 1) return formulaError('FORMULA_UNCLOSED_BRACKET');
  return { ok: true, counts: stack[0] as ElementCounts };
}

/**
 * Parses a molecular formula with brackets and hydrates: Al(OH)3, CuSO4·5H2O, (C2H6N2S)2·H2SO4, KNaC4H4O6·4H2O.
 * The hydrate separators "·", "•" and "*" are accepted.
 */
export function parseFormula(
  raw: string | null | undefined,
  elements: ElementTable,
): FormulaResult {
  const text = (raw ?? '').replace(/\s+/g, '');
  if (!text) return formulaError('FORMULA_EMPTY');
  const total: Record<string, number> = {};
  for (const part of text.split(/[·•*]/)) {
    if (!part) return formulaError('FORMULA_EMPTY_HYDRATE_PART');
    const multiplier = /^(\d+)(.+)$/.exec(part);
    const body = multiplier ? (multiplier[2] as string) : part;
    const factor = multiplier ? Number.parseInt(multiplier[1] as string, 10) : 1;
    const parsed = parseGroup(body, elements);
    if (!parsed.ok) return parsed;
    addInto(total, parsed.counts, factor);
  }
  return { ok: true, counts: total };
}

/** Molar mass, g/mol, from element counts. Every element in `counts` was checked against `elements` by the parser. */
export function molarMass(counts: ElementCounts, elements: ElementTable): number {
  let mass = 0;
  for (const [symbol, count] of Object.entries(counts)) {
    const element = elements.elements[symbol];
    if (!element) throw new Error(`Element ${symbol} is not in element table ${elements.version}.`);
    mass += element.weight * count;
  }
  return mass;
}

/** Hill order as used for library keys: C first, then H (also when there is no carbon), then the others alphabetically. */
export function hillOrder(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'C') return -1;
  if (b === 'C') return 1;
  if (a === 'H') return -1;
  if (b === 'H') return 1;
  return a.localeCompare(b);
}

/** Canonical Hill formula, used as the key for library lookups (ΔHf°, gases). */
export function hillFormula(counts: ElementCounts): string {
  return Object.keys(counts)
    .filter((symbol) => (counts[symbol] ?? 0) > 0)
    .sort(hillOrder)
    .map((symbol) => (counts[symbol] === 1 ? symbol : `${symbol}${counts[symbol]}`))
    .join('');
}
