'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Compass,
  ArrowUpRight,
  Activity,
  Thermometer,
  Gauge,
  Zap,
  ShieldCheck,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
} from 'lucide-react';
import { Badge, StatusBadge, Button } from '@medusajs/ui';

interface SpatialEquipmentCardProps {
  assetTag?: string;
  assetName?: string;
  unit?: string;
  bay?: string;
  status?: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  vibration?: string;
  temperature?: string;
  pressure?: string;
  rpm?: string;
  onNavigate?: () => void;
}

export function SpatialEquipmentCard({
  assetTag = 'PUMP-FP-101',
  assetName = 'Feed Pump FP-101 (High Pressure)',
  unit = 'Unit ABC',
  bay = 'Bay 3',
  status = 'NOMINAL',
  vibration = '1.4 mm/s RMS',
  temperature = '58.4 °C',
  pressure = '14.2 bar',
  rpm = '2,950 RPM',
  onNavigate,
}: SpatialEquipmentCardProps) {
  const router = useRouter();

  const handleFlyTo3D = () => {
    if (onNavigate) {
      onNavigate();
    }
    // Navigate main viewport to 3D plant twin with query param
    router.push(`/maps?view=3d&asset=${encodeURIComponent(assetTag)}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      {/* 3D Wireframe Preview / Header Banner */}
      <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Box className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-wide text-emerald-400">
                  {assetTag}
                </span>
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-300 border border-emerald-500/30">
                  {status}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-slate-100 line-clamp-1 mt-0.5">
                {assetName}
              </h4>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block">
              SPATIAL COORD
            </span>
            <span className="font-mono text-[11px] font-medium text-indigo-200">
              {unit} • {bay}
            </span>
          </div>
        </div>
      </div>

      {/* Telemetry Sensor Metrics Grid */}
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
              <Activity className="h-3 w-3 text-emerald-600" /> Vibration
            </div>
            <div className="mt-1 font-mono text-xs font-bold text-zinc-900">
              {vibration}
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5">ISO 10816 Zone A</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
              <Thermometer className="h-3 w-3 text-orange-600" /> Temperature
            </div>
            <div className="mt-1 font-mono text-xs font-bold text-zinc-900">
              {temperature}
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5">Thresh: &lt; 75.0 °C</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
              <Gauge className="h-3 w-3 text-blue-600" /> Discharge Pressure
            </div>
            <div className="mt-1 font-mono text-xs font-bold text-zinc-900">
              {pressure}
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5">Target: 14.0 bar</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
              <Zap className="h-3 w-3 text-purple-600" /> Motor Speed
            </div>
            <div className="mt-1 font-mono text-xs font-bold text-zinc-900">
              {rpm}
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5">Synchronous 50 Hz</div>
          </div>
        </div>

        {/* Safety & Compliance Verification */}
        <div className="flex items-center justify-between rounded-lg bg-emerald-50/60 border border-emerald-100 px-2.5 py-1.5 text-[11px] text-emerald-800">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Isolation LOTO Barrier Active (#LP-884)</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-700 font-medium">VERIFIED</span>
        </div>

        {/* Primary Agentic Navigation CTA */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleFlyTo3D}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
          >
            <Compass className="h-4 w-4" />
            <span>Fly to 3D Plant Digital Twin</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-80" />
          </button>
          <p className="mt-1 text-center text-[10px] text-zinc-400">
            Transitions main viewport to isometric plant model & locks camera target
          </p>
        </div>
      </div>
    </div>
  );
}
