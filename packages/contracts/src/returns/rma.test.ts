import { describe, expect, it } from 'vitest';
import { assertReturnQuantityWithinInvoiced } from './rma.js';

describe('RMA quantity guard', () => {
  it('allows return up to invoiced quantity', () => {
    expect(() => assertReturnQuantityWithinInvoiced('2.000000', '5.000000')).not.toThrow();
    expect(() => assertReturnQuantityWithinInvoiced('5.000000', '5.000000')).not.toThrow();
  });

  it('rejects return above invoiced quantity', () => {
    expect(() => assertReturnQuantityWithinInvoiced('5.000001', '5.000000')).toThrow(
      'RETURN_QUANTITY_EXCEEDS_INVOICED',
    );
  });
});
