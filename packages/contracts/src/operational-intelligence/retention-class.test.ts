import { describe, expect, it } from 'vitest';
import {
  CreateRetentionClassSchema,
  RETENTION_CLASS_PRESETS,
  RetentionClassKeySchema,
  UpdateRetentionClassSchema,
  effectiveRetentionDays,
  legalHoldBlocksPurge,
  retentionCutoff,
} from './index.js';

// WI-OI-120 (T9b): the pure retention-class logic shared by the control plane, the purge worker and their tests.
describe('retention class — pure helpers', () => {
  it('retentionCutoff subtracts the period from now', () => {
    const now = new Date('2026-10-26T00:00:00.000Z');
    expect(retentionCutoff(90, now).toISOString()).toBe('2026-07-28T00:00:00.000Z');
    expect(retentionCutoff(1, now).toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });

  it('effectiveRetentionDays prefers the adopted class, else the environment period', () => {
    expect(effectiveRetentionDays({ retentionDays: 365 }, null)).toBe(365);
    expect(effectiveRetentionDays({ retentionDays: 365 }, undefined)).toBe(365);
    expect(effectiveRetentionDays({ retentionDays: 365 }, { retentionDays: 90 })).toBe(90);
  });

  it('a legal hold blocks the purge only while it is active', () => {
    expect(legalHoldBlocksPurge([])).toBe(false);
    expect(legalHoldBlocksPurge([{ status: 'RELEASED' }])).toBe(false);
    expect(legalHoldBlocksPurge([{ status: 'RELEASED' }, { status: 'ACTIVE' }])).toBe(true);
  });
});

describe('retention class — schemas', () => {
  it('accepts a well-formed class and applies defaults', () => {
    const parsed = CreateRetentionClassSchema.parse({
      key: 'financial-records',
      name: 'Financial records',
      retentionDays: 2555,
    });
    expect(parsed.basis).toBe('OPERATIONAL');
    expect(parsed.isDefault).toBe(false);
  });

  it('rejects a bad key, a zero/overlong period, and an unknown basis', () => {
    expect(
      CreateRetentionClassSchema.safeParse({ key: 'Bad_Key', name: 'x', retentionDays: 30 })
        .success,
    ).toBe(false);
    expect(
      CreateRetentionClassSchema.safeParse({ key: 'ok', name: 'x', retentionDays: 0 }).success,
    ).toBe(false);
    expect(
      CreateRetentionClassSchema.safeParse({ key: 'ok', name: 'x', retentionDays: 36_501 }).success,
    ).toBe(false);
    expect(
      CreateRetentionClassSchema.safeParse({
        key: 'ok',
        name: 'x',
        retentionDays: 30,
        basis: 'WHIM',
      }).success,
    ).toBe(false);
  });

  it('an update must change at least one field', () => {
    expect(UpdateRetentionClassSchema.safeParse({}).success).toBe(false);
    expect(UpdateRetentionClassSchema.safeParse({ description: null }).success).toBe(true);
    expect(UpdateRetentionClassSchema.safeParse({ retentionDays: 180 }).success).toBe(true);
  });
});

describe('retention class — presets', () => {
  it('every preset has a valid key, a bounded period and a distinct key', () => {
    const keys = new Set<string>();
    for (const preset of RETENTION_CLASS_PRESETS) {
      expect(RetentionClassKeySchema.safeParse(preset.key).success).toBe(true);
      expect(preset.retentionDays).toBeGreaterThanOrEqual(1);
      expect(preset.retentionDays).toBeLessThanOrEqual(36_500);
      keys.add(preset.key);
    }
    expect(keys.size).toBe(RETENTION_CLASS_PRESETS.length);
  });
});
