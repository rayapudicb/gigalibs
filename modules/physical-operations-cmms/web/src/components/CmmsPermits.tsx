'use client';

import {
  type IsolationPointV1,
  type IsolationProcedureV1,
  type PermitV1,
  type WorkPermitStatusV1,
  type WorkPermitTypeV1,
  gasWithinLimits,
  holdsPermission,
} from '@gigalibs/contracts';
import { PageTabs } from '@gigalibs/web-sdk';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { CmmsApiError } from '../api';
import { permitsApi } from '../permits-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, optionalText, selectClass } from './CmmsShared';

// WI-OI-142 M-LOTO. CMMS enforces the sequence: every point locked and verified, a recent in-limit gas test where
// needed, three different people to request, authorize and countersign, no clash with a permit restoring energy,
// personal locks off before de-isolation, every lock removed before closing; work with a permit starts only while it
// is live.

type Can = (permission: string) => boolean;
type Tab = 'board' | 'request' | 'procedures';
const STATUS_COLOR: Readonly<Record<WorkPermitStatusV1, 'grey' | 'orange' | 'blue' | 'green' | 'purple' | 'red'>> = {
  DRAFT: 'grey', ISOLATING: 'orange', AWAITING_APPROVAL: 'blue', LIVE: 'green', DE_ISOLATING: 'purple', CLOSED: 'grey', CANCELLED: 'red',
};
const TYPE_LABEL: Readonly<Record<WorkPermitTypeV1, string>> = {
  LOTO: 'Lockout/tagout', HOT_WORK: 'Hot work', CONFINED_SPACE: 'Confined space', LINE_BREAK: 'Line breaking', HIGH_VOLTAGE: 'High voltage',
};
const label = (status: string) => status.replace('_', ' ').toLowerCase();

function readRaster(file: File): Promise<{ contentType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ contentType: file.type, base64: url.slice(url.indexOf(',') + 1) });
    };
    reader.readAsDataURL(file);
  });
}

export function CmmsPermits({ permissions = [] }: { permissions?: readonly string[] }) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [tab, setTab] = useState<Tab>('board');
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <PermitView permitId={open} can={can} onBack={() => setOpen(null)} />;
  const tabs: readonly (readonly [Tab, string, boolean])[] = [
    ['board', 'Isolation board', true], ['request', 'Request a permit', can('cmms.permits.request')],
    ['procedures', 'Isolation procedures', true],
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageTabs
        tabs={tabs.filter(([, , shown]) => shown).map(([key, text]) => ({ key, label: text }))}
        value={tab}
        onChange={setTab}
        label="Permit views"
      />
      {tab === 'board' ? <Board onOpen={setOpen} /> : null}
      {tab === 'request' ? <RequestForm onDone={setOpen} /> : null}
      {tab === 'procedures' ? <Procedures can={can} /> : null}
    </div>
  );
}

function Board({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<readonly PermitV1[] | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    permitsApi.list('ACTIVE').then((page) => setItems(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  useEffect(load, [load]);
  const counts = (items ?? []).reduce<Record<string, number>>((all, item) => ({ ...all, [item.status]: (all[item.status] ?? 0) + 1 }), {});
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Live isolation board</Heading>
          <Text size="small" className="text-ui-fg-subtle">Every permit not yet closed, with clashes on shared isolation points.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING'] as const).map((status) => (
            <StatusBadge key={status} color={STATUS_COLOR[status]}>{label(status)}: {counts[status] ?? 0}</StatusBadge>
          ))}
        </div>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
      {!error && !items ? <LoadingState label="Loading permits…" /> : null}
      {items && items.length === 0 ? <div className="px-6 pb-6"><EmptyState title="Nothing isolated" text="No permit is open." /></div> : null}
      {items && items.length > 0 ? (
        <Table>
          <Table.Body>
            {items.map((item) => (
              <Table.Row key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}>
                <Table.Cell>{item.number} · {TYPE_LABEL[item.type]}</Table.Cell>
                <Table.Cell>{item.title}</Table.Cell>
                <Table.Cell><StatusBadge color={STATUS_COLOR[item.status]}>{label(item.status)}</StatusBadge></Table.Cell>
                <Table.Cell>Until {formatDate(item.validUntil)}</Table.Cell>
                <Table.Cell>{item.clashes.length ? <StatusBadge color="red">Shares {item.clashes.map((clash) => clash.isolationTag).join(', ')}</StatusBadge> : null}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function RequestForm({ onDone }: { onDone: (id: string) => void }) {
  const [procedures, setProcedures] = useState<readonly IsolationProcedureV1[]>([]);
  const [operation] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<CmmsApiError | null>(null);
  useEffect(() => {
    permitsApi.procedures('PUBLISHED').then((page) => setProcedures(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = new Date();
    const hours = Math.min(12, Math.max(1, Number(form.get('hours')) || 8));
    setError(null);
    try {
      const workOrderId = optionalText(form.get('workOrderId'));
      const created = await permitsApi.request({
        clientOperationId: operation, type: String(form.get('type')), procedureId: String(form.get('procedureId')),
        title: String(form.get('title')).trim(), ...(workOrderId ? { workOrderId } : {}),
        validFrom: from.toISOString(), validUntil: new Date(from.getTime() + hours * 3_600_000).toISOString(),
      });
      onDone(created.permit.id);
    } catch (failure) {
      setError(failure as CmmsApiError);
    }
  }
  return (
    <Container className="p-6">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Heading level="h2" className="md:col-span-2">Request a permit</Heading>
        <Field id="ptw-type" label="Type">
          <select id="ptw-type" name="type" className={selectClass}>
            {(Object.keys(TYPE_LABEL) as WorkPermitTypeV1[]).map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
          </select>
        </Field>
        <Field id="ptw-procedure" label="Isolation procedure">
          <select id="ptw-procedure" name="procedureId" className={selectClass} required>
            {procedures.map((item) => <option key={item.id} value={item.id}>{item.code} r{item.revision} · {item.title}</option>)}
          </select>
        </Field>
        <Field id="ptw-title" label="Work"><Input id="ptw-title" name="title" size="small" required maxLength={200} /></Field>
        <Field id="ptw-wo" label="Work order id (optional)"><Input id="ptw-wo" name="workOrderId" size="small" /></Field>
        <Field id="ptw-hours" label="Valid for (hours, up to 12)"><Input id="ptw-hours" name="hours" type="number" min={1} max={12} defaultValue={8} size="small" /></Field>
        <div className="flex items-end"><Button type="submit" size="small" disabled={procedures.length === 0}>Request</Button></div>
      </form>
      <ActionError error={error} />
    </Container>
  );
}

function PermitView({ permitId, can, onBack }: { permitId: string; can: Can; onBack: () => void }) {
  const [permit, setPermit] = useState<PermitV1 | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string>>({});
  const [gas, setGas] = useState({ oxygenPercent: '20.9', lelPercent: '0', coPpm: '0', h2sPpm: '0' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    permitsApi.get(permitId).then((value) => {
      setPermit(value);
      for (const point of value.isolations.filter((item) => item.hasPhoto))
        permitsApi.photo(value.id, point.pointKey).then((image) => setPhotos((current) => ({ ...current, [point.pointKey]: `data:${image.contentType};base64,${image.base64}` })), () => undefined);
    }, (failure: CmmsApiError) => setError(failure));
  }, [permitId]);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!permit) return <LoadingState label="Loading the permit…" />;
  const act = async (work: () => Promise<PermitV1>) => {
    setActionError(null);
    try {
      setPermit(await work());
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  };
  const lockWith = async (point: PermitV1['isolations'][number], file: File | undefined) => {
    if (!file) return;
    const raster = await readRaster(file);
    await act(() => permitsApi.point(permit.id, point.pointKey, 'lock', {
      expectedVersion: point.version, lockSerial: (serials[point.pointKey] ?? '').trim(), photoContentType: raster.contentType, photoBase64: raster.base64,
    }));
  };
  const gasValues = { oxygenPercent: Number(gas.oxygenPercent), lelPercent: Number(gas.lelPercent), coPpm: Number(gas.coPpm), h2sPpm: Number(gas.h2sPpm) };
  const gasPreview = gasWithinLimits(gasValues);
  const active = ['ISOLATING', 'AWAITING_APPROVAL', 'LIVE'].includes(permit.status);
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Heading level="h2">{permit.number} · {TYPE_LABEL[permit.type]}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {permit.title} · {permit.procedureCode} r{permit.procedureRevision} · valid {formatDate(permit.validFrom)} – {formatDate(permit.validUntil)}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Requested by {permit.requestedBy}{permit.authorizedBy ? ` · authorized by ${permit.authorizedBy}` : ''}{permit.countersignedBy ? ` · countersigned by ${permit.countersignedBy}` : ''}
          </Text>
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge color={STATUS_COLOR[permit.status]}>{label(permit.status)}</StatusBadge>
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      {permit.clashes.length > 0 ? (
        <div className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3" role="alert">
          <Text size="small">Shares isolation points with {permit.clashes.map((clash) => `${clash.number} (${label(clash.status)}, ${clash.isolationTag})`).join('; ')}.</Text>
        </div>
      ) : null}
      <Heading level="h3">Isolation points</Heading>
      {permit.isolations.map((point) => (
        <div key={point.pointKey} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3 md:flex-row md:items-start">
          <div className="flex flex-1 flex-col gap-1">
            <Text size="small" weight="plus">{point.sequence + 1}. {point.label} · {point.isolationTag} · {point.energy.toLowerCase()}</Text>
            <Text size="small">{point.method}</Text>
            <Text size="small" className="text-ui-fg-subtle">
              {label(point.status)}{point.lockSerial ? ` · lock ${point.lockSerial} by ${point.lockedBy}` : ''}{point.verifiedBy ? ` · zero energy confirmed by ${point.verifiedBy}` : ''}
              {point.witnessedBy ? `, witnessed by ${point.witnessedBy}` : ''}{point.removedBy ? ` · removed by ${point.removedBy}` : ''}
            </Text>
            <div className="flex flex-wrap items-end gap-2">
              {point.status === 'PENDING' && can('cmms.permits.request') && ['DRAFT', 'ISOLATING'].includes(permit.status) ? (
                <>
                  <Input aria-label={`Lock serial for ${point.label}`} size="small" placeholder="Lock serial" value={serials[point.pointKey] ?? ''}
                    onChange={(event) => setSerials({ ...serials, [point.pointKey]: event.target.value })} />
                  <label className="txt-compact-small">Lock photo
                    <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="ml-2" disabled={!(serials[point.pointKey] ?? '').trim()}
                      onChange={(event) => lockWith(point, event.target.files?.[0])} />
                  </label>
                </>
              ) : null}
              {point.status === 'LOCKED' && can('cmms.permits.request') ? (
                <Button type="button" size="small" onClick={() => act(() => permitsApi.point(permit.id, point.pointKey, 'verify', { expectedVersion: point.version, zeroEnergyConfirmed: true }))}>
                  Try step: zero energy confirmed
                </Button>
              ) : null}
              {point.status === 'VERIFIED' && !point.witnessedBy && can('cmms.permits.authorize') ? (
                <Button type="button" size="small" variant="secondary" onClick={() => act(() => permitsApi.point(permit.id, point.pointKey, 'witness', { expectedVersion: point.version }))}>Witness</Button>
              ) : null}
              {['LOCKED', 'VERIFIED'].includes(point.status) && ['ISOLATING', 'AWAITING_APPROVAL', 'DE_ISOLATING'].includes(permit.status) && can('cmms.permits.request') ? (
                <Button type="button" size="small" variant="transparent" onClick={() => act(() => permitsApi.point(permit.id, point.pointKey, 'remove', { expectedVersion: point.version }))}>Remove lock</Button>
              ) : null}
            </div>
          </div>
          {photos[point.pointKey] ? <img src={photos[point.pointKey]} alt={`Lock on ${point.label}`} className="max-h-40 rounded-md border border-ui-border-base object-contain" /> : null}
        </div>
      ))}
      <Heading level="h3">Gas tests</Heading>
      {permit.gasTests.length === 0 ? <Text size="small">None yet{['HOT_WORK', 'CONFINED_SPACE'].includes(permit.type) ? ' — required before approval' : ''}.</Text> : null}
      {permit.gasTests.map((test) => (
        <Text key={test.id} size="small">
          {formatDate(test.testedAt)} · O₂ {test.oxygenPercent}% · LEL {test.lelPercent}% · CO {test.coPpm} ppm · H₂S {test.h2sPpm} ppm · {test.withinLimits ? 'in limits' : `OUT: ${test.flags.join(', ')}`} · {test.testedBy}
        </Text>
      ))}
      {active && can('cmms.permits.request') ? (
        <div className="flex flex-wrap items-end gap-2">
          {(['oxygenPercent', 'lelPercent', 'coPpm', 'h2sPpm'] as const).map((key) => (
            <Field key={key} id={`gas-${key}`} label={{ oxygenPercent: 'O₂ %', lelPercent: 'LEL %', coPpm: 'CO ppm', h2sPpm: 'H₂S ppm' }[key]} className="w-24">
              <Input id={`gas-${key}`} size="small" type="number" step="any" value={gas[key]} onChange={(event) => setGas({ ...gas, [key]: event.target.value })} />
            </Field>
          ))}
          <StatusBadge color={gasPreview.withinLimits ? 'green' : 'red'}>{gasPreview.withinLimits ? 'In limits' : gasPreview.flags.join(', ')}</StatusBadge>
          <Button type="button" size="small" variant="secondary"
            onClick={() => act(() => permitsApi.gasTest(permit.id, { clientOperationId: crypto.randomUUID(), ...gasValues, testedAt: new Date().toISOString() }))}>Record test</Button>
        </div>
      ) : null}
      <Heading level="h3">Personal locks</Heading>
      <Text size="small">{permit.personalLocks.length ? permit.personalLocks.map((lock) => `${lock.subject} since ${formatDate(lock.since)}`).join(' · ') : 'Nobody is signed on.'}</Text>
      <div className="flex flex-wrap items-end gap-2">
        {permit.status === 'AWAITING_APPROVAL' && can('cmms.permits.authorize') && !permit.authorizedBy ? (
          <Button type="button" size="small" onClick={() => act(() => permitsApi.act(permit.id, 'authorize', { expectedVersion: permit.version }))}>Authorize</Button>
        ) : null}
        {permit.status === 'AWAITING_APPROVAL' && can('cmms.permits.countersign') && permit.authorizedBy ? (
          <Button type="button" size="small" onClick={() => act(() => permitsApi.act(permit.id, 'countersign', { expectedVersion: permit.version }))}>Countersign and release</Button>
        ) : null}
        {permit.status === 'LIVE' && can('cmms.permits.lock') ? (
          <>
            <Button type="button" size="small" variant="secondary" onClick={() => act(() => permitsApi.lock(permit.id, 'lock-on'))}>Sign my lock on</Button>
            <Button type="button" size="small" variant="secondary" onClick={() => act(() => permitsApi.lock(permit.id, 'lock-off'))}>Sign my lock off</Button>
          </>
        ) : null}
        {permit.status === 'LIVE' && can('cmms.permits.request') ? (
          <Button type="button" size="small" variant="secondary" onClick={() => act(() => permitsApi.act(permit.id, 'de-isolate', { expectedVersion: permit.version }))}>Start de-isolation</Button>
        ) : null}
        {permit.status === 'DE_ISOLATING' && can('cmms.permits.authorize') ? (
          <Button type="button" size="small" onClick={() => act(() => permitsApi.act(permit.id, 'close', { expectedVersion: permit.version }))}>Close permit</Button>
        ) : null}
        {['DRAFT', 'ISOLATING', 'AWAITING_APPROVAL'].includes(permit.status) && can('cmms.permits.request') ? (
          <>
            <Input aria-label="Cancellation reason" size="small" placeholder="Why cancel" value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button type="button" size="small" variant="danger" disabled={!reason.trim()}
              onClick={() => act(() => permitsApi.act(permit.id, 'cancel', { expectedVersion: permit.version, reason: reason.trim() }))}>Cancel permit</Button>
          </>
        ) : null}
      </div>
      <ActionError error={actionError} onReload={load} />
    </Container>
  );
}

function Procedures({ can }: { can: Can }) {
  const [items, setItems] = useState<readonly IsolationProcedureV1[] | null>(null);
  const [editing, setEditing] = useState<IsolationProcedureV1 | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState<IsolationPointV1[]>([]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    permitsApi.procedures().then((page) => setItems(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  useEffect(load, [load]);
  const open = (procedure: IsolationProcedureV1 | 'new') => {
    setEditing(procedure);
    setCode(procedure === 'new' ? '' : procedure.code);
    setTitle(procedure === 'new' ? '' : procedure.title);
    setPoints(procedure === 'new' ? [{ key: 'point-1', label: '', energy: 'ELECTRICAL', isolationTag: '', method: '' }] : [...procedure.points]);
  };
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      setEditing(null);
      load();
    } catch (failure) {
      setError(failure as CmmsApiError);
    }
  };
  const manage = can('cmms.isolations.manage');
  const setPoint = (index: number, patch: Partial<IsolationPointV1>) => setPoints(points.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  if (editing)
    return (
      <Container className="flex flex-col gap-3 p-6">
        <Heading level="h2">{editing === 'new' ? 'New isolation procedure' : `Edit ${editing.code} r${editing.revision}`}</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="iso-code" label="Code"><Input id="iso-code" size="small" value={code} disabled={editing !== 'new'} onChange={(event) => setCode(event.target.value)} /></Field>
          <Field id="iso-title" label="Title"><Input id="iso-title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        </div>
        {points.map((point, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-ui-border-base p-3 md:grid-cols-5">
            <Input aria-label={`Point ${index + 1} key`} size="small" value={point.key} onChange={(event) => setPoint(index, { key: event.target.value })} />
            <Input aria-label={`Point ${index + 1} label`} size="small" placeholder="Label" value={point.label} onChange={(event) => setPoint(index, { label: event.target.value })} />
            <select aria-label={`Point ${index + 1} energy`} className={selectClass} value={point.energy}
              onChange={(event) => setPoint(index, { energy: event.target.value as IsolationPointV1['energy'] })}>
              {['ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'THERMAL', 'CHEMICAL', 'MECHANICAL', 'GRAVITY'].map((energy) => <option key={energy} value={energy}>{energy.toLowerCase()}</option>)}
            </select>
            <Input aria-label={`Point ${index + 1} isolation tag`} size="small" placeholder="Isolation tag" value={point.isolationTag} onChange={(event) => setPoint(index, { isolationTag: event.target.value })} />
            <Input aria-label={`Point ${index + 1} method`} size="small" placeholder="Method" value={point.method} onChange={(event) => setPoint(index, { method: event.target.value })} />
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" size="small" variant="secondary"
            onClick={() => setPoints([...points, { key: `point-${points.length + 1}`, label: '', energy: 'ELECTRICAL', isolationTag: '', method: '' }])}>Add point</Button>
          <Button type="button" size="small" onClick={() => act(() => (editing === 'new'
            ? permitsApi.createProcedure({ code, title, points })
            : permitsApi.updateProcedure(editing.id, { expectedVersion: editing.version, title, points })))}>Save draft</Button>
          <Button type="button" size="small" variant="transparent" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
        <ActionError error={error} />
      </Container>
    );
  return (
    <Container className="flex flex-col gap-3 p-6">
      <div className="flex justify-between gap-3">
        <Heading level="h2">Isolation procedures</Heading>
        {manage ? <Button type="button" size="small" onClick={() => open('new')}>New procedure</Button> : null}
      </div>
      {!items && !error ? <LoadingState label="Loading procedures…" /> : null}
      {items && items.length === 0 ? <EmptyState title="No procedures" text="Write the isolation steps for each machine." /> : null}
      {items?.map((procedure) => (
        <div key={procedure.id} className="flex flex-col gap-1 rounded-lg border border-ui-border-base p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text weight="plus">{procedure.code} r{procedure.revision} · {procedure.title}</Text>
            <StatusBadge color={procedure.status === 'PUBLISHED' ? 'green' : procedure.status === 'DRAFT' ? 'orange' : 'grey'}>{procedure.status}</StatusBadge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">{procedure.points.map((point) => `${point.isolationTag} (${point.energy.toLowerCase()})`).join(' · ')}</Text>
          {manage ? (
            <div className="flex gap-2">
              {procedure.status === 'DRAFT' ? (
                <>
                  <Button type="button" size="small" variant="secondary" onClick={() => open(procedure)}>Edit</Button>
                  <Button type="button" size="small" onClick={() => act(() => permitsApi.procedureAction(procedure.id, 'publish', procedure.version))}>Publish</Button>
                </>
              ) : null}
              {procedure.status === 'PUBLISHED' ? (
                <Button type="button" size="small" variant="secondary" onClick={() => act(() => permitsApi.procedureAction(procedure.id, 'revise', procedure.version))}>New revision</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <ActionError error={error} onReload={load} />
    </Container>
  );
}
