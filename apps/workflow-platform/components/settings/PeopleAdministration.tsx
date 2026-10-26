'use client';

// WI-OI-120p (S17, people administration): the console a delegated department head uses to add, track and off-board
// people within the units they manage — the web surface for the R13/R14 control-plane endpoints
// (`current/delegated-invitations[/bulk,/bulk/resend,/bulk/revoke]`, `current/delegated-grants`,
// `current/members/bulk-offboard`). Each section is shown only when the member holds the permission that endpoint
// requires: bulk invite / tracker / resend / revoke need `people:manage` (a head's scoped grant), the tracker alone
// needs `people:read`, and off-boarding needs `users:update` (a workspace administrator). The control plane is the
// authority — it validates every row against the head's units and the department's allowances and returns per-row
// errors — so this UI stays lenient and simply surfaces what the server says.

import { OrgUnitPicker, useUnitNames } from '@/components/organization/OrgShared';
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
import {
  type CreatedInvite,
  inviteAcceptUrl,
  inviteLinksText,
  parsePeopleList,
} from '@/lib/people-admin-parse';
import { type InviteStatus, type OrgUnitV1, holdsAnyPermission } from '@gigalibs/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WorkspaceRole {
  id: string;
  name: string;
  color: string;
}

interface DelegatedInvite {
  id: string;
  email: string;
  unitId: string | null;
  customRoleIds: string[];
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  status: InviteStatus;
}

interface OffboardMember {
  id: string;
  status: string;
  user: { email: string; name: string | null };
}

interface RowError {
  index: number;
  email: string;
  code: string;
  message: string;
}

async function readError(
  response: Response,
  fallback: string,
): Promise<{ message: string; errors?: RowError[] }> {
  try {
    const body = (await response.json()) as {
      message?: unknown;
      detail?: unknown;
      errors?: unknown;
    };
    const errors = Array.isArray(body.errors) ? (body.errors as RowError[]) : undefined;
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof body.detail === 'string'
          ? body.detail
          : fallback;
    return { message, errors };
  } catch {
    return { message: fallback };
  }
}

const STATUS_STYLE: Record<InviteStatus, string> = {
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  REVOKED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function StatusBadge({ status }: { status: InviteStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);

function download(filename: string, text: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The created/regenerated one-time links, with copy-one, copy-all and download, shown after invite or resend. */
function InviteLinks({ title, invites }: { title: string; invites: CreatedInvite[] }) {
  if (invites.length === 0) return null;
  const handout = inviteLinksText(origin(), invites);
  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-emerald-900">
          {title} — {invites.length} one-time link{invites.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={() => void navigator.clipboard?.writeText(handout)}
          >
            Copy all
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => download('invitation-links.txt', handout)}
          >
            Download
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-emerald-800">
        Email is not wired yet, so share each link with its person directly. The token travels after
        “#”, so it is never sent to a server.
      </p>
      <ul className="mt-3 space-y-1.5">
        {invites.map((invite) => (
          <li key={invite.email} className="flex items-center gap-2 text-xs">
            <span className="w-56 shrink-0 truncate font-medium text-zinc-700">{invite.email}</span>
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-[11px] text-zinc-600 border border-emerald-200">
              {inviteAcceptUrl(origin(), invite.token)}
            </code>
            <Button
              size="small"
              variant="transparent"
              onClick={() =>
                void navigator.clipboard?.writeText(inviteAcceptUrl(origin(), invite.token))
              }
            >
              Copy
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowErrors({ errors, total }: { errors: RowError[]; total: number }) {
  return (
    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
      <p className="text-sm font-semibold text-rose-900">
        {errors.length} of {total} row{total === 1 ? '' : 's'} could not be added — nothing was
        created. Fix these and try again:
      </p>
      <ul className="mt-2 space-y-1 text-xs text-rose-800">
        {errors.map((error) => (
          <li key={`${error.index}-${error.code}`}>
            <span className="font-medium">Row {error.index + 1}</span>
            {error.email ? ` (${error.email})` : ''}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bulk invite: pick a unit and the roles, paste the people, send. Needs `people:manage`. */
function BulkInviteSection({
  roles,
  onInvited,
}: { roles: WorkspaceRole[]; onInvited: () => void }) {
  const [unit, setUnit] = useState<OrgUnitV1 | null>(null);
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<CreatedInvite[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parsePeopleList(emails), [emails]);
  const ready = unit !== null && roleIds.size > 0 && parsed.people.length > 0 && !sending;

  const toggleRole = (id: string) =>
    setRoleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!unit || roleIds.size === 0 || parsed.people.length === 0) return;
    setSending(true);
    setCreated([]);
    setRowErrors(null);
    setError(null);
    try {
      const rows = parsed.people.map((person) => ({
        email: person.email,
        unit: unit.id,
        roleIds: [...roleIds],
        ...(person.name ? { name: person.name } : {}),
      }));
      const response = await fetch('/api/control/tenants/current/delegated-invitations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, expiresInHours }),
      });
      if (!response.ok) {
        const failure = await readError(response, 'The invitations could not be created.');
        setRowErrors(failure.errors ?? null);
        if (!failure.errors) setError(failure.message);
        return;
      }
      const data = (await response.json()) as { count: number; invites: CreatedInvite[] };
      setCreated(data.invites);
      setEmails('');
      onInvited();
    } catch {
      setError('The invitations could not be created. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people in bulk</CardTitle>
        <CardDescription>
          Choose a unit and the roles they should get, then paste one email per line (an optional
          name after a comma). Everyone is invited into that unit with those roles; every row is
          checked before anything is created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OrgUnitPicker label="Unit" value={unit} onChange={setUnit} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ui-fg-base">Roles</p>
          {roles.length === 0 ? (
            <p className="text-xs text-ui-fg-subtle">
              No workspace roles yet — create one under Access first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const on = roleIds.has(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle'
                    }`}
                    aria-pressed={on}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                    {role.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="people-emails"
            className="mb-1.5 block text-sm font-medium text-ui-fg-base"
          >
            People
          </label>
          <textarea
            id="people-emails"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            rows={6}
            placeholder={'ada@example.com, Ada Lovelace\nalan@example.com'}
            className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 text-sm font-mono text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <p className="mt-1 text-xs text-ui-fg-subtle">
            {parsed.people.length} ready
            {parsed.duplicates > 0
              ? `, ${parsed.duplicates} duplicate${parsed.duplicates === 1 ? '' : 's'} removed`
              : ''}
            {parsed.invalidLines.length > 0
              ? `, line${parsed.invalidLines.length === 1 ? '' : 's'} ${parsed.invalidLines.join(', ')} have no email`
              : ''}
            .
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="people-expiry" className="text-sm text-ui-fg-subtle">
            Links expire in
          </label>
          <input
            id="people-expiry"
            type="number"
            min={1}
            max={168}
            value={expiresInHours}
            onChange={(event) =>
              setExpiresInHours(Math.max(1, Math.min(168, Number(event.target.value) || 72)))
            }
            className="w-20 rounded-md border border-ui-border-base px-2 py-1 text-sm"
          />
          <span className="text-sm text-ui-fg-subtle">hours</span>
          <Button
            className="ml-auto"
            variant="primary"
            disabled={!ready}
            isLoading={sending}
            onClick={() => void send()}
          >
            Send {parsed.people.length > 0 ? `${parsed.people.length} ` : ''}invitation
            {parsed.people.length === 1 ? '' : 's'}
          </Button>
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}
        {rowErrors && (
          <RowErrors errors={rowErrors} total={parsed.people.length || rowErrors.length} />
        )}
        <InviteLinks title="Invited" invites={created} />
      </CardContent>
    </Card>
  );
}

/** Join tracker: who has joined, with bulk resend and revoke of still-pending invites. Needs `people:read`. */
function JoinTrackerSection({ canManage, reloadKey }: { canManage: boolean; reloadKey: number }) {
  const [invites, setInvites] = useState<DelegatedInvite[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState<CreatedInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unitNames = useUnitNames(
    (invites ?? []).map((invite) => invite.unitId ?? '').filter(Boolean),
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/control/tenants/current/delegated-invitations', {
        cache: 'no-store',
      });
      if (!response.ok) {
        setInvites([]);
        return;
      }
      const data = (await response.json()) as { invites: DelegatedInvite[] };
      setInvites(data.invites);
      setSelected(new Set());
    } catch {
      setInvites([]);
      setError('The join tracker could not be loaded.');
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional trigger to refetch the tracker after a bulk invite.
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const pending = (invites ?? []).filter((invite) => invite.status === 'PENDING');
  const togglePending = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const act = async (action: 'resend' | 'revoke') => {
    if (selected.size === 0) return;
    setBusy(true);
    setResent([]);
    setError(null);
    try {
      const response = await fetch(
        `/api/control/tenants/current/delegated-invitations/bulk/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteIds: [...selected], expiresInHours: 72 }),
        },
      );
      if (!response.ok) {
        setError(
          (
            await readError(
              response,
              `The invitations could not be ${action === 'resend' ? 'resent' : 'revoked'}.`,
            )
          ).message,
        );
        return;
      }
      if (action === 'resend') {
        const data = (await response.json()) as { invites: CreatedInvite[] };
        setResent(data.invites);
      }
      await load();
    } catch {
      setError('That action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join tracker</CardTitle>
        <CardDescription>
          Everyone invited into your units and whether they have joined. Select still-pending
          invitations to resend a fresh link or revoke them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invites === null ? (
          <p className="text-sm text-ui-fg-subtle">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No invitations into your units yet.</p>
        ) : (
          <>
            {canManage && (
              <div className="mb-3 flex items-center gap-2">
                <Button
                  size="small"
                  variant="secondary"
                  disabled={selected.size === 0 || busy}
                  onClick={() => void act('resend')}
                >
                  Resend selected ({selected.size})
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  disabled={selected.size === 0 || busy}
                  onClick={() => void act('revoke')}
                >
                  Revoke selected
                </Button>
                <span className="text-xs text-ui-fg-subtle">{pending.length} pending</span>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead className="w-8" />}
                  <TableHead>Email</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    {canManage && (
                      <TableCell>
                        {invite.status === 'PENDING' && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${invite.email}`}
                            checked={selected.has(invite.id)}
                            onChange={() => togglePending(invite.id)}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-ui-fg-base">{invite.email}</TableCell>
                    <TableCell className="text-ui-fg-subtle">
                      {invite.unitId ? (unitNames[invite.unitId] ?? invite.unitId) : '—'}
                    </TableCell>
                    <TableCell className="text-ui-fg-subtle">
                      {invite.customRoleIds.length}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invite.status} />
                    </TableCell>
                    <TableCell className="text-ui-fg-subtle">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <InviteLinks title="Resent" invites={resent} />
      </CardContent>
    </Card>
  );
}

/** Bulk off-board: suspend many members at once, with a reason. Needs `users:update`; the last admin is protected. */
function BulkOffboardSection() {
  const [members, setMembers] = useState<OffboardMember[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/control/tenants/current/members', { cache: 'no-store' });
      if (!response.ok) {
        setMembers([]);
        return;
      }
      const data = (await response.json()) as OffboardMember[];
      setMembers(data.filter((member) => member.status !== 'SUSPENDED'));
      setSelected(new Set());
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = (members ?? []).filter((member) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      member.user.email.toLowerCase().includes(needle) ||
      (member.user.name ?? '').toLowerCase().includes(needle)
    );
  });

  const offboard = async () => {
    if (selected.size === 0 || reason.trim().length < 3) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/control/tenants/current/members/bulk-offboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [...selected], reason: reason.trim() }),
      });
      if (!response.ok) {
        setError((await readError(response, 'The members could not be off-boarded.')).message);
        return;
      }
      const data = (await response.json()) as { offboarded: number };
      setNotice(
        `${data.offboarded} member${data.offboarded === 1 ? '' : 's'} off-boarded (suspended). Roles are kept for a later return.`,
      );
      setReason('');
      await load();
    } catch {
      setError('The members could not be off-boarded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Off-board people in bulk</CardTitle>
        <CardDescription>
          Suspend several members at once — their access stops immediately while their roles are
          kept for a bounded return. The last workspace administrator can never be suspended.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people…"
          className="w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm"
        />
        <div className="max-h-64 overflow-auto rounded-lg border border-ui-border-base">
          {members === null ? (
            <p className="p-3 text-sm text-ui-fg-subtle">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="p-3 text-sm text-ui-fg-subtle">No active members match.</p>
          ) : (
            <ul className="divide-y divide-ui-border-base">
              {visible.map((member) => (
                <li key={member.id} className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${member.user.email}`}
                    checked={selected.has(member.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(member.id)) next.delete(member.id);
                        else next.add(member.id);
                        return next;
                      })
                    }
                  />
                  <span className="text-sm font-medium text-ui-fg-base">
                    {member.user.name ?? member.user.email}
                  </span>
                  <span className="text-xs text-ui-fg-subtle">{member.user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (recorded in the audit log)"
          className="w-full rounded-lg border border-ui-border-base px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-ui-fg-subtle">{selected.size} selected</span>
          <Button
            className="ml-auto"
            variant="danger"
            disabled={selected.size === 0 || reason.trim().length < 3 || busy}
            isLoading={busy}
            onClick={() => void offboard()}
          >
            Off-board selected
          </Button>
        </div>
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** Delegated grant: give allowed unit-scoped roles to people who are ALREADY members. Needs `people:manage`. */
function DelegatedGrantSection({ roles }: { roles: WorkspaceRole[] }) {
  const [unit, setUnit] = useState<OrgUnitV1 | null>(null);
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parsePeopleList(emails), [emails]);
  const ready = unit !== null && roleIds.size > 0 && parsed.people.length > 0 && !busy;

  const toggleRole = (id: string) =>
    setRoleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const grant = async () => {
    if (!unit || roleIds.size === 0 || parsed.people.length === 0) return;
    setBusy(true);
    setNotice(null);
    setRowErrors(null);
    setError(null);
    try {
      const rows = parsed.people.map((person) => ({
        email: person.email,
        unit: unit.id,
        roleIds: [...roleIds],
      }));
      const response = await fetch('/api/control/tenants/current/delegated-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) {
        const failure = await readError(response, 'The roles could not be granted.');
        setRowErrors(failure.errors ?? null);
        if (!failure.errors) setError(failure.message);
        return;
      }
      const data = (await response.json()) as {
        granted: number;
        skipped: { email: string; roleId: string }[];
      };
      const skipped = data.skipped.length;
      setNotice(
        `${data.granted} role grant${data.granted === 1 ? '' : 's'} applied${
          skipped > 0 ? `, ${skipped} skipped (already held)` : ''
        }.`,
      );
      setEmails('');
    } catch {
      setError('The roles could not be granted. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grant roles to existing people</CardTitle>
        <CardDescription>
          Give people who are already in the workspace an allowed role, scoped to one of your units.
          Paste one email per line; a role someone already holds is skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OrgUnitPicker label="Unit" value={unit} onChange={setUnit} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-ui-fg-base">Roles</p>
          {roles.length === 0 ? (
            <p className="text-xs text-ui-fg-subtle">No workspace roles yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const on = roleIds.has(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-ui-border-base bg-white text-ui-fg-base hover:bg-ui-bg-subtle'
                    }`}
                    aria-pressed={on}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                    {role.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <label
            htmlFor="grant-emails"
            className="mb-1.5 block text-sm font-medium text-ui-fg-base"
          >
            People (existing members)
          </label>
          <textarea
            id="grant-emails"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            rows={4}
            placeholder={'ada@example.com\nalan@example.com'}
            className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 text-sm font-mono text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <p className="mt-1 text-xs text-ui-fg-subtle">{parsed.people.length} ready.</p>
        </div>
        <div className="flex items-center">
          <Button
            className="ml-auto"
            variant="primary"
            disabled={!ready}
            isLoading={busy}
            onClick={() => void grant()}
          >
            Grant roles
          </Button>
        </div>
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {rowErrors && (
          <RowErrors errors={rowErrors} total={parsed.people.length || rowErrors.length} />
        )}
      </CardContent>
    </Card>
  );
}

export function PeopleAdministration({ permissions }: { permissions: string[] }) {
  const canManage = holdsAnyPermission(permissions, ['people:manage']);
  const canReadInvites = holdsAnyPermission(permissions, ['people:read', 'people:manage']);
  const canOffboard = holdsAnyPermission(permissions, ['users:update']);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [invitedAt, setInvitedAt] = useState(0);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void fetch('/api/control/tenants/current/roles', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: WorkspaceRole[]) => {
        if (!cancelled) setRoles(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  if (!canManage && !canReadInvites && !canOffboard) {
    return (
      <p className="text-sm text-ui-fg-subtle">
        People administration is delegated. Ask a workspace administrator to grant you a
        people-management role scoped to your department.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <BulkInviteSection roles={roles} onInvited={() => setInvitedAt((value) => value + 1)} />
      )}
      {canReadInvites && <JoinTrackerSection canManage={canManage} reloadKey={invitedAt} />}
      {canManage && <DelegatedGrantSection roles={roles} />}
      {canOffboard && <BulkOffboardSection />}
    </div>
  );
}
