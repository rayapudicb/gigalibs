import { describe, expect, it, vi } from 'vitest';
import {
  ClaimWfoShiftV1Schema,
  CreateWfoShiftSwapV1Schema,
  RespondWfoShiftSwapV1Schema,
  WfoForecastQueryV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WfoForecastingService } from '../forecasting/wfo-forecasting.service.js';
import { WfoShiftsService } from './wfo-shifts.service.js';

describe('WI-WFO-004: Forecasting & Shifts Service Rules', () => {
  const principal: GigaOpsPrincipal = {
    subject: 'worker-100',
    tenantId: 'tenant-wfo',
    roles: ['WORKER'],
    placeScopes: [],
    attributes: {},
  };

  it('validates forecasting query schema and computes gap statuses correctly', async () => {
    const validQuery = {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      horizon: '30' as const,
    };
    expect(() => WfoForecastQueryV1Schema.parse(validQuery)).not.toThrow();

    const mockDb: any = {
      withTenantTransaction: vi.fn().mockImplementation(async (_tenantId, cb) => {
        return cb({
          query: vi.fn().mockResolvedValue({
            rows: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                tenantId: 'tenant-wfo',
                orgUnitId: 'PLANT-1',
                skillId: null,
                forecastDate: '2026-10-05',
                demandUnits: 15,
                filledUnits: 8,
                confidencePct: 90,
                source: 'HISTORICAL',
                notes: null,
                calculatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        });
      }),
    };

    const forecastService = new WfoForecastingService(mockDb);
    const gaps = await forecastService.getGaps(principal, validQuery);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapUnits).toBe(7);
    expect(gaps[0].status).toBe('CRITICAL_GAP');
    expect(gaps[0].fillRatePct).toBeCloseTo(53.3, 1);
  });

  it('rejects shift swap when fromWorkerId is equal to toWorkerId', async () => {
    const shiftsService = new WfoShiftsService({} as any);

    await expect(
      shiftsService.createShiftSwap(principal, {
        fromBookingId: '11111111-1111-4111-8111-111111111111',
        fromWorkerId: '22222222-2222-4222-8222-222222222222',
        toWorkerId: '22222222-2222-4222-8222-222222222222',
        reason: 'Swapping with myself',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces four-eyes approval: requester cannot approve their own shift swap', async () => {
    const mockDb: any = {
      withTenantTransaction: vi.fn().mockImplementation(async (_tenantId, cb) => {
        return cb({
          query: vi.fn().mockResolvedValue({
            rowCount: 1,
            rows: [
              {
                id: 'swap-1',
                from_booking_id: 'booking-1',
                from_worker_id: 'worker-100', // matches principal.subject
                to_worker_id: 'worker-200',
                status: 'PENDING',
              },
            ],
          }),
        });
      }),
    };

    const shiftsService = new WfoShiftsService(mockDb);

    await expect(
      shiftsService.respondShiftSwap(principal, 'swap-1', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('validates ClaimWfoShift and RespondWfoShiftSwap contract schemas', () => {
    const validClaim = {
      bookingId: '44444444-4444-4444-8444-444444444444',
      workerId: '55555555-5555-4555-8555-555555555555',
      notes: 'Happy to cover this shift',
    };
    expect(() => ClaimWfoShiftV1Schema.parse(validClaim)).not.toThrow();

    const validResponse = {
      decision: 'REJECT' as const,
      reason: 'Overtime budget exceeded',
    };
    expect(() => RespondWfoShiftSwapV1Schema.parse(validResponse)).not.toThrow();
  });
});
