'use client';

import type { OrgPage, OrgUnitTypeV1, OrgUnitV1 } from '@gigalibs/contracts';
import { Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { describeOrgError, orgRequest, type OrgErrorView, type OrgPermissions } from './organization-client';
import { OrgErrorAlert, OrgSuccess, ReasonField, selectClassName } from './OrgShared';
import { OrgPlaceLinksPanel } from './OrgPlaceLinksPanel';

export interface OrgMember {
  id: string;
  status: string;
  user: { id: string; name: string | null; email: string };
}

interface UnitDraft {
  typeCode: string;
  code: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  timeZone: string;
  managerUserId: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  addressCountry: string;
  legalName: string;
  legalCountry: string;
  currency: string;
  taxId: string;
  reason: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const blank = (typeCode: string): UnitDraft => ({
  typeCode, code: '', name: '', effectiveFrom: today(), effectiveTo: '', timeZone: '', managerUserId: '', email: '', phone: '',
  line1: '', city: '', addressCountry: '', legalName: '', legalCountry: '', currency: '', taxId: '', reason: '',
});

const STATUS_COLOR = { ACTIVE: 'green', INACTIVE: 'orange', ARCHIVED: 'grey' } as const;

/** The organization's units: searchable, editable, never placed in a tree from here (placement is versioned). */
export function OrgUnitsPanel({ unitTypes, members, permissions }: { unitTypes: OrgUnitTypeV1[]; members: OrgMember[]; permissions: OrgPermissions }) {
  const [query, setQuery] = useState('');
  const [typeCode, setTypeCode] = useState('');
  const [status, setStatus] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [page, setPage] = useState<OrgPage<OrgUnitV1> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<OrgErrorView | null>(null);
  const [editing, setEditing] = useState<OrgUnitV1 | 'new' | null>(null);
  const [draft, setDraft] = useState<UnitDraft>(blank(''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<OrgErrorView | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<OrgUnitV1 | null>(null);
  const [placesOf, setPlacesOf] = useState<OrgUnitV1 | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const fieldIds = {
    search: useId(), type: useId(), status: useId(), unitType: useId(), code: useId(), name: useId(), from: useId(), to: useId(),
    zone: useId(), manager: useId(), email: useId(), phone: useId(), line1: useId(), city: useId(), addressCountry: useId(),
    legalName: useId(), legalCountry: useId(), currency: useId(), taxId: useId(),
  };

  const cursor = cursors[cursors.length - 1];
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (query.trim()) params.set('q', query.trim());
      if (typeCode) params.set('typeCode', typeCode);
      if (status) params.set('status', status);
      if (cursor) params.set('cursor', cursor);
      setPage(await orgRequest<OrgPage<OrgUnitV1>>(`/units?${params}`));
    } catch (caught) {
      setLoadError(describeOrgError(caught));
    } finally {
      setLoading(false);
    }
  }, [query, typeCode, status, cursor]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const typeOf = (code: string) => unitTypes.find((type) => type.code === code);
  const isLegal = typeOf(draft.typeCode)?.capabilities.includes('LEGAL_ENTITY') ?? false;
  const activeTypes = unitTypes.filter((type) => type.status === 'ACTIVE');

  const open = (unit: OrgUnitV1 | 'new') => {
    setEditing(unit);
    setError(null);
    setSuccess(null);
    if (unit === 'new') {
      setDraft(blank(activeTypes[0]?.code ?? ''));
      return;
    }
    setDraft({
      typeCode: unit.typeCode, code: unit.code, name: unit.name, effectiveFrom: unit.effectiveFrom, effectiveTo: unit.effectiveTo ?? '',
      timeZone: unit.timeZone ?? '', managerUserId: unit.managerUserId ?? '', email: unit.contact?.email ?? '', phone: unit.contact?.phone ?? '',
      line1: unit.address?.line1 ?? '', city: unit.address?.city ?? '', addressCountry: unit.address?.country ?? '',
      legalName: unit.legal?.legalName ?? '', legalCountry: unit.legal?.country ?? '', currency: unit.legal?.functionalCurrency ?? '',
      taxId: unit.legal?.taxIds?.[0]?.value ?? '', reason: '',
    });
  };

  const body = () => {
    const contact = draft.email || draft.phone ? { ...(draft.email ? { email: draft.email } : {}), ...(draft.phone ? { phone: draft.phone } : {}) } : null;
    const address = draft.line1 && draft.city && draft.addressCountry ? { line1: draft.line1, city: draft.city, country: draft.addressCountry.toUpperCase() } : null;
    const legal =
      isLegal && draft.legalName
        ? {
            legalName: draft.legalName,
            country: draft.legalCountry.toUpperCase(),
            functionalCurrency: draft.currency.toUpperCase(),
            taxIds: draft.taxId ? [{ scheme: 'TAX', value: draft.taxId }] : [],
          }
        : null;
    return {
      code: draft.code.trim(),
      name: draft.name.trim(),
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || null,
      timeZone: draft.timeZone.trim() || null,
      managerUserId: draft.managerUserId || null,
      contact,
      address,
      legal,
    };
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') {
        const created = await orgRequest<OrgUnitV1>('/units', { method: 'POST', body: { typeCode: draft.typeCode, ...body() } });
        setSuccess(`Unit ${created.code} created. Place it in the tree from Structure.`);
      } else if (editing) {
        const saved = await orgRequest<OrgUnitV1>(`/units/${editing.id}`, { method: 'PATCH', body: { expectedVersion: editing.version, ...body(), reason: draft.reason } });
        setSuccess(`Unit ${saved.code} saved.`);
      }
      setEditing(null);
      await load();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (unit: OrgUnitV1, action: 'archive' | 'restore' | 'ACTIVE' | 'INACTIVE', reason: string) => {
    setError(null);
    setSuccess(null);
    try {
      if (action === 'archive' || action === 'restore')
        await orgRequest(`/units/${unit.id}/${action}`, { method: 'POST', body: { expectedVersion: unit.version, reason } });
      else await orgRequest(`/units/${unit.id}`, { method: 'PATCH', body: { expectedVersion: unit.version, status: action, reason } });
      setSuccess(`Unit ${unit.code} ${action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : action === 'INACTIVE' ? 'deactivated' : 'activated'}.`);
      setArchiving(null);
      setArchiveReason('');
      await load();
    } catch (caught) {
      setError(describeOrgError(caught));
    }
  };

  const field = (id: string, label: string, key: keyof UnitDraft, extra: { type?: string; placeholder?: string } = {}) => (
    <div className="flex flex-col gap-1">
      <Label size="small" htmlFor={id}>{label}</Label>
      <Input id={id} size="small" type={extra.type ?? 'text'} placeholder={extra.placeholder} value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    </div>
  );

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Heading level="h2">Units</Heading>
          <Text size="small" className="text-ui-fg-subtle">Companies, offices, stores, estates or departments. Their place in the tree changes only through a reviewed version.</Text>
        </div>
        {permissions.draft && !editing && (
          <Button size="small" onClick={() => open('new')} disabled={activeTypes.length === 0}>Add unit</Button>
        )}
      </div>
      {activeTypes.length === 0 && <Text size="small" className="text-ui-fg-subtle">Add a unit type first.</Text>}
      <OrgSuccess message={success} />
      <OrgErrorAlert error={error} onReload={() => void load()} onRetry={() => void save()} />

      {editing && (
        <form
          className="flex flex-col gap-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
          aria-label={editing === 'new' ? 'New unit' : `Edit ${editing.code}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={fieldIds.unitType}>Type</Label>
              <select id={fieldIds.unitType} className={selectClassName} value={draft.typeCode} disabled={editing !== 'new'}
                onChange={(event) => setDraft({ ...draft, typeCode: event.target.value })}>
                {(editing === 'new' ? activeTypes : unitTypes).map((type) => <option key={type.id} value={type.code}>{type.labels.one} ({type.code})</option>)}
              </select>
            </div>
            {field(fieldIds.code, 'Code', 'code', { placeholder: 'STORE-101' })}
            {field(fieldIds.name, 'Name', 'name')}
            {field(fieldIds.from, 'Effective from', 'effectiveFrom', { type: 'date' })}
            {field(fieldIds.to, 'Effective to (optional)', 'effectiveTo', { type: 'date' })}
            {field(fieldIds.zone, 'Time zone (optional)', 'timeZone', { placeholder: 'Asia/Kolkata' })}
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={fieldIds.manager}>Manager (optional)</Label>
              <select id={fieldIds.manager} className={selectClassName} value={draft.managerUserId} onChange={(event) => setDraft({ ...draft, managerUserId: event.target.value })}>
                <option value="">No manager</option>
                {members.filter((member) => member.status === 'ACTIVE').map((member) => (
                  <option key={member.user.id} value={member.user.id}>{member.user.name ?? member.user.email}</option>
                ))}
              </select>
            </div>
            {field(fieldIds.email, 'Contact email (optional)', 'email', { type: 'email' })}
            {field(fieldIds.phone, 'Contact phone (optional)', 'phone')}
          </div>
          <fieldset className="grid gap-4 md:grid-cols-3">
            <legend className="mb-1"><Text size="small" weight="plus">Address (optional)</Text></legend>
            {field(fieldIds.line1, 'Street', 'line1')}
            {field(fieldIds.city, 'City', 'city')}
            {field(fieldIds.addressCountry, 'Country (2 letters)', 'addressCountry', { placeholder: 'IN' })}
          </fieldset>
          {isLegal && (
            <fieldset className="grid gap-4 md:grid-cols-4">
              <legend className="mb-1"><Text size="small" weight="plus">Legal entity</Text></legend>
              {field(fieldIds.legalName, 'Legal name', 'legalName')}
              {field(fieldIds.legalCountry, 'Country (2 letters)', 'legalCountry', { placeholder: 'IN' })}
              {field(fieldIds.currency, 'Functional currency', 'currency', { placeholder: 'INR' })}
              {field(fieldIds.taxId, 'Tax id (optional)', 'taxId')}
            </fieldset>
          )}
          {editing !== 'new' && <ReasonField value={draft.reason} onChange={(reason) => setDraft({ ...draft, reason })} />}
          <div className="flex gap-2">
            <Button size="small" type="submit" isLoading={saving}>Save</Button>
            <Button size="small" variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-col gap-1">
          <Label size="small" htmlFor={fieldIds.search}>Search</Label>
          <Input id={fieldIds.search} size="small" type="text" placeholder="Code or name" value={query}
            onChange={(event) => { setQuery(event.target.value); setCursors([]); }} />
        </div>
        <div className="flex flex-col gap-1">
          <Label size="small" htmlFor={fieldIds.type}>Type</Label>
          <select id={fieldIds.type} className={selectClassName} value={typeCode} onChange={(event) => { setTypeCode(event.target.value); setCursors([]); }}>
            <option value="">All types</option>
            {unitTypes.map((type) => <option key={type.id} value={type.code}>{type.labels.other}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label size="small" htmlFor={fieldIds.status}>Status</Label>
          <select id={fieldIds.status} className={selectClassName} value={status} onChange={(event) => { setStatus(event.target.value); setCursors([]); }}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      <OrgErrorAlert error={loadError} onRetry={() => void load()} onReload={() => void load()} />
      {loading && !page ? (
        <Text size="small" className="text-ui-fg-subtle" role="status">Loading units…</Text>
      ) : page && page.items.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">{query || typeCode || status ? 'No units match.' : 'No units yet.'}</Text>
      ) : page ? (
        <div className="overflow-x-auto" aria-busy={loading}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell>Effective</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell><span className="sr-only">Actions</span></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {page.items.map((unit) => (
                <Table.Row key={unit.id}>
                  <Table.Cell><Text size="small" weight="plus">{unit.code}</Text></Table.Cell>
                  <Table.Cell>{unit.name}{unit.legal ? <Badge size="2xsmall" className="ml-2">Legal entity</Badge> : null}</Table.Cell>
                  <Table.Cell>{typeOf(unit.typeCode)?.labels.one ?? unit.typeCode}</Table.Cell>
                  <Table.Cell>{unit.effectiveFrom}{unit.effectiveTo ? ` – ${unit.effectiveTo}` : ''}</Table.Cell>
                  <Table.Cell><Badge size="2xsmall" color={STATUS_COLOR[unit.status]}>{unit.status.charAt(0) + unit.status.slice(1).toLowerCase()}</Badge></Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end gap-2">
                      <Button size="small" variant="transparent" onClick={() => setPlacesOf(unit)} aria-label={`Places of ${unit.code}`}>Places</Button>
                    {permissions.draft && (
                      <>
                        {unit.status !== 'ARCHIVED' && <Button size="small" variant="secondary" onClick={() => open(unit)}>Edit</Button>}
                        {unit.status === 'ACTIVE' && <Button size="small" variant="transparent" onClick={() => void changeStatus(unit, 'INACTIVE', 'Temporarily inactive')}>Deactivate</Button>}
                        {unit.status === 'INACTIVE' && <Button size="small" variant="transparent" onClick={() => void changeStatus(unit, 'ACTIVE', 'Active again')}>Activate</Button>}
                        {unit.status !== 'ARCHIVED' && <Button size="small" variant="transparent" onClick={() => setArchiving(unit)}>Archive</Button>}
                        {unit.status === 'ARCHIVED' && <Button size="small" variant="transparent" onClick={() => void changeStatus(unit, 'restore', 'Restored')}>Restore</Button>}
                      </>
                    )}
                    </div>
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
      ) : null}

      {placesOf && <OrgPlaceLinksPanel unit={placesOf} canEdit={permissions.draft} onClose={() => setPlacesOf(null)} />}

      {archiving && (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" role="dialog" aria-label={`Archive ${archiving.code}`}>
          <Text size="small">
            Archive {archiving.code}? A unit in an active, scheduled or open version, or with live grants, is refused: take it out through a new version first.
          </Text>
          <ReasonField value={archiveReason} onChange={setArchiveReason} />
          <div className="flex gap-2">
            <Button size="small" variant="danger" onClick={() => void changeStatus(archiving, 'archive', archiveReason)}>Archive</Button>
            <Button size="small" variant="secondary" onClick={() => setArchiving(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Container>
  );
}
