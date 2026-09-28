import { describe, expect, it } from 'vitest';
import {
  formatOptionsForDisplay,
  normalizeOptionValue,
  parseOptionsInput,
} from '../lib/form-options-parser';

describe('form-options-parser', () => {
  it('parses standard comma-separated options', () => {
    const input = 'Active, Inactive, Pending';
    const result = parseOptionsInput(input);
    expect(result).toEqual([
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
      { label: 'Pending', value: 'pending' },
    ]);
  });

  it('handles irregular spaces and trailing/leading commas without dropping tokens', () => {
    const input = ' ,  Option A ,   Option B ,  Option C ,  ';
    const result = parseOptionsInput(input);
    expect(result).toEqual([
      { label: 'Option A', value: 'option-a' },
      { label: 'Option B', value: 'option-b' },
      { label: 'Option C', value: 'option-c' },
    ]);
  });

  it('parses explicit key-value pairs using colon or equals', () => {
    const input = 'act: Active Account, inact: Inactive Account, arch=Archived';
    const result = parseOptionsInput(input);
    expect(result).toEqual([
      { label: 'Active Account', value: 'act' },
      { label: 'Inactive Account', value: 'inact' },
      { label: 'Archived', value: 'arch' },
    ]);
  });

  it('parses newline-separated options (multiline paste from spreadsheets)', () => {
    const input = `Small (1-10)
Medium (11-50)
Large (51-250)
Enterprise (250+)`;
    const result = parseOptionsInput(input);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ label: 'Small (1-10)', value: 'small-1-10' });
    expect(result[3]).toEqual({ label: 'Enterprise (250+)', value: 'enterprise-250' });
  });

  it('parses semicolon-separated options', () => {
    const input = 'High; Medium; Low';
    const result = parseOptionsInput(input);
    expect(result).toEqual([
      { label: 'High', value: 'high' },
      { label: 'Medium', value: 'medium' },
      { label: 'Low', value: 'low' },
    ]);
  });

  it('deduplicates identical values cleanly to prevent schema collision', () => {
    const input = 'Review, Review, Review';
    const result = parseOptionsInput(input);
    expect(result).toEqual([
      { label: 'Review', value: 'review' },
      { label: 'Review', value: 'review-2' },
      { label: 'Review', value: 'review-3' },
    ]);
  });

  it('formats options back to display string correctly', () => {
    const options = [
      { label: 'Active', value: 'active' },
      { label: 'Custom Label', value: 'cust_val' },
    ];
    const formatted = formatOptionsForDisplay(options);
    expect(formatted).toBe('Active, cust_val: Custom Label');
  });

  it('returns empty array for empty or whitespace-only inputs', () => {
    expect(parseOptionsInput('')).toEqual([]);
    expect(parseOptionsInput('   ')).toEqual([]);
    expect(parseOptionsInput(',,,')).toEqual([]);
  });
});
