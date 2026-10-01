'use client';

import type { OrgPage, OrgScopeGrantV1, OrgUnitV1 } from '@gigalibs/contracts';
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { describeOrgError, localDateTimeToIso, newIdempotencyKey, orgRequest, type OrgErrorView, type OrgPermissions } from './organization-client';
import { OrgErrorAlert, OrgSuccess, OrgUnitPicker, ReasonField, selectClassName, useUnitNames } from './OrgShared';
import type { OrgMember } from './OrgUnitsPanel';

/** Who may see and change what: a grant covers its unit and everything below it in the primary tree in force. */
export function OrgAccessPanel({ members, permissions, userNames }: { members: OrgMember[]; permissions: OrgPermissions; userNames: Record<string, string> }) {
  const ids = { member: useId(), filter: useId(), access: useId(), until: useId() };
  const [filterUser, setFilterUser] = useState('');
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const [page, setPage] = useState<OrgPage<OrgScopeGrantV1> | null>(null);
  const [loadError, setLoadError] = useState<OrgErrorView | null>(null);
  const [error, setError] = useState<OrgErrorView | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ userId: string; unit: OrgUnitV1 | null; access: 'READ' | 'READ_WRITE'; until: string; reason: string; key: string } | null>(null);
  const [revoking, setRevoking] = useState<OrgScopeGrantV1 | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const cursor = cursors[cursors.length - 1];
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams({ limit: '50', includeRevoked: String(includeRevoked) });
      if (filterUser) params.set('userId', filterUser);
      if (cursor) params.set('cursor', cursor);
      setPage(await orgRequest<OrgPage<OrgScopeGrantV1>>(`/grants?${params}`));
    } catch (caught) {
      setLoadError(describeOrgError(caught));
    }
  }, [filterUser, includeRevoked, cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const unitNames = useUnitNames(page?.items.map((grant) => grant.unitId) ?? []);
  const activeMembers = members.filter((member) => member.status === 'ACTIVE');

  const create = async () => {
    if (!form?.unit) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await orgRequest('/grants', {
        method: 'POST',
        body: {
          userId: form.userId,
          unitId: form.unit.id,
          access: form.access,
          reason: form.reason,
          idempotencyKey: form.key,
          ...(localDateTimeToIso(form.until) ? { effectiveTo: localDateTimeToIso(form.until) } : {}),
        },
      });
      setSuccess(`${userNames[form.userId] ?? 'The member'} now has ${form.access === 'READ' ? 'read' : 'read and write'} access to ${form.unit.code} and everything below it.`);
      setForm(null);
      await load();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await orgRequest(`/grants/${revoking.id}/revoke`, { method: 'POST', body: { reason: revokeReason } });
      setSuccess('Grant revoked.');
      setRevoking(null);
      setRevokeReason('');
      await load();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!permissions.grant)
    return (
      <Container className="p-6">
        <Heading level="h2">Access</Heading>
        <Text size="small" className="text-ui-fg-subtle">Managing member access needs the organization:grant permission.</Text>
      </Container>
    );

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Heading level="h2">Access</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            A grant covers its unit and everything below it in the primary tree in force. Tenant administrators see everything without grants.
          </Text>
        </div>
        {!form && (
          <Button size="small" disabled={activeMembers.length === 0}
            onClick={() => setForm({ userId: activeMembers[0]?.user.id ?? '', unit: null, access: 'READ', until: '', reason: '', key: newIdempotencyKey('grant') })}>
            Grant access
          </Button>
        )}
      </div>
      <OrgSuccess message={success} />
      <OrgErrorAlert error={error} onReload={() => void load()} onRetry={() => (form ? void create() : void revoke())} />

      {form && (
        <form className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label="Grant access"
          onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.member}>Member</Label>
              <select id={ids.member} className={selectClassName} value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}>
                {activeMembers.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name ?? member.user.email}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.access}>Access</Label>
              <select id={ids.access} className={selectClassName} value={form.access} onChange={(event) => setForm({ ...form, access: event.target.value as 'READ' | 'READ_WRITE' })}>
                <option value="READ">Read</option>
                <option value="READ_WRITE">Read and write</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.until}>Until (optional)</Label>
              <Input id={ids.until} size="small" type="datetime-local" value={form.until} onChange={(event) => setForm({ ...form, until: event.target.value })} />
            </div>
          </div>
          <OrgUnitPicker label="Unit" value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
          <ReasonField value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
          <div className="flex gap-2">
            <Button size="small" type="submit" isLoading={busy} disabled={!form.unit || !form.userId}>Grant</Button>
            <Button size="small" variant="secondary" type="button" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label size="small" htmlFor={ids.filter}>Member</Label>
          <select id={ids.filter} className={selectClassName} value={filterUser} onChange={(event) => { setFilterUser(event.target.value); setCursors([]); }}>
            <option value="">Everyone</option>
            {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name ?? member.user.email}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1">
          <Checkbox checked={includeRevoked} onCheckedChange={(checked) => { setIncludeRevoked(checked === true); setCursors([]); }} />
          <Text size="small">Show revoked</Text>
        </label>
      </div>

      <OrgErrorAlert error={loadError} onRetry={() => void load()} onReload={() => void load()} />
      {!page ? (
        <Text size="small" className="text-ui-fg-subtle" role="status">Loading grants…</Text>
      ) : page.items.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">No grants{filterUser ? ' for this member' : ''}. Members of an organization-scoped tenant with no grant see nothing.</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Member</Table.HeaderCell>
                <Table.HeaderCell>Unit and below</Table.HeaderCell>
                <Table.HeaderCell>Access</Table.HeaderCell>
                <Table.HeaderCell>From</Table.HeaderCell>
                <Table.HeaderCell>Until</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell><span className="sr-only">Actions</span></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {page.items.map((grant) => (
                <Table.Row key={grant.id}>
                  <Table.Cell>{userNames[grant.userId] ?? grant.userId}</Table.Cell>
                  <Table.Cell>{unitNames[grant.unitId] ?? grant.unitId}</Table.Cell>
                  <Table.Cell>{grant.access === 'READ' ? 'Read' : 'Read and write'}</Table.Cell>
                  <Table.Cell>{new Date(grant.effectiveFrom).toLocaleDateString()}</Table.Cell>
                  <Table.Cell>{grant.effectiveTo ? new Date(grant.effectiveTo).toLocaleDateString() : '—'}</Table.Cell>
                  <Table.Cell><Badge size="2xsmall" color={grant.revokedAt ? 'grey' : 'green'}>{grant.revokedAt ? 'Revoked' : 'Active'}</Badge></Table.Cell>
                  <Table.Cell>
                    {!grant.revokedAt && <Button size="small" variant="transparent" onClick={() => setRevoking(grant)}>Revoke</Button>}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <div className="mt-3 flex gap-2">
            <Button size="small" variant="secondary" disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</Button>
            <Button size="small" variant="secondary" disabled={!page.nextCursor} onClick={() => page.nextCursor && setCursors([...cursors, page.nextCursor])}>Next</Button>
          </div>
        </div>
      )}

      {revoking && (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" role="dialog" aria-label="Revoke grant">
          <Text size="small">
            Revoke {userNames[revoking.userId] ?? revoking.userId}&apos;s access to {unitNames[revoking.unitId] ?? revoking.unitId}? It ends now.
          </Text>
          <ReasonField value={revokeReason} onChange={setRevokeReason} />
          <div className="flex gap-2">
            <Button size="small" variant="danger" isLoading={busy} onClick={() => void revoke()}>Revoke</Button>
            <Button size="small" variant="secondary" onClick={() => setRevoking(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Container>
  );
}
