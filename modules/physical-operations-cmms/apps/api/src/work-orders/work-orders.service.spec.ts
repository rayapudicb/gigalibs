/**
 * WI-OI-038 — work-order contract rules: the lifecycle table, request keys, task limits and validation that
 * the service enforces before any SQL runs. Transactions, numbering, completion guards and concurrency are
 * certified live by verify-cmms-journey.sh.
 */
import {
  CMMS_WORK_ORDER_TRANSITIONS,
  ChangeCmmsWorkOrderStatusV1Schema,
  CreateCmmsWorkOrderV1Schema,
  LogCmmsLabourV1Schema,
  RecordCmmsStockMovementV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

describe('CMMS work-order rules', () => {
  it('makes COMPLETED and CANCELLED terminal and forbids skipping execution', () => {
    expect(CMMS_WORK_ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(CMMS_WORK_ORDER_TRANSITIONS.CANCELLED).toEqual([]);
    expect(CMMS_WORK_ORDER_TRANSITIONS.OPEN).not.toContain('COMPLETED');
    expect(CMMS_WORK_ORDER_TRANSITIONS.ON_HOLD).toEqual(['IN_PROGRESS', 'CANCELLED']);
  });

  it('requires a request key and rejects unknown fields', () => {
    expect(() => parseInput(CreateCmmsWorkOrderV1Schema, { type: 'REACTIVE', title: 'Leak' })).toThrow(BadRequestException);
    expect(() =>
      parseInput(CreateCmmsWorkOrderV1Schema, {
        requestKey: '0b9c7d1e-2f3a-4b5c-8d6e-7f8091a2b3c4',
        type: 'REACTIVE',
        title: 'Leak',
        tenantId: 'another-tenant',
      }),
    ).toThrow(BadRequestException);
    const parsed = parseInput(CreateCmmsWorkOrderV1Schema, {
      requestKey: '0b9c7d1e-2f3a-4b5c-8d6e-7f8091a2b3c4',
      type: 'REACTIVE',
      title: ' Leak ',
      tasks: [{ label: 'Isolate' }],
    });
    expect(parsed).toMatchObject({ title: 'Leak', priority: 'MEDIUM', requiresSignature: false, tasks: [{ label: 'Isolate', required: true }] });
  });

  it('caps tasks at 50 and needs a currency with a labour rate', () => {
    const tasks = Array.from({ length: 51 }, (_, index) => ({ label: `Step ${index}` }));
    expect(() =>
      parseInput(CreateCmmsWorkOrderV1Schema, { requestKey: '0b9c7d1e-2f3a-4b5c-8d6e-7f8091a2b3c4', type: 'REACTIVE', title: 'x', tasks }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseInput(LogCmmsLabourV1Schema, { workerRef: 'cmuser1', hours: 2, hourlyRate: 40, performedOn: '2026-09-27' }),
    ).toThrow(BadRequestException);
    expect(() => parseInput(LogCmmsLabourV1Schema, { workerRef: 'cmuser1', hours: 25, performedOn: '2026-09-27' })).toThrow(
      BadRequestException,
    );
  });

  it('only captures a well-formed status change', () => {
    expect(() => parseInput(ChangeCmmsWorkOrderStatusV1Schema, { status: 'COMPLETED' })).toThrow(BadRequestException);
    expect(parseInput(ChangeCmmsWorkOrderStatusV1Schema, { expectedVersion: 2, status: 'COMPLETED', signatureData: 'sig' })).toEqual({
      expectedVersion: 2,
      status: 'COMPLETED',
      signatureData: 'sig',
    });
  });

  it('keeps stock movements explicit: signed adjustments need a reason, receipts are positive, issues go through work orders', () => {
    const key = '0b9c7d1e-2f3a-4b5c-8d6e-7f8091a2b3c4';
    expect(() => parseInput(RecordCmmsStockMovementV1Schema, { movementType: 'RECEIPT', idempotencyKey: key, quantity: -1 })).toThrow(
      BadRequestException,
    );
    expect(() => parseInput(RecordCmmsStockMovementV1Schema, { movementType: 'ADJUSTMENT', idempotencyKey: key, quantityDelta: -2 })).toThrow(
      BadRequestException,
    );
    expect(() => parseInput(RecordCmmsStockMovementV1Schema, { movementType: 'ISSUE', idempotencyKey: key, quantity: 1 })).toThrow(
      BadRequestException,
    );
    expect(
      parseInput(RecordCmmsStockMovementV1Schema, { movementType: 'ADJUSTMENT', idempotencyKey: key, quantityDelta: -2, reason: 'Cycle count' }),
    ).toMatchObject({ quantityDelta: -2 });
  });
});
