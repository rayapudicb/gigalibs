'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Send,
  CheckCircle2,
  PhoneCall,
  MessageSquare,
  Volume2,
  ShieldAlert,
  ArrowUpRight,
  Users,
} from 'lucide-react';
import { Badge, Button } from '@medusajs/ui';

interface EmergencyAlertCardProps {
  title?: string;
  targetZone?: string;
  recipientCount?: number;
  initialMessage?: string;
  assetTag?: string;
}

export function EmergencyAlertCard({
  title = 'Floor Safety & Equipment Alert Dispatch',
  targetZone = 'Zone B — Unit A Milling Bay',
  recipientCount = 14,
  initialMessage = 'CRITICAL ALERT: Slurry Pump P-204B drive bearing temperature spike (Alarm #ALM-9912). Clear drive perimeter and confirm LOTO clearance with shift lead.',
  assetTag = 'P-204B',
}: EmergencyAlertCardProps) {
  const router = useRouter();
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [paEnabled, setPaEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [message, setMessage] = useState(initialMessage);
  const [dispatching, setDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);

  const handleDispatch = () => {
    setDispatching(true);
    setTimeout(() => {
      setDispatching(false);
      setDispatched(true);
    }, 700);
  };

  const handleOpenCommunications = () => {
    router.push('/communications');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-xs transition-all hover:border-red-300">
      {/* Warning Header Banner */}
      <div className="flex items-start justify-between border-b border-red-100 bg-red-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shadow-xs">
            <ShieldAlert className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-red-900">
                P1-EMERGENCY
              </span>
              <span className="rounded bg-red-200/80 px-1.5 py-0.2 text-[10px] font-mono font-bold text-red-950">
                ASSET: {assetTag}
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-900 mt-0.5">
              {title}
            </h4>
          </div>
        </div>

        <div className="text-right text-[11px] font-mono text-red-800">
          <div className="flex items-center gap-1 justify-end">
            <Users className="h-3 w-3 text-red-700" />
            <span>{recipientCount} Techs</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{targetZone}</div>
        </div>
      </div>

      {/* Broadcast Channels & Message Preview */}
      <div className="p-3.5 space-y-3">
        {/* Channel Selection Checkboxes */}
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/70 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Dispatch Channels (Omnichannel TextFly)
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
              />
              <MessageSquare className="h-3.5 w-3.5 text-zinc-600" />
              <span>SMS Broadcast (TextFly)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={paEnabled}
                onChange={(e) => setPaEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
              />
              <Volume2 className="h-3.5 w-3.5 text-zinc-600" />
              <span>Floor PA Speaker</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
              />
              <PhoneCall className="h-3.5 w-3.5 text-zinc-600" />
              <span>Mobile Push</span>
            </label>
          </div>
        </div>

        {/* Message Content Area */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 block">
            Broadcast Payload
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-800 font-mono shadow-xs focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          />
        </div>

        {/* Action Buttons (HITL Confirmation) */}
        <div className="pt-1">
          {dispatched ? (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold">
                  Emergency broadcast dispatched to {recipientCount} floor devices.
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenCommunications}
                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Track Receipts ↗
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDispatch}
                disabled={dispatching || (!smsEnabled && !paEnabled && !pushEnabled)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{dispatching ? 'Broadcasting...' : 'Confirm & Blast Alert'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCommunications}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
              >
                <span>Open Communications Hub</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
