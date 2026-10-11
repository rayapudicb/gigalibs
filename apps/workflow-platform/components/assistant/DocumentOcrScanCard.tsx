'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ScanText,
  CheckCircle2,
  FileSearch,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

interface DocumentOcrScanCardProps {
  documentId?: string;
  documentType?: string;
  extractedVendor?: string;
  extractedTotal?: string;
  confidenceScore?: number;
}

export function DocumentOcrScanCard({
  documentId = 'DOC-SCAN-2026-88',
  documentType = 'Commercial Packing List & Bill of Lading',
  extractedVendor = 'Atlas Copco Industrial Compressors',
  extractedTotal = '$24,800.00',
  confidenceScore = 98.4,
}: DocumentOcrScanCardProps) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    setConfirmed(true);
  };

  const handleOpenScanner = () => {
    router.push('/scanner');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 border border-sky-500/20">
            <ScanText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{documentId}</span>
              <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-sky-800">
                OCR {confidenceScore}% CONFIDENCE
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{documentType}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-zinc-900">{extractedTotal}</div>
          <div className="text-[10px] text-zinc-400">PDF Intake Scan</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Extracted Vendor:</span>
          <span className="font-semibold text-zinc-900">{extractedVendor}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmed}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {confirmed ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Parsed & Pushed to AP</span>
              </>
            ) : (
              <span>Confirm & Commit OCR Data</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenScanner}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Document Scanner</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
