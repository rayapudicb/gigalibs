'use client';

/**
 * WI-OI-104e (ADR-0016 F8): pulled data becomes a dataset without code. A source (records Connector Hub sends, a
 * Postgres table, the Demo Lab) is discovered, its fields are mapped (names, types, unit conversions), the mapping is
 * published and built into a dataset, and the dataset gets a model so Explore, charts and dashboards can use it. A
 * rebuild can run on a schedule; each rebuild refreshes the model and its charts' summaries. Analytics validates
 * everything and checks each right (connectors, mappings, models).
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { ANALYTICS_UNITS, type AnalyticsModelSummaryV1, type AnalyticsUnit } from '@gigalibs/contracts';
import { SchedulePanel } from '@/components/schedules/SchedulePanel';
import {
  type AnalyticalType,
  type DiscoveredField,
  type DraftField,
  type FieldMappingEntry,
  NO_PLACE,
  NO_UNIT,
  type PlaceDraft,
  type UnitDraft,
  defaultMeasures,
  draftFromDiscovery,
  fieldMappingsFromDraft,
  placeDraftFromDiscovery,
} from '@/lib/analytics/mapping-draft';
import { analyticsApi } from '../explore/analytics-api';

const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';
const TYPES: AnalyticalType[] = ['string', 'number', 'date', 'timestamp', 'boolean'];
const SOURCE_KIND: Record<string, string> = { CONNECTOR_HUB: 'Connector Hub', POSTGRES: 'Postgres', SYNTHETIC: 'Demo Lab' };

interface Source {
  id: string;
  displayName: string;
  sourceType: string;
  status: string;
}

interface Mapping {
  id: string;
  connectionId: string;
  displayName: string;
  sourceTableName: string;
  lifecycle: string;
  latestVersionNumber: number | null;
  latestFieldMappings?: FieldMappingEntry[];
}

interface DatasetVersion {
  id: string;
  versionNumber: number;
  buildStatus: 'BUILDING' | 'READY' | 'FAILED';
  recordCount: number;
  /** WI-OI-105c: records a build tagged with no place; absent for datasets without places. */
  unplacedCount?: number;
  buildError: string | null;
  completedAt: string | null;
}

export function SourcesWorkbench({ canMap, canModel }: { canMap: boolean; canModel: boolean }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [models, setModels] = useState<AnalyticsModelSummaryV1[]>([]);
  const [versions, setVersions] = useState<Record<string, DatasetVersion[]>>({});
  const [mappingSource, setMappingSource] = useState<Source | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [mappingList, modelList] = await Promise.all([
      analyticsApi<Mapping[]>('v1/mappings').catch(() => [] as Mapping[]),
      analyticsApi<AnalyticsModelSummaryV1[]>('v1/semantic-models').catch(() => [] as AnalyticsModelSummaryV1[]),
    ]);
    setMappings(mappingList);
    setModels(modelList);
    const entries = await Promise.all(
      mappingList.map(async (mapping) => [mapping.id, await analyticsApi<DatasetVersion[]>(`v1/datasets/by-mapping/${mapping.id}`).catch(() => [])] as const),
    );
    setVersions(Object.fromEntries(entries));
    if (canMap) {
      analyticsApi<Source[]>('v1/sources')
        .then(setSources)
        .catch((cause: Error) => {
          setSources([]);
          setError(cause.message);
        });
    } else {
      setSources([]);
    }
  }, [canMap]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const build = (mapping: Mapping) =>
    run(`build-${mapping.id}`, async () => {
      const built = await analyticsApi<DatasetVersion & { refreshedModelIds?: string[] }>('v1/datasets/build', {
        method: 'POST',
        body: JSON.stringify({ mappingId: mapping.id }),
      });
      if (built.buildStatus !== 'READY') throw new Error(`The build ended ${built.buildStatus.toLowerCase()}: ${built.buildError ?? 'no detail'}.`);
      const refreshed = built.refreshedModelIds?.length ?? 0;
      const unplaced = built.unplacedCount ? ` ${built.unplacedCount.toLocaleString()} are in no known place (“Unplaced”).` : '';
      return `Dataset version ${built.versionNumber} built: ${built.recordCount.toLocaleString()} records.${unplaced}${refreshed ? ` ${refreshed} model(s) now show it.` : ''}`;
    });

  const makeExplorable = (mapping: Mapping, version: DatasetVersion) =>
    run(`model-${mapping.id}`, async () => {
      const fields = mapping.latestFieldMappings ?? [];
      if (fields.length === 0) throw new Error('This mapping has no published fields.');
      await analyticsApi('v1/semantic-models', {
        method: 'POST',
        body: JSON.stringify({ datasetVersionId: version.id, displayName: mapping.displayName, measures: defaultMeasures(fields) }),
      });
      return `"${mapping.displayName}" is ready in Explore, with a total of each number field and a record count.`;
    });

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Container className="flex flex-col gap-3 p-5">
        <Heading level="h2">Sources</Heading>
        {!canMap ? (
          <Text size="small" className="text-ui-fg-subtle">Mapping sources needs the Analytics data steward role.</Text>
        ) : sources === null ? (
          <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
        ) : sources.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No sources yet. In Connections, set up a pull source and turn on “Send pulled records to Analytics”; its records appear here after the next pull.
          </Text>
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((source) => (
              <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base px-3 py-2">
                <div className="flex items-center gap-2">
                  <Text size="small" weight="plus">{source.displayName}</Text>
                  <Badge size="2xsmall" color="grey">{SOURCE_KIND[source.sourceType] ?? source.sourceType}</Badge>
                </div>
                {canMap ? (
                  <Button type="button" size="small" variant="secondary" onClick={() => setMappingSource(mappingSource?.id === source.id ? null : source)}>
                    {mappingSource?.id === source.id ? 'Close' : 'Map fields'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {mappingSource ? (
          <MappingEditor
            source={mappingSource}
            onDone={async (message) => {
              setMappingSource(null);
              setNotice(message);
              await refresh();
            }}
          />
        ) : null}
      </Container>

      <Container className="flex flex-col gap-3 p-5">
        <Heading level="h2">Datasets</Heading>
        {mappings.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">No mappings yet. Map a source’s fields above to make its first dataset.</Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Mapping</Table.HeaderCell>
                  <Table.HeaderCell>Latest dataset</Table.HeaderCell>
                  <Table.HeaderCell>Explore</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {mappings.map((mapping) => {
                  const list = versions[mapping.id] ?? [];
                  const latest = [...list].sort((a, b) => b.versionNumber - a.versionNumber)[0];
                  const ready = list.filter((version) => version.buildStatus === 'READY').sort((a, b) => b.versionNumber - a.versionNumber)[0];
                  const model = models.find((candidate) => list.some((version) => version.id === candidate.datasetVersionId));
                  return (
                    <Fragment key={mapping.id}>
                      <Table.Row>
                        <Table.Cell>
                          <Text size="small">{mapping.displayName}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">{`${mapping.lifecycle.toLowerCase()} · version ${mapping.latestVersionNumber ?? '–'} · ${mapping.latestFieldMappings?.length ?? 0} fields`}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          {latest ? (
                            <div className="flex flex-col gap-1">
                              <Badge size="2xsmall" color={latest.buildStatus === 'READY' ? 'green' : latest.buildStatus === 'FAILED' ? 'red' : 'orange'}>
                                {`v${latest.versionNumber} ${latest.buildStatus.toLowerCase()}`}
                              </Badge>
                              <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">
                                {`${latest.recordCount.toLocaleString()} records${latest.unplacedCount !== undefined ? ` · ${latest.unplacedCount.toLocaleString()} unplaced` : ''}${latest.completedAt ? ` · ${new Date(latest.completedAt).toLocaleString()}` : ''}`}
                              </Text>
                              {latest.buildError ? <Text size="xsmall" className="text-ui-fg-error">{latest.buildError}</Text> : null}
                            </div>
                          ) : (
                            <Text size="xsmall" className="text-ui-fg-subtle">Not built yet</Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {model ? (
                            <Text size="xsmall">{`Model “${model.displayName}”`}</Text>
                          ) : ready && canModel ? (
                            <Button type="button" size="small" variant="secondary" isLoading={busy === `model-${mapping.id}`} disabled={busy !== null} onClick={() => void makeExplorable(mapping, ready)}>
                              Make explorable
                            </Button>
                          ) : (
                            <Text size="xsmall" className="text-ui-fg-subtle">{ready ? 'Needs the models right' : 'Build a dataset first'}</Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex justify-end gap-2">
                            {canMap && mapping.lifecycle === 'PUBLISHED' ? (
                              <>
                                <Button type="button" size="small" variant="transparent" onClick={() => setScheduling(scheduling === mapping.id ? null : mapping.id)}>
                                  Schedule
                                </Button>
                                <Button type="button" size="small" variant="secondary" isLoading={busy === `build-${mapping.id}`} disabled={busy !== null} onClick={() => void build(mapping)}>
                                  Build now
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </Table.Cell>
                      </Table.Row>
                      {scheduling === mapping.id ? (
                        <Table.Row>
                          <td colSpan={4} className="bg-ui-bg-subtle px-6 py-3">
                            <Text size="xsmall" className="mb-2 block text-ui-fg-subtle">
                              A scheduled rebuild reads every record received so far, moves the model to the new data, and then rebuilds its charts’ summaries.
                            </Text>
                            <SchedulePanel operation="analytics.dataset-build" targetId={mapping.id} targetName={mapping.displayName} />
                          </td>
                        </Table.Row>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </div>
  );
}

/** WI-OI-105c: tag each record with the smallest known place holding its point, or the place its code names. */
function PlaceChoice({ draft, place, onChange }: { draft: readonly DraftField[]; place: PlaceDraft; onChange: (place: PlaceDraft) => void }) {
  const set = (change: Partial<PlaceDraft>) => onChange({ ...place, ...change });
  const fieldOptions = draft.map((field) => <option key={field.sourceField} value={field.sourceField}>{field.sourceField}</option>);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-3">
      <Text size="small" weight="plus">Place of each record</Text>
      <Text size="xsmall" className="text-ui-fg-subtle">
        Records are matched to places from Geospatial. Members with a place scope see only records in their places; records in no known place show as “Unplaced”.
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Place of each record" className={selectClass} value={place.mode} onChange={(event) => set({ mode: event.target.value as PlaceDraft['mode'] })}>
          <option value="none">No place</option>
          <option value="point">From latitude and longitude</option>
          <option value="code">From a place code or id</option>
        </select>
        {place.mode === 'point' ? (
          <>
            <select aria-label="Latitude field" className={selectClass} value={place.latitudeField} onChange={(event) => set({ latitudeField: event.target.value })}>
              <option value="">Latitude field…</option>
              {fieldOptions}
            </select>
            <select aria-label="Longitude field" className={selectClass} value={place.longitudeField} onChange={(event) => set({ longitudeField: event.target.value })}>
              <option value="">Longitude field…</option>
              {fieldOptions}
            </select>
          </>
        ) : null}
        {place.mode === 'code' ? (
          <select aria-label="Place code field" className={selectClass} value={place.codeField} onChange={(event) => set({ codeField: event.target.value })}>
            <option value="">Field with the place code or id…</option>
            {fieldOptions}
          </select>
        ) : null}
        {place.mode !== 'none' ? (
          <Input aria-label="Name of the place field" size="small" className="w-40" value={place.fieldName} onChange={(event) => set({ fieldName: event.target.value })} />
        ) : null}
      </div>
    </div>
  );
}

/** WI-OI-109e3: the field naming each record's organization unit; members then see their units' records and shared ones. */
function UnitChoice({ draft, unit, onChange }: { draft: readonly DraftField[]; unit: UnitDraft; onChange: (unit: UnitDraft) => void }) {
  const set = (change: Partial<UnitDraft>) => onChange({ ...unit, ...change });
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-3">
      <Text size="small" weight="plus">Unit of each record</Text>
      <Text size="xsmall" className="text-ui-fg-subtle">
        Records are matched to your organization’s units. Members see the records of the units they are granted and records with no unit; a unit that matches nothing is shown only to tenant-wide roles.
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Unit of each record" className={selectClass} value={unit.mode} onChange={(event) => set({ mode: event.target.value as UnitDraft['mode'] })}>
          <option value="none">No unit</option>
          <option value="code">From a unit code</option>
          <option value="id">From a unit id</option>
        </select>
        {unit.mode !== 'none' ? (
          <>
            <select aria-label="Unit field" className={selectClass} value={unit.sourceField} onChange={(event) => set({ sourceField: event.target.value })}>
              <option value="">Field naming the unit…</option>
              {draft.map((field) => <option key={field.sourceField} value={field.sourceField}>{field.sourceField}</option>)}
            </select>
            <Input aria-label="Name of the unit field" size="small" className="w-40" value={unit.fieldName} onChange={(event) => set({ fieldName: event.target.value })} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function MappingEditor({ source, onDone }: { source: Source; onDone: (message: string) => Promise<void> }) {
  const [table, setTable] = useState(source.sourceType === 'CONNECTOR_HUB' ? 'records' : '');
  const [draft, setDraft] = useState<DraftField[] | null>(null);
  const [place, setPlace] = useState<PlaceDraft>(NO_PLACE);
  const [unit, setUnit] = useState<UnitDraft>(NO_UNIT);
  const [name, setName] = useState(source.displayName);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = (index: number, change: Partial<DraftField>) =>
    setDraft((current) => current?.map((field, at) => (at === index ? { ...field, ...change } : field)) ?? null);

  const discover = async () => {
    setBusy('discover');
    setError(null);
    try {
      const schema = await analyticsApi<{ fields: DiscoveredField[] }>(`v1/connectors/${source.id}/discover?table=${encodeURIComponent(table.trim())}`, { method: 'POST' });
      if (schema.fields.length === 0) throw new Error('No records to discover yet. Pull the source first.');
      setDraft(draftFromDiscovery(schema.fields));
      setPlace(placeDraftFromDiscovery(schema.fields));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const { fieldMappings, error: problem } = fieldMappingsFromDraft(draft ?? [], place, unit);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy('publish');
    setError(null);
    try {
      const mapping = await analyticsApi<{ id: string }>('v1/mappings', {
        method: 'POST',
        body: JSON.stringify({ connectionId: source.id, displayName: name.trim() || source.displayName, sourceTableName: table.trim(), fieldMappings }),
      });
      await analyticsApi(`v1/mappings/${mapping.id}/publish`, { method: 'POST', body: JSON.stringify({ fieldMappings }) });
      await onDone(`Mapping “${name.trim() || source.displayName}” published with ${fieldMappings.length} fields. Build its dataset below.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unitOptions = (Object.keys(ANALYTICS_UNITS) as AnalyticsUnit[]).map((unit) => (
    <option key={unit} value={unit}>{ANALYTICS_UNITS[unit].label}</option>
  ));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-ui-border-base p-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mapping-table" size="xsmall">Table</Label>
          <Input id="mapping-table" size="small" value={table} disabled={source.sourceType === 'CONNECTOR_HUB'} onChange={(event) => setTable(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mapping-name" size="xsmall">Dataset name</Label>
          <Input id="mapping-name" size="small" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </div>
        <Button type="button" size="small" variant="secondary" isLoading={busy === 'discover'} disabled={busy !== null || !table.trim()} onClick={() => void discover()}>
          Discover fields
        </Button>
      </div>
      {draft ? (
        <>
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Use</Table.HeaderCell>
                  <Table.HeaderCell>Source field</Table.HeaderCell>
                  <Table.HeaderCell>Dataset field</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Unit conversion</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {draft.map((field, index) => (
                  <Table.Row key={field.sourceField}>
                    <Table.Cell>
                      <input type="checkbox" aria-label={`Use ${field.sourceField}`} checked={field.include} onChange={(event) => update(index, { include: event.target.checked })} />
                    </Table.Cell>
                    <Table.Cell><Text size="xsmall" className="font-mono">{field.sourceField}</Text></Table.Cell>
                    <Table.Cell>
                      <Input aria-label={`Dataset name for ${field.sourceField}`} size="small" value={field.analyticalField} disabled={!field.include} onChange={(event) => update(index, { analyticalField: event.target.value })} />
                    </Table.Cell>
                    <Table.Cell>
                      <select aria-label={`Type of ${field.sourceField}`} className={selectClass} value={field.analyticalType} disabled={!field.include} onChange={(event) => update(index, { analyticalType: event.target.value as AnalyticalType, ...(event.target.value !== 'number' ? { unitMode: 'none' as const } : {}) })}>
                        {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </Table.Cell>
                    <Table.Cell>
                      {field.include && field.analyticalType === 'number' ? (
                        <div className="flex min-w-[16rem] flex-wrap gap-1">
                          <select aria-label={`Unit conversion of ${field.sourceField}`} className={selectClass} value={field.unitMode} onChange={(event) => update(index, { unitMode: event.target.value as DraftField['unitMode'] })}>
                            <option value="none">No conversion</option>
                            <option value="field">Unit named in a field</option>
                            <option value="fixed">Always one unit</option>
                          </select>
                          {field.unitMode === 'field' ? (
                            <select aria-label={`Field naming the unit of ${field.sourceField}`} className={selectClass} value={field.unitFromField} onChange={(event) => update(index, { unitFromField: event.target.value })}>
                              <option value="">Field with the unit…</option>
                              {draft.filter((candidate) => candidate.sourceField !== field.sourceField).map((candidate) => (
                                <option key={candidate.sourceField} value={candidate.sourceField}>{candidate.sourceField}</option>
                              ))}
                            </select>
                          ) : null}
                          {field.unitMode === 'fixed' ? (
                            <select aria-label={`Unit ${field.sourceField} arrives in`} className={selectClass} value={field.unitFrom} onChange={(event) => update(index, { unitFrom: event.target.value as AnalyticsUnit })}>
                              <option value="">Arrives in…</option>
                              {unitOptions}
                            </select>
                          ) : null}
                          {field.unitMode !== 'none' ? (
                            <select aria-label={`Unit ${field.sourceField} is stored in`} className={selectClass} value={field.unitTo} onChange={(event) => update(index, { unitTo: event.target.value as AnalyticsUnit })}>
                              <option value="">Store as…</option>
                              {unitOptions}
                            </select>
                          ) : null}
                        </div>
                      ) : (
                        <Text size="xsmall" className="text-ui-fg-subtle">–</Text>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            A value whose unit is unknown or of another kind (for example a weight stored as an area) is left empty in the dataset, never guessed.
          </Text>
          <PlaceChoice draft={draft} place={place} onChange={setPlace} />
          <UnitChoice draft={draft} unit={unit} onChange={setUnit} />
          <div>
            <Button type="button" size="small" isLoading={busy === 'publish'} disabled={busy !== null} onClick={() => void publish()}>
              Save and publish mapping
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
