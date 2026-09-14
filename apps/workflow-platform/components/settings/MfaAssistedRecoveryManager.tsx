'use client';

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
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

interface RecoveryMember {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  user: { id: string; email: string; name: string | null; status: string };
}

type RecoveryStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CONSUMED' | 'EXPIRED';

interface AssistedRecovery {
  id: string;
  status: RecoveryStatus;
  requestReason: string;
  identityEvidenceReference: string;
  expiresAt: string;
  approvedAt: string | null;
  consumedAt: string | null;
  rejectedAt: string | null;
  requestedById: string;
  approvedById: string | null;
  rejectedById: string | null;
  createdAt: string;
  updatedAt: string;
  targetUser: { id: string; email: string; name: string | null; status: string };
}

interface ApprovedRecovery extends AssistedRecovery {
  grant: string;
  delivery: 'DISPLAY_ONCE';
}

interface ErrorPayload {
  detail?: unknown;
  message?: unknown;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  if (Array.isArray(payload?.message)) return payload.message.join(', ');
  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Invalid date' : parsed.toLocaleString();
}

function statusClass(status: RecoveryStatus): string {
  if (status === 'REQUESTED') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'APPROVED') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'CONSUMED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-zinc-200 bg-zinc-100 text-zinc-600';
}

export function MfaAssistedRecoveryManager({
  canRequest,
  currentUserId,
  enforceMfa,
  members,
}: {
  canRequest: boolean;
  currentUserId: string;
  enforceMfa: boolean;
  members: RecoveryMember[];
}) {
  const eligibleMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === 'ACTIVE' &&
          member.user.status === 'ACTIVE' &&
          member.user.id !== currentUserId,
      ),
    [currentUserId, members],
  );
  const [recoveries, setRecoveries] = useState<AssistedRecovery[]>([]);
  const [targetMemberId, setTargetMemberId] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [displayOnceGrant, setDisplayOnceGrant] = useState<ApprovedRecovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/control/auth/mfa/assisted-recovery', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Recovery requests could not be loaded.'));
      }
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Recovery service returned an invalid response.');
      }
      setRecoveries(payload as AssistedRecovery[]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Recovery requests could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!targetMemberId && eligibleMembers[0]) setTargetMemberId(eligibleMembers[0].id);
  }, [eligibleMembers, targetMemberId]);

  const createRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId('create');
    setError(null);
    try {
      const response = await fetch('/api/control/auth/mfa/assisted-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMemberId,
          identityEvidenceReference: evidenceReference,
          reason: requestReason,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Recovery request could not be created.'));
      }
      setEvidenceReference('');
      setRequestReason('');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Recovery request could not be created.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (recovery: AssistedRecovery, decision: 'approve' | 'reject') => {
    setBusyId(recovery.id);
    setError(null);
    setDisplayOnceGrant(null);
    try {
      const response = await fetch(
        `/api/control/auth/mfa/assisted-recovery/${encodeURIComponent(recovery.id)}/${decision}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: decisionReasons[recovery.id] ?? '' }),
        },
      );
      if (!response.ok) {
        throw new Error(await readError(response, `Recovery request could not be ${decision}d.`));
      }
      const payload = (await response.json()) as AssistedRecovery | ApprovedRecovery;
      if (decision === 'approve') {
        const approved = payload as ApprovedRecovery;
        if (approved.delivery !== 'DISPLAY_ONCE' || !/^[A-Za-z0-9_-]{43}$/.test(approved.grant)) {
          throw new Error('Recovery service returned an invalid one-time grant.');
        }
        setDisplayOnceGrant(approved);
      }
      setDecisionReasons((current) => ({ ...current, [recovery.id]: '' }));
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Recovery request could not be ${decision}d.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administrator-assisted MFA recovery</CardTitle>
        <CardDescription>
          Reset a member who lost both their authenticator and recovery codes. One administrator
          requests the reset, a different MFA-verified administrator approves it, and the target
          consumes a display-once grant after signing in again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {!enforceMfa ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Enable the tenant MFA policy before creating an assisted-recovery request.
          </p>
        ) : null}

        {displayOnceGrant ? (
          <output className="block rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Copy this recovery grant now. It cannot be retrieved again.
            </p>
            <p className="mt-1 text-xs text-amber-900">
              Deliver it only to {displayOnceGrant.targetUser.email} through the approved support
              channel. It expires at {formatDate(displayOnceGrant.expiresAt)}.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Display-once assisted recovery grant"
                className="h-9 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 font-mono text-xs"
                readOnly
                value={displayOnceGrant.grant}
              />
              <Button
                type="button"
                onClick={() => void navigator.clipboard.writeText(displayOnceGrant.grant)}
              >
                Copy grant
              </Button>
              <Button type="button" variant="transparent" onClick={() => setDisplayOnceGrant(null)}>
                Dismiss
              </Button>
            </div>
          </output>
        ) : null}

        {canRequest ? (
          <form
            className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_minmax(16rem,2fr)_auto]"
            onSubmit={createRequest}
          >
            <label className="text-xs font-medium text-zinc-700">
              Member to recover
              <select
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2"
                required
                value={targetMemberId}
                onChange={(event) => setTargetMemberId(event.target.value)}
              >
                {eligibleMembers.length === 0 ? <option value="">No eligible member</option> : null}
                {eligibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user.name || member.user.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-700">
              Identity evidence reference
              <input
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                maxLength={500}
                minLength={3}
                placeholder="SUPPORT-CASE-1234"
                required
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-zinc-700">
              Request reason
              <input
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                maxLength={500}
                minLength={3}
                placeholder="Verified device loss through support procedure"
                required
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
              />
            </label>
            <Button
              className="self-end"
              type="submit"
              variant="primary"
              disabled={
                !enforceMfa ||
                !targetMemberId ||
                evidenceReference.trim().length < 3 ||
                requestReason.trim().length < 3
              }
              isLoading={busyId === 'create'}
            >
              Request recovery
            </Button>
          </form>
        ) : null}

        <p className="text-xs text-zinc-500">
          Full testing requires three distinct active users: target, requesting administrator and
          approving administrator. The target must already have a verified authenticator.
        </p>

        {error ? (
          <p
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading assisted-recovery history…</p>
        ) : recoveries.length === 0 ? (
          <p className="text-sm text-zinc-500">No assisted-recovery requests exist.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence and reason</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recoveries.map((recovery) => {
                  const mayDecide =
                    canRequest &&
                    recovery.status === 'REQUESTED' &&
                    recovery.requestedById !== currentUserId &&
                    recovery.targetUser.id !== currentUserId;
                  const decisionReason = decisionReasons[recovery.id] ?? '';
                  return (
                    <TableRow key={recovery.id}>
                      <TableCell>
                        <p className="font-medium text-zinc-900">
                          {recovery.targetUser.name || 'Unnamed user'}
                        </p>
                        <p className="text-zinc-500">{recovery.targetUser.email}</p>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(recovery.status)}`}
                        >
                          {recovery.status}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-80">
                        <p className="font-mono text-xs">{recovery.identityEvidenceReference}</p>
                        <p className="mt-1 text-xs text-zinc-500">{recovery.requestReason}</p>
                      </TableCell>
                      <TableCell>{formatDate(recovery.expiresAt)}</TableCell>
                      <TableCell className="min-w-64">
                        {mayDecide ? (
                          <div className="space-y-2">
                            <input
                              aria-label={`Decision reason for ${recovery.targetUser.email}`}
                              className="h-8 w-full rounded-md border border-zinc-200 px-2 text-xs"
                              maxLength={500}
                              minLength={3}
                              placeholder="Decision reason"
                              value={decisionReason}
                              onChange={(event) =>
                                setDecisionReasons((current) => ({
                                  ...current,
                                  [recovery.id]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="small"
                                variant="primary"
                                disabled={decisionReason.trim().length < 3}
                                isLoading={busyId === recovery.id}
                                onClick={() => void decide(recovery, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="small"
                                variant="danger"
                                disabled={decisionReason.trim().length < 3}
                                onClick={() => void decide(recovery, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ) : recovery.status === 'REQUESTED' ? (
                          <span className="text-xs text-zinc-500">
                            Another MFA-verified administrator must decide.
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            {recovery.status === 'APPROVED'
                              ? `Approved ${formatDate(recovery.approvedAt)}`
                              : recovery.status === 'CONSUMED'
                                ? `Consumed ${formatDate(recovery.consumedAt)}`
                                : recovery.status === 'REJECTED'
                                  ? `Rejected ${formatDate(recovery.rejectedAt)}`
                                  : 'Expired'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
