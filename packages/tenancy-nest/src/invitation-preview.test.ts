import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120ba: the invited person sees what an invitation is for before accepting; anyone else learns nothing.
const prismaMock = vi.hoisted(() => ({
  tenantInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  tenantMember: { findUnique: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { TenancyService } from './tenancy.service.js';

const TOKEN = 'a'.repeat(43);
const future = new Date(Date.now() + 60 * 60 * 1000);
const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  tenantId: 'tenant-1',
  email: 'Sam@Example.com',
  role: 'MANAGER',
  invitedById: 'admin-1',
  acceptedAt: null,
  revokedAt: null,
  expiresAt: future,
  tenant: { name: 'Journey Works', status: 'TRIAL' },
  ...overrides,
});
const people = (invitee: Record<string, unknown> | null, sender: Record<string, unknown> | null = { name: 'Ada Admin' }) =>
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === 'admin-1' ? sender : invitee,
  );

describe('invitation preview', () => {
  const service = new TenancyService();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenantInvite.findUnique.mockResolvedValue(invitation());
    prismaMock.tenantMember.findUnique.mockResolvedValue(null);
    people({ email: 'sam@example.com', status: 'ACTIVE' });
  });

  it('shows the invitee the workspace, role, sender and expiry, looking the token up by its hash', async () => {
    await expect(service.previewInvite('sam', { token: TOKEN })).resolves.toEqual({
      workspaceName: 'Journey Works',
      role: 'MANAGER',
      invitedBy: 'Ada Admin',
      expiresAt: future.toISOString(),
    });
    const lookedUp = prismaMock.tenantInvite.findUnique.mock.calls[0]?.[0] as { where: { token: string } };
    expect(lookedUp.where.token).toBe(createHash('sha256').update(TOKEN).digest('hex'));
    expect(lookedUp.where.token).not.toBe(TOKEN);
  });

  it('writes nothing', async () => {
    await service.previewInvite('sam', { token: TOKEN });
    expect(prismaMock.tenantInvite.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.tenantMember.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('gives anyone but the active invitee the same refusal, whatever the invitation', async () => {
    const refusal = async () => {
      const error = await service.previewInvite('someone', { token: TOKEN }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BadRequestException);
      return (error as BadRequestException).message;
    };
    people({ email: 'other@example.com', status: 'ACTIVE' });
    const wrongEmail = await refusal();
    prismaMock.tenantInvite.findUnique.mockResolvedValue(null);
    const unknownToken = await refusal();
    prismaMock.tenantInvite.findUnique.mockResolvedValue(invitation({ revokedAt: new Date(), tenant: { name: 'X', status: 'CANCELLED' } }));
    const revokedElsewhere = await refusal();
    prismaMock.tenantInvite.findUnique.mockResolvedValue(invitation());
    people({ email: 'sam@example.com', status: 'SUSPENDED' });
    const suspended = await refusal();
    expect(new Set([wrongEmail, unknownToken, revokedElsewhere, suspended])).toEqual(new Set(['Invitation is invalid for this user']));
  });

  it('tells the invitee, as accepting would, when the invitation can no longer be used', async () => {
    for (const changed of [
      { acceptedAt: new Date() },
      { revokedAt: new Date() },
      { expiresAt: new Date(Date.now() - 1000) },
      { tenant: { name: 'Journey Works', status: 'SUSPENDED' } },
    ]) {
      prismaMock.tenantInvite.findUnique.mockResolvedValue(invitation(changed));
      await expect(service.previewInvite('sam', { token: TOKEN })).rejects.toBeInstanceOf(ConflictException);
    }
    prismaMock.tenantInvite.findUnique.mockResolvedValue(invitation());
    prismaMock.tenantMember.findUnique.mockResolvedValue({ id: 'member-1' });
    await expect(service.previewInvite('sam', { token: TOKEN })).rejects.toThrow('A tenant membership already exists');
  });

  it('leaves the sender out when they have no name, rather than showing their address', async () => {
    people({ email: 'sam@example.com', status: 'ACTIVE' }, { name: '  ' });
    await expect(service.previewInvite('sam', { token: TOKEN })).resolves.toMatchObject({ invitedBy: null });
    people({ email: 'sam@example.com', status: 'ACTIVE' }, null);
    await expect(service.previewInvite('sam', { token: TOKEN })).resolves.toMatchObject({ invitedBy: null });
  });
});
