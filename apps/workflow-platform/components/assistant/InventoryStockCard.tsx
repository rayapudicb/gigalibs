'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Layers,
} from 'lucide-react';

interface InventoryStockCardProps {
  sku?: string;
  partName?: string;
  binLocation?: string;
  onHand?: number;
  minThreshold?: number;
}

export function InventoryStockCard({
  sku = 'BRG-SKF-6312',
  partName = 'Deep Groove Ball Bearing 60mm Bore',
  binLocation = 'Storeroom 01 • Bin B-04-1',
  onHand = 14,
  minThreshold = 5,
}: InventoryStockCardProps) {
  const router = useRouter();
  const [reserved, setReserved] = useState(false);

  const handleReserve = () => {
    setReserved(true);
  };

  const handleOpenInventory = () => {
    router.push('/inventory');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/20">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{sku}</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-800">
                IN STOCK
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{partName}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-zinc-900">{onHand} Units Available</div>
          <div className="text-[10px] text-zinc-400">Min Safe: {minThreshold}</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Physical Location:</span>
          <span className="font-mono font-bold text-zinc-900">{binLocation}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleReserve}
            disabled={reserved}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {reserved ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>2 Units Allocated</span>
              </>
            ) : (
              <span>Reserve 2 Units for WO</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenInventory}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Inventory Ledger</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
