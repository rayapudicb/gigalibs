import {
  MOBILE_MAX_ASSIGNMENTS,
  type MobileAssignmentScopeV3,
  type MobileSessionV3,
  MobileSessionV3Schema,
  type PlatformContextAssignmentScope,
  determinePersona,
  holdsPermission,
} from '@gigalibs/contracts';
import { type LegacyOrgScope, NO_TREE_IN_FORCE } from '../organization-scope.js';
import { sha256Hex } from './mobile-credentials.js';

// WI-OI-120cf: `mobile-session.v3` from the same session context the web reads (`AuthService.getSessionContext`).
// Nothing here grants anything: each assignment keeps its own permissions and scope (never merged), and a role that
// covers nothing (a unit scope with no tree in force) is left out. `modules` stays empty until the platform publishes
// mobile module grants (capabilities, navigation order, presentation): the app then shows only what it compiles in
// without a grant (Home, Profile), and no module is offered on a guess.

export interface MobileSessionSource {
  readonly user: { readonly id: string; readonly email: string; readonly name: string | null };
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly features: readonly string[];
    readonly entitlements: readonly { readonly moduleKey: string; readonly version: string }[];
  } | null;
  readonly roles: readonly string[];
  readonly platformRoles: readonly string[];
  readonly assignments?: readonly { readonly permissions: readonly string[]; readonly scope: PlatformContextAssignmentScope }[];
  readonly orgScope: LegacyOrgScope;
  readonly spatialScope: { readonly mode: 'UNBOUNDED' } | { readonly mode: 'SCOPED_PLACES'; readonly placeIds: readonly string[] };
}

export interface MobileSessionBinding {
  readonly membershipId: string;
  /** The ids of the member's role assignments, in the order the context lists them after the member's own. */
  readonly roleAssignmentIds: readonly string[];
  /** The mobile session's revision: it grows at each workspace switch. */
  readonly sessionRevision: number;
  /** When this projection stops being valid: the server mobile session's expiry. */
  readonly expiresAt: Date;
}

export class MobileSessionUnavailableError extends Error {}

/** A revision that changes whenever `value` does; the app compares revisions for equality only. */
export function contentRevision(value: unknown): number {
  return Number.parseInt(sha256Hex(JSON.stringify(value)).slice(0, 12), 16);
}

function assignmentScope(scope: PlatformContextAssignmentScope): MobileAssignmentScopeV3 | null {
  switch (scope.kind) {
    case 'MEMBER':
      return { kind: 'MEMBER' };
    case 'TENANT':
      return { kind: 'TENANT' };
    case 'UNITS':
      return scope.tree_version === NO_TREE_IN_FORCE ? null : { kind: 'UNITS', treeVersion: scope.tree_version, unitIds: [...scope.unit_ids] };
    case 'PLACES':
      return { kind: 'PLACES', placeIds: [...scope.place_ids] };
  }
}

export function projectMobileSession(source: MobileSessionSource, binding: MobileSessionBinding): MobileSessionV3 {
  const { tenant } = source;
  if (!tenant) throw new MobileSessionUnavailableError('A tenant-bound session has no tenant.');
  const assignments = source.assignments ?? [];
  if (assignments.length !== binding.roleAssignmentIds.length + 1) {
    throw new MobileSessionUnavailableError('The role assignments changed while the session was read.');
  }
  const projected = assignments.flatMap((assignment, index) => {
    const scope = assignmentScope(assignment.scope);
    if (!scope) return [];
    const assignmentId = index === 0 ? `member:${binding.membershipId}` : binding.roleAssignmentIds[index - 1];
    return [{ assignmentId: assignmentId as string, permissions: [...new Set(assignment.permissions)], scope }];
  });
  if (projected.length > MOBILE_MAX_ASSIGNMENTS) {
    throw new MobileSessionUnavailableError(`The member holds more than ${MOBILE_MAX_ASSIGNMENTS} assignments.`);
  }
  const memberOrganizationScope =
    source.orgScope.mode === 'FLAT_TENANT'
      ? ({ mode: 'FLAT_TENANT' } as const)
      : ({ mode: 'SCOPED_DEPARTMENTS', departmentIds: [...source.orgScope.departmentIds] } as const);
  const memberSpatialScope =
    source.spatialScope.mode === 'UNBOUNDED'
      ? ({ mode: 'UNBOUNDED' } as const)
      : ({ mode: 'SCOPED_PLACES', placeIds: [...source.spatialScope.placeIds] } as const);
  const persona = determinePersona([...source.roles], [...source.platformRoles]);
  const entitlements = [...new Set(tenant.entitlements.map((entitlement) => entitlement.moduleKey))];
  const canExecuteRounds = projected.some((assignment) =>
    holdsPermission(assignment.permissions,'operator-rounds.runs.execute'));
  const canReadRoundsBoard = projected.some((assignment) =>
    holdsPermission(assignment.permissions,'operator-rounds.board.read'));
  const roundsEnabled = entitlements.includes('operator-rounds') &&
    (canExecuteRounds || canReadRoundsBoard);
  // WI-OI-134 M-CAL: calibration is a CMMS (asset-maintenance) journey for members who may execute calibrations.
  const calibrationEnabled = entitlements.includes('asset-maintenance') && projected.some((assignment) =>
    holdsPermission(assignment.permissions,'cmms.calibration.execute'));
  const commissioningCapabilities = entitlements.includes('asset-maintenance') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.commissioning.submit'))
      ? ['cmms.commissioning.submit'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.audits.execute'))
      ? ['cmms.audits.execute'] : []),
  ] : [];
  const sparesCapabilities = entitlements.includes('asset-maintenance') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.bom.read')) ? ['cmms.bom.read'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.parts.reserve')) ? ['cmms.parts.reserve'] : []),
  ] : [];
  const sopCapabilities = entitlements.includes('asset-maintenance') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.sop.read')) ? ['cmms.sop.read'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.sop.execute')) ? ['cmms.sop.execute'] : []),
  ] : [];
  const fleetCapabilities = entitlements.includes('asset-maintenance') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.fleet.inspect')) ? ['cmms.fleet.inspect'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.fleet.certify')) ? ['cmms.fleet.certify'] : []),
  ] : [];
  // WI-OI-140 M-REQ: reporting a problem from the app needs cmms.requests.report.
  const canReport = entitlements.includes('asset-maintenance') &&
    projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.requests.report'));
  // WI-OI-141 M-INC: hazard reports for members who report; acknowledging stop work is its own capability.
  const safetyCapabilities = entitlements.includes('safety-operations') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'safety-operations.hazards.report')) ? ['safety-operations.hazards.report'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'safety-operations.stop-work.acknowledge')) ? ['safety-operations.stop-work.acknowledge'] : []),
  ] : [];
  // WI-OI-142 M-LOTO: isolating and gas testing (request) and personal locks (lock), each by its own permission.
  const permitCapabilities = entitlements.includes('asset-maintenance') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.permits.request')) ? ['cmms.permits.request'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'cmms.permits.lock')) ? ['cmms.permits.lock'] : []),
  ] : [];
  const logbookCapabilities = entitlements.includes('gigaops') ? [
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'workforce.logbook.read')) ? ['workforce.logbook.read'] : []),
    ...(projected.some((assignment) => holdsPermission(assignment.permissions,'workforce.logbook.write')) ? ['workforce.logbook.write'] : []),
  ] : [];
  const modules = [
    ...(roundsEnabled ? [{
      key:'operator-rounds',enabled:true,navigationOrder:370,
      capabilities:[
        ...(canExecuteRounds ? ['operator-rounds.routes.execute'] : []),
        ...(canReadRoundsBoard ? ['operator-rounds.board.read'] : []),
      ],
      presentationRevision:'operator-rounds.v1',
      requiredDeviceCapabilities:canExecuteRounds ? ['camera'] : [],
    }] : []),
    ...(calibrationEnabled ? [{
      key:'calibration',enabled:true,navigationOrder:380,
      capabilities:['cmms.calibration.execute'],
      presentationRevision:'calibration.v1',
      requiredDeviceCapabilities:[],
    }] : []),
    // WI-OI-136 M-BOM: visual spares for members who read diagrams (reserving needs its own capability).
    ...(sparesCapabilities.includes('cmms.bom.read') ? [{
      key:'spares',enabled:true,navigationOrder:400,
      capabilities:sparesCapabilities,
      presentationRevision:'spares.v1',
      requiredDeviceCapabilities:[],
    }] : []),
    // WI-OI-137 M-LOG: the shift logbook for members who read it (logging needs its own capability).
    ...(logbookCapabilities.includes('workforce.logbook.read') ? [{
      key:'logbook',enabled:true,navigationOrder:410,
      capabilities:logbookCapabilities,
      presentationRevision:'logbook.v1',
      requiredDeviceCapabilities:[],
    }] : []),
    // WI-OI-138 M-SOP: work instructions for members who perform them; photo steps use the camera.
    ...(sopCapabilities.includes('cmms.sop.execute') ? [{
      key:'sop',enabled:true,navigationOrder:420,
      capabilities:sopCapabilities,
      presentationRevision:'sop.v1',
      requiredDeviceCapabilities:['camera'],
    }] : []),
    // WI-OI-139 M-DVIR: circle checks and red tags for operators, repair certificates for mechanics; scan and photos.
    ...(fleetCapabilities.length ? [{
      key:'fleet',enabled:true,navigationOrder:430,
      capabilities:fleetCapabilities,
      presentationRevision:'fleet.v1',
      requiredDeviceCapabilities:['camera'],
    }] : []),
    ...(canReport ? [{
      key:'requests',enabled:true,navigationOrder:440,
      capabilities:['cmms.requests.report'],
      presentationRevision:'requests.v1',
      requiredDeviceCapabilities:[],
    }] : []),
    ...(safetyCapabilities.includes('safety-operations.hazards.report') ? [{
      key:'safety',enabled:true,navigationOrder:450,
      capabilities:safetyCapabilities,
      presentationRevision:'safety.v1',
      requiredDeviceCapabilities:['camera'],
    }] : []),
    ...(permitCapabilities.length ? [{
      key:'permits',enabled:true,navigationOrder:460,
      capabilities:permitCapabilities,
      presentationRevision:'permits.v1',
      requiredDeviceCapabilities:['camera'],
    }] : []),
    // WI-OI-135 M-TAG: commissioning proposals and floor walks, each by its own permission.
    ...(commissioningCapabilities.length ? [{
      key:'commissioning',enabled:true,navigationOrder:390,
      capabilities:commissioningCapabilities,
      presentationRevision:'commissioning.v1',
      requiredDeviceCapabilities:['camera'],
    }] : []),
  ];

  const parsed = MobileSessionV3Schema.safeParse({
    contractVersion: 'mobile-session.v3',
    sessionRevision: binding.sessionRevision,
    authorizationRevision: contentRevision({
      membershipId: binding.membershipId,
      persona,
      roles: source.roles,
      platformRoles: source.platformRoles,
      assignments: projected,
      memberOrganizationScope,
      memberSpatialScope,
    }),
    configurationRevision: contentRevision({ entitlements: tenant.entitlements, features: tenant.features }),
    tenant: { id: tenant.id, displayName: tenant.name },
    user: { id: source.user.id, displayName: source.user.name?.trim() || source.user.email },
    membershipId: binding.membershipId,
    persona,
    entitlements,
    memberOrganizationScope,
    memberSpatialScope,
    assignments: projected,
    modules,
    expiresAt: binding.expiresAt.toISOString(),
  });
  // A session the contract cannot carry (too many places or departments, say) is refused, never cut down.
  if (!parsed.success) throw new MobileSessionUnavailableError(`The session does not fit mobile-session.v3: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
