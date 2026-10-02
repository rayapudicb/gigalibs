'use client';

import type {
  CmmsAssetClassificationV1,
  CmmsAssetSpecValueV1,
  CmmsAssetStatusV1,
  CmmsAssetV1,
  CmmsClassificationTreeV1,
  CmmsEquipmentNodeV1,
  CmmsPageV1,
  CmmsSpaceTreeV1,
  CmmsSpecDefinitionV1,
} from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import {
  ActionError,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  type SiteOption,
  SiteSelect,
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
  const [spaces, setSpaces] = useState<
    Array<{ id: string; name: string; code: string; spaceType: string }>
  >([]);
  const [classifications, setClassifications] = useState<
    Array<{ id: string; name: string; code: string; parentClassId: string | null }>
  >([]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { sites, siteName } = useSites();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, spacesRes, classesRes] = await Promise.all([
        cmmsApi.searchAssets({
          pageSize: 100,
          includeArchived,
          ...(query.trim() ? { q: query.trim() } : {}),
        }),
        cmmsApi.listSpaceTree().catch(() => ({ items: [] })),
        cmmsApi.listClassificationTree().catch(() => ({ items: [] })),
      ]);
      setPage(assetsRes);
      const flat: Array<{ id: string; name: string; code: string; spaceType: string }> = [];
      function recurse(nodes: readonly CmmsSpaceTreeV1[]) {
        for (const node of nodes) {
          flat.push({ id: node.id, name: node.name, code: node.code, spaceType: node.spaceType });
          if (node.children) recurse(node.children);
        }
      }
      recurse(spacesRes.items);
      setSpaces(flat);

      const flatClasses: Array<{ id: string; name: string; code: string; parentClassId: string | null }> = [];
      function recurseClasses(nodes: readonly CmmsClassificationTreeV1[]) {
        for (const node of nodes) {
          flatClasses.push({ id: node.id, name: node.name, code: node.code, parentClassId: node.parentClassId });
          if (node.children) recurseClasses(node.children);
        }
      }
      recurseClasses(classesRes.items);
      setClassifications(flatClasses);
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
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {page ? `${page.total} asset(s)` : 'Loading…'}
            </Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}>
            <Plus /> Register asset
          </Button>
        </div>
        {showCreate ? (
          <AssetForm
            sites={sites}
            assets={assets}
            spaces={spaces}
            classifications={classifications}
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
            <Input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Search assets"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or tag"
            />
          </div>
          <label className="flex items-center gap-2 txt-compact-small">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />{' '}
            Include archived
          </label>
        </form>
        {loading ? (
          <LoadingState />
        ) : assets.length === 0 ? (
          <EmptyState
            title="No assets registered"
            text="Register the equipment you maintain and place it at a Geospatial site."
          />
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
                  <Table.Row
                    key={asset.id}
                    className={`cursor-pointer ${selected?.id === asset.id ? 'bg-ui-bg-highlight' : ''}`}
                    onClick={() => setSelected(asset)}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{asset.name}</span>
                      <span className="font-mono text-xs text-ui-fg-subtle">{asset.assetTag}</span>
                    </Table.Cell>
                    <Table.Cell>{siteName(asset.siteRef)}</Table.Cell>
                    <Table.Cell>{asset.criticality}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={assetStatusColor[asset.status]}>
                        {asset.status.replace('_', ' ')}
                      </StatusBadge>
                    </Table.Cell>
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
        spaces={spaces}
        classifications={classifications}
        siteName={siteName}
        onChanged={async (asset) => {
          setSelected(asset);
          await load();
        }}
      />
    </div>
  );
}

function AssetForm({
  asset,
  sites,
  assets,
  spaces,
  classifications,
  onSaved,
}: {
  asset?: CmmsAssetV1;
  sites: readonly SiteOption[];
  assets: readonly CmmsAssetV1[];
  spaces: readonly { id: string; name: string; code: string; spaceType: string }[];
  classifications: ReadonlyArray<{ id: string; name: string; code: string }>;
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
      spaceId: optionalText(data.get('spaceId')) ?? null,
      classificationId: optionalText(data.get('classificationId')) ?? null,
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
    <form
      onSubmit={submit}
      className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2"
    >
      {asset ? null : (
        <Field id={`${prefix}-tag`} label="Asset tag">
          <Input
            id={`${prefix}-tag`}
            name="assetTag"
            required
            maxLength={64}
            className="uppercase"
          />
        </Field>
      )}
      <Field id={`${prefix}-name`} label="Name" className={asset ? 'md:col-span-2' : ''}>
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={200}
          defaultValue={asset?.name}
        />
      </Field>
      <Field id={`${prefix}-site`} label="Site">
        <SiteSelect
          id={`${prefix}-site`}
          name="siteRef"
          defaultValue={asset?.siteRef}
          sites={sites}
        />
      </Field>
      <Field id={`${prefix}-space`} label="Spatial location (CAFM Space)">
        <select
          id={`${prefix}-space`}
          name="spaceId"
          defaultValue={asset?.spaceId ?? ''}
          className={selectClass}
        >
          <option value="">None (Unassigned)</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              [{s.spaceType}] {s.name} ({s.code})
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-classification`} label="Engineering classification (Taxonomy)">
        <select
          id={`${prefix}-classification`}
          name="classificationId"
          defaultValue={asset?.classificationId ?? ''}
          className={selectClass}
        >
          <option value="">None (Unclassified)</option>
          {classifications.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-parent`} label="Parent asset">
        <select
          id={`${prefix}-parent`}
          name="parentAssetId"
          defaultValue={asset?.parentAssetId ?? ''}
          className={selectClass}
        >
          <option value="">None</option>
          {assets
            .filter((candidate) => candidate.id !== asset?.id && !candidate.archivedAt)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({candidate.assetTag})
              </option>
            ))}
        </select>
      </Field>
      <Field id={`${prefix}-criticality`} label="Criticality">
        <select
          id={`${prefix}-criticality`}
          name="criticality"
          defaultValue={asset?.criticality ?? 'MEDIUM'}
          className={selectClass}
        >
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-status`} label="Status">
        <select
          id={`${prefix}-status`}
          name="status"
          defaultValue={asset?.status ?? 'OPERATIONAL'}
          className={selectClass}
        >
          {['OPERATIONAL', 'UNDER_MAINTENANCE', 'OFFLINE'].map((value) => (
            <option key={value} value={value}>
              {value.replace('_', ' ')}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-category`} label="Category">
        <Input
          id={`${prefix}-category`}
          name="category"
          maxLength={80}
          defaultValue={asset?.category ?? ''}
        />
      </Field>
      <Field id={`${prefix}-manufacturer`} label="Manufacturer">
        <Input
          id={`${prefix}-manufacturer`}
          name="manufacturer"
          maxLength={200}
          defaultValue={asset?.manufacturer ?? ''}
        />
      </Field>
      <Field id={`${prefix}-model`} label="Model">
        <Input
          id={`${prefix}-model`}
          name="model"
          maxLength={200}
          defaultValue={asset?.model ?? ''}
        />
      </Field>
      <Field id={`${prefix}-serial`} label="Serial number">
        <Input
          id={`${prefix}-serial`}
          name="serialNumber"
          maxLength={200}
          defaultValue={asset?.serialNumber ?? ''}
        />
      </Field>
      <Field id={`${prefix}-cost`} label="Acquisition cost">
        <div className="flex gap-2">
          <Input
            id={`${prefix}-cost`}
            name="acquisitionCost"
            type="number"
            min="0"
            step="0.01"
            defaultValue={asset?.acquisitionCost ?? ''}
          />
          <Input
            name="currencyCode"
            aria-label="Currency"
            maxLength={3}
            placeholder="USD"
            className="w-20 uppercase"
            defaultValue={asset?.currencyCode ?? ''}
          />
        </div>
      </Field>
      <Field id={`${prefix}-purchase`} label="Purchase date">
        <Input
          id={`${prefix}-purchase`}
          name="purchaseDate"
          type="date"
          defaultValue={asset?.purchaseDate ?? ''}
        />
      </Field>
      <Field id={`${prefix}-warranty`} label="Warranty expiry">
        <Input
          id={`${prefix}-warranty`}
          name="warrantyExpiry"
          type="date"
          defaultValue={asset?.warrantyExpiry ?? ''}
        />
      </Field>
      <div className="md:col-span-2">
        <ActionError error={error} />
      </div>
      <Button type="submit" isLoading={saving} className="md:col-span-2">
        {asset ? 'Save changes' : 'Register asset'}
      </Button>
    </form>
  );
}

function AssetPanel({
  asset,
  sites,
  assets,
  spaces,
  classifications,
  siteName,
  onChanged,
}: {
  asset: CmmsAssetV1 | null;
  sites: readonly SiteOption[];
  assets: readonly CmmsAssetV1[];
  spaces: readonly { id: string; name: string; code: string; spaceType: string }[];
  classifications: ReadonlyArray<{ id: string; name: string; code: string }>;
  siteName: (siteRef: string | null) => string;
  onChanged: (asset: CmmsAssetV1) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'hierarchy'>('overview');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setActiveTab('overview');
    setError(null);
  }, [asset?.id]);

  if (!asset) {
    return (
      <aside aria-label="Asset details">
        <Container className="p-5">
          <Heading level="h2">Asset details</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">
            Select an asset to view or change it. Health figures are shown only when measured.
          </Text>
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
      await onChanged(
        await cmmsApi.archiveAsset(asset!.id, { expectedVersion: asset!.version, reason }),
      );
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  const classification = classifications.find((c) => c.id === asset.classificationId);

  return (
    <aside aria-label="Asset details">
      <Container className="p-5">
        <div className="flex items-center justify-between">
          <Text size="xsmall" className="font-mono text-ui-fg-subtle">
            {asset.assetTag} · v{asset.version}
          </Text>
          {classification && (
            <span className="text-[11px] font-mono text-ui-fg-interactive bg-ui-bg-highlight px-2 py-0.5 rounded border border-ui-border-interactive">
              {classification.name} ({classification.code})
            </span>
          )}
        </div>
        <Heading level="h2" className="mt-1">
          {asset.name}
        </Heading>

        <div className="mt-4 flex gap-1 border-b border-ui-border-base pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'overview'
                ? 'bg-ui-bg-highlight text-ui-fg-interactive font-semibold shadow-sm'
                : 'text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('specs')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'specs'
                ? 'bg-ui-bg-highlight text-ui-fg-interactive font-semibold shadow-sm'
                : 'text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            Engineering Specs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hierarchy')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'hierarchy'
                ? 'bg-ui-bg-highlight text-ui-fg-interactive font-semibold shadow-sm'
                : 'text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            Hierarchy &amp; Cascade
          </button>
        </div>

        {activeTab === 'overview' && (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 txt-compact-small">
              <div>
                <dt className="text-ui-fg-subtle">Status</dt>
                <dd>{asset.status.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Criticality</dt>
                <dd>{asset.criticality}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Classification</dt>
                <dd>{classification ? `${classification.name} (${classification.code})` : '—'}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Site</dt>
                <dd>{siteName(asset.siteRef)}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Spatial location</dt>
                <dd>
                  {(() => {
                    const sp = spaces.find((s) => s.id === asset.spaceId);
                    return sp ? `[${sp.spaceType}] ${sp.name} (${sp.code})` : '—';
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Open work orders</dt>
                <dd className="tabular-nums">{asset.openWorkOrderCount}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Manufacturer / model</dt>
                <dd>{[asset.manufacturer, asset.model].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Serial</dt>
                <dd>{asset.serialNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Acquisition cost</dt>
                <dd>
                  {asset.acquisitionCost !== null && asset.currencyCode
                    ? formatMoney(asset.acquisitionCost, asset.currencyCode)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ui-fg-subtle">Warranty</dt>
                <dd>{asset.warrantyExpiry ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ui-fg-subtle">Updated</dt>
                <dd>{formatDate(asset.updatedAt)}</dd>
              </div>
            </dl>
            {asset.archivedAt ? (
              <Text size="small" className="mt-4 text-ui-fg-subtle">
                Archived {formatDate(asset.archivedAt)}.
              </Text>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  onClick={() => setEditing((value) => !value)}
                >
                  {editing ? 'Close editor' : 'Edit asset'}
                </Button>
              </div>
            )}
            {editing && !asset.archivedAt ? (
              <AssetForm
                asset={asset}
                sites={sites}
                assets={assets}
                spaces={spaces}
                classifications={classifications}
                onSaved={async (saved) => {
                  setEditing(false);
                  await onChanged(saved);
                }}
              />
            ) : null}
            {!asset.archivedAt ? (
              <form
                onSubmit={archive}
                className="mt-5 flex flex-wrap gap-2 border-t border-ui-border-base pt-4"
              >
                <Input
                  name="reason"
                  placeholder="Reason to decommission"
                  aria-label="Decommission reason"
                  maxLength={500}
                  className="min-w-[200px] flex-1"
                />
                <Button type="submit" size="small" variant="danger" isLoading={busy}>
                  Decommission
                </Button>
              </form>
            ) : null}
          </>
        )}

        {activeTab === 'specs' && (
          <AssetSpecSheet asset={asset} classifications={classifications} />
        )}

        {activeTab === 'hierarchy' && (
          <AssetEquipmentHierarchySection
            asset={asset}
            onStatusCascaded={async () => {
              const refreshed = await cmmsApi.getAsset(asset.id);
              await onChanged(refreshed);
            }}
          />
        )}

        <ActionError error={error} />
      </Container>
    </aside>
  );
}

function AssetSpecSheet({
  asset,
  classifications,
}: {
  asset: CmmsAssetV1;
  classifications: ReadonlyArray<{ id: string; name: string; code: string }>;
}) {
  const [specs, setSpecs] = useState<readonly CmmsAssetSpecValueV1[]>([]);
  const [specDefs, setSpecDefs] = useState<readonly CmmsSpecDefinitionV1[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [formValues, setFormValues] = useState<
    Record<string, { text?: string; number?: number; boolean?: boolean }>
  >({});

  const loadSpecs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [specsRes, defsRes] = await Promise.all([
        cmmsApi.getAssetSpecs(asset.id),
        asset.classificationId
          ? cmmsApi.listSpecDefs(asset.classificationId).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      setSpecs(specsRes.items);
      setSpecDefs(defsRes.items);
      const initial: Record<string, { text?: string; number?: number; boolean?: boolean }> = {};
      for (const s of specsRes.items) {
        initial[s.specDefinitionId] = {
          text: s.valueText ?? undefined,
          number: s.valueNumber ?? undefined,
          boolean: s.valueBoolean ?? undefined,
        };
      }
      setFormValues(initial);
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [asset.id, asset.classificationId]);

  useEffect(() => {
    void loadSpecs();
  }, [loadSpecs]);

  async function saveSpecs(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payloadSpecs: Array<{
        specDefinitionId: string;
        valueText?: string | null;
        valueNumber?: number | null;
        valueBoolean?: boolean | null;
      }> = [];

      for (const def of specDefs) {
        const val = formValues[def.id];
        if (!val) continue;
        payloadSpecs.push({
          specDefinitionId: def.id,
          valueText: def.dataType === 'TEXT' ? val.text ?? null : null,
          valueNumber: def.dataType === 'NUMBER' ? val.number ?? null : null,
          valueBoolean:
            def.dataType === 'BOOLEAN' ? (val.boolean !== undefined ? val.boolean : null) : null,
        });
      }

      await cmmsApi.setAssetSpecs(asset.id, { specs: payloadSpecs });
      setEditing(false);
      await loadSpecs();
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }

  const classification = classifications.find((c) => c.id === asset.classificationId);

  return (
    <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h3" className="text-sm font-semibold">
            Technical Specification Sheet
          </Heading>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {classification
              ? `Taxonomy: ${classification.name} (${classification.code})`
              : 'Unclassified asset'}
          </Text>
        </div>
        {specDefs.length > 0 && !editing && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Edit specifications
          </Button>
        )}
      </div>

      <ActionError error={error} />

      {loading ? (
        <LoadingState />
      ) : !asset.classificationId ? (
        <Text size="small" className="mt-3 text-ui-fg-subtle">
          Assign an engineering classification in the Overview tab to define technical specifications for this asset.
        </Text>
      ) : specDefs.length === 0 ? (
        <Text size="small" className="mt-3 text-ui-fg-subtle">
          No specification definitions configured for this classification.
        </Text>
      ) : editing ? (
        <form onSubmit={saveSpecs} className="mt-3 grid gap-3">
          {specDefs.map((def) => {
            const current = formValues[def.id] ?? {};
            return (
              <div key={def.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center text-xs">
                <div>
                  <span className="font-medium text-ui-fg-base">{def.label}</span>
                  {def.required && <span className="text-ui-fg-error ml-1">*</span>}
                  <div className="text-ui-fg-subtle text-[11px]">
                    {def.attributeKey} · {def.dataType} {def.uom ? `(${def.uom})` : ''}
                    {def.minValue !== null || def.maxValue !== null
                      ? ` · Range: [${def.minValue ?? '-∞'}, ${def.maxValue ?? '+∞'}]`
                      : ''}
                  </div>
                </div>
                <div>
                  {def.dataType === 'NUMBER' ? (
                    <Input
                      type="number"
                      step="any"
                      min={def.minValue ?? undefined}
                      max={def.maxValue ?? undefined}
                      required={def.required}
                      placeholder={def.uom ? `Value in ${def.uom}` : 'Numeric value'}
                      value={current.number ?? ''}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          [def.id]: {
                            ...prev[def.id],
                            number: e.target.value === '' ? undefined : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  ) : def.dataType === 'BOOLEAN' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={current.boolean ?? false}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [def.id]: { ...prev[def.id], boolean: e.target.checked },
                          }))
                        }
                      />
                      <span>{current.boolean ? 'True / Yes' : 'False / No'}</span>
                    </label>
                  ) : (
                    <Input
                      type="text"
                      required={def.required}
                      placeholder="Text value"
                      value={current.text ?? ''}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          [def.id]: { ...prev[def.id], text: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="small" isLoading={saving}>
              Save specifications
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ui-border-base text-ui-fg-subtle">
                <th className="py-1">Specification</th>
                <th className="py-1">Key</th>
                <th className="py-1">Value</th>
                <th className="py-1">Unit</th>
              </tr>
            </thead>
            <tbody>
              {specDefs.map((def) => {
                const s = specs.find((item) => item.specDefinitionId === def.id);
                let displayVal = '—';
                if (s) {
                  if (def.dataType === 'NUMBER') {
                    displayVal = s.valueNumber !== null ? String(s.valueNumber) : '—';
                  } else if (def.dataType === 'BOOLEAN') {
                    displayVal =
                      s.valueBoolean !== null ? (s.valueBoolean ? 'True' : 'False') : '—';
                  } else {
                    displayVal = s.valueText ?? '—';
                  }
                }
                return (
                  <tr key={def.id} className="border-b border-ui-border-base/50">
                    <td className="py-1.5 font-medium">{def.label}</td>
                    <td className="py-1.5 font-mono text-[11px] text-ui-fg-subtle">
                      {def.attributeKey}
                    </td>
                    <td className="py-1.5">{displayVal}</td>
                    <td className="py-1.5 text-ui-fg-subtle">{def.uom ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssetEquipmentHierarchySection({
  asset,
  onStatusCascaded,
}: {
  asset: CmmsAssetV1;
  onStatusCascaded: () => Promise<void>;
}) {
  const [tree, setTree] = useState<CmmsEquipmentNodeV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [cascadeTarget, setCascadeTarget] = useState<CmmsAssetStatusV1>('OFFLINE');
  const [cascadeReason, setCascadeReason] = useState('');
  const [showCascadeForm, setShowCascadeForm] = useState(false);
  const [cascading, setCascading] = useState(false);
  const [cascadeResult, setCascadeResult] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cmmsApi.getEquipmentTree(asset.id);
      setTree(res);
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  async function handleCascade(e: FormEvent) {
    e.preventDefault();
    if (!cascadeReason.trim()) return;
    setCascading(true);
    setError(null);
    setCascadeResult(null);
    try {
      const res = await cmmsApi.cascadeStatus(asset.id, {
        targetStatus: cascadeTarget,
        reason: cascadeReason.trim(),
      });
      setCascadeResult(
        `Cascaded status "${res.targetStatus}" across ${res.affectedCount} asset(s) in this hierarchy.`,
      );
      setShowCascadeForm(false);
      setCascadeReason('');
      await loadTree();
      await onStatusCascaded();
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setCascading(false);
    }
  }

  function renderNode(node: CmmsEquipmentNodeV1, depth = 0) {
    const isCurrent = node.id === asset.id;
    return (
      <div key={node.id} className="mt-1" style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
        <div
          className={`flex items-center justify-between rounded p-2 text-xs border ${
            isCurrent
              ? 'border-ui-border-interactive bg-ui-bg-highlight font-medium'
              : 'border-ui-border-base bg-ui-bg-subtle'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-ui-fg-subtle">{node.assetTag}</span>
            <span className="font-semibold text-ui-fg-base">{node.name}</span>
            {node.classificationName && (
              <span className="text-[11px] text-ui-fg-muted bg-ui-bg-base px-1.5 py-0.5 rounded border border-ui-border-base">
                {node.classificationName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ui-fg-subtle">{node.criticality}</span>
            <StatusBadge color={assetStatusColor[node.status]}>
              {node.status.replace('_', ' ')}
            </StatusBadge>
          </div>
        </div>
        {node.children && node.children.length > 0 && (
          <div className="border-l border-ui-border-base pl-2 ml-3">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const childCount = tree?.children?.length ?? 0;

  return (
    <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h3" className="text-sm font-semibold">
            Equipment Hierarchy
          </Heading>
          <Text size="xsmall" className="text-ui-fg-subtle">
            System &amp; downstream component hierarchy ({childCount} direct subcomponent{childCount === 1 ? '' : 's'})
          </Text>
        </div>
        {childCount > 0 && !showCascadeForm && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() => setShowCascadeForm(true)}
          >
            Cascade status
          </Button>
        )}
      </div>

      <ActionError error={error} />
      {cascadeResult && (
        <div className="mt-3 p-2 rounded bg-ui-bg-highlight border border-ui-border-interactive text-xs text-ui-fg-interactive">
          {cascadeResult}
        </div>
      )}

      {showCascadeForm && (
        <form
          onSubmit={handleCascade}
          className="mt-3 p-3 rounded border border-ui-border-base bg-ui-bg-base text-xs grid gap-3"
        >
          <Text size="small" className="font-medium text-ui-fg-base">
            Cascade Operational Status Downward
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Propagates status to this asset and all subcomponents in its equipment hierarchy.
          </Text>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-ui-fg-subtle mb-1">Target Status</label>
              <select
                value={cascadeTarget}
                onChange={(e) => setCascadeTarget(e.target.value as CmmsAssetStatusV1)}
                className={selectClass}
              >
                <option value="OFFLINE">OFFLINE</option>
                <option value="UNDER_MAINTENANCE">UNDER MAINTENANCE</option>
                <option value="OPERATIONAL">OPERATIONAL</option>
              </select>
            </div>
            <div>
              <label className="block text-ui-fg-subtle mb-1">Reason / MOC Reference</label>
              <Input
                required
                placeholder="Reason (e.g. Turbine overhaul shutdown)"
                value={cascadeReason}
                onChange={(e) => setCascadeReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() => setShowCascadeForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="small" variant="danger" isLoading={cascading}>
              Execute cascade
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : tree ? (
        <div className="mt-3">{renderNode(tree)}</div>
      ) : (
        <Text size="small" className="mt-3 text-ui-fg-subtle">
          Hierarchy unavailable.
        </Text>
      )}
    </div>
  );
}

