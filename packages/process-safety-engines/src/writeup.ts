// WI-OI-120cc (SPEED S8; FR-INP-07, FR-INP-08; decision D8: no AI in R1): a deterministic reading of a lab write-up or
// patent text. It finds quantities by pattern and names the reagents it knows from the workspace's own substances;
// nothing it finds is used until the chemist confirms it. It reads only the text it is given: no network, no model.

export const WRITEUP_TYPES = [
  'TEMPERATURE',
  'MASS',
  'VOLUME',
  'AMOUNT',
  'EQUIVALENTS',
  'TIME',
  'DOSING',
] as const;
export type WriteupType = (typeof WRITEUP_TYPES)[number];

/** The unit each type's value is given in. */
export const WRITEUP_UNITS: Readonly<Record<WriteupType, string | null>> = {
  TEMPERATURE: '°C',
  MASS: 'g',
  VOLUME: 'mL',
  AMOUNT: 'mol',
  EQUIVALENTS: 'equiv',
  TIME: 'min',
  DOSING: null,
};

export interface WriteupFinding {
  readonly type: WriteupType;
  /** Where it was found: [start, end) in the text. */
  readonly start: number;
  readonly end: number;
  /** The words found, as written. */
  readonly found: string;
  /** In WRITEUP_UNITS[type]; for a range, the upper bound (a temperature range's worst case). Null for dosing. */
  readonly value: number | null;
  /** For a range, the lower bound. */
  readonly low?: number;
}

export interface WriteupSubstance {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly casNumber: string | null;
}

export interface WriteupReagent {
  readonly substanceId: string;
  readonly start: number;
  readonly end: number;
  readonly found: string;
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
// A number standing alone: not part of a formula (C14H15FO3), a word or a longer number.
const BEFORE = String.raw`(?<![A-Za-z\d.\-])`;
const RANGE = String.raw`\s*(?:-|–|—|to)\s*`;

const SCALE: Readonly<Record<string, number>> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  µl: 0.001,
  ul: 0.001,
  ml: 1,
  l: 1000,
  mmol: 0.001,
  mol: 1,
  kmol: 1000,
  s: 1 / 60,
  sec: 1 / 60,
  second: 1 / 60,
  seconds: 1 / 60,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  day: 1440,
  days: 1440,
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

interface Pattern {
  readonly type: Exclude<WriteupType, 'DOSING'>;
  readonly expression: RegExp;
  /** The value from the match's groups: number, optional lower number of a range, unit. */
  readonly value: (match: RegExpExecArray) => { value: number; low?: number } | null;
}

const toCelsius = (value: number, unit: string) => {
  const u = unit.toUpperCase();
  if (u === 'F') return ((value - 32) * 5) / 9;
  if (u === 'K') return value - 273.15;
  return value;
};

const PATTERNS: readonly Pattern[] = [
  {
    type: 'TEMPERATURE',
    // 0–5 °C, -10 to 0 °C, 40 °C, 40°C, 40 deg C, 104 °F. A bare "K" is left alone: in a write-up it is usually a
    // temperature difference (ΔT 21 K), not a temperature.
    expression: new RegExp(
      String.raw`${BEFORE}(-?${NUMBER})(?:${RANGE}(-?${NUMBER}))?\s*(?:°\s*|º\s*|deg(?:rees?)?\s*)([CFK])\b`,
      'g',
    ),
    value: (match) => {
      const [first, second, unit] = [match[1], match[2], match[3] as string];
      const a = toCelsius(Number(first), unit);
      if (second === undefined) return { value: round(a) };
      const b = toCelsius(Number(second), unit);
      return { value: round(Math.max(a, b)), low: round(Math.min(a, b)) };
    },
  },
  {
    type: 'MASS',
    expression: new RegExp(String.raw`${BEFORE}(${NUMBER})\s*(mg|g|kg)\b`, 'g'),
    value: (match) => ({
      value: round(Number(match[1]) * (SCALE[(match[2] as string).toLowerCase()] as number)),
    }),
  },
  {
    type: 'VOLUME',
    expression: new RegExp(String.raw`${BEFORE}(${NUMBER})\s*(µL|uL|mL|ml|L)\b`, 'g'),
    value: (match) => ({
      value: round(Number(match[1]) * (SCALE[(match[2] as string).toLowerCase()] as number)),
    }),
  },
  {
    type: 'AMOUNT',
    expression: new RegExp(String.raw`${BEFORE}(${NUMBER})\s*(mmol|kmol|mol)\b`, 'g'),
    value: (match) => ({
      value: round(Number(match[1]) * (SCALE[(match[2] as string).toLowerCase()] as number)),
    }),
  },
  {
    type: 'EQUIVALENTS',
    expression: new RegExp(
      String.raw`${BEFORE}(${NUMBER})\s*(?:equiv(?:alents?)?|eq)\.?(?![A-Za-z])`,
      'gi',
    ),
    value: (match) => ({ value: round(Number(match[1])) }),
  },
  {
    type: 'TIME',
    // 2 h, 30 min, 1.5 hours, 12 hrs; a range takes its upper bound
    expression: new RegExp(
      String.raw`${BEFORE}(${NUMBER})(?:${RANGE}(${NUMBER}))?\s*(seconds?|sec|s|minutes?|mins?|hours?|hrs?|h|days?)\b`,
      'gi',
    ),
    value: (match) => {
      const scale = SCALE[(match[3] as string).toLowerCase()] as number;
      const a = Number(match[1]) * scale;
      if (match[2] === undefined) return { value: round(a) };
      const b = Number(match[2]) * scale;
      return { value: round(Math.max(a, b)), low: round(Math.min(a, b)) };
    },
  },
];

// How a reagent was added: the chemist reads these and confirms them as dosing notes.
const DOSING =
  /\b(?:dropwise|drop-wise|portionwise|portion-wise|in (?:\w+ )?portions|slowly|via (?:a )?syringe pump|via (?:an )?addition funnel|over (?:a period of )?\d+(?:\.\d+)?\s*(?:min|minutes|h|hours?))\b/gi;

/** The sentence around a match, trimmed, for the "Found" column. */
function sentenceAround(text: string, start: number, end: number): { start: number; end: number } {
  const before =
    Math.max(text.lastIndexOf('.', start - 1), text.lastIndexOf('\n', start - 1), -1) + 1;
  const stops = ['.', '\n'].map((stop) => text.indexOf(stop, end)).filter((index) => index >= 0);
  const after = stops.length ? Math.min(...stops) : text.length;
  let from = before;
  while (from < after && /\s/.test(text[from] as string)) from += 1;
  return { start: from, end: after };
}

/** Every quantity and dosing statement in the text, in reading order; overlapping findings keep the first, longest. */
export function parseWriteup(text: string): WriteupFinding[] {
  const findings: WriteupFinding[] = [];
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern.expression)) {
      const start = match.index ?? 0;
      const parsed = pattern.value(match as RegExpExecArray);
      if (!parsed || !Number.isFinite(parsed.value)) continue;
      findings.push({
        type: pattern.type,
        start,
        end: start + match[0].length,
        found: match[0],
        ...parsed,
      });
    }
  }
  for (const match of text.matchAll(DOSING)) {
    const start = match.index ?? 0;
    const sentence = sentenceAround(text, start, start + match[0].length);
    findings.push({
      type: 'DOSING',
      start: sentence.start,
      end: sentence.end,
      found: text.slice(sentence.start, sentence.end),
      value: null,
    });
  }
  findings.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: WriteupFinding[] = [];
  for (const finding of findings) {
    // A dosing sentence may contain quantities; quantities may not overlap each other (12 h is not also 12 h and 2 h).
    const clash = kept.some(
      (other) =>
        finding.type !== 'DOSING' &&
        other.type !== 'DOSING' &&
        finding.start < other.end &&
        other.start < finding.end,
    );
    const sameDosing = kept.some(
      (other) =>
        finding.type === 'DOSING' && other.type === 'DOSING' && other.start === finding.start,
    );
    if (!clash && !sameDosing) kept.push(finding);
  }
  return kept;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The workspace's substances named in the text, by name, CAS number or formula; each substance once, first mention. */
export function recogniseReagents(
  text: string,
  substances: readonly WriteupSubstance[],
): WriteupReagent[] {
  const found: WriteupReagent[] = [];
  for (const substance of substances) {
    const names = [substance.name, substance.casNumber, substance.formula].filter(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length >= 2,
    );
    let first: WriteupReagent | null = null;
    for (const name of names) {
      // Names are matched without regard to case; a formula only as written, as a whole token.
      const flags = name === substance.formula ? 'g' : 'gi';
      const expression = new RegExp(String.raw`(?<![\w-])${escape(name.trim())}(?![\w-])`, flags);
      const match = expression.exec(text);
      if (match && (!first || match.index < first.start))
        first = {
          substanceId: substance.id,
          start: match.index,
          end: match.index + match[0].length,
          found: match[0],
        };
    }
    if (first) found.push(first);
  }
  return found.sort((a, b) => a.start - b.start);
}
