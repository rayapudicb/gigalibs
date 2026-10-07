'use client';

import { PageShell } from '@/components/page-shell';
import { memberStatusLabel, roleLabel } from '@/lib/role-labels';
import {
  baseRoleAdditions,
  holdsPermission,
  type OrgUnitV1,
  PERMISSION_CATALOGUE,
  SCOPE_ENFORCING_MODULES,
  type SpatialNodeV1,
} from '@gigalibs/contracts';
import { OrgUnitPicker, useUnitNames } from '@/components/organization/OrgShared';
import { geospatialApi } from '@/lib/geospatial-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import { MfaAssistedRecoveryManager } from './MfaAssistedRecoveryManager';
import { TenantDataExportManager } from './TenantDataExportManager';
import { TenantOidcManager } from './TenantOidcManager';

const ROLES = ['TENANT_ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST'] as const;
const STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
// WI-OI-120q (R1): the permissions a role may hold are those some screen, route or service checks, grouped by family.
const PERMISSION_GROUPS = Object.entries(
  PERMISSION_CATALOGUE.reduce<Record<string, string[]>>((groups, entry) => {
    (groups[entry.family] ??= []).push(entry.code);
    return groups;
  }, {}),
);
type AssignableMemberRole = (typeof ROLES)[number];
type MemberRole = AssignableMemberRole | 'SUPER_ADMIN';
type MemberStatus = (typeof STATUSES)[number];

interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string | null; status: string };
  customRole: Pick<CustomRole, 'id' | 'name' | 'color' | 'permissions'> | null;
  /** WI-OI-120w (R2 slices 2a and 2b): the roles the member holds, oldest first, each with where it applies. */
  roleAssignments?: Array<{
    id: string;
    customRoleId: string;
    scope?: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES';
    unitIds?: string[];
    placeIds?: string[];
    customRole: { name: string; color: string };
  }>;
}

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  permissions: string[];
  /** WI-OI-120w (R2 slice 2c): the roles this role includes. */
  includes?: string[];
  createdAt: string;
  updatedAt: string;
  _count: { members: number };
}

/** What a role grants with everything it includes (the server computes the same, at most five deep). */
function grantedInTotal(roleId: string, roles: readonly CustomRole[], depth = 0, path: ReadonlySet<string> = new Set([roleId])): Set<string> {
  const role = roles.find((candidate) => candidate.id === roleId);
  const codes = new Set(role?.permissions ?? []);
  if (depth < 5)
    for (const included of role?.includes ?? [])
      if (!path.has(included)) for (const code of grantedInTotal(included, roles, depth + 1, new Set([...path, included]))) codes.add(code);
  return codes;
}

interface Invitation {
  id: string;
  email: string;
  role: AssignableMemberRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface CreatedInvitation extends Invitation {
  token: string;
  delivery: 'MANUAL_SECURE_LINK';
}

interface ApiErrorPayload {
  detail?: unknown;
  message?: unknown;
}

interface TenantSettings {
  version: number;
  security: { enforceMfa: boolean };
}

interface TenantDomainStatus {
  activeDomain?: string | null;
  activeDomainVerifiedAt?: string | null;
  domain: string | null;
  recordName: string | null;
  status: 'NOT_CONFIGURED' | 'UNVERIFIED' | 'PENDING' | 'LOCKED' | 'EXPIRED' | 'VERIFIED';
  verifiedAt?: string | null;
  challengeExpiresAt?: string | null;
  verificationAttempts?: number;
  lockedUntil?: string | null;
}

interface TenantDomainChallenge extends TenantDomainStatus {
  verificationValue: string;
}

function hasPermission(permissions: string[], requested: string): boolean {
  return holdsPermission(permissions, requested);
}

/**
 * WI-OI-120x: the base roles this viewer may give a member whose role is `current` (null: an invitation), as the server
 * checks it. Only an administrator gives Tenant Admin; anyone else gives a role only when they hold what it adds.
 */
function givableRoles(current: MemberRole | null, viewerPermissions: string[], isAdministrator: boolean): AssignableMemberRole[] {
  return ROLES.filter(
    (option) =>
      option === current ||
      isAdministrator ||
      (option !== 'TENANT_ADMIN' && baseRoleAdditions(current, option).every((code) => hasPermission(viewerPermissions, code))),
  );
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  if (Array.isArray(payload?.message)) return payload.message.join(', ');
  return fallback;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Invalid date' : parsed.toLocaleString();
}

function invitationStatus(invitation: Invitation): string {
  if (invitation.acceptedAt) return 'Accepted';
  if (invitation.revokedAt) return 'Revoked';
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return 'Expired';
  return 'Pending';
}

interface MemberRowProps {
  member: Member;
  currentUserId: string;
  canUpdate: boolean;
  /** WI-OI-120v: only a workspace administrator grants, changes or suspends the Tenant Admin role (the server refuses). */
  isAdministrator: boolean;
  /** WI-OI-120w (R2 slice 2a): holds `roles:assign`; one's own roles change only through another administrator. */
  canAssignRoles: boolean;
  /** WI-OI-120x: the viewer's permissions, to offer only the base roles they may give. */
  viewerPermissions: string[];
  customRoles: CustomRole[];
  onSaved: () => Promise<void>;
}

function MemberRow({ member, currentUserId, canUpdate: mayUpdate, isAdministrator, canAssignRoles, viewerPermissions, customRoles, onSaved }: MemberRowProps) {
  // WI-OI-120v, 120x (review L3): a Tenant Admin's or Super Admin's row is read-only for anyone but an administrator.
  const canUpdate = mayUpdate && (isAdministrator || (member.role !== 'TENANT_ADMIN' && member.role !== 'SUPER_ADMIN'));
  // WI-OI-120x: only an administrator changes their own base role; anyone else asks another administrator.
  const canChangeRole = canUpdate && (isAdministrator || member.user.id !== currentUserId);
  const [role, setRole] = useState<MemberRole>(member.role);
  const [status, setStatus] = useState<MemberStatus>(member.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = role !== member.role || status !== member.status;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/control/tenants/current/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(role !== member.role ? { role } : {}),
          ...(status !== member.status ? { status } : {}),
          expectedUpdatedAt: member.updatedAt,
          reason,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Member update failed.'));
      setReason('');
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Member update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-zinc-900">
          {member.user.name || 'Unnamed user'}
          {member.user.id === currentUserId ? ' (you)' : ''}
        </p>
        <p className="text-zinc-500">{member.user.email}</p>
      </TableCell>
      <TableCell>
        {canChangeRole ? (
          <select
            aria-label={`Role for ${member.user.email}`}
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
          >
            {member.role === 'SUPER_ADMIN' ? (
              <option value="SUPER_ADMIN" disabled>
                {roleLabel('SUPER_ADMIN')} (managed by GigaLibs)
              </option>
            ) : null}
            {givableRoles(member.role, viewerPermissions, isAdministrator).map((option) => (
              <option key={option} value={option}>
                {roleLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          roleLabel(member.role)
        )}
      </TableCell>
      <TableCell>
        {canUpdate ? (
          <select
            aria-label={`Status for ${member.user.email}`}
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as MemberStatus)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {memberStatusLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          memberStatusLabel(member.status)
        )}
      </TableCell>
      <TableCell>{formatDate(member.joinedAt)}</TableCell>
      <TableCell className="min-w-64">
        <MemberRoles
          member={member}
          customRoles={customRoles}
          canAssign={
            canAssignRoles &&
            (isAdministrator || (member.user.id !== currentUserId && member.role !== 'TENANT_ADMIN' && member.role !== 'SUPER_ADMIN'))
          }
          canChooseScope={isAdministrator}
          onSaved={onSaved}
        />
      </TableCell>
      {canUpdate ? (
        <TableCell className="min-w-64">
          <div className="flex flex-col gap-2">
            <input
              aria-label={`Reason for changing ${member.user.email}`}
              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
              placeholder="Reason for this change"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              type="button"
              size="small"
              variant="primary"
              disabled={!changed || reason.trim().length < 3}
              isLoading={saving}
              onClick={() => void save()}
            >
              Save change
            </Button>
            {error ? (
              <p className="text-xs text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** WI-OI-120w (R2 slice 2b): where a role applies when it is given. */
type RoleScopeKind = 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES';
// Units and places are offered once a module is proven to limit its records by them (Security review of slice 2b).
const ENFORCED = {
  units: Object.values(SCOPE_ENFORCING_MODULES).some((module) => module.units),
  places: Object.values(SCOPE_ENFORCING_MODULES).some((module) => module.places),
};
const SCOPE_CHOICES: ReadonlyArray<{ value: RoleScopeKind; label: string }> = [
  { value: 'MEMBER' as const, label: 'Their own scope' },
  { value: 'WORKSPACE' as const, label: 'The whole workspace' },
  ...(ENFORCED.units ? [{ value: 'UNITS' as const, label: 'Chosen units' }] : []),
  ...(ENFORCED.places ? [{ value: 'PLACES' as const, label: 'Chosen places' }] : []),
];

/**
 * WI-OI-120w (R2 slices 2a and 2b): the roles a member holds, each removable and labelled with where it applies, and a
 * picker to add another. An administrator also chooses where: the member's own scope, the whole workspace, units or
 * places. Every change has a reason; the member's next request has the change.
 */
function MemberRoles({
  member,
  customRoles,
  canAssign,
  canChooseScope,
  onSaved,
}: {
  member: Member;
  customRoles: CustomRole[];
  canAssign: boolean;
  canChooseScope: boolean;
  onSaved: () => Promise<void>;
}) {
  const held = member.roleAssignments ?? [];
  const [adding, setAdding] = useState('');
  const [reason, setReason] = useState('');
  const [where, setWhere] = useState<RoleScopeKind>('MEMBER');
  const [units, setUnits] = useState<OrgUnitV1[]>([]);
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [places, setPlaces] = useState<SpatialNodeV1[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = member.user.email;
  const reasonGiven = [...reason.trim()].length >= 3; // characters, as the server counts them
  const unitNames = useUnitNames(held.flatMap((assignment) => assignment.unitIds ?? []));
  const needsPlaces = where === 'PLACES' || held.some((assignment) => (assignment.placeIds ?? []).length > 0);

  useEffect(() => {
    if (!needsPlaces || places) return;
    let cancelled = false;
    void geospatialApi
      .listNodes({ pageSize: 200 })
      .then((page) => {
        if (!cancelled) setPlaces(page.items);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPlaces, places]);

  const placeName = (id: string) => places?.find((place) => place.id === id)?.displayName ?? 'a place';
  const scopeLabel = (assignment: NonNullable<Member['roleAssignments']>[number]) => {
    if (assignment.scope === 'WORKSPACE') return 'the whole workspace';
    if (assignment.scope === 'UNITS') return (assignment.unitIds ?? []).map((id) => unitNames[id] ?? 'a unit').join(', ');
    if (assignment.scope === 'PLACES') return (assignment.placeIds ?? []).map(placeName).join(', ');
    return '';
  };
  const tagLabel = (assignment: NonNullable<Member['roleAssignments']>[number]) => {
    const label = scopeLabel(assignment);
    return label ? `${assignment.customRole.name} · ${label}` : assignment.customRole.name;
  };

  const change = async (path: string, body: Record<string, unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/control/tenants/current/members/${member.id}/role-assignments${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, reason }),
      });
      if (!response.ok) throw new Error(await readError(response, fallback));
      setAdding('');
      setReason('');
      setWhere('MEMBER');
      setUnits([]);
      setPlaceIds([]);
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  if (!canAssign) return <>{held.length > 0 ? held.map(tagLabel).join(', ') : 'None'}</>;
  const available = customRoles.filter((role) => !held.some((assignment) => assignment.customRoleId === role.id));
  const scope =
    where === 'WORKSPACE'
      ? { kind: 'WORKSPACE' }
      : where === 'UNITS'
        ? { kind: 'UNITS', unitIds: units.map((unit) => unit.id) }
        : where === 'PLACES'
          ? { kind: 'PLACES', placeIds }
          : undefined;
  const scopeReady = (where !== 'UNITS' || units.length > 0) && (where !== 'PLACES' || placeIds.length > 0);
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={`Roles of ${email}`} className="flex flex-wrap gap-1">
        {held.length === 0 ? <li className="text-ui-fg-muted">None</li> : null}
        {held.map((assignment) => (
          <li key={assignment.id} className="flex items-center gap-1 rounded-full border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-xs">
            {tagLabel(assignment)}
            <button
              type="button"
              aria-label={`Remove ${assignment.customRole.name} from ${email}`}
              title={reasonGiven ? 'Remove this role' : 'Give a reason first'}
              className="rounded px-1 text-ui-fg-muted hover:text-ui-fg-error disabled:opacity-40"
              disabled={busy || !reasonGiven}
              onClick={() => void change(`/${assignment.id}/revoke`, {}, 'The role could not be removed.')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <select
        aria-label={`Add a role for ${email}`}
        className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
        value={adding}
        onChange={(event) => setAdding(event.target.value)}
      >
        <option value="">Add a role…</option>
        {available.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      {canChooseScope && adding ? (
        <select
          aria-label={`Where the role applies for ${email}`}
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
          value={where}
          onChange={(event) => setWhere(event.target.value as RoleScopeKind)}
        >
          {SCOPE_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : null}
      {canChooseScope && adding && where === 'UNITS' ? (
        <div className="flex flex-col gap-1">
          <OrgUnitPicker
            label={`Add a unit for ${email}`}
            value={null}
            onChange={(unit) => {
              if (unit) setUnits((previous) => (previous.some((chosen) => chosen.id === unit.id) ? previous : [...previous, unit]));
            }}
          />
          <ul aria-label={`Chosen units for ${email}`} className="flex flex-wrap gap-1 text-xs">
            {units.map((unit) => (
              <li key={unit.id} className="flex items-center gap-1 rounded-full border border-ui-border-base px-2 py-0.5">
                {unit.code} · {unit.name}
                <button
                  type="button"
                  aria-label={`Remove ${unit.name}`}
                  className="px-1 text-ui-fg-muted"
                  onClick={() => setUnits((previous) => previous.filter((chosen) => chosen.id !== unit.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canChooseScope && adding && where === 'PLACES' ? (
        places && places.length > 0 ? (
          <select
            multiple
            aria-label={`Places for ${email}`}
            className="min-h-24 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-xs"
            value={placeIds}
            onChange={(event) => setPlaceIds([...event.target.selectedOptions].map((option) => option.value).slice(0, 50))}
          >
            {places.map((place) => (
              <option key={place.id} value={place.id} title={place.path}>
                {place.displayName}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-ui-fg-muted">{places ? 'No places to choose from (Geospatial is needed).' : 'Loading places…'}</p>
        )
      ) : null}
      <input
        aria-label={`Reason for the role change for ${email}`}
        className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2"
        placeholder="Reason for the role change"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        type="button"
        size="small"
        variant="secondary"
        disabled={!adding || !reasonGiven || !scopeReady || busy}
        isLoading={busy}
        onClick={() => void change('', { customRoleId: adding, ...(scope ? { scope } : {}) }, 'The role could not be added.')}
      >
        Add role
      </Button>
      {error ? (
        <p className="text-xs text-ui-fg-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The catalogue by family. A role's whole-area grants (`cmms:*`) and any older code it holds that is not in the list
 * are shown too, so editing the role keeps them unless they are deselected.
 */
function PermissionOptions({ held }: { held: readonly string[] }) {
  const listed = new Set(PERMISSION_CATALOGUE.map((entry) => entry.code));
  const wholeAreas = held.filter((code) => /^[a-z][a-z0-9-]*[:.]\*$/.test(code));
  const unlisted = held.filter((code) => !listed.has(code) && !wholeAreas.includes(code));
  return (
    <>
      {wholeAreas.length > 0 ? (
        <optgroup label="Whole areas this role holds">
          {wholeAreas.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </optgroup>
      ) : null}
      {PERMISSION_GROUPS.map(([family, codes]) => (
        <optgroup key={family} label={family}>
          {codes.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </optgroup>
      ))}
      {unlisted.length > 0 ? (
        <optgroup label="Also held by this role (another spelling, or not in the list)">
          {unlisted.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

function selectedPermissions(event: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

/** WI-OI-103e (ADR-0016 F16): a module's default role, kept equal to its manifest; members can be assigned it. */
function BuiltInRoleRow({ role }: { role: CustomRole }) {
  return (
    <div className="grid gap-3 border-t border-zinc-100 p-4 lg:grid-cols-[12rem_minmax(12rem,1fr)_minmax(18rem,2fr)_14rem_auto]">
      <div className="text-xs font-medium text-zinc-700">
        Name
        <p className="mt-1 text-sm text-zinc-900">
          {role.name} <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">Built-in</span>
        </p>
      </div>
      <div className="text-xs font-medium text-zinc-700">
        Description
        <p className="mt-1 text-sm font-normal text-zinc-600">{role.description}</p>
      </div>
      <div className="text-xs font-medium text-zinc-700">
        Permissions ({role.permissions.length})
        <p className="mt-1 break-words font-mono text-xs font-normal text-zinc-600">{role.permissions.join(', ')}</p>
      </div>
      <p className="text-xs text-zinc-500">
        Defined by the module; it cannot be edited or deleted. Assigned to {role._count.members} member(s).
      </p>
    </div>
  );
}

function CustomRoleRow({
  role,
  roles,
  canDelete,
  onSaved,
}: {
  role: CustomRole;
  /** Every role of the workspace, for the roles this one may include (WI-OI-120w slice 2c). */
  roles: readonly CustomRole[];
  canDelete: boolean;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [permissions, setPermissions] = useState<string[]>(role.permissions);
  const [includes, setIncludes] = useState<string[]>(role.includes ?? []);
  const includesChanged = [...includes].sort().join(',') !== [...(role.includes ?? [])].sort().join(',');
  const total = grantedInTotal(role.id, roles.map((candidate) => (candidate.id === role.id ? { ...candidate, permissions, includes } : candidate))).size;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/control/tenants/current/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          permissions,
          ...(includesChanged ? { includes } : {}),
          expectedUpdatedAt: role.updatedAt,
          reason,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Custom role update failed.'));
      setReason('');
      await onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Custom role update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/control/tenants/current/roles/${role.id}?reason=${encodeURIComponent(reason)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error(await readError(response, 'Custom role deletion failed.'));
      await onSaved();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Custom role deletion failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 border-t border-zinc-100 p-4 lg:grid-cols-[12rem_minmax(12rem,1fr)_minmax(18rem,2fr)_14rem_auto]">
      <label className="text-xs font-medium text-zinc-700">
        Name
        <input
          className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-zinc-700">
        Description
        <input
          className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-zinc-700">
        Effective additions ({permissions.length})
        <select
          multiple
          className="mt-1 h-28 w-full rounded-md border border-zinc-200 bg-white p-2 font-mono"
          value={permissions}
          onChange={(event) => setPermissions(selectedPermissions(event))}
        >
          <PermissionOptions held={permissions} />
        </select>
        <span className="mt-2 block font-normal">Includes (it also grants what they grant)</span>
        <select
          multiple
          aria-label={`Roles ${role.name} includes`}
          className="mt-1 h-20 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2"
          value={includes}
          onChange={(event) => setIncludes(selectedPermissions(event))}
        >
          {roles
            .filter((candidate) => candidate.id !== role.id)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
        </select>
        <span className="mt-1 block font-normal text-ui-fg-muted">Grants {total} permission(s) in total</span>
      </label>
      <label className="text-xs font-medium text-zinc-700">
        Change reason
        <input
          className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
          placeholder="Required for save/delete"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <span className="mt-2 block text-zinc-500">
          Assigned to {role._count.members} member(s)
        </span>
      </label>
      <div className="flex flex-col justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={reason.trim().length < 3}
          isLoading={busy}
          onClick={() => void save()}
        >
          Save role
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="danger"
            disabled={reason.trim().length < 3 || role._count.members > 0}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        ) : null}
        {error ? (
          <p className="text-xs text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TenantAccessManager({
  currentUserId,
  permissions,
  roles,
  tenantName,
  displaySection = 'all',
}: {
  currentUserId: string;
  permissions: string[];
  roles: string[];
  tenantName: string;
  displaySection?: 'all' | 'team' | 'security';
}) {
  const isAdministrator = roles.some((role) => role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN');
  const effectivePermissions = isAdministrator ? [...permissions, '*'] : permissions;
  const canReadMembers = hasPermission(effectivePermissions, 'users:read');
  const canUpdateMembers = hasPermission(effectivePermissions, 'users:update');
  const canReadInvites = hasPermission(effectivePermissions, 'invites:read');
  const canCreateInvites = hasPermission(effectivePermissions, 'invites:create');
  const canDeleteInvites = hasPermission(effectivePermissions, 'invites:delete');
  const canReadRoles = hasPermission(effectivePermissions, 'roles:read');
  const canCreateRoles = hasPermission(effectivePermissions, 'roles:create');
  const canUpdateRoles = hasPermission(effectivePermissions, 'roles:update');
  const canAssignRoles = hasPermission(effectivePermissions, 'roles:assign');
  // WI-OI-120x: an invitation offers only the base roles this viewer may give.
  const inviteRoles = givableRoles(null, effectivePermissions, isAdministrator);
  const canDeleteRoles = hasPermission(effectivePermissions, 'roles:delete');
  const canReadSettings = hasPermission(effectivePermissions, 'settings:read');
  const canUpdateSettings = hasPermission(effectivePermissions, 'settings:update');
  const canReadTenant = hasPermission(effectivePermissions, 'tenant:read');
  const canUpdateTenant = hasPermission(effectivePermissions, 'tenant:update');
  const canExportTenant = hasPermission(effectivePermissions, 'tenant:export');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableMemberRole>('MEMBER');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [creating, setCreating] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [enforceMfa, setEnforceMfa] = useState(false);
  const [mfaReason, setMfaReason] = useState('');
  const [savingMfa, setSavingMfa] = useState(false);
  const [domainStatus, setDomainStatus] = useState<TenantDomainStatus | null>(null);
  const [domainName, setDomainName] = useState('');
  const [domainReason, setDomainReason] = useState('');
  const [domainChallenge, setDomainChallenge] = useState<TenantDomainChallenge | null>(null);
  const [savingDomain, setSavingDomain] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const requests: Promise<void>[] = [];
      if (canReadMembers) {
        requests.push(
          fetch('/api/control/tenants/current/members', { cache: 'no-store' }).then(
            async (response) => {
              if (!response.ok)
                throw new Error(await readError(response, 'Members could not be loaded.'));
              const payload: unknown = await response.json();
              if (!Array.isArray(payload))
                throw new Error('Member service returned an invalid response.');
              setMembers(payload as Member[]);
            },
          ),
        );
      }
      if (canReadInvites) {
        requests.push(
          fetch('/api/control/tenants/current/invitations', { cache: 'no-store' }).then(
            async (response) => {
              if (!response.ok)
                throw new Error(await readError(response, 'Invitations could not be loaded.'));
              const payload: unknown = await response.json();
              if (!Array.isArray(payload))
                throw new Error('Invitation service returned an invalid response.');
              setInvitations(payload as Invitation[]);
            },
          ),
        );
      }
      if (canReadRoles) {
        requests.push(
          fetch('/api/control/tenants/current/roles', { cache: 'no-store' }).then(
            async (response) => {
              if (!response.ok) {
                throw new Error(await readError(response, 'Custom roles could not be loaded.'));
              }
              const payload: unknown = await response.json();
              if (!Array.isArray(payload)) {
                throw new Error('Custom role service returned an invalid response.');
              }
              setCustomRoles(payload as CustomRole[]);
            },
          ),
        );
      }
      if (canReadSettings) {
        requests.push(
          fetch('/api/control/settings', { cache: 'no-store' }).then(async (response) => {
            if (!response.ok) {
              throw new Error(await readError(response, 'Security settings could not be loaded.'));
            }
            const payload = (await response.json()) as TenantSettings;
            if (
              !Number.isSafeInteger(payload?.version) ||
              typeof payload?.security?.enforceMfa !== 'boolean'
            ) {
              throw new Error('Settings service returned an invalid response.');
            }
            setSettings(payload);
            setEnforceMfa(payload.security.enforceMfa);
          }),
        );
      }
      if (canReadTenant) {
        requests.push(
          fetch('/api/control/tenants/current/domain', { cache: 'no-store' }).then(
            async (response) => {
              if (!response.ok) {
                throw new Error(await readError(response, 'Tenant domain could not be loaded.'));
              }
              const payload = (await response.json()) as TenantDomainStatus;
              if (
                ![
                  'NOT_CONFIGURED',
                  'UNVERIFIED',
                  'PENDING',
                  'LOCKED',
                  'EXPIRED',
                  'VERIFIED',
                ].includes(payload?.status)
              ) {
                throw new Error('Tenant domain service returned an invalid response.');
              }
              setDomainStatus(payload);
              setDomainName(payload.domain ?? '');
            },
          ),
        );
      }
      await Promise.all(requests);
    } catch (requestError) {
      setPageError(
        requestError instanceof Error
          ? requestError.message
          : 'Tenant access data could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [canReadInvites, canReadMembers, canReadRoles, canReadSettings, canReadTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setPageError(null);
    setCreatedInvitation(null);
    try {
      const response = await fetch('/api/control/tenants/current/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRoles.includes(role) ? role : inviteRoles[0], expiresInHours }),
      });
      if (!response.ok)
        throw new Error(await readError(response, 'Invitation could not be created.'));
      const payload = (await response.json()) as CreatedInvitation;
      if (!payload.token || payload.delivery !== 'MANUAL_SECURE_LINK') {
        throw new Error('Invitation service returned an invalid response.');
      }
      setCreatedInvitation(payload);
      setEmail('');
      await load();
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : 'Invitation could not be created.',
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (invitation: Invitation) => {
    setPageError(null);
    const response = await fetch(`/api/control/tenants/current/invitations/${invitation.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setPageError(await readError(response, 'Invitation could not be revoked.'));
      return;
    }
    await load();
  };

  const createCustomRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingRole(true);
    setPageError(null);
    try {
      const response = await fetch('/api/control/tenants/current/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName,
          description: newRoleDescription || null,
          color: '#6366f1',
          permissions: newRolePermissions,
        }),
      });
      if (!response.ok)
        throw new Error(await readError(response, 'Custom role could not be created.'));
      setNewRoleName('');
      setNewRoleDescription('');
      setNewRolePermissions([]);
      await load();
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : 'Custom role could not be created.',
      );
    } finally {
      setCreatingRole(false);
    }
  };

  const saveMfaPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSavingMfa(true);
    setPageError(null);
    try {
      const response = await fetch('/api/control/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: settings.version,
          security: { enforceMfa },
          changeReason: mfaReason,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, 'MFA policy update failed.'));
      const payload = (await response.json()) as TenantSettings;
      setSettings(payload);
      setEnforceMfa(payload.security.enforceMfa);
      setMfaReason('');
      if (payload.security.enforceMfa) window.location.assign('/mfa');
    } catch (requestError) {
      setPageError(
        requestError instanceof Error ? requestError.message : 'MFA policy update failed.',
      );
    } finally {
      setSavingMfa(false);
    }
  };

  const createDomainChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingDomain(true);
    setPageError(null);
    setDomainChallenge(null);
    try {
      const response = await fetch('/api/control/tenants/current/domain/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainName, reason: domainReason }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Domain challenge could not be created.'));
      }
      const payload = (await response.json()) as TenantDomainChallenge;
      if (!payload.verificationValue || payload.status !== 'PENDING' || !payload.recordName) {
        throw new Error('Tenant domain service returned an invalid challenge.');
      }
      setDomainChallenge(payload);
      setDomainStatus(payload);
      setDomainName(payload.domain ?? '');
      setDomainReason('');
    } catch (requestError) {
      setPageError(
        requestError instanceof Error
          ? requestError.message
          : 'Domain challenge could not be created.',
      );
    } finally {
      setSavingDomain(false);
    }
  };

  const verifyDomain = async () => {
    setSavingDomain(true);
    setPageError(null);
    try {
      const response = await fetch('/api/control/tenants/current/domain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: domainReason }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Domain ownership could not be verified.'));
      }
      const payload = (await response.json()) as TenantDomainStatus;
      if (payload.status !== 'VERIFIED') {
        throw new Error('Tenant domain service did not return verified ownership.');
      }
      setDomainStatus(payload);
      setDomainChallenge(null);
      setDomainReason('');
    } catch (requestError) {
      setPageError(
        requestError instanceof Error
          ? requestError.message
          : 'Domain ownership could not be verified.',
      );
    } finally {
      setSavingDomain(false);
    }
  };

  const revokeDomain = async () => {
    setSavingDomain(true);
    setPageError(null);
    try {
      const response = await fetch(
        `/api/control/tenants/current/domain?reason=${encodeURIComponent(domainReason)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        throw new Error(await readError(response, 'Tenant domain could not be removed.'));
      }
      setDomainStatus((await response.json()) as TenantDomainStatus);
      setDomainChallenge(null);
      setDomainName('');
      setDomainReason('');
    } catch (requestError) {
      setPageError(
        requestError instanceof Error
          ? requestError.message
          : 'Tenant domain could not be removed.',
      );
    } finally {
      setSavingDomain(false);
    }
  };

  const invitationLink =
    createdInvitation && typeof window !== 'undefined'
      ? // WI-OI-120n (security review): the token travels after `#`, which browsers never send to a server or proxy log.
        `${window.location.origin}/select-tenant#invite=${encodeURIComponent(createdInvitation.token)}`
      : '';

  const showSecurity = displaySection === 'all' || displaySection === 'security';
  const showTeam = displaySection === 'all' || displaySection === 'team';

  const content = (
    <div className="space-y-6">
      {pageError ? (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          role="alert"
        >
          {pageError}
        </div>
      ) : null}

      {showSecurity && canReadTenant ? (
        <Card>
          <CardHeader>
            <CardTitle>Verified organization domain</CardTitle>
            <CardDescription>
              Prove ownership with a real DNS TXT record before this domain can be used as an SSO
              trust boundary. A challenge expires after 24 hours and its value is shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <p>
                <span className="font-medium">Current claim:</span>{' '}
                {domainStatus?.domain ?? 'Not configured'}
              </p>
              <p>
                <span className="font-medium">Status:</span>{' '}
                {domainStatus?.status.replaceAll('_', ' ') ?? 'Loading'}
              </p>
              <p>
                <span className="font-medium">Claim verified:</span>{' '}
                {domainStatus?.status === 'VERIFIED' && domainStatus.verifiedAt
                  ? formatDate(domainStatus.verifiedAt)
                  : 'No'}
              </p>
            </div>
            {domainStatus?.activeDomain && domainStatus.activeDomain !== domainStatus.domain ? (
              <p className="text-sm text-zinc-700">
                Active verified domain:{' '}
                <span className="font-mono">{domainStatus.activeDomain}</span>
                {domainStatus.activeDomainVerifiedAt
                  ? ` since ${formatDate(domainStatus.activeDomainVerifiedAt)}`
                  : ''}
              </p>
            ) : null}
            {domainChallenge ? (
              <output className="block rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-semibold text-amber-950">
                  Add this TXT record now. The challenge value cannot be retrieved later.
                </p>
                <dl className="mt-3 grid gap-2">
                  <div>
                    <dt className="font-medium text-amber-900">Record name</dt>
                    <dd className="break-all font-mono">{domainChallenge.recordName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-amber-900">TXT value</dt>
                    <dd className="break-all font-mono">{domainChallenge.verificationValue}</dd>
                  </div>
                </dl>
              </output>
            ) : domainStatus?.status === 'PENDING' ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                A challenge is pending for {domainStatus.recordName}. Its secret value is no longer
                available; create a new challenge if it was not saved.
              </p>
            ) : null}
            {canUpdateTenant ? (
              <form
                className="grid gap-3 md:grid-cols-[minmax(15rem,1fr)_minmax(16rem,2fr)_auto]"
                onSubmit={createDomainChallenge}
              >
                <label className="text-xs font-medium text-zinc-700">
                  Public DNS hostname
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                    placeholder="login.company.com"
                    required
                    value={domainName}
                    onChange={(event) => setDomainName(event.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-zinc-700">
                  Change reason
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                    placeholder="Required for challenge, verify, or removal"
                    required
                    minLength={3}
                    value={domainReason}
                    onChange={(event) => setDomainReason(event.target.value)}
                  />
                </label>
                <Button
                  className="self-end"
                  type="submit"
                  variant="primary"
                  disabled={domainReason.trim().length < 3}
                  isLoading={savingDomain}
                >
                  Create challenge
                </Button>
              </form>
            ) : null}
            {canUpdateTenant && domainStatus?.status === 'PENDING' ? (
              <Button
                type="button"
                variant="primary"
                disabled={domainReason.trim().length < 3}
                isLoading={savingDomain}
                onClick={() => void verifyDomain()}
              >
                Verify DNS now
              </Button>
            ) : null}
            {canUpdateTenant && domainStatus?.domain ? (
              <Button
                type="button"
                variant="danger"
                disabled={domainReason.trim().length < 3}
                isLoading={savingDomain}
                onClick={() => void revokeDomain()}
              >
                Remove domain
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showSecurity && canReadSettings ? <TenantOidcManager canUpdate={canUpdateSettings} /> : null}

      {showSecurity && canReadSettings ? (
        <Card>
          <CardHeader>
            <CardTitle>Session MFA policy</CardTitle>
            <CardDescription>
              Require every member to verify a persisted TOTP authenticator after password sign-in
              or workspace switching. Existing unverified sessions are blocked on their next
              request.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {settings ? (
              <form
                className="grid gap-4 md:grid-cols-[minmax(16rem,1fr)_minmax(16rem,2fr)_auto]"
                onSubmit={saveMfaPolicy}
              >
                <label className="flex items-center gap-3 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={enforceMfa}
                    disabled={!canUpdateSettings}
                    onChange={(event) => setEnforceMfa(event.target.checked)}
                  />
                  Enforce TOTP for this tenant
                </label>
                <label className="text-xs font-medium text-zinc-700">
                  Change reason
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                    disabled={!canUpdateSettings}
                    placeholder="Required for a security policy change"
                    value={mfaReason}
                    onChange={(event) => setMfaReason(event.target.value)}
                  />
                </label>
                {canUpdateSettings ? (
                  <Button
                    className="self-end"
                    type="submit"
                    variant="primary"
                    disabled={
                      enforceMfa === settings.security.enforceMfa || mfaReason.trim().length < 3
                    }
                    isLoading={savingMfa}
                  >
                    Save MFA policy
                  </Button>
                ) : null}
              </form>
            ) : (
              <p className="text-sm text-zinc-500">Loading security policy…</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showSecurity && canReadMembers ? (
        <MfaAssistedRecoveryManager
          canRequest={canUpdateMembers}
          currentUserId={currentUserId}
          enforceMfa={settings?.security.enforceMfa === true}
          members={members}
        />
      ) : null}

      {showSecurity ? <TenantDataExportManager enabled={canExportTenant} /> : null}

      {showTeam && (
        <>
          {canCreateInvites ? (
            <Card>
              <CardHeader>
                <CardTitle>Invite a member</CardTitle>
            <CardDescription>
              The recipient must register with this email. Secure email delivery is not configured,
              so the link is shown once for manual secure delivery.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form
              className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_10rem_auto]"
              onSubmit={createInvite}
            >
              <label className="text-xs font-medium text-zinc-700">
                Email
                <input
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Role
                <select
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2"
                  value={inviteRoles.includes(role) ? role : inviteRoles[0]}
                  onChange={(event) => setRole(event.target.value as AssignableMemberRole)}
                >
                  {inviteRoles.map((option) => (
                    <option key={option} value={option}>
                      {roleLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Expires in hours
                <input
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  type="number"
                  min={1}
                  max={168}
                  required
                  value={expiresInHours}
                  onChange={(event) => setExpiresInHours(Number(event.target.value))}
                />
              </label>
              <Button className="self-end" type="submit" variant="primary" isLoading={creating}>
                Create invitation
              </Button>
            </form>
            {createdInvitation ? (
              <output className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">
                  Copy this link now. It will not be shown again.
                </p>
                <p className="mt-1 text-xs text-amber-900">
                  Share it only through an approved secure channel. The database stores a SHA-256
                  digest, not this credential.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="One-time invitation link"
                    className="h-9 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 font-mono text-xs"
                    readOnly
                    value={invitationLink}
                  />
                  <Button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(invitationLink)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="transparent"
                    onClick={() => setCreatedInvitation(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </output>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Custom roles</CardTitle>
          <CardDescription>
            Add tenant-scoped permissions to a member's base role. Platform permissions and
            unvalidated permission formats are rejected by the server.
          </CardDescription>
        </CardHeader>
        {canCreateRoles ? (
          <CardContent className="pt-6">
            <form
              className="grid gap-3 lg:grid-cols-[12rem_minmax(12rem,1fr)_minmax(18rem,2fr)_auto]"
              onSubmit={createCustomRole}
            >
              <label className="text-xs font-medium text-zinc-700">
                Role name
                <input
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  minLength={2}
                  required
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Description
                <input
                  className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                  value={newRoleDescription}
                  onChange={(event) => setNewRoleDescription(event.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Permission additions ({newRolePermissions.length})
                <select
                  multiple
                  className="mt-1 h-28 w-full rounded-md border border-zinc-200 bg-white p-2 font-mono"
                  value={newRolePermissions}
                  onChange={(event) => setNewRolePermissions(selectedPermissions(event))}
                >
                  <PermissionOptions held={newRolePermissions} />
                </select>
              </label>
              <Button className="self-end" type="submit" variant="primary" isLoading={creatingRole}>
                Create role
              </Button>
            </form>
          </CardContent>
        ) : null}
        {!canReadRoles ? (
          <p className="border-t border-zinc-100 p-6 text-sm text-zinc-600">
            You do not have permission to list custom roles.
          </p>
        ) : loading ? (
          <p className="border-t border-zinc-100 p-6 text-sm text-zinc-500">
            Loading custom roles…
          </p>
        ) : customRoles.length === 0 ? (
          <p className="border-t border-zinc-100 p-6 text-sm text-zinc-500">
            No custom roles have been created.
          </p>
        ) : canUpdateRoles ? (
          customRoles.map((customRole) =>
            customRole.isSystem ? (
              <BuiltInRoleRow key={customRole.id} role={customRole} />
            ) : (
              <CustomRoleRow
                key={customRole.id}
                role={customRole}
                roles={customRoles}
                canDelete={canDeleteRoles}
                onSaved={load}
              />
            ),
          )
        ) : (
          <ul className="border-t border-zinc-100 p-6 text-sm text-zinc-700">
            {customRoles.map((customRole) => (
              <li key={customRole.id}>
                {customRole.name}: {customRole.permissions.join(', ') || 'No permission additions'}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Suspending a member immediately revokes that member's active sessions for this
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!canReadMembers ? (
            <p className="p-6 text-sm text-zinc-600">
              You do not have permission to list tenant members.
            </p>
          ) : loading ? (
            <p className="p-6 text-sm text-zinc-500">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">No persisted memberships were found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Roles</TableHead>
                  {canUpdateMembers ? <TableHead>Change control</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    currentUserId={currentUserId}
                    canUpdate={canUpdateMembers}
                    isAdministrator={isAdministrator}
                    canAssignRoles={canAssignRoles}
                    viewerPermissions={effectivePermissions}
                    customRoles={customRoles}
                    onSaved={load}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>Invitation credentials are never returned by this list.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!canReadInvites ? (
            <p className="p-6 text-sm text-zinc-600">
              You do not have permission to list invitations.
            </p>
          ) : loading ? (
            <p className="p-6 text-sm text-zinc-500">Loading invitations…</p>
          ) : invitations.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">No invitations have been created.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  {canDeleteInvites ? <TableHead>Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const status = invitationStatus(invitation);
                  return (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>{roleLabel(invitation.role)}</TableCell>
                      <TableCell>{status}</TableCell>
                      <TableCell>{formatDate(invitation.expiresAt)}</TableCell>
                      {canDeleteInvites ? (
                        <TableCell>
                          {status === 'Pending' ? (
                            <Button
                              type="button"
                              size="small"
                              variant="danger"
                              onClick={() => void revoke(invitation)}
                            >
                              Revoke
                            </Button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );

  if (displaySection !== 'all') {
    return content;
  }

  return (
    <PageShell
      eyebrow="Tenant administration"
      title={`${tenantName} access`}
      description="Manage persisted tenant memberships and invitation credentials. Every change is enforced server-side and written to the audit log."
    >
      {content}
    </PageShell>
  );
}
