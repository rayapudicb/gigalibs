/**
 * WI-OI-153 slice B: a platform operator creating a workspace may choose its country and base currency; the request
 * carries a workspace profile only when something was chosen, in the shape the control plane validates.
 */
import { PlatformCreateTenantSchema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { createTenantBody } from '../components/platform/PlatformTenantControl';

const form = {
  name: 'Acme India',
  slug: 'acme-india',
  ownerEmail: 'owner@acme.example',
  trialDays: 7,
  isolationMode: 'ROW_LEVEL_SECURITY' as const,
  region: 'local',
  reason: 'Create tenant trial',
  countryCode: '',
  defaultCurrency: '',
  timezone: '',
};

describe('creating a workspace with its profile', () => {
  it('sends the chosen country, currency and time zone as the workspace profile', () => {
    const body = createTenantBody({ ...form, countryCode: 'IN', defaultCurrency: 'INR', timezone: 'Asia/Calcutta' }, ['asset-maintenance']);
    expect(body.profile).toEqual({ countryCode: 'IN', defaultCurrency: 'INR', timezone: 'Asia/Calcutta' });
    expect(body).not.toHaveProperty('countryCode');
    expect(PlatformCreateTenantSchema.safeParse(body).success).toBe(true);
  });

  it('sends no profile when nothing was chosen, so the workspace keeps the defaults', () => {
    const body = createTenantBody(form, []);
    expect(body).not.toHaveProperty('profile');
    expect(PlatformCreateTenantSchema.safeParse(body).success).toBe(true);
  });
});
