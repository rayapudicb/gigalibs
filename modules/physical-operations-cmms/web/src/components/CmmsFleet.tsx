'use client';

import {
  type CmmsAssetV1,
  type FleetCheckZoneV1,
  type FleetGroundingV1,
  type FleetInspectionV1,
  type FleetReadinessV1,
  type FleetTemplateV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { PageTabs } from '@gigalibs/web-sdk';
import { Button, Container, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import { fleetApi } from '../fleet-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, optionalText, selectClass } from './CmmsShared';

// WI-OI-139 M-DVIR. CMMS decides readiness and grounding; this screen shows the fleet, works the red-tag queue
// (mechanic certificate, then a different supervisor's clearance), enrols assets, edits checks and exports history.

type Can = (permission: string) => boolean;
type Tab = 'readiness' | 'redtags' | 'enrol' | 'checks' | 'history';
const stateColor = { OPERATIONAL: 'green', INSPECTION_DUE: 'orange', AWAITING_CLEARANCE: 'blue', GROUNDED: 'red' } as const;
const stateLabel = { OPERATIONAL: 'Operational', INSPECTION_DUE: 'Inspection due', AWAITING_CLEARANCE: 'Awaiting clearance', GROUNDED: 'Grounded' } as const;
const resultColor = { PASS: 'green', DEFECTS: 'orange', GROUNDED: 'red' } as const;

export function CmmsFleet({ permissions = [] }: { permissions?: readonly string[] }) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [tab, setTab] = useState<Tab>('readiness');
  const [asset, setAsset] = useState<string | null>(null);
  const tabs: readonly (readonly [Tab, string, boolean])[] = [
    ['readiness', 'Readiness', true], ['redtags', 'Red tags', true], ['enrol', 'Enrol assets', can('cmms.fleet.manage')],
    ['checks', 'Checks', true], ['history', 'History', true],
  ];
  if (asset) return <AssetFleetView assetId={asset} can={can} onBack={() => setAsset(null)} />;
  return (
    <div className="flex flex-col gap-4">
      <PageTabs
        tabs={tabs.filter(([, , shown]) => shown).map(([key, label]) => ({ key, label: label }))}
        value={tab}
        onChange={setTab}
        label="Fleet views"
      />
      {tab === 'readiness' ? <Readiness onOpen={setAsset} /> : null}
      {tab === 'redtags' ? <RedTags can={can} /> : null}
      {tab === 'enrol' ? <Enrol /> : null}
      {tab === 'checks' ? <Checks can={can} /> : null}
      {tab === 'history' ? <History onOpen={setAsset} /> : null}
    </div>
  );
}

function Readiness({ onOpen }: { onOpen: (assetId: string) => void }) {
  const [items, setItems] = useState<readonly FleetReadinessV1[] | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    fleetApi.readiness().then((page) => setItems(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  useEffect(load, [load]);
  const counts = (items ?? []).reduce<Record<string, number>>((all, item) => ({ ...all, [item.state]: (all[item.state] ?? 0) + 1 }), {});
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Fleet readiness</Heading>
          <Text size="small" className="text-ui-fg-subtle">Every enrolled vehicle and machine, from its latest circle check and red tag.</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(stateLabel) as (keyof typeof stateLabel)[]).map((state) => (
            <StatusBadge key={state} color={stateColor[state]}>{stateLabel[state]}: {counts[state] ?? 0}</StatusBadge>
          ))}
        </div>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
      {!error && !items ? <LoadingState label="Loading the fleet…" /> : null}
      {items && items.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No enrolled equipment" text="Enrol forklifts, cranes and vehicles on a check." /></div> : null}
      {items && items.length > 0 ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Asset</Table.HeaderCell>
              <Table.HeaderCell>State</Table.HeaderCell>
              <Table.HeaderCell>Last check</Table.HeaderCell>
              <Table.HeaderCell>Next due</Table.HeaderCell>
              <Table.HeaderCell>Credential</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row key={item.assetId}>
                <Table.Cell>{item.assetTag} · {item.assetName}</Table.Cell>
                <Table.Cell><StatusBadge color={stateColor[item.state]}>{stateLabel[item.state]}</StatusBadge></Table.Cell>
                <Table.Cell>{item.lastInspectionAt ? `${formatDate(item.lastInspectionAt)} · ${item.lastResult}` : 'Never'}</Table.Cell>
                <Table.Cell>{item.dueAt ? formatDate(item.dueAt) : '—'}</Table.Cell>
                <Table.Cell>{item.requiredCredential ?? '—'}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button type="button" size="small" variant="secondary" onClick={() => onOpen(item.assetId)}>Open</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function RedTagCard({ tag, can, onChanged }: { tag: FleetGroundingV1; can: Can; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      setText('');
      onChanged();
    } catch (failure) {
      setError(failure as CmmsApiError);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text weight="plus">{tag.assetTag} · {tag.assetName}</Text>
        <StatusBadge color={tag.status === 'GROUNDED' ? 'red' : tag.status === 'REPAIRED' ? 'blue' : 'green'}>{tag.status}</StatusBadge>
      </div>
      <Text size="small" className="whitespace-pre-wrap">{tag.reason}</Text>
      <Text size="small" className="text-ui-fg-subtle">
        {tag.source === 'MANUAL' ? 'Red-tagged' : 'Grounded by inspection'} by {tag.groundedBy}, {formatDate(tag.groundedAt)}
        {tag.workOrderId ? ' · emergency work order raised' : ''}
      </Text>
      {tag.correctiveAction ? <Text size="small">Repair ({tag.certifiedBy}): {tag.correctiveAction}</Text> : null}
      {tag.clearedBy ? <Text size="small">Cleared by {tag.clearedBy}{tag.override ? ' (override)' : ''}{tag.clearanceNote ? `: ${tag.clearanceNote}` : ''}</Text> : null}
      {tag.status !== 'CLEARED' && (can('cmms.fleet.certify') || can('cmms.fleet.authorize')) ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field id={`tag-text-${tag.id}`} label={tag.status === 'GROUNDED' ? 'Corrective action, or override reason' : 'Clearance note (optional)'} className="min-w-64 flex-1">
            <Input id={`tag-text-${tag.id}`} size="small" value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          {tag.status === 'GROUNDED' && can('cmms.fleet.certify') ? (
            <Button type="button" size="small" disabled={!text.trim()}
              onClick={() => act(() => fleetApi.certify(tag.id, { expectedVersion: tag.version, correctiveAction: text.trim() }))}>Certify repair</Button>
          ) : null}
          {tag.status === 'REPAIRED' && can('cmms.fleet.authorize') ? (
            <Button type="button" size="small"
              onClick={() => act(() => fleetApi.clear(tag.id, { expectedVersion: tag.version, ...(text.trim() ? { note: text.trim() } : {}) }))}>
              Clear and return to service
            </Button>
          ) : null}
          {tag.status === 'GROUNDED' && can('cmms.fleet.authorize') ? (
            <Button type="button" size="small" variant="danger" disabled={!text.trim()}
              onClick={() => act(() => fleetApi.clear(tag.id, { expectedVersion: tag.version, override: true, note: text.trim() }))}>Override</Button>
          ) : null}
        </div>
      ) : null}
      <ActionError error={error} onReload={onChanged} />
    </div>
  );
}

function RedTags({ can }: { can: Can }) {
  const [items, setItems] = useState<readonly FleetGroundingV1[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    fleetApi.groundings(all ? 'ALL' : undefined).then((page) => setItems(page.items), (failure: CmmsApiError) => setError(failure));
  }, [all]);
  useEffect(load, [load]);
  return (
    <Container className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">Red tags</Heading>
          <Text size="small" className="text-ui-fg-subtle">A mechanic certifies the repair; a different supervisor clears it.</Text>
        </div>
        <Button type="button" size="small" variant="secondary" onClick={() => setAll(!all)}>{all ? 'Open only' : 'Last 92 days'}</Button>
      </div>
      {error ? <ErrorState error={error} retry={load} /> : null}
      {!error && !items ? <LoadingState label="Loading red tags…" /> : null}
      {items && items.length === 0 ? <EmptyState title="No red tags" text="Nothing is grounded." /> : null}
      {items?.map((tag) => <RedTagCard key={tag.id} tag={tag} can={can} onChanged={load} />)}
    </Container>
  );
}

function Enrol() {
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [templates, setTemplates] = useState<readonly FleetTemplateV1[]>([]);
  const [filter, setFilter] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  useEffect(() => {
    fleetApi.templates('PUBLISHED').then((page) => setTemplates(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  useEffect(() => {
    cmmsApi.searchAssets({ pageSize: 50, ...(filter.trim() ? { q: filter.trim() } : {}) }).then((page) => setAssets(page.items), () => setAssets([]));
  }, [filter]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setDone(null);
    try {
      const credential = optionalText(form.get('credential'));
      const enrolled = await fleetApi.enroll({
        assetId: String(form.get('assetId')), templateCode: String(form.get('templateCode')), intervalHours: Number(form.get('interval')),
        ...(credential ? { requiredCredential: credential } : {}),
      });
      setDone(`Enrolled on ${enrolled.templateCode}, every ${enrolled.intervalHours} h.`);
    } catch (failure) {
      setError(failure as CmmsApiError);
    }
  }
  return (
    <Container className="p-6">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Heading level="h2" className="md:col-span-3">Enrol equipment</Heading>
        <Field id="fleet-filter" label="Find asset"><Input id="fleet-filter" size="small" value={filter} onChange={(event) => setFilter(event.target.value)} /></Field>
        <Field id="fleet-asset" label="Asset">
          <select id="fleet-asset" name="assetId" className={selectClass} required>
            {assets.map((item) => <option key={item.id} value={item.id}>{item.assetTag} · {item.name}</option>)}
          </select>
        </Field>
        <Field id="fleet-template" label="Check">
          <select id="fleet-template" name="templateCode" className={selectClass} required>
            {templates.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
        </Field>
        <Field id="fleet-interval" label="Inspect every (hours)"><Input id="fleet-interval" name="interval" size="small" type="number" min={1} max={168} defaultValue={24} required /></Field>
        <Field id="fleet-credential" label="Required credential (optional)"><Input id="fleet-credential" name="credential" size="small" placeholder="e.g. FORKLIFT-B" /></Field>
        <div className="flex items-end"><Button type="submit" size="small" disabled={templates.length === 0}>Enrol</Button></div>
        <Text size="small" className="text-ui-fg-subtle md:col-span-3">
          Credentials are recorded for each asset; checking them against operator records waits for Workforce credentials.
        </Text>
        {done ? <Text size="small" className="md:col-span-3">{done}</Text> : null}
      </form>
      <ActionError error={error} />
    </Container>
  );
}

function ZoneEditor({ zones, onChange }: { zones: FleetCheckZoneV1[]; onChange: (zones: FleetCheckZoneV1[]) => void }) {
  const setZone = (index: number, zone: FleetCheckZoneV1) => onChange(zones.map((item, at) => (at === index ? zone : item)));
  return (
    <div className="flex flex-col gap-3">
      {zones.map((zone, index) => (
        <fieldset key={index} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3">
          <legend className="px-1 txt-compact-small-plus">Zone {index + 1}</legend>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Field id={`zone-key-${index}`} label="Key"><Input id={`zone-key-${index}`} size="small" value={zone.key} onChange={(event) => setZone(index, { ...zone, key: event.target.value })} required /></Field>
            <Field id={`zone-title-${index}`} label="Title" className="md:col-span-2"><Input id={`zone-title-${index}`} size="small" value={zone.title} onChange={(event) => setZone(index, { ...zone, title: event.target.value })} required /></Field>
          </div>
          {zone.items.map((item, itemIndex) => (
            <div key={itemIndex} className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <Input aria-label={`Zone ${index + 1} item ${itemIndex + 1} key`} size="small" value={item.key}
                onChange={(event) => setZone(index, { ...zone, items: zone.items.map((entry, at) => (at === itemIndex ? { ...entry, key: event.target.value } : entry)) })} />
              <Input aria-label={`Zone ${index + 1} item ${itemIndex + 1} label`} size="small" className="md:col-span-2" value={item.label}
                onChange={(event) => setZone(index, { ...zone, items: zone.items.map((entry, at) => (at === itemIndex ? { ...entry, label: event.target.value } : entry)) })} />
              <Button type="button" size="small" variant="transparent" disabled={zone.items.length === 1}
                onClick={() => setZone(index, { ...zone, items: zone.items.filter((_, at) => at !== itemIndex) })}>Remove item</Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" size="small" variant="secondary"
              onClick={() => setZone(index, { ...zone, items: [...zone.items, { key: `item-${zone.items.length + 1}`, label: '' }] })}>Add item</Button>
            <Button type="button" size="small" variant="transparent" disabled={zones.length === 1}
              onClick={() => onChange(zones.filter((_, at) => at !== index))}>Remove zone</Button>
          </div>
        </fieldset>
      ))}
      <Button type="button" size="small" variant="secondary" className="self-start"
        onClick={() => onChange([...zones, { key: `zone-${zones.length + 1}`, title: '', items: [{ key: `z${zones.length + 1}-item-1`, label: '' }] }])}>Add zone</Button>
    </div>
  );
}

function Checks({ can }: { can: Can }) {
  const [items, setItems] = useState<readonly FleetTemplateV1[] | null>(null);
  const [editing, setEditing] = useState<FleetTemplateV1 | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [zones, setZones] = useState<FleetCheckZoneV1[]>([]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    fleetApi.templates().then((page) => setItems(page.items), (failure: CmmsApiError) => setError(failure));
  }, []);
  useEffect(load, [load]);
  const open = (template: FleetTemplateV1 | 'new') => {
    setEditing(template);
    setCode(template === 'new' ? '' : template.code);
    setName(template === 'new' ? '' : template.name);
    setZones(template === 'new' ? [{ key: 'front', title: 'Front', items: [{ key: 'forks', label: 'Forks and mast chains' }] }] : template.zones);
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
  const manage = can('cmms.fleet.manage');
  if (editing)
    return (
      <Container className="flex flex-col gap-3 p-6">
        <Heading level="h2">{editing === 'new' ? 'New check' : `Edit ${editing.code} r${editing.revision}`}</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="check-code" label="Code"><Input id="check-code" size="small" value={code} disabled={editing !== 'new'} onChange={(event) => setCode(event.target.value)} /></Field>
          <Field id="check-name" label="Name"><Input id="check-name" size="small" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        </div>
        <ZoneEditor zones={zones} onChange={setZones} />
        <div className="flex gap-2">
          <Button type="button" size="small" onClick={() => act(() => (editing === 'new'
            ? fleetApi.createTemplate({ code, name, zones })
            : fleetApi.updateTemplate(editing.id, { expectedVersion: editing.version, name, zones })))}>Save draft</Button>
          <Button type="button" size="small" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
        <ActionError error={error} />
      </Container>
    );
  return (
    <Container className="flex flex-col gap-3 p-6">
      <div className="flex justify-between gap-3">
        <Heading level="h2">Circle checks</Heading>
        {manage ? <Button type="button" size="small" onClick={() => open('new')}>New check</Button> : null}
      </div>
      {!items && !error ? <LoadingState label="Loading checks…" /> : null}
      {items && items.length === 0 ? <EmptyState title="No checks" text="Create a circle check for each kind of equipment." /> : null}
      {items?.map((template) => (
        <div key={template.id} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text weight="plus">{template.code} r{template.revision} · {template.name}</Text>
            <StatusBadge color={template.status === 'PUBLISHED' ? 'green' : template.status === 'DRAFT' ? 'orange' : 'grey'}>{template.status}</StatusBadge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {template.zones.map((zone) => `${zone.title} (${zone.items.length})`).join(' · ')}
          </Text>
          {manage ? (
            <div className="flex flex-wrap gap-2">
              {template.status === 'DRAFT' ? (
                <>
                  <Button type="button" size="small" variant="secondary" onClick={() => open(template)}>Edit</Button>
                  <Button type="button" size="small" onClick={() => act(() => fleetApi.templateAction(template.id, 'publish', template.version))}>Publish</Button>
                </>
              ) : null}
              {template.status === 'PUBLISHED' ? (
                <>
                  <Button type="button" size="small" variant="secondary" onClick={() => act(() => fleetApi.templateAction(template.id, 'revise', template.version))}>New revision</Button>
                  <Button type="button" size="small" variant="transparent" onClick={() => act(() => fleetApi.templateAction(template.id, 'retire', template.version))}>Retire</Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <ActionError error={error} onReload={load} />
    </Container>
  );
}

function toCsv(items: readonly FleetInspectionV1[]): string {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    // Neutralise spreadsheet formulas and quote every cell.
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const header = ['Submitted', 'Asset', 'Check', 'Revision', 'Kind', 'Inspector', 'Result', 'Minor', 'Critical', 'Meter', 'Defects'];
  const rows = items.map((item) => [
    item.submittedAt, item.assetTag, item.templateCode, item.revision, item.kind, item.inspectedBy, item.result, item.minorCount,
    item.criticalCount, item.meterReading,
    item.results.filter((result) => result.outcome === 'MINOR' || result.outcome === 'CRITICAL').map((result) => `${result.itemKey} (${result.outcome}): ${result.note}`).join('; '),
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

function History({ onOpen }: { onOpen: (assetId: string) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ from: string; to: string; items: FleetInspectionV1[] } | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    const to = new Date();
    fleetApi.inspections({ from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString() })
      .then(setData, (failure: CmmsApiError) => setError(failure));
  }, [days]);
  useEffect(load, [load]);
  const download = () => {
    if (!data) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([toCsv(data.items)], { type: 'text/csv;charset=utf-8' }));
    link.download = `fleet-inspections-${data.from.slice(0, 10)}-${data.to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <Heading level="h2">Inspection history</Heading>
        <div className="flex items-end gap-2">
          <Field id="fleet-days" label="Days">
            <select id="fleet-days" className={selectClass} value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {[7, 30, 92].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Button type="button" size="small" variant="secondary" disabled={!data?.items.length} onClick={download}>Export CSV</Button>
        </div>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
      {!error && !data ? <LoadingState label="Loading inspections…" /> : null}
      {data && data.items.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No inspections" text="Nothing in this window." /></div> : null}
      {data && data.items.length > 0 ? (
        <Table>
          <Table.Body>
            {data.items.map((item) => (
              <Table.Row key={item.id} className="cursor-pointer" onClick={() => onOpen(item.assetId)}>
                <Table.Cell>{formatDate(item.submittedAt)}</Table.Cell>
                <Table.Cell>{item.assetTag}</Table.Cell>
                <Table.Cell>{item.kind === 'PRE_TRIP' ? 'Pre-trip' : 'Post-trip'} · {item.inspectedBy}</Table.Cell>
                <Table.Cell><StatusBadge color={resultColor[item.result]}>{item.result}</StatusBadge></Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function AssetFleetView({ assetId, can, onBack }: { assetId: string; can: Can; onBack: () => void }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof fleetApi.asset>> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    fleetApi.asset(assetId).then(setView, (failure: CmmsApiError) => setError(failure));
  }, [assetId]);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!view) return <LoadingState label="Loading the asset…" />;
  const { readiness } = view;
  const redTag = async () => {
    setActionError(null);
    try {
      await fleetApi.ground({ clientOperationId: crypto.randomUUID(), assetId, reason: reason.trim() });
      setReason('');
      load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  };
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Heading level="h2">{readiness.assetTag} · {readiness.assetName}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {readiness.templateCode} every {readiness.intervalHours} h{readiness.dueAt ? ` · next due ${formatDate(readiness.dueAt)}` : ''}
            {view.eligibility.credentialCheck === 'UNVERIFIED' ? ` · needs ${readiness.requiredCredential} (not verified)` : ''}
          </Text>
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge color={stateColor[readiness.state]}>{stateLabel[readiness.state]}</StatusBadge>
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      {view.openGrounding ? <RedTagCard tag={view.openGrounding} can={can} onChanged={load} /> : null}
      {!view.openGrounding && can('cmms.fleet.inspect') ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field id="red-tag-reason" label="Red-tag reason" className="min-w-72 flex-1">
            <Textarea id="red-tag-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button type="button" size="small" variant="danger" disabled={!reason.trim()} onClick={redTag}>Red tag (ground now)</Button>
        </div>
      ) : null}
      <ActionError error={actionError} onReload={load} />
      <Heading level="h3">Recent inspections</Heading>
      {view.recentInspections.length === 0 ? <Text size="small">No inspections yet.</Text> : null}
      {view.recentInspections.map((inspection) => (
        <div key={inspection.id} className="flex flex-col gap-1 rounded-lg border border-ui-border-base p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="small" weight="plus">{formatDate(inspection.submittedAt)} · {inspection.kind === 'PRE_TRIP' ? 'Pre-trip' : 'Post-trip'} · {inspection.inspectedBy}</Text>
            <StatusBadge color={resultColor[inspection.result]}>{inspection.result}</StatusBadge>
          </div>
          {inspection.results.filter((result) => result.note).map((result) => (
            <Text key={result.itemKey} size="small">{result.outcome === 'CRITICAL' ? 'Critical' : 'Minor'} · {result.itemKey}: {result.note}{result.hasPhoto ? ' (photo)' : ''}</Text>
          ))}
        </div>
      ))}
    </Container>
  );
}
