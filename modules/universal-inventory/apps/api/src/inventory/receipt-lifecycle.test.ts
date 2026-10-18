import { DocumentGuardRefusedError } from '@gigalibs/document-lifecycle';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  INVENTORY_RECEIPT_COMPLETE_FROM,
  mapInventoryReceiptLifecycleError,
  runInventoryReceiptTransition,
} from './receipt-lifecycle.js';

describe('inventory receipt lifecycle (F1.3)', () => {
  it('documents allowed complete sources', () => {
    expect(INVENTORY_RECEIPT_COMPLETE_FROM).toEqual(['DRAFT', 'EXPECTED', 'RECEIVING']);
  });

  it('runs complete from DRAFT', async () => {
    const persistComplete = vi.fn(async () => ({ id: 'r1', status: 'COMPLETED' }));
    const result = await runInventoryReceiptTransition(
      {
        tenantId: 't1',
        actorId: 'u1',
        lineCount: 1,
        persistComplete,
      },
      { id: 'r1', status: 'DRAFT', version: 2 },
      'complete',
      2,
    );
    expect(result).toEqual({ id: 'r1', status: 'COMPLETED' });
    expect(persistComplete).toHaveBeenCalledOnce();
  });

  it('refuses complete with no lines', async () => {
    await expect(
      runInventoryReceiptTransition(
        {
          tenantId: 't1',
          actorId: 'u1',
          lineCount: 0,
          persistComplete: vi.fn(),
        },
        { id: 'r1', status: 'DRAFT', version: 1 },
        'complete',
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses complete when already completed', async () => {
    await expect(
      runInventoryReceiptTransition(
        {
          tenantId: 't1',
          actorId: 'u1',
          lineCount: 1,
          persistComplete: vi.fn(),
        },
        { id: 'r1', status: 'COMPLETED', version: 3 },
        'complete',
        3,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps guard errors to BadRequestException', () => {
    expect(() =>
      mapInventoryReceiptLifecycleError(new DocumentGuardRefusedError('complete', 'bad')),
    ).toThrow(BadRequestException);
  });
});
