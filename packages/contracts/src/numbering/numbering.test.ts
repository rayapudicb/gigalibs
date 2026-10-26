import { describe, expect, it } from 'vitest';
import {
  NumberingPatternSchema,
  NumberingSeriesSchema,
  renderDocumentNumber,
  sequencePeriodKey,
} from './index.js';

// WI-OI-120 (Phase 4, S13 numbering): the pure document-numbering engine.
const at = new Date('2026-03-09T00:00:00.000Z');

describe('renderDocumentNumber', () => {
  it('pads the sequence and fills date tokens from the UTC date', () => {
    expect(renderDocumentNumber('PO-{YYYY}-{SEQ:5}', 42, at)).toBe('PO-2026-00042');
    expect(renderDocumentNumber('INV{YY}{MM}-{SEQ:4}', 7, at)).toBe('INV2603-0007');
    expect(renderDocumentNumber('WO-{SEQ}', 1234, at)).toBe('WO-1234');
    expect(renderDocumentNumber('{YYYY}{MM}{DD}-{SEQ:3}', 1, at)).toBe('20260309-001');
  });

  it('does not truncate a sequence wider than its padding', () => {
    expect(renderDocumentNumber('N-{SEQ:3}', 12345, at)).toBe('N-12345');
  });
});

describe('sequencePeriodKey', () => {
  it('buckets a date by the reset policy', () => {
    expect(sequencePeriodKey('NEVER', at)).toBe('all');
    expect(sequencePeriodKey('YEARLY', at)).toBe('2026');
    expect(sequencePeriodKey('MONTHLY', at)).toBe('2026-03');
    expect(sequencePeriodKey('DAILY', at)).toBe('2026-03-09');
  });
});

describe('NumberingPatternSchema', () => {
  it('requires exactly one SEQ token and only known tokens', () => {
    expect(NumberingPatternSchema.safeParse('PO-{YYYY}-{SEQ:5}').success).toBe(true);
    expect(NumberingPatternSchema.safeParse('PO-{YYYY}').success).toBe(false); // no SEQ
    expect(NumberingPatternSchema.safeParse('{SEQ}-{SEQ}').success).toBe(false); // two SEQ
    expect(NumberingPatternSchema.safeParse('PO-{WEEK}-{SEQ}').success).toBe(false); // unknown token
    expect(NumberingPatternSchema.safeParse('PO-{SEQ:0}').success).toBe(false); // padding 0 (needs 1-12)
    expect(NumberingPatternSchema.safeParse('PO-{SEQ:13}').success).toBe(false); // padding too wide
  });

  it('a series applies its defaults', () => {
    const series = NumberingSeriesSchema.parse({ key: 'purchase-orders', pattern: 'PO-{SEQ:5}' });
    expect(series.resetPolicy).toBe('NEVER');
    expect(series.start).toBe(1);
  });
});
