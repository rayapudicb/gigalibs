'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plug,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  Activity,
} from 'lucide-react';

interface ConnectorIntegrationCardProps {
  connectorName?: string;
  protocol?: string;
  status?: string;
  throughput?: string;
}

export function ConnectorIntegrationCard({
  connectorName = 'SAP S/4HANA OData & RFC Connector',
  protocol = 'OData v4 / TLS 1.3 Mutually Authenticated',
  status = 'CONNECTED (HEALTHY)',
  throughput = '4,200 events/sec',
}: ConnectorIntegrationCardProps) {
  const router = useRouter();
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setTested(true);
    }, 600);
  };

  const handleOpenConnectors = () => {
    router.push('/connectors');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">CONN-SAP-ERP</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-800">
                {status}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{connectorName}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-zinc-900">{throughput}</div>
          <div className="text-[10px] text-zinc-400">Latency: 18ms</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs text-zinc-700 flex items-center justify-between">
          <span className="text-zinc-500">Protocol Binding:</span>
          <span className="font-mono text-[11px] font-bold text-zinc-800">{protocol}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {tested ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Ping Verified (18ms)</span>
              </>
            ) : (
              <>
                <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testing...' : 'Test Ping Connection'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenConnectors}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Connector Hub</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
