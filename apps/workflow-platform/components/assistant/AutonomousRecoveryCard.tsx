'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  CheckCircle2,
  RefreshCcw,
  ArrowUpRight,
  Zap,
} from 'lucide-react';

interface AutonomousRecoveryCardProps {
  serviceId?: string;
  incidentType?: string;
  actionTaken?: string;
  circuitState?: string;
}

export function AutonomousRecoveryCard({
  serviceId = 'SVC-SCADA-INGEST-01',
  incidentType = 'High Connection Saturation (Circuit Breaker Tripped)',
  actionTaken = 'Auto-diverted telemetry traffic to Standby Redis Cluster',
  circuitState = 'HALF-OPEN (PROBING)',
}: AutonomousRecoveryCardProps) {
  const router = useRouter();
  const [reset, setReset] = useState(false);

  const handleReset = () => {
    setReset(true);
  };

  const handleOpenRecovery = () => {
    router.push('/recovery');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{serviceId}</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-800">
                {reset ? 'CLOSED (NORMAL)' : circuitState}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">Autonomous Self-Healing Policy</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>Failover: 120ms</div>
          <div className="text-[10px] text-zinc-400">Zero Ingestion Loss</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs text-zinc-700">
          <div className="font-semibold text-zinc-900 mb-0.5">{incidentType}</div>
          <div className="text-zinc-500">{actionTaken}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleReset}
            disabled={reset}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {reset ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Circuit Reset Normal</span>
              </>
            ) : (
              <span>Reset Circuit Breaker</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenRecovery}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Recovery Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
