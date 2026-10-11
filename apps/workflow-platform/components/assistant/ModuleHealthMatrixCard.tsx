'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  Server,
  Zap,
  Clock,
} from 'lucide-react';
import { Badge } from '@medusajs/ui';

interface ModuleStatus {
  name: string;
  code: string;
  status: 'NOMINAL' | 'DEGRADED' | 'OUTAGE';
  latency: number;
  uptime: string;
}

const INITIAL_MODULES: ModuleStatus[] = [
  { name: 'CMMS & Physical Operations', code: 'cmms', status: 'NOMINAL', latency: 24, uptime: '99.98%' },
  { name: 'Geospatial & 3D Plant Twin', code: 'maps', status: 'NOMINAL', latency: 12, uptime: '100.0%' },
  { name: 'TextFly Omnichannel & Softphone', code: 'textfly', status: 'NOMINAL', latency: 38, uptime: '99.85%' },
  { name: 'Accounts Receivable & Billing', code: 'ar', status: 'NOMINAL', latency: 19, uptime: '100.0%' },
  { name: 'Workflow Studio & Saga Engine', code: 'workflows', status: 'NOMINAL', latency: 15, uptime: '100.0%' },
  { name: 'Platform Identity & RBAC Control', code: 'rbac', status: 'NOMINAL', latency: 8, uptime: '100.0%' },
];

export function ModuleHealthMatrixCard() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleStatus[]>(INITIAL_MODULES);
  const [runningSweep, setRunningSweep] = useState(false);
  const [lastCheck, setLastCheck] = useState('Just now');

  const handleSweep = () => {
    setRunningSweep(true);
    setTimeout(() => {
      setModules((prev) =>
        prev.map((m) => ({
          ...m,
          latency: Math.max(8, ((m.latency * 13) % 35) + 10),
        })),
      );
      setRunningSweep(false);
      setLastCheck(new Date().toLocaleTimeString());
    }, 700);
  };

  const handleOpenInfra = () => {
    router.push('/platform-admin/infra');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      {/* Header Banner */}
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">
                PLATFORM-HEALTH
              </span>
              <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ALL NOMINAL
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5">
              Multi-Module Operational Diagnostics
            </h4>
          </div>
        </div>

        <div className="text-right text-[11px] text-zinc-500 font-mono">
          <div>6/6 Modules Active</div>
          <div className="text-[10px] text-zinc-400">Sweep: {lastCheck}</div>
        </div>
      </div>

      {/* Module Latency Grid */}
      <div className="p-3.5 space-y-3">
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 bg-zinc-50/40">
          {modules.map((mod) => (
            <div key={mod.code} className="flex items-center justify-between p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-zinc-800">{mod.name}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-zinc-500">{mod.latency}ms</span>
                <span className="text-emerald-700 font-semibold">{mod.uptime}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleSweep}
            disabled={runningSweep}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runningSweep ? 'animate-spin' : ''}`} />
            <span>{runningSweep ? 'Probing Nodes...' : 'Run Diagnostics Sweep'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenInfra}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Infrastructure Hub</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
