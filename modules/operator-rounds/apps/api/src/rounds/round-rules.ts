import type { CaptureRoundReadingV1, RoundCheckpointDraftV1 } from '@gigalibs/contracts';

const SCALE = 1_000_000n;

export class RoundRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RoundRuleError';
  }
}

/** Compare PostgreSQL numeric(18,6) values exactly without floating-point threshold drift. */
export function scaledDecimal(value: string): bigint {
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new RoundRuleError('INVALID_DECIMAL', 'Use a decimal with up to six places.');
  return (match[1] === '-' ? -1n : 1n) * (BigInt(match[2]!) * SCALE + BigInt((match[3] ?? '').padEnd(6, '0')));
}

const compare = (a: string | null, b: string | null, relation: (a: bigint, b: bigint) => boolean): boolean =>
  a !== null && b !== null && relation(scaledDecimal(a), scaledDecimal(b));

export function validateCheckpointSet(checkpoints: readonly RoundCheckpointDraftV1[]): void {
  if (checkpoints.length === 0) throw new RoundRuleError('EMPTY_ROUTE', 'A route needs at least one checkpoint.');
  const positions = new Set<number>();
  for (const point of checkpoints) {
    if (positions.has(point.position)) throw new RoundRuleError('DUPLICATE_POSITION', 'Checkpoint positions must be unique.');
    positions.add(point.position);
    if (point.readingKind === 'NUMERIC') {
      if (!point.unitCode) throw new RoundRuleError('UNIT_REQUIRED', 'A numeric reading needs a unit.');
      const bounds = [point.redLow, point.amberLow, point.nominal, point.amberHigh, point.redHigh]
        .filter((value): value is string => value !== null)
        .map(scaledDecimal);
      if (bounds.some((value, index) => index > 0 && value < bounds[index - 1]!))
        throw new RoundRuleError('THRESHOLD_ORDER', 'Thresholds must progress from red low to red high.');
      if (point.choices.length > 0) throw new RoundRuleError('CHOICES_NOT_ALLOWED', 'Numeric checkpoints cannot have choices.');
    } else {
      if (point.unitCode || point.nominal || point.amberLow || point.amberHigh || point.redLow || point.redHigh)
        throw new RoundRuleError('NUMERIC_FIELDS_NOT_ALLOWED', 'Only numeric checkpoints use units and thresholds.');
      if (point.readingKind === 'CHOICE' && point.choices.length < 2)
        throw new RoundRuleError('CHOICES_REQUIRED', 'A choice checkpoint needs at least two choices.');
    }
    for (const rule of point.branchRules) {
      if (rule.nextPosition <= point.position) throw new RoundRuleError('BRANCH_CYCLE', 'A branch must move forward.');
    }
  }
  for (const point of checkpoints) {
    for (const rule of point.branchRules) {
      if (!positions.has(rule.nextPosition)) throw new RoundRuleError('BRANCH_TARGET', 'A branch target must exist in the route.');
    }
  }
}

export function classifyReading(checkpoint: RoundCheckpointDraftV1, reading: CaptureRoundReadingV1): 'NORMAL' | 'AMBER' | 'RED' {
  if (checkpoint.tagCode !== reading.scannedTag)
    throw new RoundRuleError('TAG_MISMATCH', 'Scan the tag assigned to this checkpoint.');
  if (checkpoint.readingKind === 'NUMERIC') {
    if (reading.numericValue === null || reading.choiceValue !== null)
      throw new RoundRuleError('NUMERIC_REQUIRED', 'This checkpoint needs a numeric value.');
    scaledDecimal(reading.numericValue);
    if (compare(reading.numericValue, checkpoint.redLow, (a, b) => a < b) ||
        compare(reading.numericValue, checkpoint.redHigh, (a, b) => a > b)) return 'RED';
    if (compare(reading.numericValue, checkpoint.amberLow, (a, b) => a < b) ||
        compare(reading.numericValue, checkpoint.amberHigh, (a, b) => a > b)) return 'AMBER';
    return 'NORMAL';
  }
  if (reading.numericValue !== null || reading.choiceValue === null)
    throw new RoundRuleError('CHOICE_REQUIRED', 'Choose a checkpoint value.');
  if (checkpoint.readingKind === 'BOOLEAN' && !['PASS', 'FLAG', 'FAIL'].includes(reading.choiceValue))
    throw new RoundRuleError('BOOLEAN_VALUE', 'Use PASS, FLAG or FAIL.');
  if (checkpoint.readingKind === 'CHOICE' && !checkpoint.choices.includes(reading.choiceValue))
    throw new RoundRuleError('UNKNOWN_CHOICE', 'This value is not in the published route.');
  return reading.choiceValue === 'FAIL' ? 'RED' : reading.choiceValue === 'FLAG' ? 'AMBER' : 'NORMAL';
}
