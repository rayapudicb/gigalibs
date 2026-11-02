import { MobileSessionV3Schema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { NO_TREE_IN_FORCE } from '../organization-scope.js';
import { MobileSessionUnavailableError, type MobileSessionSource, projectMobileSession } from './mobile-session-projection.js';

// WI-OI-120cf: `mobile-session.v3` from the web's session context: each assignment keeps its own permissions and scope,
// a role covering nothing is left out, and a session the contract cannot carry is refused, never cut down.

const PLACE = '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a10';

function source(overrides: Partial<MobileSessionSource> = {}): MobileSessionSource {
  return {
    user: { id: 'user-1', email: 'tech@example.test', name: 'Field Tech' },
    tenant: {
      id: 'tenant-1',
      name: 'North Plant',
      features: ['organization-hierarchy'],
      entitlements: [
        { moduleKey: 'physical-operations-cmms', version: '2026-10-01T00:00:00.000Z' },
        { moduleKey: 'my-workspace', version: '2026-10-01T00:00:00.000Z' },
      ],
    },
    roles: ['MEMBER', 'Technician North'],
    platformRoles: [],
    assignments: [
      { permissions: ['users:read', 'users:read'], scope: { kind: 'MEMBER' } },
      { permissions: ['cmms:read', 'cmms:execute-own'], scope: { kind: 'UNITS', tree_version: 'tree-7', unit_ids: ['north'] } },
      { permissions: ['places:read'], scope: { kind: 'PLACES', place_ids: [PLACE] } },
      { permissions: ['cmms:approve'], scope: { kind: 'UNITS', tree_version: NO_TREE_IN_FORCE, unit_ids: ['south'] } },
    ],
    orgScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['north'] },
    spatialScope: { mode: 'UNBOUNDED' },
    ...overrides,
  };
}

const binding = {
  membershipId: 'member-1',
  roleAssignmentIds: ['assignment-north', 'assignment-places', 'assignment-south'],
  sessionRevision: 3,
  expiresAt: new Date('2026-10-22T12:10:00.000Z'),
};

describe('mobile session v3 projection', () => {
  it('keeps each assignment separate, with its id and scope, and leaves out one that covers nothing', () => {
    const session = projectMobileSession(source(), binding);
    expect(MobileSessionV3Schema.parse(session)).toEqual(session);
    expect(session.assignments).toEqual([
      { assignmentId: 'member:member-1', permissions: ['users:read'], scope: { kind: 'MEMBER' } },
      {
        assignmentId: 'assignment-north',
        permissions: ['cmms:read', 'cmms:execute-own'],
        scope: { kind: 'UNITS', treeVersion: 'tree-7', unitIds: ['north'] },
      },
      { assignmentId: 'assignment-places', permissions: ['places:read'], scope: { kind: 'PLACES', placeIds: [PLACE] } },
    ]);
    expect(session).toMatchObject({
      contractVersion: 'mobile-session.v3',
      sessionRevision: 3,
      tenant: { id: 'tenant-1', displayName: 'North Plant' },
      user: { id: 'user-1', displayName: 'Field Tech' },
      membershipId: 'member-1',
      persona: 'WORKFORCE_MEMBER',
      entitlements: ['physical-operations-cmms', 'my-workspace'],
      memberOrganizationScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['north'] },
      memberSpatialScope: { mode: 'UNBOUNDED' },
      modules: [],
      expiresAt: '2026-10-22T12:10:00.000Z',
    });
  });

  it('names the persona from the base and platform roles', () => {
    expect(projectMobileSession(source({ roles: ['TENANT_ADMIN'] }), binding).persona).toBe('TENANT_ADMIN');
    expect(projectMobileSession(source({ platformRoles: ['PLATFORM_OWNER'] }), binding).persona).toBe('PLATFORM_OPERATOR');
  });

  it('offers Rounds to an entitled operator or board-only supervisor',() => {
    const base = source();
    const withGrant = {
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,
        {moduleKey:'operator-rounds',version:'2026-10-30'}]},
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,'operator-rounds.runs.execute']}
        : assignment),
    };
    expect(projectMobileSession(withGrant,binding).modules).toMatchObject([
      {key:'operator-rounds',enabled:true,capabilities:['operator-rounds.routes.execute']},
    ]);
    expect(projectMobileSession({...withGrant,assignments:base.assignments!},binding).modules).toEqual([]);
    const boardOnly = {
      ...withGrant,
      assignments: base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,'operator-rounds.board.read']}
        : assignment),
    };
    expect(projectMobileSession(boardOnly,binding).modules).toMatchObject([{
      key:'operator-rounds',capabilities:['operator-rounds.board.read'],requiredDeviceCapabilities:[],
    }]);
  });

  it('offers Calibration only with CMMS enabled and the execute permission (WI-OI-134)',() => {
    const base = source();
    const entitled = {
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,{moduleKey:'asset-maintenance',version:'2026-11-01'}]},
    };
    const technician = {
      ...entitled,
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,'cmms.calibration.execute']}
        : assignment),
    };
    expect(projectMobileSession(technician,binding).modules).toEqual([{
      key:'calibration',enabled:true,navigationOrder:380,capabilities:['cmms.calibration.execute'],
      presentationRevision:'calibration.v1',requiredDeviceCapabilities:[],
    }]);
    expect(projectMobileSession(entitled,binding).modules).toEqual([]);
    expect(projectMobileSession({...technician,tenant:base.tenant!},binding).modules).toEqual([]);
    const readOnly = {
      ...entitled,
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,'cmms.calibration.read']}
        : assignment),
    };
    expect(projectMobileSession(readOnly,binding).modules).toEqual([]);
  });

  it('offers Commissioning with the capabilities the member holds (WI-OI-135)',() => {
    const base = source();
    const withPermissions = (permissions: string[]) => ({
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,{moduleKey:'asset-maintenance',version:'2026-11-01'}]},
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,...permissions]} : assignment),
    });
    expect(projectMobileSession(withPermissions(['cmms.commissioning.submit','cmms.audits.execute']),binding).modules).toEqual([{
      key:'commissioning',enabled:true,navigationOrder:390,capabilities:['cmms.commissioning.submit','cmms.audits.execute'],
      presentationRevision:'commissioning.v1',requiredDeviceCapabilities:['camera'],
    }]);
    expect(projectMobileSession(withPermissions(['cmms.audits.execute']),binding).modules)
      .toMatchObject([{key:'commissioning',capabilities:['cmms.audits.execute']}]);
    expect(projectMobileSession(withPermissions(['cmms.commissioning.read']),binding).modules).toEqual([]);
  });

  it('offers Visual Spares to diagram readers, with reserving only when held (WI-OI-136)',() => {
    const base = source();
    const withPermissions = (permissions: string[]) => ({
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,{moduleKey:'asset-maintenance',version:'2026-11-02'}]},
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,...permissions]} : assignment),
    });
    expect(projectMobileSession(withPermissions(['cmms.bom.read','cmms.parts.reserve']),binding).modules).toEqual([{
      key:'spares',enabled:true,navigationOrder:400,capabilities:['cmms.bom.read','cmms.parts.reserve'],
      presentationRevision:'spares.v1',requiredDeviceCapabilities:[],
    }]);
    expect(projectMobileSession(withPermissions(['cmms.parts.reserve']),binding).modules).toEqual([]);
  });

  it('offers the shift logbook to readers with Workforce enabled (WI-OI-137)',() => {
    const base = source();
    const withPermissions = (permissions: string[], moduleKey = 'gigaops') => ({
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,{moduleKey,version:'2026-11-02'}]},
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,...permissions]} : assignment),
    });
    expect(projectMobileSession(withPermissions(['workforce.logbook.read','workforce.logbook.write']),binding).modules).toEqual([{
      key:'logbook',enabled:true,navigationOrder:410,capabilities:['workforce.logbook.read','workforce.logbook.write'],
      presentationRevision:'logbook.v1',requiredDeviceCapabilities:[],
    }]);
    expect(projectMobileSession(withPermissions(['workforce.logbook.read'],'asset-maintenance'),binding).modules).toEqual([]);
  });

  it('offers work instructions to members who perform them, with the camera for photo steps (WI-OI-138)',() => {
    const base = source();
    const withPermissions = (permissions: string[]) => ({
      ...base,
      tenant:{...base.tenant!,entitlements:[...base.tenant!.entitlements,{moduleKey:'asset-maintenance',version:'2026-11-02'}]},
      assignments:base.assignments!.map((assignment,index) => index === 1
        ? {...assignment,permissions:[...assignment.permissions,...permissions]} : assignment),
    });
    expect(projectMobileSession(withPermissions(['cmms.sop.read','cmms.sop.execute']),binding).modules).toEqual([{
      key:'sop',enabled:true,navigationOrder:420,capabilities:['cmms.sop.read','cmms.sop.execute'],
      presentationRevision:'sop.v1',requiredDeviceCapabilities:['camera'],
    }]);
    expect(projectMobileSession(withPermissions(['cmms.sop.read']),binding).modules).toEqual([]);
  });

  it('changes the authorization revision with a permission, and the configuration revision with an entitlement', () => {
    const before = projectMobileSession(source(), binding);
    const granted = source();
    const more = projectMobileSession(
      {
        ...granted,
        assignments: (granted.assignments ?? []).map((assignment, index) =>
          index === 1 ? { ...assignment, permissions: [...assignment.permissions, 'cmms:write'] } : assignment,
        ),
      },
      binding,
    );
    expect(more.authorizationRevision).not.toBe(before.authorizationRevision);
    expect(more.configurationRevision).toBe(before.configurationRevision);
    const entitled = projectMobileSession(
      source({ tenant: { ...(source().tenant as NonNullable<MobileSessionSource['tenant']>), entitlements: [] } }),
      binding,
    );
    expect(entitled.configurationRevision).not.toBe(before.configurationRevision);
    expect(entitled.authorizationRevision).toBe(before.authorizationRevision);
  });

  it('falls back to the email when the user has no name', () => {
    const session = projectMobileSession(source({ user: { id: 'user-1', email: 'tech@example.test', name: null } }), binding);
    expect(session.user.displayName).toBe('tech@example.test');
  });

  it('refuses a session the contract cannot carry, or one whose assignments changed while read', () => {
    const places = Array.from({ length: 51 }, (_, index) => `0199d6f4-3af2-7b4e-8eb2-${String(index).padStart(12, '0')}`);
    expect(() => projectMobileSession(source({ spatialScope: { mode: 'SCOPED_PLACES', placeIds: places } }), binding)).toThrow(
      MobileSessionUnavailableError,
    );
    expect(() => projectMobileSession(source(), { ...binding, roleAssignmentIds: ['assignment-north'] })).toThrow(
      MobileSessionUnavailableError,
    );
    expect(() => projectMobileSession(source({ tenant: null }), binding)).toThrow(MobileSessionUnavailableError);
  });
});
