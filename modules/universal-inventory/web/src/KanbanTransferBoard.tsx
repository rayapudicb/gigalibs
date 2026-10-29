'use client';

import { useCallback, useEffect, useState } from 'react';

const BASE = '/api/universal-inventory/v1';

interface TransferLine {
  productId: string;
  quantity: string;
}
interface Transfer {
  id: string;
  transferNumber: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  status: string;
  lines: TransferLine[];
}

const COLUMNS: {
  readonly key: string;
  readonly label: string;
  readonly action?: 'dispatch' | 'receive';
  readonly actionLabel?: string;
}[] = [
  { key: 'DRAFT', label: 'Outbound', action: 'dispatch', actionLabel: 'Dispatch' },
  { key: 'IN_TRANSIT', label: 'In transit', action: 'receive', actionLabel: 'Receive' },
  { key: 'RECEIVED', label: 'Received' },
];

/** WI-OI-125 S4: the transfer Kanban board — Outbound (draft), In transit, Received — with the DocAction on each card. */
export function KanbanTransferBoard() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${BASE}/transfers`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not load transfers.');
      setTransfers((await response.json()) as Transfer[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load transfers.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (transfer: Transfer, action: 'dispatch' | 'receive') => {
      setBusyId(transfer.id);
      try {
        const response = await fetch(`${BASE}/transfers/${transfer.id}/${action}`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const message =
            body && typeof body === 'object' && 'message' in body
              ? String((body as { message: unknown }).message)
              : `Could not ${action} (${response.status}).`;
          throw new Error(message);
        }
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Could not ${action}.`);
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ui-fg-base">Transfer board</h2>
          <p className="text-sm text-ui-fg-subtle">
            Move inter-warehouse transfers from Outbound through In transit to Received.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-ui-border-base px-3 py-2 text-sm text-ui-fg-base"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const cards = transfers.filter((transfer) => transfer.status === column.key);
          return (
            <div
              key={column.key}
              className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3"
            >
              <h3 className="mb-2 flex items-center justify-between text-sm font-medium text-ui-fg-base">
                <span>{column.label}</span>
                <span className="rounded-full bg-ui-bg-base px-2 py-0.5 text-xs text-ui-fg-subtle">
                  {cards.length}
                </span>
              </h3>
              <ul className="space-y-2">
                {cards.map((transfer) => (
                  <li
                    key={transfer.id}
                    className="rounded-md border border-ui-border-base bg-ui-bg-base p-3"
                  >
                    <p className="text-sm font-medium text-ui-fg-base">{transfer.transferNumber}</p>
                    <p className="text-xs text-ui-fg-subtle">
                      {transfer.lines.length} line{transfer.lines.length === 1 ? '' : 's'}
                    </p>
                    {column.action ? (
                      <button
                        type="button"
                        className="mt-2 rounded-md bg-ui-button-inverted px-3 py-1.5 text-xs font-medium text-ui-fg-on-inverted disabled:opacity-50"
                        disabled={busyId === transfer.id}
                        onClick={() => void act(transfer, column.action as 'dispatch' | 'receive')}
                      >
                        {busyId === transfer.id ? '…' : column.actionLabel}
                      </button>
                    ) : null}
                  </li>
                ))}
                {cards.length === 0 ? (
                  <li className="text-xs text-ui-fg-muted">Nothing here.</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
