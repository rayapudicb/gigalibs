'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  TrendingDown,
} from 'lucide-react';

interface SpendApprovalCardProps {
  requestNumber?: string;
  department?: string;
  amount?: string;
  category?: string;
}

export function SpendApprovalCard({
  requestNumber = 'SPEND-2026-0419',
  department = 'Mechanical Engineering Maintenance',
  amount = '$4,850.00',
  category = 'Emergency Equipment Overhaul & Tooling',
}: SpendApprovalCardProps) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);

  const handleApprove = () => {
    setApproved(true);
  };

  const handleOpenSpend = () => {
    router.push('/spend');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{requestNumber}</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-800">
                WITHIN POLICY
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{category}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-emerald-700">{amount}</div>
          <div className="text-[10px] text-zinc-400">Budget: 72% Used</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Department:</span>
          <span className="font-semibold text-zinc-900">{department}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approved}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
          >
            {approved ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                <span>Approved & Released</span>
              </>
            ) : (
              <span>Approve Spend ({amount})</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenSpend}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Spend Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
