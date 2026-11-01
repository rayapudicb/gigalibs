'use client';

import {
  type AssetAuditReportV1,
  type AssetAuditWalkV1,
  type AssetTagResolutionV1,
  type CommissioningRequestV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { Badge, Button, Container, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { CmmsApiError } from '../api';
import { commissioningApi } from '../commissioning-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, selectClass } from './CmmsShared';

// WI-OI-135 M-TAG. Field proposals reach the register only through a reviewer here; every figure is read from CMMS.

type Tab = 'requests' | 'walks' | 'tags';
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'requests', label: 'Commissioning requests' },
  { key: 'walks', label: 'Floor-walk audits' },
  { key: 'tags', label: 'Tag lookup' },
];
const statusColor = { SUBMITTED: 'orange', APPROVED: 'green', REJECTED: 'grey' } as const;

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const reload = useCallback(() => {
    setError(null);
    load().then(setData, (failure: CmmsApiError) => setError(failure));
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function CmmsCommissioning({ permissions = [] }: { permissions?: readonly string[] }) {
  const [tab, setTab] = useState<Tab>('requests');
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-2 overflow-x-auto" aria-label="Commissioning views">
        {TABS.map((item) => (
          <Button key={item.key} type="button" size="small" variant={tab === item.key ? 'primary' : 'secondary'}
            aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </Button>
        ))}
      </nav>
      {tab === 'requests' ? <Requests canApprove={can('cmms.commissioning.approve')} /> : null}
      {tab === 'walks' ? <Walks canExecute={can('cmms.audits.execute')} /> : null}
      {tab === 'tags' ? <TagLookup canManage={can('cmms.assets.write')} /> : null}
    </div>
  );
}

function Requests({ canApprove }: { canApprove: boolean }) {
  const [status, setStatus] = useState('SUBMITTED');
  const load = useCallback(() => commissioningApi.requests(status || undefined), [status]);
  const { data, error, reload } = useLoad(load);
  const [open, setOpen] = useState<CommissioningRequestV1 | null>(null);
  if (open) return <RequestDetail request={open} canApprove={canApprove} onBack={() => { setOpen(null); reload(); }} />;
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Commissioning requests</Heading>
          <Text size="small" className="text-ui-fg-subtle">Assets proposed from the floor, awaiting a reviewer.</Text>
        </div>
        <Field id="commissioning-status" label="Status" className="w-48">
          <select id="commissioning-status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="SUBMITTED">Awaiting review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        </Field>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={reload} /></div> : null}
      {!error && !data ? <LoadingState label="Loading commissioning requests…" /> : null}
      {data && data.items.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No requests" text="Nothing matches this status." /></div> : null}
      {data && data.items.length > 0 ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Proposed asset</Table.HeaderCell>
              <Table.HeaderCell>Submitted</Table.HeaderCell>
              <Table.HeaderCell>Tag</Table.HeaderCell>
              <Table.HeaderCell>Possible duplicates</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((request) => (
              <Table.Row key={request.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">{request.proposedAssetTag}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{request.name}</Text>
                </Table.Cell>
                <Table.Cell>{formatDate(request.submittedAt)} · {request.submittedBy}</Table.Cell>
                <Table.Cell>{request.tag ? `${request.tag.kind} ${request.tag.value}` : '—'}</Table.Cell>
                <Table.Cell>{request.duplicates.length ? <Badge size="2xsmall" color="orange">{request.duplicates.length}</Badge> : '—'}</Table.Cell>
                <Table.Cell><StatusBadge color={statusColor[request.status]}>{request.status}</StatusBadge></Table.Cell>
                <Table.Cell className="text-right">
                  <Button type="button" size="small" variant="secondary" onClick={() => setOpen(request)}>Review</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function RequestDetail({ request: initial, canApprove, onBack }: { request: CommissioningRequestV1; canApprove: boolean; onBack: () => void }) {
  const [request, setRequest] = useState(initial);
  const [note, setNote] = useState('');
  const [linkTo, setLinkTo] = useState(initial.duplicates[0]?.assetId ?? '');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  async function decide(decision: 'APPROVE_NEW' | 'LINK_EXISTING' | 'REJECT') {
    setBusy(true);
    setActionError(null);
    try {
      setRequest(await commissioningApi.decide(request.id, {
        decision, expectedVersion: request.version, ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === 'LINK_EXISTING' ? { assetId: linkTo } : {}),
      }));
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  const field = (label: string, value: string | number | null) => (
    <div><Text size="xsmall" className="text-ui-fg-subtle">{label}</Text><Text size="small">{value ?? '—'}</Text></div>
  );
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{request.proposedAssetTag} · {request.name}</Heading>
          <Text size="small" className="text-ui-fg-subtle">Proposed by {request.submittedBy} on {formatDate(request.submittedAt)}</Text>
        </div>
        <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
      </div>
      <StatusBadge color={statusColor[request.status]}>{request.status}{request.decision ? ` · ${request.decision}` : ''}</StatusBadge>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field('Manufacturer', request.manufacturer)}
        {field('Model', request.model)}
        {field('Serial number', request.serialNumber)}
        {field('Category', request.category)}
        {field('Space', request.spaceId)}
        {field('Parent asset', request.parentAssetId)}
        {field('Tag', request.tag ? `${request.tag.kind} ${request.tag.value}` : null)}
        {field('Coordinates', request.latitude !== null ? `${request.latitude}, ${request.longitude}` : null)}
      </div>
      {request.nameplateText ? <Text size="small">Nameplate (confirmed by the technician): {request.nameplateText}</Text> : null}
      {Object.keys(request.specs).length ? (
        <Text size="small">Ratings: {Object.entries(request.specs).map(([key, value]) => `${key} ${String(value)}`).join(' · ')}</Text>
      ) : null}
      {request.duplicates.length ? (
        <div className="rounded-lg border border-ui-border-base p-4">
          <Text size="small" weight="plus">Possible duplicates in the register</Text>
          {request.duplicates.map((duplicate) => (
            <Text key={`${duplicate.assetId}-${duplicate.reason}`} size="small">
              {duplicate.assetTag} · {duplicate.name} · same {duplicate.reason === 'SERIAL_NUMBER' ? 'serial number' : 'asset tag'}
            </Text>
          ))}
        </div>
      ) : null}
      {request.reviewedBy ? (
        <Text size="small">Decided by {request.reviewedBy} on {formatDate(request.reviewedAt)}{request.reviewNote ? `: ${request.reviewNote}` : ''}</Text>
      ) : null}
      {request.status === 'SUBMITTED' && canApprove ? (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4">
          <Field id="commissioning-note" label="Note (required to reject)">
            <Textarea id="commissioning-note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {request.duplicates.length ? (
            <Field id="commissioning-link" label="Existing asset to link instead">
              <select id="commissioning-link" className={selectClass} value={linkTo} onChange={(event) => setLinkTo(event.target.value)}>
                {request.duplicates.map((duplicate) => <option key={duplicate.assetId} value={duplicate.assetId}>{duplicate.assetTag} · {duplicate.name}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="small" isLoading={busy} disabled={busy} onClick={() => decide('APPROVE_NEW')}>Create asset</Button>
            {request.duplicates.length ? (
              <Button type="button" size="small" variant="secondary" disabled={busy || !linkTo} onClick={() => decide('LINK_EXISTING')}>Link to existing</Button>
            ) : null}
            <Button type="button" size="small" variant="danger" disabled={busy || !note.trim()} onClick={() => decide('REJECT')}>Reject</Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">You cannot decide a request you proposed. The tag is bound in the same step.</Text>
        </div>
      ) : null}
      <ActionError error={actionError} />
    </Container>
  );
}

function Walks({ canExecute }: { canExecute: boolean }) {
  const load = useCallback(() => commissioningApi.walks(), []);
  const { data, error, reload } = useLoad(load);
  const [report, setReport] = useState<AssetAuditReportV1 | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  async function open(walk: AssetAuditWalkV1) {
    setActionError(null);
    try {
      setReport(await commissioningApi.report(walk.id));
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  async function finish(walk: AssetAuditWalkV1) {
    setActionError(null);
    try {
      await commissioningApi.finishWalk(walk.id);
      reload();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <LoadingState label="Loading floor walks…" />;
  if (report) return <WalkReport report={report} onBack={() => setReport(null)} />;
  return (
    <Container className="p-0">
      <div className="p-6">
        <Heading level="h2">Floor-walk audits</Heading>
        <Text size="small" className="text-ui-fg-subtle">Walks are started and scanned on the mobile app; reports compare them with the register.</Text>
      </div>
      <div className="px-6"><ActionError error={actionError} /></div>
      {data.items.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No floor walks" text="Start a walk from the mobile app." /></div> : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Walk</Table.HeaderCell>
              <Table.HeaderCell>Started</Table.HeaderCell>
              <Table.HeaderCell>Scans</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((walk) => (
              <Table.Row key={walk.id}>
                <Table.Cell>{walk.label}</Table.Cell>
                <Table.Cell>{formatDate(walk.startedAt)} · {walk.startedBy}</Table.Cell>
                <Table.Cell>{walk.sightingCount}</Table.Cell>
                <Table.Cell><StatusBadge color={walk.status === 'OPEN' ? 'orange' : 'green'}>{walk.status}</StatusBadge></Table.Cell>
                <Table.Cell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canExecute && walk.status === 'OPEN' ? <Button type="button" size="small" variant="secondary" onClick={() => finish(walk)}>Finish</Button> : null}
                    <Button type="button" size="small" variant="secondary" onClick={() => open(walk)}>Report</Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
}

function WalkReport({ report, onBack }: { report: AssetAuditReportV1; onBack: () => void }) {
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex justify-between gap-3">
        <Heading level="h2">{report.walk.label}</Heading>
        <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge size="2xsmall" color="green">Seen {report.seen.length}</Badge>
        <Badge size="2xsmall" color="orange">Relocated {report.seen.filter((item) => item.relocated).length}</Badge>
        <Badge size="2xsmall" color="red">Missing {report.missing.length}</Badge>
        <Badge size="2xsmall" color="grey">Unknown tags {report.unknownTags.length}</Badge>
      </div>
      <Heading level="h3">Missing from the walk</Heading>
      {report.missing.length === 0 ? <Text size="small">Every registered asset was seen.</Text> : report.missing.map((item) => (
        <Text key={item.assetId} size="small">{item.assetTag} · {item.name}</Text>
      ))}
      <Heading level="h3">Seen</Heading>
      {report.seen.map((item) => (
        <Text key={item.assetId} size="small">{item.assetTag} · {item.name}{item.relocated ? ' · seen in another space' : ''}</Text>
      ))}
      <Heading level="h3">Unknown tags</Heading>
      {report.unknownTags.length === 0 ? <Text size="small">None.</Text> : report.unknownTags.map((tag) => (
        <Text key={`${tag.kind}-${tag.value}`} size="small">{tag.kind} {tag.value} · {formatDate(tag.seenAt)}</Text>
      ))}
    </Container>
  );
}

function TagLookup({ canManage }: { canManage: boolean }) {
  const [kind, setKind] = useState('NFC');
  const [value, setValue] = useState('');
  const [found, setFound] = useState<AssetTagResolutionV1 | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  async function lookup(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setFound(null);
    try {
      setFound(await commissioningApi.resolveTag(kind, value.trim()));
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  async function retire() {
    if (!found) return;
    setActionError(null);
    try {
      await commissioningApi.retireTag(found.tag.id, 'Retired from the tag lookup');
      setFound(null);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  return (
    <Container className="flex flex-col gap-4 p-6">
      <Heading level="h2">Tag lookup</Heading>
      <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
        <Field id="tag-kind" label="Tag type" className="w-40">
          <select id="tag-kind" className={selectClass} value={kind} onChange={(event) => setKind(event.target.value)}>
            {['NFC', 'RFID', 'DATAMATRIX', 'QR', 'CODE128'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field id="tag-value" label="Tag value" className="w-72">
          <Input id="tag-value" size="small" value={value} onChange={(event) => setValue(event.target.value)} required />
        </Field>
        <Button type="submit" size="small">Find asset</Button>
      </form>
      {found ? (
        <div className="rounded-lg border border-ui-border-base p-4">
          <Text size="small" weight="plus">{found.asset.assetTag} · {found.asset.name}</Text>
          <Text size="small">Bound by {found.tag.boundBy} on {formatDate(found.tag.boundAt)} · asset {found.asset.status}</Text>
          {canManage ? <Button type="button" size="small" variant="secondary" className="mt-2" onClick={retire}>Retire this tag</Button> : null}
        </div>
      ) : null}
      <ActionError error={actionError} />
    </Container>
  );
}
