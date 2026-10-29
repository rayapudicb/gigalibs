'use client';

import type { InventoryWarehouseV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';

const BASE = '/api/universal-inventory/v1';

interface Suggestion {
  productId: string;
  availableQuantity: string;
  minQuantity: string;
  maxQuantity: string;
  packSize: string;
  suggestedQuantity: string;
  packs: string;
  shouldReplenish: boolean;
}

/** WI-OI-125 S3/S5: the Replenishment Radar — products below their min, with a bulk "Generate POs" handshake. */
export function ReplenishmentRadarPanel() {
  const [warehouses, setWarehouses] = useState<InventoryWarehouseV1[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${BASE}/warehouses`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as InventoryWarehouseV1[])
          : Promise.reject(new Error('Could not load warehouses.')),
      )
      .then(setWarehouses)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!warehouseId) {
      setRows([]);
      return;
    }
    setNotice(null);
    void fetch(`${BASE}/replenish-radar?warehouseId=${encodeURIComponent(warehouseId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as Suggestion[])
          : Promise.reject(new Error('Could not load the radar.')),
      )
      .then((data) => {
        setRows(data);
        setSelected(new Set(data.filter((row) => row.shouldReplenish).map((row) => row.productId)));
        setError(null);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [warehouseId]);

  const toggle = (productId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  async function generate() {
    const productIds = rows
      .filter((row) => row.shouldReplenish && selected.has(row.productId))
      .map((row) => row.productId);
    if (productIds.length === 0) {
      setError('Select at least one product below its minimum.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${BASE}/replenish-pos`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ warehouseId, productIds }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? String((body as { message: unknown }).message)
            : `Could not generate drafts (${response.status}).`;
        throw new Error(message);
      }
      const drafts = Array.isArray(body) ? body.length : 0;
      setNotice(`${drafts} purchase draft${drafts === 1 ? '' : 's'} raised for Procurement.`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate drafts.');
    } finally {
      setBusy(false);
    }
  }

  const cellClass = 'px-3 py-2 text-sm';
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ui-fg-base">Replenishment radar</h2>
        <p className="text-sm text-ui-fg-subtle">
          Products at or below their minimum, with a pack-rounded suggested order you can turn into
          purchase drafts.
        </p>
      </div>
      <label className="block max-w-sm text-sm text-ui-fg-subtle">
        Warehouse
        <select
          className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-ui-fg-base"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
        >
          <option value="">Select warehouse</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} — {warehouse.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-ui-fg-base">
          {notice}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-ui-border-base">
          <table className="w-full border-collapse">
            <thead className="bg-ui-bg-subtle text-left text-xs uppercase text-ui-fg-subtle">
              <tr>
                <th className={cellClass}> </th>
                <th className={cellClass}>Product</th>
                <th className={cellClass}>Available</th>
                <th className={cellClass}>Min / Max</th>
                <th className={cellClass}>Pack</th>
                <th className={cellClass}>Suggested</th>
                <th className={cellClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId} className="border-t border-ui-border-base">
                  <td className={cellClass}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.productId)}
                      disabled={!row.shouldReplenish}
                      onChange={() => toggle(row.productId)}
                      aria-label={`Select ${row.productId}`}
                    />
                  </td>
                  <td className={`${cellClass} font-mono text-xs text-ui-fg-base`}>
                    {row.productId.slice(0, 8)}…
                  </td>
                  <td className={cellClass}>{row.availableQuantity}</td>
                  <td className={cellClass}>
                    {row.minQuantity} / {row.maxQuantity}
                  </td>
                  <td className={cellClass}>{row.packSize}</td>
                  <td className={`${cellClass} font-medium text-ui-fg-base`}>
                    {row.shouldReplenish ? row.suggestedQuantity : '—'}
                  </td>
                  <td className={cellClass}>
                    {row.shouldReplenish ? (
                      <span className="rounded-full border border-ui-border-base px-2 py-0.5 text-xs font-medium text-ui-fg-error">
                        Below min
                      </span>
                    ) : (
                      <span className="rounded-full bg-ui-bg-subtle px-2 py-0.5 text-xs text-ui-fg-subtle">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : warehouseId ? (
        <p className="text-sm text-ui-fg-muted">No replenishment rules for this warehouse yet.</p>
      ) : null}
      <button
        type="button"
        className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50"
        disabled={busy || selected.size === 0}
        onClick={() => void generate()}
      >
        {busy ? 'Generating…' : 'Generate POs'}
      </button>
    </section>
  );
}
