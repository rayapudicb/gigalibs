import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requiredServiceIdentifier } from './required-service-header.js';

describe('requiredServiceIdentifier', () => {
  it('accepts a bounded canonical identifier', () => {
    expect(requiredServiceIdentifier('tenant_01:region-a', 'x-tenant-id')).toBe(
      'tenant_01:region-a',
    );
  });

  it.each([undefined, '', '   ', '../tenant', 'tenant id', 'tenant/other'])(
    'rejects a missing or unsafe identifier %s',
    (value) => {
      expect(() => requiredServiceIdentifier(value, 'x-tenant-id')).toThrow(
        BadRequestException,
      );
    },
  );
});

