'use client';

import {
  type AssetDiagramDetailV1,
  type AssetDiagramV1,
  type CmmsAssetV1,
  type CmmsPartV1,
  type PartAvailabilityV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, type MouseEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import { sparesApi } from '../spares-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, selectClass } from './CmmsShared';

// WI-OI-136 M-BOM. Hotspots are coloured by live CMMS stock (available = on hand − open reservations); reservations
// and publication go through CMMS, which enforces stock, scope and four eyes.

const stateColor = { IN_STOCK: 'green', LOW: 'orange', OUT: 'red', NON_STOCK: 'grey' } as const;
const stateLabel = { IN_STOCK: 'In stock', LOW: 'Low', OUT: 'Out of stock', NON_STOCK: 'Non-stock' } as const;
const hotspotClass = {
  IN_STOCK: 'border-ui-tag-green-border bg-ui-tag-green-bg',
  LOW: 'border-ui-tag-orange-border bg-ui-tag-orange-bg',
  OUT: 'border-ui-tag-red-border bg-ui-tag-red-bg',
  NON_STOCK: 'border-ui-tag-neutral-border bg-ui-tag-neutral-bg',
} as const;

interface DraftHotspot { callout: string; partId: string; quantity: number; x: number; y: number }

function readImage(file: File): Promise<{ base64: string; contentType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const url = String(reader.result);
      const image = new Image();
      image.onload = () => resolve({ base64: url.slice(url.indexOf(',') + 1), contentType: file.type, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('The file is not an image.'));
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}

export function CmmsSpares({ permissions = [] }: { permissions?: readonly string[] }) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[] | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [filter, setFilter] = useState('');
  const [asset, setAsset] = useState<CmmsAssetV1 | null>(null);
  const load = useCallback(() => {
    setError(null);
    cmmsApi.searchAssets({ pageSize: 100, ...(filter.trim() ? { q: filter.trim() } : {}) })
      .then((page) => setAssets(page.items), (failure: CmmsApiError) => setError(failure));
  }, [filter]);
  useEffect(load, [load]);
  if (asset) return <AssetDiagrams asset={asset} can={can} onBack={() => setAsset(null)} />;
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Visual spares</Heading>
          <Text size="small" className="text-ui-fg-subtle">Choose an asset to open its exploded diagrams and live spare-part stock.</Text>
        </div>
        <Field id="spares-filter" label="Find asset" className="w-64">
          <Input id="spares-filter" size="small" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </Field>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
      {!error && !assets ? <LoadingState label="Loading assets…" /> : null}
      {assets && assets.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No assets" text="Nothing matches." /></div> : null}
      {assets && assets.length > 0 ? (
        <Table>
          <Table.Body>
            {assets.map((item) => (
              <Table.Row key={item.id}>
                <Table.Cell>{item.assetTag}</Table.Cell>
                <Table.Cell>{item.name}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button type="button" size="small" variant="secondary" onClick={() => setAsset(item)}>Open diagrams</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function AssetDiagrams({ asset, can, onBack }: { asset: CmmsAssetV1; can: (permission: string) => boolean; onBack: () => void }) {
  const [diagrams, setDiagrams] = useState<readonly AssetDiagramV1[] | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError(null);
    sparesApi.diagrams(asset.id).then((page) => setDiagrams(page.items), (failure: CmmsApiError) => setError(failure));
  }, [asset.id]);
  useEffect(load, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const image = await readImage(file);
      const created = await sparesApi.createDiagram(asset.id, {
        diagramCode: String(form.get('diagramCode')), title: String(form.get('title')), imageContentType: image.contentType,
        imageBase64: image.base64, widthPx: image.width, heightPx: image.height,
      });
      load();
      setOpen(created.id);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  if (open) return <DiagramView diagramId={open} asset={asset} can={can} onBack={() => { setOpen(null); load(); }} onOpen={setOpen} />;
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex justify-between gap-3">
        <Heading level="h2">{asset.assetTag} · {asset.name}</Heading>
        <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
      </div>
      {error ? <ErrorState error={error} retry={load} /> : null}
      {!error && !diagrams ? <LoadingState label="Loading diagrams…" /> : null}
      {diagrams && diagrams.length === 0 ? <EmptyState title="No diagrams" text="Add an exploded drawing of this asset." /> : null}
      {diagrams?.map((diagram) => (
        <div key={diagram.id} className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base p-3">
          <Text size="small">{diagram.diagramCode} · {diagram.title} · r{diagram.revision}</Text>
          <div className="flex items-center gap-2">
            <StatusBadge color={diagram.status === 'PUBLISHED' ? 'green' : 'orange'}>{diagram.status}</StatusBadge>
            <Button type="button" size="small" variant="secondary" onClick={() => setOpen(diagram.id)}>Open</Button>
          </div>
        </div>
      ))}
      {can('cmms.bom.manage') ? (
        <form onSubmit={create} className="grid grid-cols-1 gap-3 rounded-lg border border-ui-border-base p-4 md:grid-cols-4">
          <Field id="diagram-code" label="Diagram code"><Input id="diagram-code" name="diagramCode" size="small" required /></Field>
          <Field id="diagram-title" label="Title"><Input id="diagram-title" name="title" size="small" required /></Field>
          <Field id="diagram-image" label="Drawing (PNG, JPEG or WebP, up to 700 KB)">
            <input id="diagram-image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required className="txt-compact-small" />
          </Field>
          <div className="flex items-end"><Button type="submit" size="small" isLoading={busy} disabled={busy}>Add draft diagram</Button></div>
        </form>
      ) : null}
      <ActionError error={actionError} />
    </Container>
  );
}

function DiagramView({ diagramId, asset, can, onBack, onOpen }: {
  diagramId: string; asset: CmmsAssetV1; can: (permission: string) => boolean; onBack: () => void; onOpen: (id: string) => void;
}) {
  const [detail, setDetail] = useState<AssetDiagramDetailV1 | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [issued, setIssued] = useState<Record<string, number>>({});
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftHotspot[] | null>(null);
  const [parts, setParts] = useState<readonly CmmsPartV1[]>([]);
  const load = useCallback(() => {
    setError(null);
    sparesApi.detail(diagramId).then(setDetail, (failure: CmmsApiError) => setError(failure));
    sparesApi.image(diagramId).then((image) => setImageUrl(`data:${image.contentType};base64,${image.base64}`), () => setImageUrl(null));
    sparesApi.consumption(diagramId).then((value) => setIssued(Object.fromEntries(value.callouts.map((item) => [item.callout, item.issuedQuantity]))), () => setIssued({}));
  }, [diagramId]);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!detail) return <LoadingState label="Loading the diagram…" />;
  const editable = detail.diagram.status === 'DRAFT' && can('cmms.bom.manage');
  const chosen = detail.hotspots.find((hotspot) => hotspot.callout === selected) ?? null;

  async function startEditing() {
    setDraft(detail!.hotspots.map((hotspot) => ({ callout: hotspot.callout, partId: hotspot.partId, quantity: hotspot.quantity, x: hotspot.x, y: hotspot.y })));
    try {
      setParts((await cmmsApi.searchParts({ pageSize: 100 })).items);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  function place(event: MouseEvent<HTMLDivElement>) {
    if (!draft || parts.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    const next = String(draft.reduce((max, item) => Math.max(max, Number(item.callout) || 0), 0) + 1);
    setDraft([...draft, { callout: next, partId: parts[0]!.id, quantity: 1, x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 }]);
  }
  async function saveHotspots() {
    if (!draft || !detail) return;
    setActionError(null);
    try {
      setDetail(await sparesApi.replaceHotspots(diagramId, { expectedVersion: detail.diagram.version, hotspots: draft }));
      setDraft(null);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  async function lifecycle(action: 'publish' | 'revise') {
    if (!detail) return;
    setActionError(null);
    try {
      if (action === 'publish') {
        await sparesApi.publish(diagramId, detail.diagram.version);
        load();
      } else onOpen((await sparesApi.revise(diagramId, detail.diagram.version)).id);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }

  const shown = draft ?? detail.hotspots.map((hotspot) => ({ ...hotspot }));
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{detail.diagram.title} · r{detail.diagram.revision}</Heading>
          <Text size="small" className="text-ui-fg-subtle">{asset.assetTag} · {detail.diagram.status}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && !draft ? <Button type="button" size="small" variant="secondary" onClick={startEditing}>Edit hotspots</Button> : null}
          {draft ? <Button type="button" size="small" onClick={saveHotspots}>Save hotspots</Button> : null}
          {draft ? <Button type="button" size="small" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button> : null}
          {detail.diagram.status === 'DRAFT' && can('cmms.bom.publish') && !draft ? <Button type="button" size="small" onClick={() => lifecycle('publish')}>Publish</Button> : null}
          {detail.diagram.status === 'PUBLISHED' && can('cmms.bom.manage') ? <Button type="button" size="small" variant="secondary" onClick={() => lifecycle('revise')}>New revision</Button> : null}
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      {draft ? <Text size="small">Click the drawing to add a hotspot, then choose its part below.</Text> : null}
      <div className="relative w-full max-w-4xl overflow-hidden rounded-lg border border-ui-border-base" onClick={draft ? place : undefined}
        role={draft ? 'application' : undefined} aria-label={draft ? 'Diagram: click to place a hotspot' : undefined}>
        {imageUrl ? <img src={imageUrl} alt={detail.diagram.title} className="block w-full" /> : <LoadingState label="Loading the drawing…" />}
        {shown.map((hotspot) => {
          const live = detail.hotspots.find((item) => item.callout === hotspot.callout && item.partId === hotspot.partId)?.availability;
          return (
            <button key={hotspot.callout} type="button" aria-label={`Callout ${hotspot.callout}`}
              onClick={(event) => { event.stopPropagation(); setSelected(hotspot.callout); }}
              className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 txt-compact-xsmall-plus ${hotspotClass[live?.stockState ?? 'NON_STOCK']}`}
              style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}>
              {hotspot.callout}
            </button>
          );
        })}
      </div>
      {draft ? (
        <Table>
          <Table.Body>
            {draft.map((hotspot, index) => (
              <Table.Row key={hotspot.callout}>
                <Table.Cell>#{hotspot.callout}</Table.Cell>
                <Table.Cell>
                  <select aria-label={`Part for callout ${hotspot.callout}`} className={selectClass} value={hotspot.partId}
                    onChange={(event) => setDraft(draft.map((item, position) => position === index ? { ...item, partId: event.target.value } : item))}>
                    {parts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.name}</option>)}
                  </select>
                </Table.Cell>
                <Table.Cell>
                  <Input aria-label={`Quantity for callout ${hotspot.callout}`} size="small" type="number" min={0.001} step="any" value={hotspot.quantity}
                    onChange={(event) => setDraft(draft.map((item, position) => position === index ? { ...item, quantity: Number(event.target.value) } : item))} />
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button type="button" size="small" variant="secondary" onClick={() => setDraft(draft.filter((_, position) => position !== index))}>Remove</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
      {chosen && !draft ? (
        <PartPanel callout={chosen.callout} availability={chosen.availability} issued={issued[chosen.callout] ?? 0}
          assetId={asset.id} diagramId={diagramId} canReserve={can('cmms.parts.reserve')} onReserved={load} />
      ) : null}
      <ActionError error={actionError} onReload={load} />
    </Container>
  );
}

function PartPanel({ callout, availability, issued, assetId, diagramId, canReserve, onReserved }: {
  callout: string; availability: PartAvailabilityV1; issued: number; assetId: string; diagramId: string; canReserve: boolean; onReserved: () => void;
}) {
  const [workOrders, setWorkOrders] = useState<readonly { id: string; woNumber: string; title: string }[]>([]);
  const [workOrderId, setWorkOrderId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  useEffect(() => {
    if (!canReserve) return;
    sparesApi.openWorkOrders(assetId).then((page) => {
      setWorkOrders(page.items);
      setWorkOrderId(page.items[0]?.id ?? '');
    }, (failure: CmmsApiError) => setActionError(failure));
  }, [assetId, canReserve]);
  async function reserve() {
    setActionError(null);
    try {
      const result = await sparesApi.reserve({ clientOperationId: operationId, partId: availability.partId, workOrderId, quantity, diagramId });
      setMessage(`Reserved ${quantity} to ${result.reservation.woNumber}.${result.lowStock ? ' Stock is now low; procurement is alerted.' : ''}`);
      setOperationId(crypto.randomUUID());
      onReserved();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-4">
      <Text size="small" weight="plus">#{callout} · {availability.partNumber} · {availability.name}</Text>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge color={stateColor[availability.stockState]}>{stateLabel[availability.stockState]}</StatusBadge>
        <Text size="small">On hand {availability.onHand} · reserved {availability.reserved} · available {availability.available} {availability.unitOfMeasure}</Text>
      </div>
      {availability.bins.map((bin) => <Text key={`${bin.storeroomId}-${bin.binLocation}`} size="small">{bin.storeroomName} · bin {bin.binLocation} · {bin.onHand}</Text>)}
      <Text size="xsmall" className="text-ui-fg-subtle">
        Issued to this asset in the last 12 months: {issued} · stock as of {new Date(availability.asOf).toLocaleTimeString()}
      </Text>
      {canReserve ? (
        workOrders.length === 0 ? <Text size="small">This asset has no open work order to reserve against.</Text> : (
          <div className="flex flex-wrap items-end gap-2">
            <Field id={`reserve-wo-${callout}`} label="Work order" className="w-64">
              <select id={`reserve-wo-${callout}`} className={selectClass} value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)}>
                {workOrders.map((workOrder) => <option key={workOrder.id} value={workOrder.id}>{workOrder.woNumber} · {workOrder.title}</option>)}
              </select>
            </Field>
            <Field id={`reserve-qty-${callout}`} label="Quantity" className="w-28">
              <Input id={`reserve-qty-${callout}`} size="small" type="number" min={0.001} step="any" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </Field>
            <Button type="button" size="small" disabled={!workOrderId || !(quantity > 0)} onClick={reserve}>Reserve</Button>
          </div>
        )
      ) : null}
      {message ? <Text size="small">{message}</Text> : null}
      <ActionError error={actionError} />
    </div>
  );
}
