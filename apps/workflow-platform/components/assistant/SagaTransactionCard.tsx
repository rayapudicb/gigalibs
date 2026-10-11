'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  GitCommit,
  ShieldCheck,
} from 'lucide-react';

interface SagaTransactionCardProps {
  sagaId?: string;
  sagaName?: string;
  status?: 'COMPENSATING' | 'COMPLETED' | 'SUSPENDED';
  failedStep?: string;
}

export function SagaTransactionCard({
  sagaId = 'SAGA-2026-PO-991',
  sagaName = 'Distributed Procurement & General Ledger Commit Saga',
  status = 'COMPENSATING',
  failedStep = 'Step 3: GL Line Reservation (Ledger Timeout)',
}: SagaTransactionCardProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retried, setRetried] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    setTimeout(() => {
      setRetrying(false);
      setRetried(true);
    }, 700);
  };

  const handleOpenSaga = () => {
    router.push('/saga');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-700 border border-rose-500/20">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{sagaId}</span>
              <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-rose-800">
                {retried ? 'RESOLVED' : status}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{sagaName}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>2/3 Compensated</div>
          <div className="text-[10px] text-zinc-400">Zero Data Leak</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-xs text-rose-900">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            <span>Compensating Transaction Triggered</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-rose-800">{failedStep}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying || retried}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {retried ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Step Re-Executed</span>
              </>
            ) : (
              <>
                <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Compensating...' : 'Retry Failed Step'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenSaga}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Saga Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
