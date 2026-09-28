'use client';

import { type CmmsApiError, cmmsApi } from '@/lib/cmms-api';
import type { CmmsAssetStatusV1, CmmsAssetV1, CmmsPageV1 } from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ActionError,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SiteSelect,
  type SiteOption,
  formatDate,
  formatMoney,
  optionalNumber,
  optionalText,
  selectClass,
  useSites,
} from './CmmsShared';

const assetStatusColor: Record<CmmsAssetStatusV1, 'green' | 'orange' | 'red' | 'grey'> = {
  OPERATIONAL: 'green',
  UNDER_MAINTENANCE: 'orange',
  OFFLINE: 'red',
  DECOMMISSIONED: 'grey',
};

export function CmmsAssets() {
  const [page, setPage] = useState<CmmsPageV1<CmmsAssetV1> | null>(null);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<CmmsAssetV1 | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { sites, siteName } = useSites();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(await cmmsApi.searchAssets({ pageSize: 100, includeArchived, ...(query.trim() ? { q: query.trim() } : {}) }));
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [query, includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !page) return <ErrorState error={error} retry={() => void load()} />;
  const assets = page?.items ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Asset register</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">{page ? `${page.total} asset(s)` : 'Loading…'}</Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}><Plus /> Register asset</Button>
        </div>
        {showCreate ? (
          <AssetForm
            sites={sites}
            assets={assets}
            onSaved={async (asset) => {
              setShowCreate(false);
              setSelected(asset);
              await load();
            }}
          />
        ) : null}
        <form
          className="mt-5 flex flex-wrap items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div className="min-w-[220px] flex-1">
            <Input type="text" inputMode="search" enterKeyHint="search" aria-label="Search assets" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or tag" />
          </div>
          <label className="flex items-center gap-2 txt-compact-small">
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Include archived
          </label>
        </form>
        {loading ? (
          <LoadingState />
        ) : assets.length === 0 ? (
          <EmptyState title="No assets registered" text="Register the equipment you maintain and place it at a Geospatial site." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Asset</Table.HeaderCell>
                  <Table.HeaderCell>Site</Table.HeaderCell>
                  <Table.HeaderCell>Criticality</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Open work</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {assets.map((asset) => (
                  <Table.Row key={asset.id} className={`cursor-pointer ${selected?.id === asset.id ? 'bg-ui-bg-highlight' : ''}`} onClick={() => setSelected(asset)}>
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{asset.name}</span>
                      <span className="font-mono text-xs text-ui-fg-subtle">{asset.assetTag}</span>
                    </Table.Cell>
                    <Table.Cell>{siteName(asset.siteRef)}</Table.Cell>
                    <Table.Cell>{asset.criticality}</Table.Cell>
                    <Table.Cell><StatusBadge color={assetStatusColor[asset.status]}>{asset.status.replace('_', ' ')}</StatusBadge></Table.Cell>
                    <Table.Cell className="tabular-nums">{asset.openWorkOrderCount}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      <AssetPanel
        asset={selected}
        sites={sites}
        assets={assets}
        siteName={siteName}
        onChanged={async (asset) => {
          setSelected(asset);
          await load();
        }}
      />
    </div>
  );
}

function AssetForm({ asset, sites, assets, onSaved }: {
  asset?: CmmsAssetV1;
  sites: readonly SiteOption[];
  assets: readonly CmmsAssetV1[];
  onSaved: (asset: CmmsAssetV1) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const cost = optionalNumber(data.get('acquisitionCost'));
    const fields = {
      name: String(data.get('name') ?? ''),
      category: optionalText(data.get('category')) ?? null,
      criticality: String(data.get('criticality')),
      status: String(data.get('status')),
      siteRef: optionalText(data.get('siteRef')) ?? null,
      parentAssetId: optionalText(data.get('parentAssetId')) ?? null,
      manufacturer: optionalText(data.get('manufacturer')) ?? null,
      model: optionalText(data.get('model')) ?? null,
      serialNumber: optionalText(data.get('serialNumber')) ?? null,
      acquisitionCost: cost ?? null,
      currencyCode: optionalText(data.get('currencyCode'))?.toUpperCase() ?? null,
      purchaseDate: optionalText(data.get('purchaseDate')) ?? null,
      warrantyExpiry: optionalText(data.get('warrantyExpiry')) ?? null,
    };
    try {
      const saved = asset
        ? await cmmsApi.updateAsset(asset.id, { expectedVersion: asset.version, ...fields })
        : await cmmsApi.createAsset({ assetTag: String(data.get('assetTag') ?? ''), ...fields });
      await onSaved(saved);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }

  const prefix = asset ? `asset-${asset.id}` : 'asset-new';
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
      {asset ? null : <Field id={`${prefix}-tag`} label="Asset tag"><Input id={`${prefix}-tag`} name="assetTag" required maxLength={64} className="uppercase" /></Field>}
      <Field id={`${prefix}-name`} label="Name" className={asset ? 'md:col-span-2' : ''}><Input id={`${prefix}-name`} name="name" required maxLength={200} defaultValue={asset?.name} /></Field>
      <Field id={`${prefix}-site`} label="Site"><SiteSelect id={`${prefix}-site`} name="siteRef" defaultValue={asset?.siteRef} sites={sites} /></Field>
      <Field id={`${prefix}-parent`} label="Parent asset">
        <select id={`${prefix}-parent`} name="parentAssetId" defaultValue={asset?.parentAssetId ?? ''} className={selectClass}>
          <option value="">None</option>
          {assets.filter((candidate) => candidate.id !== asset?.id && !candidate.archivedAt).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.assetTag})</option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-criticality`} label="Criticality">
        <select id={`${prefix}-criticality`} name="criticality" defaultValue={asset?.criticality ?? 'MEDIUM'} className={selectClass}>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </Field>
      <Field id={`${prefix}-status`} label="Status">
        <select id={`${prefix}-status`} name="status" defaultValue={asset?.status ?? 'OPERATIONAL'} className={selectClass}>
          {['OPERATIONAL', 'UNDER_MAINTENANCE', 'OFFLINE'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
        </select>
      </Field>
      <Field id={`${prefix}-category`} label="Category"><Input id={`${prefix}-category`} name="category" maxLength={80} defaultValue={asset?.category ?? ''} /></Field>
      <Field id={`${prefix}-manufacturer`} label="Manufacturer"><Input id={`${prefix}-manufacturer`} name="manufacturer" maxLength={200} defaultValue={asset?.manufacturer ?? ''} /></Field>
      <Field id={`${prefix}-model`} label="Model"><Input id={`${prefix}-model`} name="model" maxLength={200} defaultValue={asset?.model ?? ''} /></Field>
      <Field id={`${prefix}-serial`} label="Serial number"><Input id={`${prefix}-serial`} name="serialNumber" maxLength={200} defaultValue={asset?.serialNumber ?? ''} /></Field>
      <Field id={`${prefix}-cost`} label="Acquisition cost">
        <div className="flex gap-2">
          <Input id={`${prefix}-cost`} name="acquisitionCost" type="number" min="0" step="0.01" defaultValue={asset?.acquisitionCost ?? ''} />
          <Input name="currencyCode" aria-label="Currency" maxLength={3} placeholder="USD" className="w-20 uppercase" defaultValue={asset?.currencyCode ?? ''} />
        </div>
      </Field>
      <Field id={`${prefix}-purchase`} label="Purchase date"><Input id={`${prefix}-purchase`} name="purchaseDate" type="date" defaultValue={asset?.purchaseDate ?? ''} /></Field>
      <Field id={`${prefix}-warranty`} label="Warranty expiry"><Input id={`${prefix}-warranty`} name="warrantyExpiry" type="date" defaultValue={asset?.warrantyExpiry ?? ''} /></Field>
      <div className="md:col-span-2"><ActionError error={error} /></div>
      <Button type="submit" isLoading={saving} className="md:col-span-2">{asset ? 'Save changes' : 'Register asset'}</Button>
    </form>
  );
}

function AssetPanel({ asset, sites, assets, siteName, onChanged }: {
  asset: CmmsAssetV1 | null;
  sites: readonly SiteOption[];
  assets: readonly CmmsAssetV1[];
  siteName: (siteRef: string | null) => string;
  onChanged: (asset: CmmsAssetV1) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [asset?.id]);

  if (!asset) {
    return (
      <aside aria-label="Asset details">
        <Container className="p-5">
          <Heading level="h2">Asset details</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">Select an asset to view or change it. Health figures are shown only when measured.</Text>
        </Container>
      </aside>
    );
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = optionalText(new FormData(event.currentTarget).get('reason'));
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await onChanged(await cmmsApi.archiveAsset(asset!.id, { expectedVersion: asset!.version, reason }));
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="Asset details">
      <Container className="p-5">
        <Text size="xsmall" className="font-mono text-ui-fg-subtle">{asset.assetTag} · v{asset.version}</Text>
        <Heading level="h2" className="mt-1">{asset.name}</Heading>
        <dl className="mt-4 grid grid-cols-2 gap-3 txt-compact-small">
          <div><dt className="text-ui-fg-subtle">Status</dt><dd>{asset.status.replace('_', ' ')}</dd></div>
          <div><dt className="text-ui-fg-subtle">Criticality</dt><dd>{asset.criticality}</dd></div>
          <div><dt className="text-ui-fg-subtle">Site</dt><dd>{siteName(asset.siteRef)}</dd></div>
          <div><dt className="text-ui-fg-subtle">Open work orders</dt><dd className="tabular-nums">{asset.openWorkOrderCount}</dd></div>
          <div><dt className="text-ui-fg-subtle">Manufacturer / model</dt><dd>{[asset.manufacturer, asset.model].filter(Boolean).join(' · ') || '—'}</dd></div>
          <div><dt className="text-ui-fg-subtle">Serial</dt><dd>{asset.serialNumber ?? '—'}</dd></div>
          <div>
            <dt className="text-ui-fg-subtle">Acquisition cost</dt>
            <dd>{asset.acquisitionCost !== null && asset.currencyCode ? formatMoney(asset.acquisitionCost, asset.currencyCode) : '—'}</dd>
          </div>
          <div><dt className="text-ui-fg-subtle">Warranty</dt><dd>{asset.warrantyExpiry ?? '—'}</dd></div>
          <div className="col-span-2"><dt className="text-ui-fg-subtle">Updated</dt><dd>{formatDate(asset.updatedAt)}</dd></div>
        </dl>
        {asset.archivedAt ? (
          <Text size="small" className="mt-4 text-ui-fg-subtle">Archived {formatDate(asset.archivedAt)}.</Text>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button type="button" size="small" variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Close editor' : 'Edit asset'}</Button>
          </div>
        )}
        {editing && !asset.archivedAt ? (
          <AssetForm asset={asset} sites={sites} assets={assets} onSaved={async (saved) => { setEditing(false); await onChanged(saved); }} />
        ) : null}
        {!asset.archivedAt ? (
          <form onSubmit={archive} className="mt-5 flex flex-wrap gap-2 border-t border-ui-border-base pt-4">
            <Input name="reason" placeholder="Reason to decommission" aria-label="Decommission reason" maxLength={500} className="min-w-[200px] flex-1" />
            <Button type="submit" size="small" variant="danger" isLoading={busy}>Decommission</Button>
          </form>
        ) : null}
        <ActionError error={error} />
      </Container>
    </aside>
  );
}
