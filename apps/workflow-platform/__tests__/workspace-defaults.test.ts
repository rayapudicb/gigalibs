/**
 * WI-OI-153: forms read the workspace profile once per page for computed defaults; without it they keep their fixed
 * defaults.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspaceDefaults, resetWorkspaceDefaults } from '@gigalibs/configuration-react';

afterEach(() => resetWorkspaceDefaults());

describe('workspace defaults for forms', () => {
  it('reads the base currency from the member-readable workspace profile, once per page', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ defaultCurrency: 'INR', timezone: 'Asia/Kolkata' }));
    expect(await loadWorkspaceDefaults(fetchImpl as unknown as typeof fetch)).toEqual({ defaultCurrency: 'INR' });
    expect(await loadWorkspaceDefaults(fetchImpl as unknown as typeof fetch)).toEqual({ defaultCurrency: 'INR' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/control/tenants/current/profile', { cache: 'no-store' });
  });

  it('gives no computed defaults on a refusal or a failure', async () => {
    expect(await loadWorkspaceDefaults((async () => Response.json({ title: 'no' }, { status: 403 })) as unknown as typeof fetch)).toEqual({});
    resetWorkspaceDefaults();
    expect(await loadWorkspaceDefaults((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toEqual({});
  });
});
