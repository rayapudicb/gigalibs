import { describe, expect, it } from 'vitest';
import { convertUnit, normalizeUnit } from './units.js';

// WI-OI-104e: mapping unit conversion (agriculture plan: kg, quintal, t; plus area and volume).
describe('analytics units', () => {
  it('converts within a dimension and refuses across dimensions', () => {
    expect(convertUnit(12, 'quintal', 'kg')).toBe(1200);
    expect(convertUnit(2.5, 't', 'quintal')).toBe(25);
    expect(convertUnit(1200, 'kg', 't')).toBe(1.2);
    expect(convertUnit(1, 'acre', 'ha')).toBeCloseTo(0.4046856, 6);
    expect(convertUnit(3, 'm3', 'L')).toBe(3000);
    expect(convertUnit(1, 'lb', 'kg')).toBeCloseTo(0.45359237, 8);
    expect(convertUnit(5, 'kg', 'ha')).toBeNull();
    expect(convertUnit(Number.NaN, 'kg', 'g')).toBeNull();
  });

  it('reads the units sources write', () => {
    expect(['Quintals', ' qtl ', 'KG', 'Tonnes', 'metric ton', 'Hectares', 'litres', 'm³'].map(normalizeUnit)).toEqual(['quintal', 'quintal', 'kg', 't', 't', 'ha', 'L', 'm3']);
    expect(normalizeUnit('bushel')).toBeNull();
    expect(normalizeUnit(12)).toBeNull();
  });
});
