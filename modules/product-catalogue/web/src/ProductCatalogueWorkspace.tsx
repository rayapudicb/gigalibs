'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { createRecordClient, type LookupOption, MetadataWindow, type RecordClient, usePublishedManifest } from '@gigalibs/configuration-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

// WI-OI-120g (U7, ADR-0033 D1): the Product Catalogue's screens are metadata windows drawn from the dictionary each
// tenant has published, over the Catalogue's own record dispatcher. The hand-written screen, its constant dictionary
// and its silent fallback are gone. Two specialised panels stay inside the governed screen: the price resolver and
// product import/export, both calling the Catalogue's API as the signed-in user.

const BASE_PATH = '/api/product-catalogue';

const WINDOWS = [
  { surface: 'catalogue-products', label: 'Products' },
  { surface: 'catalogue-units', label: 'Units' },
  { surface: 'catalogue-categories', label: 'Categories' },
  { surface: 'catalogue-attributes', label: 'Attributes' },
  { surface: 'catalogue-catalogues', label: 'Catalogues' },
  { surface: 'catalogue-catalogue-versions', label: 'Catalogue versions' },
  { surface: 'catalogue-price-lists', label: 'Price lists' },
  { surface: 'catalogue-price-list-versions', label: 'Price-list versions' },
] as const;

type Tab = (typeof WINDOWS)[number]['surface'] | 'resolve' | 'transfer';

const field =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const primary =
  'rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const secondary =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-3 py-1.5 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';

export interface ProductCatalogueWorkspaceProps {
  /** The signed-in user's permissions, for the windows' deny-by-default rules (the server still decides). */
  readonly permissions?: readonly string[];
}

function holds(permissions: readonly string[], permission: string): boolean {
  return holdsPermission(permissions, permission);
}

export function ProductCatalogueWorkspace({ permissions = [] }: ProductCatalogueWorkspaceProps = {}) {
  const [tab, setTab] = useState<Tab>('catalogue-products');
  const client = useMemo(() => createRecordClient({ basePath: BASE_PATH }), []);
  const canTransfer = holds(permissions, 'products:import') || holds(permissions, 'products:export');
  const tabs: readonly { surface: Tab; label: string }[] = [
    ...WINDOWS,
    { surface: 'resolve', label: 'Price resolver' },
    ...(canTransfer ? [{ surface: 'transfer' as const, label: 'Import & export' }] : []),
  ];
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">Product Catalogue</h1>
        <p className="text-sm text-ui-fg-subtle">
          Products, units, categories, attributes, catalogues and price lists of your organization. Other modules use products by reference.
        </p>
      </header>
      <nav role="tablist" aria-label="Product Catalogue" className="flex flex-wrap gap-1 border-b border-ui-border-base">
        {tabs.map((entry) => (
          <button
            key={entry.surface}
            type="button"
            role="tab"
            aria-selected={tab === entry.surface}
            className={`px-3 py-2 text-sm ${tab === entry.surface ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
            onClick={() => setTab(entry.surface)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {tab === 'resolve' ? (
        <PriceResolver client={client} />
      ) : tab === 'transfer' ? (
        <ImportExport permissions={permissions} />
      ) : (
        <CatalogueWindow key={tab} surface={tab} client={client} permissions={permissions} />
      )}
    </div>
  );
}

function CatalogueWindow({ surface, client, permissions }: { surface: string; client: RecordClient; permissions: readonly string[] }) {
  const state = usePublishedManifest({ moduleKey: 'product-catalogue', entityKey: surface, surfaceKey: surface });
  if (state.status === 'loading') return <p className="text-sm text-ui-fg-muted">Loading the window…</p>;
  if (state.status !== 'ready') {
    return (
      <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <p className="text-sm font-medium text-ui-fg-error">{state.status === 'forbidden' ? 'No access' : 'This window is not available'}</p>
        <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
      </div>
    );
  }
  return <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />;
}

/** The server's message from a failed call. */
async function failure(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const nested = record.message && typeof record.message === 'object' ? (record.message as Record<string, unknown>) : record;
    if (typeof nested.message === 'string') return nested.message;
    if (typeof record.title === 'string') return record.title;
  }
  return `The request failed (${response.status}).`;
}

/** A searchable picker over one of the Catalogue's lookups. */
function Picker({ client, resolverKey, label, value, onChange }: { client: RecordClient; resolverKey: string; label: string; value: string; onChange: (value: string) => void }) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<readonly LookupOption[]>([]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      client
        .lookup(resolverKey, search ? { search } : {})
        .then((found) => {
          if (active) setOptions(found);
        })
        .catch(() => {
          if (active) setOptions([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, resolverKey, search]);
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ui-fg-subtle">{label}</label>
      <input aria-label={`Search ${label}`} className={field} placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label={label} className={field} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ResolvedPrice {
  readonly currencyCode: string;
  readonly listPriceMinor: string;
  readonly standardPriceMinor: string;
  readonly limitPriceMinor: string;
  readonly isTaxIncluded: boolean;
  readonly effectiveFrom: string;
  readonly resolutionTrace: { readonly versionSelected: string; readonly precedenceRule: string; readonly quantityBreak: string };
}

/** Minor units as a decimal amount, without floating point. */
function amount(minor: string, currency: string): string {
  const negative = minor.startsWith('-');
  const digits = (negative ? minor.slice(1) : minor).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)} ${currency}`;
}

function PriceResolver({ client }: { client: RecordClient }) {
  const [productId, setProductId] = useState('');
  const [uomId, setUomId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [currencyCode, setCurrencyCode] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResolvedPrice | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (!productId) return setMessage('Choose a product.');
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const response = await fetch(`${BASE_PATH}/v1/prices/resolve`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId,
          ...(uomId ? { uomId } : {}),
          ...(quantity.trim() ? { quantity: quantity.trim() } : {}),
          ...(currencyCode.trim() ? { currencyCode: currencyCode.trim().toUpperCase() } : {}),
          ...(date ? { effectiveAt: `${date}T00:00:00.000Z` } : {}),
        }),
      });
      if (response.status === 404) setMessage('No active price applies to this product, unit, quantity, currency and date.');
      else if (!response.ok) setMessage(await failure(response));
      else setResult((await response.json()) as ResolvedPrice);
    } catch {
      setMessage('The price could not be resolved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-4">
      <p className="text-sm text-ui-fg-subtle">
        Find the one price in force for a product on a date: the most specific active price-list version wins (organization, then audience, then quantity break, then the latest effective date).
      </p>
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void resolve(event)}>
        <Picker client={client} resolverKey="catalogue-products" label="Product" value={productId} onChange={setProductId} />
        <Picker client={client} resolverKey="catalogue-uoms" label="Unit (optional)" value={uomId} onChange={setUomId} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-ui-fg-subtle" htmlFor="resolve-quantity">Quantity</label>
          <input id="resolve-quantity" className={field} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ui-fg-subtle" htmlFor="resolve-currency">Currency (optional)</label>
          <input id="resolve-currency" className={field} maxLength={3} placeholder="USD" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ui-fg-subtle" htmlFor="resolve-date">On date (optional)</label>
          <input id="resolve-date" type="date" className={field} value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="flex items-end">
          <button type="submit" className={primary} disabled={busy}>
            {busy ? 'Resolving…' : 'Resolve price'}
          </button>
        </div>
      </form>
      {message && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {message}
        </p>
      )}
      {result && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-4 text-sm">
          <Row label="List price">{amount(result.listPriceMinor, result.currencyCode)}</Row>
          <Row label="Standard price">{amount(result.standardPriceMinor, result.currencyCode)}</Row>
          <Row label="Limit price">{amount(result.limitPriceMinor, result.currencyCode)}</Row>
          <Row label="Tax">{result.isTaxIncluded ? 'Included' : 'Not included'}</Row>
          <Row label="From version">{`${result.resolutionTrace.versionSelected}, effective ${result.effectiveFrom.slice(0, 10)}`}</Row>
          <Row label="Quantity break">{result.resolutionTrace.quantityBreak}</Row>
          <Row label="Rule">{result.resolutionTrace.precedenceRule}</Row>
        </dl>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ui-fg-subtle">{label}</dt>
      <dd className="col-span-2 text-ui-fg-base">{children}</dd>
    </>
  );
}

/** Splits CSV text with a header row into records; quoted cells may hold commas and doubled quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((name, column) => [name.trim(), (values[column] ?? '').trim()])));
}

/** CSV cells as the product contract's types: booleans and empty cells. */
function productRow(row: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === '') continue;
    result[key] = /^(is[A-Z])/.test(key) ? ['true', 'yes', '1'].includes(value.toLowerCase()) : value;
  }
  return result;
}

interface ImportPreview {
  readonly total: number;
  readonly valid: number;
  readonly quarantined: number;
  readonly rows: readonly { readonly row: number; readonly status: string; readonly issues: readonly string[] }[];
}

function ImportExport({ permissions }: { permissions: readonly string[] }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseCsv(csv).map(productRow), [csv]);

  async function exportProducts() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${BASE_PATH}/v1/products/export`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(await failure(response));
      const file = (await response.json()) as { mediaType: string; filename: string; content: string; truncated: boolean };
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([file.content], { type: file.mediaType }));
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage({ tone: 'info', text: file.truncated ? 'Exported the first 100 products.' : 'Exported.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The export failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function send(path: 'preview' | 'commit') {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${BASE_PATH}/v1/products/import/${path}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(path === 'commit' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) throw new Error(await failure(response));
      if (path === 'preview') setPreview((await response.json()) as ImportPreview);
      else {
        const result = (await response.json()) as { imported: number };
        setPreview(null);
        setCsv('');
        setMessage({ tone: 'info', text: `Imported ${result.imported} products as drafts.` });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The import failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-6">
      {holds(permissions, 'products:export') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ui-fg-base">Export products</h2>
          <p className="text-sm text-ui-fg-subtle">Downloads your products as CSV. Formula-like cells are neutralised.</p>
          <button type="button" className={secondary} disabled={busy} onClick={() => void exportProducts()}>
            Export CSV
          </button>
        </div>
      )}
      {holds(permissions, 'products:import') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ui-fg-base">Import products</h2>
          <p className="text-sm text-ui-fg-subtle">
            Paste CSV with a header row: code, name, productType, baseUomId, isSold, isPurchased, isStocked (and optionally displayName, description, categoryId). Up to 500 rows; every row is checked before anything is saved.
          </p>
          <textarea
            aria-label="Products CSV"
            className={`${field} h-40 font-mono`}
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setPreview(null);
            }}
          />
          <div className="flex gap-2">
            <button type="button" className={secondary} disabled={busy || rows.length === 0} onClick={() => void send('preview')}>
              Check {rows.length} rows
            </button>
            <button type="button" className={primary} disabled={busy || !preview || preview.quarantined > 0} onClick={() => void send('commit')}>
              Import
            </button>
          </div>
          {preview && (
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-3 text-sm">
              <p className="text-ui-fg-base">{`${preview.valid} of ${preview.total} rows are valid; ${preview.quarantined} need fixing.`}</p>
              <ul className="mt-2 space-y-1">
                {preview.rows
                  .filter((row) => row.status !== 'VALID')
                  .map((row) => (
                    <li key={row.row} className="text-ui-fg-error">{`Row ${row.row}: ${row.issues.join('; ')}`}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${message.tone === 'error' ? 'text-ui-fg-error' : 'text-ui-fg-subtle'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
