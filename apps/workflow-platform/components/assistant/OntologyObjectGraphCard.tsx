'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Network,
  CheckCircle2,
  ArrowUpRight,
  Share2,
  Cpu,
} from 'lucide-react';

interface OntologyObjectGraphCardProps {
  entityType?: string;
  entityId?: string;
  connectedLinksCount?: number;
}

export function OntologyObjectGraphCard({
  entityType = 'PUMP_EQUIPMENT',
  entityId = 'PUMP-FP-101',
  connectedLinksCount = 6,
}: OntologyObjectGraphCardProps) {
  const router = useRouter();
  const [synced, setSynced] = useState(false);

  const handleSync = () => {
    setSynced(true);
  };

  const handleOpenOntology = () => {
    router.push('/ontology');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 border border-cyan-500/20">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{entityId}</span>
              <span className="rounded bg-cyan-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-cyan-800">
                {entityType}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">Enterprise Ontology Knowledge Graph</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>{connectedLinksCount} Graph Edges</div>
          <div className="text-[10px] text-zinc-400">Object Semantics</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs text-zinc-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-zinc-500">Linked Objects:</span>
            <span className="font-mono text-[11px] text-cyan-700 font-bold">LOTO Permit • SCADA Node • Storeroom Part</span>
          </div>
          <div className="text-[11px] text-zinc-500">Ontology schema bidirectional sync verified.</div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={synced}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {synced ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Graph Edge Synced</span>
              </>
            ) : (
              <span>Re-index Object Links</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenOntology}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Ontology Graph</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
