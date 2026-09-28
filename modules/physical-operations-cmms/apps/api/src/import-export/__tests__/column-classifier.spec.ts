import { describe, it, expect } from 'vitest';
import { classifyHeader, classifyHeaders, isFormulaInjection, stripFormulaInjection } from '../column-classifier.js';

describe('classifyHeader', () => {
  const aliases = new Map<string, string>([['equipment_name', 'name']]);

  it('recognizes exact match', () => {
    const cls = classifyHeader('name', 'assets', new Map());
    expect(cls.kind).toBe('known');
  });

  it('normalizes whitespace and casing', () => {
    const cls = classifyHeader('Asset Tag', 'assets', new Map());
    expect(cls.kind).toBe('known');
  });

  it('resolves alias', () => {
    const cls = classifyHeader('equipment_name', 'assets', aliases);
    expect(cls.kind).toBe('alias');
    if (cls.kind === 'alias') expect(cls.resolvedKey).toBe('name');
  });

  it('classifies spec_ prefix', () => {
    const cls = classifyHeader('spec_voltage', 'assets', new Map());
    expect(cls.kind).toBe('spec-jsonb');
  });

  it('classifies custom_ prefix', () => {
    const cls = classifyHeader('custom_warranty_tier', 'assets', new Map());
    expect(cls.kind).toBe('custom-jsonb');
  });

  it('marks unrecognized columns', () => {
    const cls = classifyHeader('foobar_xyz_unknown', 'assets', new Map());
    expect(cls.kind).toBe('unrecognized');
  });
});

describe('classifyHeaders', () => {
  it('produces parallel classifications array', () => {
    const headers = ['name', 'asset_tag', 'spec_voltage', 'unknown_col'];
    const { classifications, warnings } = classifyHeaders(headers, 'assets', new Map());
    expect(classifications).toHaveLength(4);
    expect(classifications[0]?.kind).toBe('known');
    expect(classifications[2]?.kind).toBe('spec-jsonb');
    expect(classifications[3]?.kind).toBe('unrecognized');
    expect(warnings.some((w) => w.reason === 'UNRECOGNIZED')).toBe(true);
  });
});

describe('formula injection', () => {
  it.each([['=SUM(A1:A10)'], ['+1'], ['-1'], ['@cmd'], ['\t=evil']])(
    'detects formula: %s',
    (val) => {
      expect(isFormulaInjection(val)).toBe(true);
    },
  );

  it('does not flag normal strings', () => {
    expect(isFormulaInjection('Pump A')).toBe(false);
    expect(isFormulaInjection(42)).toBe(false);
  });

  it('strips formula prefix', () => {
    const { cleaned, wasFormula } = stripFormulaInjection('=HYPERLINK("evil.com")');
    expect(wasFormula).toBe(true);
    expect(cleaned).not.toMatch(/^=/);
  });
});
