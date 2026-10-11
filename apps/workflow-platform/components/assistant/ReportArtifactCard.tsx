'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSpreadsheet,
  Download,
  ArrowUpRight,
  Mail,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { Badge, Button } from '@medusajs/ui';

interface ReportArtifactCardProps {
  title?: string;
  reportId?: string;
  format?: string;
  rows?: number;
  size?: string;
  generatedAt?: string;
  viewRoute?: string;
}

export function ReportArtifactCard({
  title = 'Downtime & MTBF Reliability Parameters Report',
  reportId = 'REP-2026-DT-88',
  format = 'XLSX',
  rows = 1420,
  size = '248 KB',
  generatedAt = 'Just now',
  viewRoute = '/cmms/analytics',
}: ReportArtifactCardProps) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
      // Trigger a clean synthetic CSV/XLSX download
      const sampleCsv = `Asset Tag,Equipment Name,Unit,Downtime Minutes,Root Cause,Work Order,Resolution\nPUMP-FP-101,Feed Pump FP-101,Unit ABC,0,Nominal,PMS-412,Inspected\nP-204B,Slurry Pump P-204B,Unit A,144,Drive-end bearing temp spike,WO-4889,Bearing greased and realigned\nAC-3,Compressor AC-3,Utility Yard,66,Filter differential trip,WO-4890,Pre-filter replaced\nCV-01,Transfer Conveyor CV-01,Packaging,51,Proximity switch misalignment,WO-4891,Sensor recalibrated`;
      const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportId}_downtime_parameters.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 600);
  };

  const handleEmail = () => {
    setEmailing(true);
    setTimeout(() => {
      setEmailing(false);
      setEmailed(true);
    }, 800);
  };

  const handleView = () => {
    router.push(viewRoute);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      {/* Header Banner */}
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">
                {reportId}
              </span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-semibold text-emerald-800">
                .{format.toLowerCase()}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">
              {title}
            </h4>
          </div>
        </div>

        <div className="text-right text-[11px] text-zinc-500 font-mono">
          <div>{rows.toLocaleString()} records</div>
          <div className="text-[10px] text-zinc-400">{size} • {generatedAt}</div>
        </div>
      </div>

      {/* Metrics & Parameters Summary */}
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">Plant MTBF</div>
            <div className="font-mono font-bold text-zinc-900 mt-0.5">184.2 hrs</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">Plant MTTR</div>
            <div className="font-mono font-bold text-zinc-900 mt-0.5">1.45 hrs</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100">
            <div className="text-[10px] text-zinc-500">Availability</div>
            <div className="font-mono font-bold text-emerald-700 mt-0.5">96.8%</div>
          </div>
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
                <span>{downloading ? 'Exporting...' : 'Download .XLSX'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleView}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>View in Analytics</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Supplementary Mail / Alert Action */}
        <div className="pt-0.5 border-t border-zinc-100 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            Distribution: Maintenance Operations
          </span>
          <button
            type="button"
            onClick={handleEmail}
            disabled={emailing || emailed}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 disabled:text-zinc-400"
          >
            {emailed ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Dispatched to Team</span>
              </>
            ) : (
              <>
                <Mail className="h-3 w-3" />
                <span>{emailing ? 'Sending...' : 'Email to Supervisors'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
