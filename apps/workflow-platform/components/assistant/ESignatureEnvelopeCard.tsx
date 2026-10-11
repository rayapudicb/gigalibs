'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSignature,
  CheckCircle2,
  Mail,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

interface ESignatureEnvelopeCardProps {
  envelopeId?: string;
  documentTitle?: string;
  signeeName?: string;
  status?: string;
}

export function ESignatureEnvelopeCard({
  envelopeId = 'ENV-2026-SLA-991',
  documentTitle = 'Industrial Equipment Maintenance SLA Master Agreement',
  signeeName = 'Marcus Vance (VP Plant Operations)',
  status = 'WAITING FOR SIGNATURE',
}: ESignatureEnvelopeCardProps) {
  const router = useRouter();
  const [reminded, setReminded] = useState(false);

  const handleRemind = () => {
    setReminded(true);
  };

  const handleOpenEsign = () => {
    router.push('/esign');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{envelopeId}</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-800">
                {status}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{documentTitle}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>Signee 1 of 2 Signed</div>
          <div className="text-[10px] text-zinc-400">eIDAS / ESIGN Legal</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Pending Signee:</span>
          <span className="font-semibold text-zinc-900">{signeeName}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleRemind}
            disabled={reminded}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {reminded ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Reminder Dispatched</span>
              </>
            ) : (
              <span>Resend Signing Reminder</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenEsign}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open E-Sign Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
