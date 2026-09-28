import { describe, it, expect } from 'vitest';
import { determinePersona } from '../lib/platform-context';
import { canOpenPlatformModule } from '../lib/module-access';
import { platformModuleCatalog } from '@gigalibs/contracts';

describe('Persona Routing & Lens Verification', () => {
  it('correctly maps platform authorities to PLATFORM_OPERATOR', () => {
    expect(determinePersona(['admin'], ['PLATFORM_ADMIN'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona(['member'], ['PLATFORM_OPERATOR'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona([], ['PLATFORM_OWNER'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona([], ['PLATFORM_SUPPORT'])).toBe('PLATFORM_OPERATOR');
  });

  it('correctly maps executive roles to C_LEVEL', () => {
    expect(determinePersona(['CEO'], [])).toBe('C_LEVEL');
    expect(determinePersona(['cfo'], [])).toBe('C_LEVEL');
    expect(determinePersona(['CTO'], [])).toBe('C_LEVEL');
    expect(determinePersona(['executive'], [])).toBe('C_LEVEL');
    expect(determinePersona(['C_LEVEL'], [])).toBe('C_LEVEL');
  });

  it('correctly maps workspace administration roles to TENANT_ADMIN', () => {
    expect(determinePersona(['admin'], [])).toBe('TENANT_ADMIN');
    expect(determinePersona(['TENANT_ADMIN'], [])).toBe('TENANT_ADMIN');
  });

  it('correctly maps operational supervisors to OPERATIONS_SUPERVISOR', () => {
    expect(determinePersona(['supervisor'], [])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['manager'], [])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['dispatcher'], [])).toBe('OPERATIONS_SUPERVISOR');
  });

  it('correctly maps frontline workers to WORKFORCE_MEMBER', () => {
    expect(determinePersona(['workforce_member'], [])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona(['worker'], [])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona(['operator'], [])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona(['technician'], [])).toBe('WORKFORCE_MEMBER');
  });

  it('falls back securely to CUSTOMER_GUEST when no privileged roles are present', () => {
    expect(determinePersona([], [])).toBe('CUSTOMER_GUEST');
    expect(determinePersona(['guest'], [])).toBe('CUSTOMER_GUEST');
    expect(determinePersona(['viewer'], [])).toBe('CUSTOMER_GUEST');
  });

  it('ensures persona is strictly a routing lens and never elevates permissions (STRIDE EoP)', () => {
    // User with guest roles and empty permissions
    const guestSession = {
      tenant: { features: ['asset-maintenance', 'dynamic-forms'] },
      permissions: [],
      platformRoles: [],
    };

    const cmmsModule = platformModuleCatalog.find((m) => m.key === 'asset-maintenance')!;
    expect(cmmsModule).toBeDefined();

    // Even if user interface pretends to view as C_LEVEL or TENANT_ADMIN,
    // underlying access decision canOpenPlatformModule fails closed (returns false)
    expect(canOpenPlatformModule(cmmsModule, guestSession)).toBe(false);

    // Only when explicit permission is granted does canOpenPlatformModule return true
    const authorizedSession = {
      tenant: { features: ['asset-maintenance', 'dynamic-forms'] },
      permissions: ['cmms:read'],
      platformRoles: [],
    };
    expect(canOpenPlatformModule(cmmsModule, authorizedSession)).toBe(true);
  });
});
