'use client';

import type { InventoryAtpCheckResponseV1, InventoryWarehouseV1 } from '@gigalibs/contracts';
import { type FormEvent, useEffect, useState } from 'react';

const BASE = '/api/universal-inventory/v1';

export function AtpLivePanel() {
  const [warehouses, setWarehouses] = useState<InventoryWarehouseV1[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [uomId, setUomId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [result, setResult] = useState<InventoryAtpCheckResponseV1 | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void fetch(`${BASE}/warehouses`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load warehouses.');
        return response.json() as Promise<InventoryWarehouseV1[]>;
      })
      .then(setWarehouses)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!watching || !warehouseId || !productId || !uomId || !quantity) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${BASE}/atp/check`, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ requestKey: crypto.randomUUID(), warehouseId, productId, uomId,
            requestedQuantity: quantity }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = body && typeof body === 'object' && 'message' in body
            ? String((body as { message: unknown }).message) : `ATP check failed (${response.status}).`;
          throw new Error(message);
        }
        if (!stopped) { setResult(body as InventoryAtpCheckResponseV1); setCheckedAt(new Date()); setError(null); }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'ATP check failed.');
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(() => void check(), 5000);
        }
      }
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [watching, warehouseId, productId, uomId, quantity, refreshKey]);

  function start(event: FormEvent) {
    event.preventDefault();
    setResult(null); setCheckedAt(null); setError(null); setWatching(true);
    setRefreshKey((value) => value + 1);
  }

  const inputClass = 'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-ui-fg-base';
  return (
    <section className="max-w-xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ui-fg-base">Available to promise</h2>
        <p className="text-sm text-ui-fg-subtle">Read the current on-hand and reserved quantities from Inventory every five seconds while this tile is open.</p>
      </div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={start}>
        <label className="text-sm text-ui-fg-subtle sm:col-span-2">Warehouse
          <select className={inputClass} value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setWatching(false); }} required>
            <option value="">Select warehouse</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-ui-fg-subtle">Product ID
          <input className={inputClass} value={productId} onChange={(event) => { setProductId(event.target.value); setWatching(false); }} required />
        </label>
        <label className="text-sm text-ui-fg-subtle">Unit ID
          <input className={inputClass} value={uomId} onChange={(event) => { setUomId(event.target.value); setWatching(false); }} required />
        </label>
        <label className="text-sm text-ui-fg-subtle">Requested quantity
          <input className={inputClass} inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setWatching(false); }} required />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted">{watching ? 'Refresh now' : 'Watch ATP'}</button>
          {watching ? <button type="button" className="rounded-md border border-ui-border-base px-3 py-2 text-sm" onClick={() => setWatching(false)}>Stop</button> : null}
        </div>
      </form>
      {error ? <p role="alert" className="text-sm text-ui-fg-error">{error}</p> : null}
      {result ? <div role="status" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
        <p className="text-sm font-medium text-ui-fg-base">{result.decision === 'AVAILABLE' ? 'Available' : 'Short'}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt>On hand</dt><dd>{result.onHandQuantity}</dd>
          <dt>Reserved</dt><dd>{result.reservedQuantity}</dd>
          <dt>Available</dt><dd>{result.availableQuantity}</dd>
        </dl>
        <p className="mt-2 text-xs text-ui-fg-subtle">{loading ? 'Refreshing…' : checkedAt ? `Checked ${checkedAt.toLocaleTimeString()}` : 'Waiting for first check'}</p>
      </div> : null}
    </section>
  );
}
