import { describe, expect, it } from 'vitest';
import type { RmaV1 } from '@gigalibs/contracts';
import { deriveRmaChecklistSteps } from './checklist.js';

const baseRma: RmaV1 = {
  id: '00000000-0000-4000-8000-000000000001',
  tenantId: 't1',
  rmaNumber: 'RMA-1',
  status: 'DRAFT',
  customerPartyId: '00000000-0000-4000-8000-000000000002',
  salesOrderId: null,
  customerInvoiceId: null,
  ordersReturnId: null,
  reason: 'Damaged',
  version: 1,
  lines: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      lineNumber: 1,
      productId: '00000000-0000-4000-8000-000000000004',
      uomId: '00000000-0000-4000-8000-000000000005',
      requestedQuantity: '2',
      authorizedQuantity: '0',
      receivedQuantity: '0',
      invoicedQuantityCap: '2',
      salesOrderLineId: null,
      customerInvoiceLineId: null,
    },
  ],
  createdBy: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('deriveRmaChecklistSteps', () => {
  it('marks submit and authorize from status', () => {
    const draft = deriveRmaChecklistSteps(baseRma);
    expect(draft.find((s) => s.key === 'submit')?.done).toBe(false);
    expect(draft.find((s) => s.key === 'authorize')?.done).toBe(false);

    const authorized = deriveRmaChecklistSteps({ ...baseRma, status: 'AUTHORIZED' });
    expect(authorized.find((s) => s.key === 'submit')?.done).toBe(true);
    expect(authorized.find((s) => s.key === 'authorize')?.done).toBe(true);
  });

  it('marks inspect done when received covers authorized qty', () => {
    const rma: RmaV1 = {
      ...baseRma,
      status: 'AUTHORIZED',
      lines: [{ ...baseRma.lines[0]!, authorizedQuantity: '2', receivedQuantity: '2' }],
    };
    expect(deriveRmaChecklistSteps(rma).find((s) => s.key === 'inspect')?.done).toBe(true);
  });
});
