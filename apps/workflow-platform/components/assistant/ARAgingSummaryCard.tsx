'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  Download,
  Mail,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
} from 'lucide-react';
import { Badge } from '@medusajs/ui';

interface ARAgingSummaryCardProps {
  totalOverdue?: string;
  delinquentCount?: number;
  topAccount?: string;
  topAccountAmount?: string;
}

export function ARAgingSummaryCard({
  totalOverdue = '$128,450.00',
  delinquentCount = 4,
  topAccount = 'Titan Mining Corp',
  topAccountAmount = '$64,200.00',
}: ARAgingSummaryCardProps) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
      const sampleCsv = `Customer,Invoice No,Days Overdue,Amount Due,Status\nTitan Mining Corp,INV-2026-0881,64,$64200.00,PAST DUE\nApex Heavy Industries,INV-2026-0914,48,$38150.00,PAST DUE\nPacific Refining,INV-2026-0940,32,$16100.00,PENDING\nBorealis Chemicals,INV-2026-0955,18,$10000.00,CURRENT`;
      const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `AR_Aging_Statement_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 600);
  };

  const handleSendNotice = () => {
    setSendingNotice(true);
    setTimeout(() => {
      setSendingNotice(false);
      setNoticeSent(true);
    }, 700);
  };

  const handleOpenLedger = () => {
    router.push('/ar/aging');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      {/* Header Banner */}
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700 border border-blue-500/20">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">
                AR-AGING-SUMMARY
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-800">
                {delinquentCount} DELINQUENT
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5">
              Outstanding Accounts Receivable
            </h4>
          </div>
        </div>

        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="text-red-700 font-bold">{totalOverdue}</div>
          <div className="text-[10px] text-zinc-400">Total Past Due</div>
        </div>
      </div>

      {/* Aging Bracket Breakdown */}
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">Current (0-30d)</div>
            <div className="font-mono font-bold text-zinc-800 mt-0.5">$412.8k</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">31-60 Days</div>
            <div className="font-mono font-bold text-amber-700 mt-0.5">$62.1k</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">&gt; 60 Days</div>
            <div className="font-mono font-bold text-red-700 mt-0.5">$66.3k</div>
          </div>
        </div>

        {/* Delinquent Highlight */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-amber-900">Largest Overdue Account:</span>
            <span className="font-mono font-bold text-amber-900">{topAccountAmount}</span>
          </div>
          <div className="text-[11px] text-amber-800 font-mono mt-0.5">{topAccount} • 64 days overdue</div>
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {downloaded ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>{downloading ? 'Exporting...' : 'Statement .CSV'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenLedger}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open AR Ledger</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Send Notice Action */}
        <div className="pt-0.5 border-t border-zinc-100 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            Dunning Notice: Titan Mining Corp
          </span>
          <button
            type="button"
            onClick={handleSendNotice}
            disabled={sendingNotice || noticeSent}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 disabled:text-zinc-400"
          >
            {noticeSent ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Notice Dispatched</span>
              </>
            ) : (
              <>
                <Mail className="h-3 w-3" />
                <span>{sendingNotice ? 'Sending...' : 'Send Reminder Notice'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
