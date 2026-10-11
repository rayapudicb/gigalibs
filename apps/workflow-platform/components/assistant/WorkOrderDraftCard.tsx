'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  ArrowUpRight,
  UserCheck,
  Send,
  Clock,
} from 'lucide-react';
import { Badge, Button } from '@medusajs/ui';

interface WorkOrderDraftCardProps {
  orderNumber?: string;
  assetTag?: string;
  assetName?: string;
  priority?: string;
  assignedCrew?: string;
  estimatedHours?: string;
}

export function WorkOrderDraftCard({
  orderNumber = 'WO-2026-EM-4890',
  assetTag = 'P-204B',
  assetName = 'Slurry Pump P-204B (Unit A)',
  priority = 'P1-EMERGENCY',
  assignedCrew = 'Senior Millwright Team 2',
  estimatedHours = '2.5 hrs',
}: WorkOrderDraftCardProps) {
  const router = useRouter();
  const [dispatching, setDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const handleDispatch = () => {
    setDispatching(true);
    setTimeout(() => {
      setDispatching(false);
      setDispatched(true);
    }, 700);
  };

  const handleOpenStudio = () => {
    router.push('/cmms/work-orders');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      {/* Header Banner */}
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-700 border border-orange-500/20">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">
                {orderNumber}
              </span>
              <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-red-800">
                {priority}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5">
              Emergency Maintenance Work Order
            </h4>
          </div>
        </div>

        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>Est. {estimatedHours}</div>
          <div className="text-[10px] text-zinc-400">Target: Immediate</div>
        </div>
      </div>

      {/* Details & Inventory Pre-check */}
      <div className="p-3.5 space-y-3">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/70 p-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Target Equipment:</span>
            <span className="font-mono font-bold text-zinc-900">{assetTag} — {assetName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Assigned Crew:</span>
            <span className="font-semibold text-zinc-800">{assignedCrew}</span>
          </div>
        </div>

        {/* Storeroom Inventory Validation */}
        <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 border border-emerald-100 px-2.5 py-1.5 text-xs text-emerald-800">
          <div className="flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4 text-emerald-600" />
            <span>2x SKF Bearings (#BRG-SKF-6312) in Bin B-04-1</span>
          </div>
          <span className="font-mono font-bold text-[10px] text-emerald-700">IN STOCK</span>
        </div>

        {/* Action Buttons */}
        <div className="pt-1">
          {dispatched ? (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold">
                  Crew dispatched & spare parts allocated in Storeroom 01.
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenStudio}
                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Track WO ↗
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDispatch}
                disabled={dispatching}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{dispatching ? 'Allocating...' : 'Dispatch & Reserve'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenStudio}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
              >
                <span>Open in CMMS Studio</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
