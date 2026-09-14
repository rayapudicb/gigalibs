import { describe, expect, it } from 'vitest';
import { isTenantAdministratorRole } from './mfa-assisted-recovery.service.js';

describe('assisted recovery administrator authority', () => {
  it.each(['SUPER_ADMIN', 'TENANT_ADMIN'])('accepts active administrative role %s', (role) => {
    expect(isTenantAdministratorRole(role)).toBe(true);
  });

  it.each(['MANAGER', 'MEMBER', 'VIEWER', 'GUEST', ''])(
    'rejects non-administrator role %s',
    (role) => {
      expect(isTenantAdministratorRole(role)).toBe(false);
    },
  );
});
