import { describe, expect, it } from 'vitest';
import { consecutiveAbove, rateOfChange, rollingAvg } from './telemetry-operators.js';

const series = [
  { value: 1, readAtMs: 0 },
  { value: 2, readAtMs: 1000 },
  { value: 4, readAtMs: 2000 },
  { value: 8, readAtMs: 3000 },
];

describe('telemetry-operators', () => {
  it('computes rolling average inside the window', () => {
    expect(rollingAvg(series, 2500)).toBeCloseTo(4.666, 2);
  });

  it('computes rate of change per second', () => {
    expect(rateOfChange(series, 3000)).toBeCloseTo(2.333, 2);
  });

  it('detects consecutive readings above threshold', () => {
    expect(consecutiveAbove(series, 3, 2)).toBe(true);
    expect(consecutiveAbove(series, 5, 2)).toBe(false);
  });
});
