import { describe, expect, it } from 'vitest';
import { baseRolePermissions } from '../rbac/base-roles.js';
import { determinePersona } from './platform-context.js';

// WI-OI-120p (R16, personas from roles): a member's persona is the highest authority their role NAMES or their
// PERMISSIONS imply. Names keep their historical mapping (no known role regresses); permissions add a capability
// signal so a custom role whose name matches nothing lands on a sensible navigation lens instead of CUSTOMER_GUEST.
describe('determinePersona — names (historical mapping, unchanged by R16)', () => {
  it('platform roles make a PLATFORM_OPERATOR regardless of tenant roles or permissions', () => {
    expect(determinePersona(['admin'], ['PLATFORM_ADMIN'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona(['member'], ['PLATFORM_OPERATOR'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona([], ['PLATFORM_OWNER'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona([], ['PLATFORM_SUPPORT'])).toBe('PLATFORM_OPERATOR');
    expect(determinePersona([], ['PLATFORM_AUDITOR'])).toBe('PLATFORM_OPERATOR');
    // Even a '*' permission does not demote or promote away from a platform role.
    expect(determinePersona([], ['PLATFORM_ADMIN'], ['*'])).toBe('PLATFORM_OPERATOR');
  });

  it('maps the known tenant role names to their historical personas', () => {
    expect(determinePersona(['CEO'], [])).toBe('C_LEVEL');
    expect(determinePersona(['cfo'], [])).toBe('C_LEVEL');
    expect(determinePersona(['executive'], [])).toBe('C_LEVEL');
    expect(determinePersona(['admin'], [])).toBe('TENANT_ADMIN');
    expect(determinePersona(['TENANT_ADMIN'], [])).toBe('TENANT_ADMIN');
    expect(determinePersona(['supervisor'], [])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['manager'], [])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['dispatcher'], [])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['worker'], [])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona(['technician'], [])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona([], [])).toBe('CUSTOMER_GUEST');
    expect(determinePersona(['guest'], [])).toBe('CUSTOMER_GUEST');
    expect(determinePersona(['viewer'], [])).toBe('CUSTOMER_GUEST');
  });
});

describe('determinePersona — capability (R16)', () => {
  it('a custom (unknown-name) role that can do operational work is a WORKFORCE_MEMBER, not a guest', () => {
    // The headline bug: before R16 this name matched nothing and fell through to CUSTOMER_GUEST, hiding the product.
    expect(determinePersona(['MAINT-PLANNER'], [], ['cmms:work-orders:write'])).toBe(
      'WORKFORCE_MEMBER',
    );
    expect(determinePersona(['field-crew'], [], ['cmms:*'])).toBe('WORKFORCE_MEMBER');
    expect(determinePersona(['data-entry'], [], ['inventory:adjust:create'])).toBe(
      'WORKFORCE_MEMBER',
    );
  });

  it('an approval/assignment/publish permission makes an OPERATIONS_SUPERVISOR', () => {
    expect(determinePersona(['buyer-lead'], [], ['procurement:orders:approve'])).toBe(
      'OPERATIONS_SUPERVISOR',
    );
    expect(determinePersona(['ap-lead'], [], ['spend:approve'])).toBe('OPERATIONS_SUPERVISOR');
    expect(determinePersona(['gl-lead'], [], ['finance:journals:post'])).toBe(
      'OPERATIONS_SUPERVISOR',
    );
    expect(determinePersona(['cat-lead'], [], ['catalogues:publish'])).toBe(
      'OPERATIONS_SUPERVISOR',
    );
  });

  it('a delegated department head (people:manage) is a supervisor, not a workspace admin', () => {
    // A head manages people within their units; they must NOT get the "sees every module" TENANT_ADMIN lens.
    expect(determinePersona(['dept-head'], [], ['people:manage', 'people:read'])).toBe(
      'OPERATIONS_SUPERVISOR',
    );
  });

  it('managing roles, settings, the tenant or billing makes a TENANT_ADMIN', () => {
    expect(determinePersona(['workspace-owner'], [], ['settings:update'])).toBe('TENANT_ADMIN');
    expect(determinePersona(['role-steward'], [], ['roles:update'])).toBe('TENANT_ADMIN');
    expect(determinePersona(['billing-owner'], [], ['billing:update'])).toBe('TENANT_ADMIN');
    expect(determinePersona(['account-owner'], [], ['tenant:update'])).toBe('TENANT_ADMIN');
  });

  it('read-only / self-service permissions stay a CUSTOMER_GUEST', () => {
    expect(determinePersona(['unknown'], [], ['dashboard:read', 'content:read'])).toBe(
      'CUSTOMER_GUEST',
    );
    expect(determinePersona(['unknown'], [], ['profile:read', 'profile:update'])).toBe(
      'CUSTOMER_GUEST',
    );
    expect(
      determinePersona(['unknown'], [], ['users:read', 'currency:convert', 'ap:evaluate']),
    ).toBe('CUSTOMER_GUEST');
    expect(determinePersona([], [], [])).toBe('CUSTOMER_GUEST');
  });
});

describe('determinePersona — ladder, max semantics and safety caps (R16)', () => {
  it('takes the HIGHEST rung names and permissions reach; permissions never demote a name', () => {
    // Name says workforce; permission says supervisor → supervisor (the higher).
    expect(determinePersona(['worker'], [], ['procurement:orders:approve'])).toBe(
      'OPERATIONS_SUPERVISOR',
    );
    // Name says guest/viewer; permission says admin → admin.
    expect(determinePersona(['viewer'], [], ['settings:update'])).toBe('TENANT_ADMIN');
    // Name says manager (supervisor); permission is read-only → stays supervisor (name not demoted).
    expect(determinePersona(['manager'], [], ['dashboard:read'])).toBe('OPERATIONS_SUPERVISOR');
  });

  it('permissions can never mint C_LEVEL or PLATFORM_OPERATOR — those are identity, not tenant capability', () => {
    // Even the all-powerful '*' caps at TENANT_ADMIN when it comes from permissions.
    expect(determinePersona([], [], ['*'])).toBe('TENANT_ADMIN');
    expect(determinePersona(['some-custom-role'], [], ['*'])).toBe('TENANT_ADMIN');
    // Executive standing still comes only from the name.
    expect(determinePersona(['CEO'], [], ['dashboard:read'])).toBe('C_LEVEL');
  });
});

describe('determinePersona — the real base-role permission sets map sensibly (R16)', () => {
  it('derives the expected persona from each base role, by permissions alone', () => {
    expect(determinePersona([], [], baseRolePermissions('SUPER_ADMIN'))).toBe('TENANT_ADMIN');
    expect(determinePersona([], [], baseRolePermissions('TENANT_ADMIN'))).toBe('TENANT_ADMIN');
    expect(determinePersona([], [], baseRolePermissions('MANAGER'))).toBe('OPERATIONS_SUPERVISOR');
    // MEMBER's permissions are collaboration/self-service only, so its persona rests on the role name.
    expect(determinePersona([], [], baseRolePermissions('MEMBER'))).toBe('CUSTOMER_GUEST');
    expect(determinePersona(['MEMBER'], [], baseRolePermissions('MEMBER'))).toBe(
      'WORKFORCE_MEMBER',
    );
    expect(determinePersona([], [], baseRolePermissions('VIEWER'))).toBe('CUSTOMER_GUEST');
  });
});
