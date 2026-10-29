'use client';

import type { InventoryWarehouseMapCellV1, InventoryWarehouseV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';

const BASE_PATH = '/api/universal-inventory';

export function WarehouseMapPanel() {
  const [warehouses, setWarehouses] = useState<InventoryWarehouseV1[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [cells, setCells] = useState<InventoryWarehouseMapCellV1[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch(`${BASE_PATH}/v1/warehouses`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load warehouses.');
        return res.json() as Promise<InventoryWarehouseV1[]>;
      })
      .then((rows) => {
        setWarehouses(rows);
        if (rows[0]?.id) setWarehouseId(rows[0].id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    setError(null);
    void fetch(`${BASE_PATH}/v1/warehouses/${warehouseId}/location-map`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load the warehouse map.');
        return res.json() as Promise<InventoryWarehouseMapCellV1[]>;
      })
      .then(setCells)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [warehouseId]);

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-sm text-ui-fg-subtle">
        Warehouse
        <select
          className="max-w-md rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-ui-fg-base"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
        >
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.code} — {wh.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-ui-fg-error">{error}</p> : null}
      {loading ? <p className="text-sm text-ui-fg-muted">Loading locator grid…</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cells.map((cell) => (
          <article
            key={cell.locationId}
            className="rounded-lg border border-ui-border-base bg-ui-bg-base p-3 shadow-sm"
            title={cell.nearestLotExpiry ? `Nearest lot expiry: ${cell.nearestLotExpiry}` : undefined}
          >
            <p className="font-medium text-ui-fg-base">{cell.code}</p>
            <p className="text-xs text-ui-fg-subtle">
              {[cell.aisle, cell.rack, cell.shelf, cell.bin].filter(Boolean).join(' · ') || cell.name}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-ui-fg-muted">
              <dt>On hand</dt>
              <dd className="text-right text-ui-fg-base">{cell.onHandQuantity}</dd>
              <dt>Available</dt>
              <dd className="text-right text-ui-fg-base">{cell.availableQuantity}</dd>
            </dl>
            {cell.nearestLotExpiry ? (
              <p className="mt-2 text-xs text-ui-fg-subtle">Expiry ≤ {new Date(cell.nearestLotExpiry).toLocaleDateString()}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
