'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Truck,
  CheckCircle2,
  ArrowUpRight,
  Clock,
} from 'lucide-react';

interface SalesOrderFulfillmentCardProps {
  orderNumber?: string;
  customer?: string;
  status?: string;
  eta?: string;
}

export function SalesOrderFulfillmentCard({
  orderNumber = 'SO-2026-TITAN-8821',
  customer = 'Titan Mining Operations',
  status = 'PICKED & PACKAGED',
  eta = 'Tomorrow 10:00 AM',
}: SalesOrderFulfillmentCardProps) {
  const router = useRouter();
  const [expedited, setExpedited] = useState(false);

  const handleExpedite = () => {
    setExpedited(true);
  };

  const handleOpenOrders = () => {
    router.push('/orders');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700 border border-blue-500/20">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{orderNumber}</span>
              <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-blue-800">
                {expedited ? 'PRIORITY DISPATCH' : status}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{customer}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-zinc-900">ETA: {eta}</div>
          <div className="text-[10px] text-zinc-400">Carrier: DHL Freight</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Waybill Consignment:</span>
          <span className="font-mono font-bold text-zinc-900">DHL-EXPRESS-991204</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleExpedite}
            disabled={expedited}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {expedited ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Expedited with Carrier</span>
              </>
            ) : (
              <span>Expedite Hot Dispatch</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenOrders}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Orders Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
