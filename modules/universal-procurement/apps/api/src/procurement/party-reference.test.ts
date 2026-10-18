import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { requireActiveVendorParty } from './party-reference.js';

describe('requireActiveVendorParty', () => {
  it('passes when the database guard succeeds', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await requireActiveVendorParty(client as never, 'tenant-a', '323e4567-e89b-12d3-a456-426614174000');
    expect(client.query).toHaveBeenCalledWith(
      'SELECT gigalibs_procurement.require_active_party($1, $2::uuid)',
      ['tenant-a', '323e4567-e89b-12d3-a456-426614174000'],
    );
  });

  it('refuses when the party reference is invalid', async () => {
    const client = {
      query: vi.fn().mockRejectedValue({ code: '23503', message: 'foreign key violation' }),
    };
    await expect(
      requireActiveVendorParty(client as never, 'tenant-a', '323e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
