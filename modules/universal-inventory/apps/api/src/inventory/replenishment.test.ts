import { ExactDecimal } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { calculateReplenishment } from './replenishment.js';

const eq = (a: string, b: string) => ExactDecimal.compare(a, b) === 0;

describe('calculateReplenishment (min–max, pack-aware)', () => {
  it('does nothing while stock is above the reorder point', () => {
    const r = calculateReplenishment('50', { minQuantity: '20', maxQuantity: '100', packSize: '1' });
    expect(r.shouldReplenish).toBe(false);
    expect(eq(r.suggestedQuantity, '0')).toBe(true);
    expect(eq(r.packs, '0')).toBe(true);
  });

  it('replenishes up to max when stock sits exactly on the reorder point', () => {
    const r = calculateReplenishment('20', { minQuantity: '20', maxQuantity: '100', packSize: '1' });
    expect(r.shouldReplenish).toBe(true);
    expect(eq(r.suggestedQuantity, '80')).toBe(true);
    expect(eq(r.packs, '80')).toBe(true);
  });

  it('rounds the suggestion UP to a whole number of packs', () => {
    // need = 100 - 10 = 90; ceil(90 / 12) = 8 packs = 96.
    const r = calculateReplenishment('10', { minQuantity: '20', maxQuantity: '100', packSize: '12' });
    expect(r.shouldReplenish).toBe(true);
    expect(eq(r.suggestedQuantity, '96')).toBe(true);
    expect(eq(r.packs, '8')).toBe(true);
  });

  it('does not add an extra pack when the need is an exact multiple', () => {
    const r = calculateReplenishment('0', { minQuantity: '0', maxQuantity: '48', packSize: '12' });
    expect(r.shouldReplenish).toBe(true);
    expect(eq(r.suggestedQuantity, '48')).toBe(true);
    expect(eq(r.packs, '4')).toBe(true);
  });

  it('handles fractional pack sizes exactly', () => {
    // need = 20 - 2.5 = 17.5; ceil(17.5 / 2.5) = 7 packs = 17.5.
    const r = calculateReplenishment('2.5', { minQuantity: '5', maxQuantity: '20', packSize: '2.5' });
    expect(r.shouldReplenish).toBe(true);
    expect(eq(r.suggestedQuantity, '17.5')).toBe(true);
    expect(eq(r.packs, '7')).toBe(true);
  });

  it('orders nothing when min, max and available are equal', () => {
    const r = calculateReplenishment('20', { minQuantity: '20', maxQuantity: '20', packSize: '10' });
    expect(r.shouldReplenish).toBe(false);
    expect(eq(r.suggestedQuantity, '0')).toBe(true);
  });

  it('refuses a negative available quantity', () => {
    expect(() => calculateReplenishment('-1', { minQuantity: '0', maxQuantity: '10', packSize: '1' })).toThrow();
  });

  it('refuses a maximum below the minimum', () => {
    expect(() => calculateReplenishment('5', { minQuantity: '20', maxQuantity: '10', packSize: '1' })).toThrow();
  });

  it('refuses a non-positive pack size', () => {
    expect(() => calculateReplenishment('5', { minQuantity: '20', maxQuantity: '100', packSize: '0' })).toThrow();
  });
});
