import { describe, expect, it, vi } from 'vitest';
import { ArOrganizationSyncGuard } from './organization.controller.js';

describe('AR organization version delivery authority', () => {
  it('fails closed without the signed platform context verifier', async () => {
    const guard = new ArOrganizationSyncGuard(null);
    await expect(Promise.resolve().then(() => guard.canActivate({} as never))).rejects.toThrow('not configured');
  });

  it('delegates only to the signed verifier', async () => {
    const canActivate = vi.fn(async () => true);
    const guard = new ArOrganizationSyncGuard({ canActivate } as never);
    const context = {} as never;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(canActivate).toHaveBeenCalledWith(context);
  });
});
