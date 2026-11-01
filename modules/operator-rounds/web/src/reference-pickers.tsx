'use client';

import { Button, Input, Label, Text } from '@medusajs/ui';
import { useEffect, useState } from 'react';

// WI-OI-133: the route editor picks records other modules own, as the signed-in user, through those modules' own web
// gateways (CMMS assets and meters, Workforce resources) and the platform lookups (organization units, places). Each
// owning service's permission decides what is offered. When a lookup is refused or unavailable, the field falls back
// to typing the identifier, so a missing read permission never blocks route authoring.

export interface PickerOption<T = unknown> { readonly value: string; readonly label: string; readonly data?: T }
type Search<T> = (query: string) => Promise<readonly PickerOption<T>[]>;
type Resolve<T> = (id: string) => Promise<PickerOption<T> | null>;

class LookupRefused extends Error {}

async function readJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  if (response.status === 401 || response.status === 403 || response.status === 404) throw new LookupRefused(String(response.status));
  if (!response.ok) throw new Error(`Lookup failed (${response.status}).`);
  return response.json();
}
const items = (body: unknown): Record<string, unknown>[] =>
  Array.isArray(body) ? body : body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: Record<string, unknown>[] }).items : [];
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Search-as-you-type with a manual identifier fallback; `value` is the chosen identifier or ''. */
export function ReferencePicker<T>({ id, label, value, search, resolve, onChange, placeholder, manualLabel }: {
  readonly id: string; readonly label: string; readonly value: string; readonly search: Search<T>;
  readonly resolve: Resolve<T>; readonly onChange: (option: PickerOption<T> | null) => void;
  readonly placeholder?: string; readonly manualLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<readonly PickerOption<T>[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setChosen(null); return; }
    let live = true;
    resolve(value).then((option) => { if (live) setChosen(option?.label ?? null); })
      .catch((error) => { if (live) { setChosen(null); if (error instanceof LookupRefused) setManual(true); } });
    return () => { live = false; };
    // resolve is stable per field; re-resolving only when the identifier changes is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (manual || query.trim().length < 2) { setOptions([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      search(query.trim()).then((found) => { if (live) { setOptions(found.slice(0, 10)); setNotice(found.length ? null : 'No matches.'); } })
        .catch((error) => {
          if (!live) return;
          setOptions([]);
          if (error instanceof LookupRefused) { setManual(true); setNotice('This list is not available to your account; enter the identifier.'); }
          else setNotice('The list could not be loaded; try again or enter the identifier.');
        });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
    // search is stable per field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, manual]);

  return <div className="flex flex-col gap-1">
    <Label htmlFor={id}>{label}</Label>
    {value && !manual && <div className="flex flex-wrap items-center gap-2">
      <Text size="small">{chosen ?? value}</Text>
      <Button type="button" size="small" variant="secondary" onClick={() => { onChange(null); setQuery(''); }}>Change</Button>
    </div>}
    {manual ? <Input id={id} value={value} placeholder={manualLabel}
      onChange={(event) => onChange(event.target.value.trim() ? { value: event.target.value.trim(), label: event.target.value.trim() } : null)}/>
      : !value && <Input id={id} value={query} placeholder={placeholder ?? 'Type at least 2 characters'}
        onChange={(event) => setQuery(event.target.value)}/>}
    {!value && options.length > 0 && <div className="flex flex-col gap-1" role="listbox" aria-label={label}>
      {options.map((option) => <Button key={option.value} type="button" size="small" variant="secondary" role="option"
        aria-selected={false} onClick={() => { onChange(option); setChosen(option.label); setOptions([]); setQuery(''); }}>{option.label}</Button>)}
    </div>}
    {notice && <Text size="small" className="text-ui-fg-subtle">{notice}</Text>}
    {!manual && <button type="button" className="self-start text-xs text-ui-fg-interactive" onClick={() => setManual(true)}>Enter an identifier instead</button>}
  </div>;
}

/** Organization units and places, from the platform lookups (organization:read, maps.nodes.read). */
export function lookupSource(key: 'organization-units' | 'workspace-sites') {
  const url = `/api/control/v1/lookups/${key}`;
  const toOption = (row: Record<string, unknown>): PickerOption => ({ value: str(row['value']), label: str(row['label']) });
  return {
    search: async (query: string) => items(await readJson(`${url}?search=${encodeURIComponent(query)}`)).map(toOption),
    resolve: async (id: string) => items(await readJson(`${url}?ids=${encodeURIComponent(id)}`)).map(toOption)[0] ?? null,
  };
}

export interface AssetData { readonly assetTag: string; readonly name: string }
/** CMMS assets by tag or name (cmms.assets.read). */
export const assetSource = {
  search: async (query: string): Promise<PickerOption<AssetData>[]> =>
    items(await readJson('/api/cmms/v1/assets/search', { method: 'POST', body: JSON.stringify({ q: query, pageSize: 10 }) }))
      .map((row) => ({ value: str(row['id']), label: `${str(row['assetTag'])} · ${str(row['name'])}`,
        data: { assetTag: str(row['assetTag']), name: str(row['name']) } })),
  resolve: async (id: string): Promise<PickerOption<AssetData> | null> => {
    const row = await readJson(`/api/cmms/v1/assets/${encodeURIComponent(id)}`) as Record<string, unknown>;
    return { value: id, label: `${str(row['assetTag'])} · ${str(row['name'])}`, data: { assetTag: str(row['assetTag']), name: str(row['name']) } };
  },
};

export interface MeterData { readonly unit: string }
/** The chosen asset's CMMS meters (cmms.meters.read). */
export function meterSource(assetId: string) {
  const load = async () => items(await readJson(`/api/cmms/v1/meters?assetId=${encodeURIComponent(assetId)}`))
    .map((row): PickerOption<MeterData> => ({ value: str(row['id']), label: `${str(row['name'])} (${str(row['unit'])})`, data: { unit: str(row['unit']) } }));
  return {
    search: async (query: string) => (await load()).filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
    resolve: async (id: string) => (await load()).find((option) => option.value === id) ?? null,
  };
}

export interface OperatorData { readonly workforceResourceRef: string; readonly operatorSubject: string }
/**
 * Active human Workforce resources linked to a platform login (workforce.resources.read). One choice gives both the
 * resource and the login, so an assignment never pairs a person with someone else's account.
 */
export const operatorSource = {
  search: async (query: string): Promise<PickerOption<OperatorData>[]> =>
    items(await readJson(`/api/gigaops/v1/resources?q=${encodeURIComponent(query)}&resourceType=HUMAN&status=ACTIVE&pageSize=10`))
      .filter((row) => str(row['platformUserId']))
      .map((row) => ({ value: str(row['id']), label: str(row['displayName']),
        data: { workforceResourceRef: str(row['id']), operatorSubject: str(row['platformUserId']) } })),
  resolve: async (id: string): Promise<PickerOption<OperatorData> | null> => {
    const row = await readJson(`/api/gigaops/v1/resources/${encodeURIComponent(id)}`) as Record<string, unknown>;
    return { value: id, label: str(row['displayName']),
      data: { workforceResourceRef: id, operatorSubject: str(row['platformUserId']) } };
  },
};
