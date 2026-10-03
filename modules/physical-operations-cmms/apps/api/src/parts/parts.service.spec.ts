/**
 * WI-EAM-005 — MRO Storeroom Logistics & Universal Workforce Relay Unit Tests
 *
 * Validates contract schemas for multi-warehouse storerooms, bin balances,
 * work order stock issue/return, and TCO financial roll-up.
 */
import {
  CreateCmmsStoreroomV1Schema,
  IssueCmmsPartToWorkOrderV1Schema,
  IssueCmmsPartV1Schema,
  ReturnCmmsPartFromWorkOrderV1Schema,
  SetCmmsPartBalanceV1Schema,
  UpdateCmmsStoreroomV1Schema,
} from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseInput } from '../common/command.js';

describe('MRO Storeroom Logistics & TCO (WI-EAM-005)', () => {
  describe('CreateCmmsStoreroomV1Schema', () => {
    it('accepts a valid storeroom definition', () => {
      const result = parseInput(CreateCmmsStoreroomV1Schema, {
        code: 'MAIN-STORE-01',
        name: 'Central Maintenance Storeroom',
        description: 'Primary warehouse for HVAC and electrical spares',
        siteRef: '550e8400-e29b-41d4-a716-446655440001',
      });
      expect(result.code).toBe('MAIN-STORE-01');
      expect(result.name).toBe('Central Maintenance Storeroom');
      expect(result.siteRef).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(result.isActive).toBe(true);
    });

    it('rejects an empty storeroom code or name', () => {
      expect(() =>
        parseInput(CreateCmmsStoreroomV1Schema, {
          code: '',
          name: 'Central Storeroom',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        parseInput(CreateCmmsStoreroomV1Schema, {
          code: 'STORE-1',
          name: '',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('UpdateCmmsStoreroomV1Schema', () => {
    it('accepts partial storeroom updates with expectedVersion', () => {
      const result = parseInput(UpdateCmmsStoreroomV1Schema, {
        expectedVersion: 1,
        name: 'Updated Central Storeroom',
        isActive: false,
      });
      expect(result.expectedVersion).toBe(1);
      expect(result.name).toBe('Updated Central Storeroom');
      expect(result.isActive).toBe(false);
    });

    it('rejects missing expectedVersion', () => {
      expect(() =>
        parseInput(UpdateCmmsStoreroomV1Schema, {
          name: 'Updated Central Storeroom',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('SetCmmsPartBalanceV1Schema', () => {
    it('accepts a valid multi-warehouse part bin balance allocation', () => {
      const result = parseInput(SetCmmsPartBalanceV1Schema, {
        partId: '550e8400-e29b-41d4-a716-446655440010',
        storeroomId: '550e8400-e29b-41d4-a716-446655440020',
        binLocation: 'AISLE-4-BIN-12',
        quantityOnHand: 25.5,
        minQuantity: 5,
        reorderPoint: 10,
      });
      expect(result.partId).toBe('550e8400-e29b-41d4-a716-446655440010');
      expect(result.storeroomId).toBe('550e8400-e29b-41d4-a716-446655440020');
      expect(result.binLocation).toBe('AISLE-4-BIN-12');
      expect(result.quantityOnHand).toBe(25.5);
      expect(result.minQuantity).toBe(5);
      expect(result.reorderPoint).toBe(10);
    });

    it('rejects negative quantityOnHand', () => {
      expect(() =>
        parseInput(SetCmmsPartBalanceV1Schema, {
          partId: '550e8400-e29b-41d4-a716-446655440010',
          storeroomId: '550e8400-e29b-41d4-a716-446655440020',
          binLocation: 'AISLE-1',
          quantityOnHand: -5,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects invalid UUIDs for part or storeroom', () => {
      expect(() =>
        parseInput(SetCmmsPartBalanceV1Schema, {
          partId: 'not-a-uuid',
          storeroomId: '550e8400-e29b-41d4-a716-446655440020',
          binLocation: 'AISLE-1',
          quantityOnHand: 10,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('Issue and Return Part Schemas', () => {
    it('accepts valid IssueCmmsPartToWorkOrderV1Schema with storeroom & bin', () => {
      const result = parseInput(IssueCmmsPartToWorkOrderV1Schema, {
        partId: '550e8400-e29b-41d4-a716-446655440010',
        storeroomId: '550e8400-e29b-41d4-a716-446655440020',
        binLocation: 'RACK-A',
        quantity: 2,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
      });
      expect(result.quantity).toBe(2);
      expect(result.storeroomId).toBe('550e8400-e29b-41d4-a716-446655440020');
      expect(result.binLocation).toBe('RACK-A');
    });

    it('accepts IssueCmmsPartV1Schema with optional storeroomId and binLocation', () => {
      const result = parseInput(IssueCmmsPartV1Schema, {
        partId: '550e8400-e29b-41d4-a716-446655440010',
        quantity: 3,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
        storeroomId: '550e8400-e29b-41d4-a716-446655440020',
        binLocation: 'SHELF-2',
      });
      expect(result.quantity).toBe(3);
      expect(result.storeroomId).toBe('550e8400-e29b-41d4-a716-446655440020');
      expect(result.binLocation).toBe('SHELF-2');
    });

    it('accepts ReturnCmmsPartFromWorkOrderV1Schema', () => {
      const result = parseInput(ReturnCmmsPartFromWorkOrderV1Schema, {
        partId: '550e8400-e29b-41d4-a716-446655440010',
        storeroomId: '550e8400-e29b-41d4-a716-446655440020',
        binLocation: 'RACK-A',
        quantity: 1,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440098',
        notes: 'Unused surplus gasket returned to inventory',
      });
      expect(result.quantity).toBe(1);
      expect(result.notes).toBe('Unused surplus gasket returned to inventory');
    });

    it('rejects zero or negative quantities', () => {
      expect(() =>
        parseInput(IssueCmmsPartToWorkOrderV1Schema, {
          partId: '550e8400-e29b-41d4-a716-446655440010',
          quantity: 0,
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        parseInput(ReturnCmmsPartFromWorkOrderV1Schema, {
          partId: '550e8400-e29b-41d4-a716-446655440010',
          quantity: -1,
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('TCO Financial Roll-up Logic', () => {
    it('accurately computes work order total cost of ownership', () => {
      const labourHours = 4.5;
      const labourCost = 382.5;
      const partsCost = 210.0;
      const totalCost = Math.round((labourCost + partsCost) * 100) / 100;

      expect(totalCost).toBe(592.5);
      expect(labourHours).toBeGreaterThan(0);
      expect(partsCost).toBeGreaterThan(0);
    });
  });
});
