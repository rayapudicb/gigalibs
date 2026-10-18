import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { requireActiveCustomerParty } from './party-reference.js';

describe('requireActiveCustomerParty', () => {
  it('refuses when the party reference is invalid', async () => {
    const client = {
      query: vi.fn().mockRejectedValue({ code: '23503' }),
    };
    await expect(
      requireActiveCustomerParty(client as never, 'tenant-a', '323e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
