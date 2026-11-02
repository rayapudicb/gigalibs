import { describe, expect, it } from 'vitest';
import { SopStepsV1Schema, nextSopStep, sopOutcomeFits } from './sop.js';

// WI-OI-138: step validation and the shared path function.
const steps = SopStepsV1Schema.parse([
  { key: 'isolate', title: 'Isolate', instruction: 'Lock out the pump.', gate: { type: 'CONFIRM' }, dualSignoff: true },
  { key: 'rust', title: 'Rust?', instruction: 'Inspect the housing.', gate: { type: 'DECISION', question: 'Is it rusted?' }, onYes: 'oil', onNo: 'slide' },
  { key: 'oil', title: 'Oil', instruction: 'Apply penetrating oil.', gate: { type: 'NONE' }, next: 'slide' },
  { key: 'slide', title: 'Slide off', instruction: 'Slide off the shaft.', gate: { type: 'READING', unit: 'Nm', min: 40, max: 50 } },
]);
const result = (stepKey: string, outcome: 'CONFIRMED' | 'ANSWER_YES' | 'ANSWER_NO' | 'READING' | 'DONE', cosign: string | null = null, required = false) =>
  ({ stepKey, outcome, cosignRequired: required, cosignedBy: cosign });

describe('SOP steps', () => {
  it('walks the path, waits for a countersign and follows decisions', () => {
    expect(nextSopStep(steps, [])).toEqual({ state: 'NEXT', stepKey: 'isolate' });
    expect(nextSopStep(steps, [result('isolate', 'CONFIRMED', null, true)])).toEqual({ state: 'AWAITING_COSIGN', stepKey: 'isolate' });
    expect(nextSopStep(steps, [result('isolate', 'CONFIRMED', 'tech-2', true)])).toEqual({ state: 'NEXT', stepKey: 'rust' });
    expect(nextSopStep(steps, [result('isolate', 'CONFIRMED', 'tech-2', true), result('rust', 'ANSWER_NO')])).toEqual({ state: 'NEXT', stepKey: 'slide' });
    expect(nextSopStep(steps, [result('isolate', 'CONFIRMED', 'tech-2', true), result('rust', 'ANSWER_YES'), result('oil', 'DONE'), result('slide', 'READING')]))
      .toEqual({ state: 'END' });
    expect(() => nextSopStep(steps, [result('rust', 'ANSWER_NO')])).toThrow('off the path');
  });

  it('refuses duplicate keys, unknown targets and loops', () => {
    const base = { title: 't', instruction: 'i', gate: { type: 'NONE' } };
    expect(SopStepsV1Schema.safeParse([{ key: 'a', ...base }, { key: 'a', ...base }]).success).toBe(false);
    expect(SopStepsV1Schema.safeParse([{ key: 'a', ...base, next: 'zzz' }]).success).toBe(false);
    expect(SopStepsV1Schema.safeParse([{ key: 'a', ...base, next: 'b' }, { key: 'b', ...base, next: 'a' }]).success).toBe(false);
    expect(SopStepsV1Schema.safeParse([{ key: 'a', ...base, onYes: 'a' }]).success).toBe(false);
  });

  it('matches outcomes to gates', () => {
    expect(sopOutcomeFits({ type: 'READING', unit: 'Nm' }, 'READING')).toBe(true);
    expect(sopOutcomeFits({ type: 'DECISION', question: 'q' }, 'CONFIRMED')).toBe(false);
    expect(sopOutcomeFits({ type: 'NONE' }, 'DONE')).toBe(true);
  });
});
