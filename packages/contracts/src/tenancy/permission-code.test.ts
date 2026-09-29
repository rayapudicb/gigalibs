import { describe, expect, it } from 'vitest';
import { TenantPermissionSchema, isTenantPermissionCode } from './index.js';

// WI-OI-103e (ADR-0016 F16): tenant roles may grant module permissions such as analytics:charts:write.
describe('tenant permission codes', () => {
  it.each(['analytics:read', 'analytics:*', 'analytics:charts:write', 'analytics:models:publish', 'master-data:read'])(
    'accepts %s',
    (code) => {
      expect(isTenantPermissionCode(code)).toBe(true);
      expect(TenantPermissionSchema.safeParse(code).success).toBe(true);
    },
  );

  it.each([
    'platform:tenants:write',
    'platform:*',
    'analytics:charts:*',
    'analytics:*:write',
    'analytics:a:b:c',
    'Analytics:read',
    'analytics',
    '*',
    'analytics:charts:write ',
    42,
  ])('refuses %s', (code) => {
    expect(isTenantPermissionCode(code)).toBe(false);
    expect(TenantPermissionSchema.safeParse(code).success).toBe(false);
  });
});
