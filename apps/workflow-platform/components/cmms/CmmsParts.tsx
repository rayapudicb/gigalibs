'use client';

import { type CmmsApiError, cmmsApi } from '@/lib/cmms-api';
import type { CmmsPageV1, CmmsPartV1, CmmsStockMovementV1 } from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Button, Checkbox, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
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

const movementLabel = { RECEIPT: 'Receipt', ISSUE: 'Issued to work', RETURN: 'Returned', ADJUSTMENT: 'Adjustment' } as const;

export function CmmsParts() {
  const [page, setPage] = useState<CmmsPageV1<CmmsPartV1> | null>(null);
  const [query, setQuery] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selected, setSelected] = useState<CmmsPartV1 | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { sites, siteName } = useSites();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(await cmmsApi.searchParts({ pageSize: 100, lowStockOnly, ...(query.trim() ? { q: query.trim() } : {}) }));
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [query, lowStockOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !page) return <ErrorState error={error} retry={() => void load()} />;
  const parts = page?.items ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Parts</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">Stock changes only through the ledger: receipts, issues to work orders, returns and reasoned adjustments.</Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}><Plus /> Add part</Button>
        </div>
        {showCreate ? <PartForm sites={sites} onCreated={async (part) => { setShowCreate(false); setSelected(part); await load(); }} /> : null}
        <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="min-w-[220px] flex-1">
            <Input type="text" inputMode="search" enterKeyHint="search" aria-label="Search parts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or part number" />
          </div>
          <label className="flex items-center gap-2 txt-compact-small">
            <input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> At or below reorder point
          </label>
        </form>
        {loading ? <LoadingState /> : parts.length === 0 ? (
          <EmptyState title="No parts" text="Add the spare parts you stock; opening quantities are recorded as receipts in the ledger." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Part</Table.HeaderCell>
                  <Table.HeaderCell>On hand</Table.HeaderCell>
                  <Table.HeaderCell>Reorder at</Table.HeaderCell>
                  <Table.HeaderCell>Unit cost</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {parts.map((part) => (
                  <Table.Row key={part.id} className={`cursor-pointer ${selected?.id === part.id ? 'bg-ui-bg-highlight' : ''}`} onClick={() => setSelected(part)}>
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{part.name}</span>
                      <span className="font-mono text-xs text-ui-fg-subtle">{part.partNumber}{part.binLocation ? ` · ${part.binLocation}` : ''}</span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {part.nonStock ? <StatusBadge color="grey">Non-stock</StatusBadge> : (
                        <span className="flex items-center gap-2">{part.quantityOnHand} {part.unitOfMeasure.toLowerCase()}{part.lowStock ? <StatusBadge color="orange">Low</StatusBadge> : null}</span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">{part.reorderPoint ?? part.minQuantity}</Table.Cell>
                    <Table.Cell className="tabular-nums">{part.unitCost === null ? '—' : formatMoney(part.unitCost, part.currencyCode)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      <PartPanel part={selected} siteName={siteName} onChanged={async (part) => { setSelected(part); await load(); }} />
    </div>
  );
}

function PartForm({ sites, onCreated }: { sites: readonly SiteOption[]; onCreated: (part: CmmsPartV1) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const nonStock = data.get('nonStock') === 'on';
    try {
      const part = await cmmsApi.createPart({
        partNumber: String(data.get('partNumber') ?? ''),
        name: String(data.get('name') ?? ''),
        currencyCode: String(data.get('currencyCode') ?? '').toUpperCase(),
        unitOfMeasure: optionalText(data.get('unitOfMeasure')),
        unitCost: optionalNumber(data.get('unitCost')),
        minQuantity: optionalNumber(data.get('minQuantity')),
        reorderPoint: optionalNumber(data.get('reorderPoint')),
        nonStock,
        ...(nonStock ? {} : { openingQuantity: optionalNumber(data.get('openingQuantity')) }),
        siteRef: optionalText(data.get('siteRef')),
        binLocation: optionalText(data.get('binLocation')),
      });
      await onCreated(part);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3">
      <Field id="part-number" label="Part number"><Input id="part-number" name="partNumber" required maxLength={64} className="uppercase" /></Field>
      <Field id="part-name" label="Name" className="md:col-span-2"><Input id="part-name" name="name" required maxLength={200} /></Field>
      <Field id="part-uom" label="Unit of measure"><Input id="part-uom" name="unitOfMeasure" placeholder="EACH" maxLength={32} /></Field>
      <Field id="part-cost" label="Unit cost">
        <div className="flex gap-2">
          <Input id="part-cost" name="unitCost" type="number" min="0" step="0.01" />
          <Input name="currencyCode" aria-label="Currency" required maxLength={3} defaultValue="USD" className="w-20 uppercase" />
        </div>
      </Field>
      <Field id="part-opening" label="Opening quantity"><Input id="part-opening" name="openingQuantity" type="number" min="0" step="any" /></Field>
      <Field id="part-min" label="Minimum"><Input id="part-min" name="minQuantity" type="number" min="0" step="any" /></Field>
      <Field id="part-reorder" label="Reorder point"><Input id="part-reorder" name="reorderPoint" type="number" min="0" step="any" /></Field>
      <Field id="part-bin" label="Bin location"><Input id="part-bin" name="binLocation" maxLength={120} /></Field>
      <Field id="part-site" label="Store site"><SiteSelect id="part-site" name="siteRef" sites={sites} /></Field>
      <div className="flex items-center gap-2 self-end pb-1">
        <Checkbox id="part-nonstock" name="nonStock" />
        <label htmlFor="part-nonstock" className="txt-compact-small">Non-stock (bought per job)</label>
      </div>
      <div className="md:col-span-3"><ActionError error={error} /></div>
      <Button type="submit" isLoading={saving} className="md:col-span-3">Add part</Button>
    </form>
  );
}

function PartPanel({ part, siteName, onChanged }: { part: CmmsPartV1 | null; siteName: (siteRef: string | null) => string; onChanged: (part: CmmsPartV1) => Promise<void> }) {
  const [movements, setMovements] = useState<readonly CmmsStockMovementV1[]>([]);
  const [type, setType] = useState<'RECEIPT' | 'ADJUSTMENT'>('RECEIPT');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    if (!part) return;
    let active = true;
    cmmsApi.movements(part.id).then((result) => active && setMovements(result.items), (reason) => active && setError(reason as CmmsApiError));
    return () => {
      active = false;
    };
  }, [part]);

  if (!part) {
    return (
      <aside aria-label="Part details">
        <Container className="p-5">
          <Heading level="h2">Stock ledger</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">Select a part to receive or adjust stock and see every movement.</Text>
        </Container>
      </aside>
    );
  }

  async function move(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const result = await cmmsApi.recordMovement(
        part!.id,
        type === 'RECEIPT'
          ? {
              movementType: 'RECEIPT',
              idempotencyKey: crypto.randomUUID(),
              quantity: Number(data.get('quantity')),
              unitCost: optionalNumber(data.get('unitCost')),
              reason: optionalText(data.get('reason')),
            }
          : {
              movementType: 'ADJUSTMENT',
              idempotencyKey: crypto.randomUUID(),
              quantityDelta: Number(data.get('quantity')),
              reason: optionalText(data.get('reason')) ?? '',
            },
      );
      form.reset();
      await onChanged(result.part);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="Part details">
      <Container className="p-5">
        <Text size="xsmall" className="font-mono text-ui-fg-subtle">{part.partNumber} · v{part.version}</Text>
        <Heading level="h2" className="mt-1">{part.name}</Heading>
        <dl className="mt-4 grid grid-cols-2 gap-3 txt-compact-small">
          <div><dt className="text-ui-fg-subtle">On hand</dt><dd className="tabular-nums">{part.nonStock ? 'Non-stock' : `${part.quantityOnHand} ${part.unitOfMeasure.toLowerCase()}`}</dd></div>
          <div><dt className="text-ui-fg-subtle">Reorder point</dt><dd className="tabular-nums">{part.reorderPoint ?? '—'}</dd></div>
          <div><dt className="text-ui-fg-subtle">Store</dt><dd>{siteName(part.siteRef)}{part.binLocation ? ` · ${part.binLocation}` : ''}</dd></div>
          <div><dt className="text-ui-fg-subtle">Unit cost</dt><dd>{part.unitCost === null ? '—' : formatMoney(part.unitCost, part.currencyCode)}</dd></div>
        </dl>
        {part.nonStock ? null : (
          <form onSubmit={move} className="mt-4 grid grid-cols-2 gap-2 border-t border-ui-border-base pt-4">
            <select aria-label="Movement" value={type} onChange={(event) => setType(event.target.value as typeof type)} className={`${selectClass} col-span-2`}>
              <option value="RECEIPT">Receive stock</option>
              <option value="ADJUSTMENT">Adjust count (+/−)</option>
            </select>
            <Input name="quantity" type="number" step="any" required placeholder={type === 'RECEIPT' ? 'Quantity received' : 'Change, e.g. -2'} aria-label="Quantity" />
            {type === 'RECEIPT' ? <Input name="unitCost" type="number" min="0" step="0.01" placeholder={`Unit cost (${part.currencyCode})`} aria-label="Receipt unit cost" /> : <span />}
            <Input name="reason" required={type === 'ADJUSTMENT'} placeholder={type === 'ADJUSTMENT' ? 'Reason (required)' : 'Reference, e.g. delivery note'} aria-label="Reason" className="col-span-2" maxLength={500} />
            <Button type="submit" size="small" isLoading={busy} className="col-span-2">Record movement</Button>
          </form>
        )}
        <ActionError error={error} />
        <Heading level="h3" className="mt-5">Ledger</Heading>
        {movements.length === 0 ? <Text size="small" className="mt-2 text-ui-fg-subtle">No movements yet.</Text> : (
          <ul className="mt-2 space-y-1">
            {movements.map((movement) => (
              <li key={movement.id} className="flex justify-between gap-2 txt-compact-small">
                <span>
                  {movementLabel[movement.movementType]}
                  <span className="block text-xs text-ui-fg-subtle">{formatDate(movement.createdAt)}{movement.reason ? ` · ${movement.reason}` : ''}</span>
                </span>
                <span className="text-right tabular-nums">
                  {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}
                  <span className="block text-xs text-ui-fg-subtle">{movement.balanceAfter === null ? '' : `balance ${movement.balanceAfter}`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </aside>
  );
}
