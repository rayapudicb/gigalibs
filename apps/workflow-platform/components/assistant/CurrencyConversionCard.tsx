'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Coins,
  RefreshCw,
  CheckCircle2,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

interface CurrencyConversionCardProps {
  pair?: string;
  rate?: string;
  sourceAmount?: string;
  convertedAmount?: string;
}

export function CurrencyConversionCard({
  pair = 'USD / EUR',
  rate = '0.9241',
  sourceAmount = '$50,000.00 USD',
  convertedAmount = '€46,205.00 EUR',
}: CurrencyConversionCardProps) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);

  const handleLock = () => {
    setLocked(true);
  };

  const handleOpenCurrency = () => {
    router.push('/currency');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 border border-violet-500/20">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{pair}</span>
              <span className="rounded bg-violet-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-violet-800">
                SPOT RATE: {rate}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">Multi-Currency Hedging & Conversion</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-zinc-900">{convertedAmount}</div>
          <div className="text-[10px] text-zinc-400">From {sourceAmount}</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">ECB Sovereign Feed:</span>
          <span className="font-mono text-emerald-700 font-bold">Spread 0.02% (Nominal)</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleLock}
            disabled={locked}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {locked ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Rate Locked (60m)</span>
              </>
            ) : (
              <span>Lock FX Rate for PO</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenCurrency}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Currency Hub</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
