'use client';

import { geospatialApi, type GeospatialApiError } from '@/lib/geospatial-api';
import { PLACE_IMPORT_TEMPLATE, placeRowsFromCsv, type PlaceImportFile } from '@/lib/place-import';
import {
  MAX_SPATIAL_IMPORT_ROWS,
  type SpatialNodeDetailV1,
  type SpatialNodeImportResultV1,
  type SpatialNodePageV1,
  type SpatialNodeTypeV1,
  type SpatialNodeV1,
} from '@gigalibs/contracts';
import { ArrowDownTray, ArrowPath, ArrowUpTray, ChevronRight, ExclamationCircle, MapPin, Plus, ShieldCheck, Spinner } from '@medusajs/icons';
import { Alert, Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

type Panel = 'create-place' | 'create-type' | 'import' | null;

// Native selects keep FormData and empty-value options; this matches the Medusa Input field style.
const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export function SitesAndZonesExplorer() {
  const [types, setTypes] = useState<readonly SpatialNodeTypeV1[]>([]);
  const [page, setPage] = useState<SpatialNodePageV1 | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SpatialNodeDetailV1 | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GeospatialApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [typePage, nodePage] = await Promise.all([
        geospatialApi.listNodeTypes(),
        geospatialApi.listNodes({ q: q || undefined }),
      ]);
      setTypes(typePage.items);
      setPage(nodePage);
    } catch (reason) {
      setError(reason as GeospatialApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = useCallback(async (id: string) => {
    try {
      setSelected(await geospatialApi.getNode(id));
    } catch (reason) {
      setError(reason as GeospatialApiError);
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(query);
    if (selected) await select(selected.id);
  }, [load, query, select, selected]);

  const nodes = page?.items ?? [];
  const flat = (page?.tenantNodeCount ?? 0) <= 1 || nodes.every((node) => node.depth === 1);
  const activeTypes = types.filter((type) => type.status === 'ACTIVE');

  return (
    <section className="min-h-full bg-ui-bg-subtle px-[5px] py-5 text-ui-fg-base" aria-labelledby="places-title">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">


        {loading && !page ? (
          <Container className="flex items-center gap-x-2 p-7 text-ui-fg-subtle" role="status">
            <Spinner className="animate-spin" /> <Text size="small">Loading places…</Text>
          </Container>
        ) : error && !page ? (
          <ErrorPanel error={error} retry={() => load(query)} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Container className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Heading level="h2">Places</Heading>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    {page?.tenantNodeCount ?? 0} persisted {page?.tenantNodeCount === 1 ? 'place' : 'places'}
                    {flat ? '' : ' in a hierarchy'}.
                  </Text>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="small" disabled={activeTypes.length === 0} onClick={() => { setNotice(null); setPanel(panel === 'import' ? null : 'import'); }}>
                    <ArrowUpTray /> Import
                  </Button>
                  <Button type="button" variant="secondary" size="small" onClick={() => setPanel(panel === 'create-type' ? null : 'create-type')}>
                    <Plus /> Place type
                  </Button>
                  <Button type="button" size="small" disabled={activeTypes.length === 0} onClick={() => setPanel(panel === 'create-place' ? null : 'create-place')}>
                    <Plus /> Place
                  </Button>
                </div>
              </div>

              {notice ? <Alert variant="success" role="status" className="mt-4">{notice}</Alert> : null}
              {panel === 'import' ? (
                <ImportPlacesPanel
                  onCancel={() => setPanel(null)}
                  onImported={(created) => {
                    setPanel(null);
                    setNotice(`Imported ${created} ${created === 1 ? 'place' : 'places'}.`);
                    void refresh();
                  }}
                />
              ) : null}
              {panel === 'create-type' ? <CreateTypeForm onDone={() => { setPanel(null); void refresh(); }} /> : null}
              {panel === 'create-place' ? (
                <CreatePlaceForm types={activeTypes} nodes={nodes} onDone={(id) => { setPanel(null); void load(query).then(() => select(id)); }} />
              ) : null}

              <form
                className="mt-5 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void load(query);
                }}
              >
                <div className="flex-1">
                  <Input id="places-search" type="search" aria-label="Search places" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or code" />
                </div>
                <Button type="submit" variant="secondary" size="small">Search</Button>
              </form>

              {error ? <Alert variant="error" role="alert" className="mt-4">{error.message}</Alert> : null}

              {types.length === 0 ? (
                <EmptyState title="Create your first place type" body="Place types name the levels your organisation uses, such as Region, Site or Zone. Add one, then add places." />
              ) : nodes.length === 0 ? (
                <EmptyState title={query ? 'No places match your search' : 'No places yet'} body={query ? 'Try a different name or code.' : 'Add your first place, such as a region or a single site.'} />
              ) : (
                <ul className="mt-4 divide-y divide-ui-border-base" aria-label="Places">
                  {nodes.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => void select(node.id)}
                        aria-current={selected?.id === node.id ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 rounded-md py-2.5 pr-2 text-left txt-compact-small transition-fg hover:bg-ui-bg-base-hover focus-visible:shadow-borders-focus focus-visible:outline-none ${selected?.id === node.id ? 'bg-ui-bg-highlight' : ''}`}
                        style={{ paddingLeft: flat ? 8 : 8 + (node.depth - 1) * 20 }}
                      >
                        {!flat && node.childCount > 0 ? <ChevronRight className="text-ui-fg-muted" /> : <MapPin className="text-ui-fg-muted" />}
                        <span className="txt-compact-small-plus">{node.displayName}</span>
                        <span className="font-mono text-xs text-ui-fg-muted">{node.code}</span>
                        <span className="ml-auto flex items-center gap-2 text-xs text-ui-fg-muted">
                          {typeLabel(types, node)}
                          {node.status === 'INACTIVE' ? <Badge size="2xsmall" color="grey">Inactive</Badge> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {page && page.total > page.items.length ? (
                <Text size="xsmall" className="mt-3 text-ui-fg-muted">Showing {page.items.length} of {page.total}. Search to narrow the list.</Text>
              ) : null}
            </Container>

            <aside aria-label="Place details">
              <Container className="p-5">
                {selected ? (
                  <PlaceDetail key={`${selected.id}-${selected.version}`} node={selected} nodes={nodes} types={activeTypes} onChanged={refresh} />
                ) : (
                  <Text size="small" className="text-ui-fg-subtle">Select a place to see its details, change it or move it.</Text>
                )}
              </Container>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function typeLabel(types: readonly SpatialNodeTypeV1[], node: SpatialNodeV1): string {
  return types.find((type) => type.id === node.nodeTypeId)?.label ?? node.nodeTypeCode;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-ui-border-strong p-6 text-center">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">{body}</Text>
    </div>
  );
}

function ErrorPanel({ error, retry }: { error: GeospatialApiError; retry: () => void }) {
  const denied = error.status === 403;
  return (
    <Container className="p-7" role="alert">
      <ExclamationCircle className="text-ui-fg-error" />
      <Heading level="h2" className="mt-4">{denied ? 'Geospatial access is not enabled' : 'Places could not be loaded'}</Heading>
      <Text size="small" className="mt-2 text-ui-fg-subtle">{error.message}</Text>
      <Button type="button" variant="secondary" size="small" onClick={retry} className="mt-5">
        <ArrowPath /> Retry
      </Button>
    </Container>
  );
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">{label}</Label>
      {children}
    </div>
  );
}

function useSubmit<T>(action: (form: FormData) => Promise<T>, onDone: (result: T) => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onDone(await action(new FormData(event.currentTarget)));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, submit };
}

const text = (form: FormData, key: string) => {
  const value = String(form.get(key) ?? '').trim();
  return value ? value : undefined;
};
const numberOrUndefined = (form: FormData, key: string) => {
  const value = text(form, key);
  return value === undefined ? undefined : Number(value);
};

function CreateTypeForm({ onDone }: { onDone: () => void }) {
  const { saving, error, submit } = useSubmit(
    (form) => geospatialApi.createNodeType({ code: text(form, 'code') ?? '', label: text(form, 'label') ?? '' }),
    () => onDone(),
  );
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3">
      <Field id="type-code" label="Code"><Input id="type-code" required name="code" maxLength={64} placeholder="SITE" className="uppercase" /></Field>
      <Field id="type-label" label="Label" className="md:col-span-2"><Input id="type-label" required name="label" maxLength={120} placeholder="Site" /></Field>
      {error ? <Alert variant="error" role="alert" className="md:col-span-3">{error}</Alert> : null}
      <Button type="submit" isLoading={saving} className="md:col-span-3">Create place type</Button>
    </form>
  );
}

function CreatePlaceForm({ types, nodes, onDone }: { types: readonly SpatialNodeTypeV1[]; nodes: readonly SpatialNodeV1[]; onDone: (id: string) => void }) {
  const { saving, error, submit } = useSubmit(
    (form) =>
      geospatialApi.createNode({
        code: text(form, 'code') ?? '',
        displayName: text(form, 'displayName') ?? '',
        nodeTypeId: text(form, 'nodeTypeId') ?? '',
        parentId: text(form, 'parentId') ?? null,
        countryCode: text(form, 'countryCode')?.toUpperCase() ?? null,
        subdivisionCode: text(form, 'subdivisionCode')?.toUpperCase() ?? null,
        timeZone: text(form, 'timeZone') ?? null,
        latitude: numberOrUndefined(form, 'latitude') ?? null,
        longitude: numberOrUndefined(form, 'longitude') ?? null,
      }),
    (created) => onDone(created.id),
  );
  const parents = nodes.filter((node) => node.status === 'ACTIVE');
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3">
      <Field id="place-code" label="Code"><Input id="place-code" required name="code" maxLength={63} placeholder="BLR_01" /></Field>
      <Field id="place-name" label="Name" className="md:col-span-2"><Input id="place-name" required name="displayName" maxLength={200} placeholder="Bengaluru warehouse" /></Field>
      <Field id="place-type" label="Type">
        <select id="place-type" name="nodeTypeId" required className={selectClass}>{types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
      </Field>
      <Field id="place-parent" label="Inside" className="md:col-span-2">
        <select id="place-parent" name="parentId" className={selectClass}>
          <option value="">Top level</option>
          {parents.map((node) => <option key={node.id} value={node.id}>{node.path.replaceAll('.', ' › ')}</option>)}
        </select>
      </Field>
      <Field id="place-country" label="Country (ISO)"><Input id="place-country" name="countryCode" maxLength={2} placeholder="IN" className="uppercase" /></Field>
      <Field id="place-subdivision" label="Subdivision"><Input id="place-subdivision" name="subdivisionCode" maxLength={6} placeholder="IN-KA" className="uppercase" /></Field>
      <Field id="place-timezone" label="Time zone"><Input id="place-timezone" name="timeZone" maxLength={64} placeholder="Asia/Kolkata" /></Field>
      <Field id="place-lat" label="Latitude"><Input id="place-lat" name="latitude" type="number" step="0.000001" min={-90} max={90} /></Field>
      <Field id="place-lng" label="Longitude"><Input id="place-lng" name="longitude" type="number" step="0.000001" min={-180} max={180} /></Field>
      {error ? <Alert variant="error" role="alert" className="md:col-span-3">{error}</Alert> : null}
      <Button type="submit" isLoading={saving} className="md:col-span-3">Create persisted place</Button>
    </form>
  );
}

const MAX_LISTED_IMPORT_ERRORS = 100;

function ImportPlacesPanel({ onCancel, onImported }: { onCancel: () => void; onImported: (created: number) => void }) {
  const [file, setFile] = useState<(PlaceImportFile & { name: string }) | null>(null);
  const [result, setResult] = useState<SpatialNodeImportResultV1 | null>(null);
  const [busy, setBusy] = useState<'validate' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setResult(null);
    setError(null);
    if (!chosen) return setFile(null);
    const parsed = { ...placeRowsFromCsv(await chosen.text()), name: chosen.name };
    setFile(parsed);
    if (parsed.rows.length === 0 || parsed.rows.length > MAX_SPATIAL_IMPORT_ROWS || parsed.problems.some((problem) => problem.startsWith('Add the required'))) return;
    setBusy('validate');
    try {
      setResult(await geospatialApi.importNodes({ mode: 'VALIDATE', rows: parsed.rows }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy('commit');
    setError(null);
    try {
      const committed = await geospatialApi.importNodes({ mode: 'COMMIT', rows: file.rows });
      onImported(committed.created);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`${PLACE_IMPORT_TEMPLATE}\n`], { type: 'text/csv' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'places-template.csv' });
    link.click();
    URL.revokeObjectURL(url);
  }

  const lineOf = (row: number) => file?.lines[row - 1] ?? row + 1;
  return (
    <div className="mt-5 space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label="Import places">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <Heading level="h3">Import places from a CSV file</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Required columns: code, name, type. Optional: parent_path, country, subdivision, time_zone, latitude,
            longitude. A parent can be an existing place or one earlier in the file. Up to{' '}
            {MAX_SPATIAL_IMPORT_ROWS.toLocaleString()} places per file; nothing is saved unless every row is valid.
          </Text>
        </div>
        <Button type="button" variant="secondary" size="small" onClick={downloadTemplate}><ArrowDownTray /> Template</Button>
      </div>
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor="place-import-file" size="xsmall" weight="plus">CSV file</Label>
        <input
          id="place-import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void choose(event)}
          className="txt-compact-small text-ui-fg-subtle file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-ui-button-neutral file:px-3 file:py-1.5 file:txt-compact-small-plus file:text-ui-fg-base file:shadow-buttons-neutral"
        />
      </div>
      {file?.problems.map((problem) => (
        <Alert key={problem} variant={problem.startsWith('Ignored') ? 'warning' : 'error'}>{problem}</Alert>
      ))}
      {busy === 'validate' ? <Text size="small" className="flex items-center gap-2 text-ui-fg-subtle"><Spinner className="animate-spin" /> Checking {file?.rows.length} rows…</Text> : null}
      {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
      {result && !result.valid ? (
        <div className="space-y-2">
          <Alert variant="error">
            {result.errors.length} {result.errors.length === 1 ? 'problem' : 'problems'} in {file?.name}. Fix the file and choose it again.
          </Alert>
          <div className="max-h-72 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Line</Table.HeaderCell>
                  <Table.HeaderCell>Column</Table.HeaderCell>
                  <Table.HeaderCell>Problem</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {result.errors.slice(0, MAX_LISTED_IMPORT_ERRORS).map((problem, index) => (
                  <Table.Row key={`${problem.row}-${index}`}>
                    <Table.Cell className="tabular-nums">{lineOf(problem.row)}</Table.Cell>
                    <Table.Cell className="font-mono text-xs">{problem.field ?? '—'}</Table.Cell>
                    <Table.Cell>{problem.message}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          {result.errors.length > MAX_LISTED_IMPORT_ERRORS ? (
            <Text size="xsmall" className="text-ui-fg-muted">Showing the first {MAX_LISTED_IMPORT_ERRORS} problems.</Text>
          ) : null}
        </div>
      ) : null}
      {result?.valid ? <Alert variant="success">All {result.rowCount} rows in {file?.name} are valid and ready to import.</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="small" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="small" disabled={!result?.valid} isLoading={busy === 'commit'} onClick={() => void commit()}>
          Import {result?.valid ? result.rowCount : ''} {result?.rowCount === 1 ? 'place' : 'places'}
        </Button>
      </div>
    </div>
  );
}

function PlaceDetail({ node, nodes, types, onChanged }: { node: SpatialNodeDetailV1; nodes: readonly SpatialNodeV1[]; types: readonly SpatialNodeTypeV1[]; onChanged: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await action();
      setMessage(done);
      await onChanged();
    } catch (reason) {
      setMessage((reason as Error).message);
    }
  };
  const moveTargets = useMemo(
    () => nodes.filter((candidate) => candidate.status === 'ACTIVE' && candidate.id !== node.id && !candidate.path.startsWith(`${node.path}.`)),
    [node, nodes],
  );
  return (
    <div className="space-y-5 txt-compact-small">
      <div>
        <nav aria-label="Place path" className="flex flex-wrap items-center gap-1 text-xs text-ui-fg-muted">
          {node.ancestors.map((ancestor) => <span key={ancestor.id}>{ancestor.displayName} ›</span>)}
        </nav>
        <div className="mt-1 flex items-center justify-between gap-3">
          <Heading level="h2">{node.displayName}</Heading>
          <Badge size="2xsmall" color={node.status === 'ACTIVE' ? 'green' : 'grey'}>{node.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
        </div>
        <p className="font-mono text-xs text-ui-fg-muted">{node.path}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-ui-fg-muted">Type</dt><dd>{types.find((type) => type.id === node.nodeTypeId)?.label ?? node.nodeTypeCode}</dd>
        <dt className="text-ui-fg-muted">Country</dt><dd>{node.countryCode ?? '—'}</dd>
        <dt className="text-ui-fg-muted">Subdivision</dt><dd>{node.subdivisionCode ?? '—'}</dd>
        <dt className="text-ui-fg-muted">Time zone</dt><dd>{node.timeZone ?? '—'}</dd>
        <dt className="text-ui-fg-muted">Coordinates</dt><dd>{node.latitude === null ? '—' : `${node.latitude}, ${node.longitude}`}</dd>
        <dt className="text-ui-fg-muted">Places inside</dt><dd>{node.childCount}</dd>
        <dt className="text-ui-fg-muted">Version</dt><dd>{node.version}</dd>
      </dl>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const displayName = String(new FormData(event.currentTarget).get('displayName') ?? '').trim();
          void run(() => geospatialApi.updateNode(node.id, { expectedVersion: node.version, displayName }), 'Name saved.');
        }}
      >
        <div className="flex-1"><Input id="detail-name" aria-label="Name" name="displayName" defaultValue={node.displayName} required maxLength={200} /></div>
        <Button type="submit" variant="secondary" size="small">Rename</Button>
      </form>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const target = String(new FormData(event.currentTarget).get('newParentId') ?? '');
          void run(() => geospatialApi.moveNode(node.id, { expectedVersion: node.version, newParentId: target || null }), 'Place moved.');
        }}
      >
        <div className="flex-1">
          <select id="detail-move" aria-label="Move to" name="newParentId" defaultValue={node.parentId ?? ''} className={selectClass}>
            <option value="">Top level</option>
            {moveTargets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.path.replaceAll('.', ' › ')}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary" size="small">Move</Button>
      </form>

      <Button
        type="button"
        variant="secondary"
        size="small"
        onClick={() => void run(
          () => geospatialApi.updateNode(node.id, { expectedVersion: node.version, status: node.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
          node.status === 'ACTIVE' ? 'Place deactivated.' : 'Place reactivated.',
        )}
      >
        {node.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
      </Button>
      {message ? <Text size="small" role="status" className="text-ui-fg-subtle">{message}</Text> : null}
    </div>
  );
}
