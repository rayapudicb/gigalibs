import { describe, expect, it } from 'vitest';
import { computePendingUninvoicedMinor } from '../orders/orders.service.js';

describe('computePendingUninvoicedMinor', () => {
  it('sums uninvoiced line totals proportionally', () => {
    expect(
      computePendingUninvoicedMinor([
        { ordered_quantity: '10', invoiced_quantity: '0', line_total_minor: '1000' },
        { ordered_quantity: '4', invoiced_quantity: '2', line_total_minor: '400' },
        { ordered_quantity: '5', invoiced_quantity: '5', line_total_minor: '500' },
      ]),
    ).toBe(1200n);
  });
});
