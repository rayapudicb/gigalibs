'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GitBranch,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface WorkflowExecutionCardProps {
  workflowId?: string;
  workflowName?: string;
  runId?: string;
  currentStep?: string;
  stepIndex?: number;
  totalSteps?: number;
}

export function WorkflowExecutionCard({
  workflowId = 'WF-PUMP-OVERHAUL-09',
  workflowName = 'Critical Asset Preventative Overhaul Pipeline',
  runId = 'RUN-2026-8812',
  currentStep = 'Vibration Telemetry Verification & LOTO Clearance',
  stepIndex = 3,
  totalSteps = 5,
}: WorkflowExecutionCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'RUNNING' | 'PAUSED'>('RUNNING');

  const togglePause = () => {
    setStatus((prev) => (prev === 'RUNNING' ? 'PAUSED' : 'RUNNING'));
  };

  const handleOpenCanvas = () => {
    router.push(`/workflows/${workflowId}/canvas`);
  };

  const progressPct = Math.round((stepIndex / totalSteps) * 100);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{runId}</span>
              <span className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                status === 'RUNNING' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {status}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{workflowName}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>Step {stepIndex} of {totalSteps}</div>
          <div className="text-[10px] text-zinc-400">{progressPct}% Complete</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 mb-1">
            <span>Active Step: <strong className="text-zinc-900">{currentStep}</strong></span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Step checkpoints preview */}
        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-center">
          <div className="rounded bg-emerald-50 border border-emerald-100 p-1 text-emerald-700 font-semibold">1. Trigger Scada</div>
          <div className="rounded bg-emerald-50 border border-emerald-100 p-1 text-emerald-700 font-semibold">2. Safety Check</div>
          <div className="rounded bg-indigo-50 border border-indigo-200 p-1 text-indigo-800 font-bold">3. Telemetry Log</div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99]"
          >
            {status === 'RUNNING' ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Pause Execution</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Resume Pipeline</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenCanvas}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open in Workflow Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
