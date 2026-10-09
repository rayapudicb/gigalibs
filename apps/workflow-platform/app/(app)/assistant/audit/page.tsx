'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  FileCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Cpu,
  Database,
  Lock,
  Download,
  Terminal,
} from 'lucide-react';
import { Badge, Button, StatusBadge } from '@medusajs/ui';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  promptSummary: string;
  toolInvoked: string;
  egressBytes: number;
  durationMs: number;
  status: 'COMMITTED' | 'CONFIRMED' | 'REJECTED';
}

const SAMPLE_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-8921-a',
    timestamp: '2026-10-09 10:28:14 UTC',
    user: 'newuser@gigalibs.io',
    role: 'OPERATIONS_SUPERVISOR',
    promptSummary: 'Tell me my todays daily inspection tasks in unit abc',
    toolInvoked: 'render_daily_inspection_checklist',
    egressBytes: 0,
    durationMs: 42,
    status: 'COMMITTED',
  },
  {
    id: 'aud-8920-b',
    timestamp: '2026-10-09 10:14:02 UTC',
    user: 'newuser@gigalibs.io',
    role: 'OPERATIONS_SUPERVISOR',
    promptSummary: 'Get me the downtimes for all the equipments in the plant',
    toolInvoked: 'plant_downtimes',
    egressBytes: 0,
    durationMs: 38,
    status: 'COMMITTED',
  },
  {
    id: 'aud-8919-c',
    timestamp: '2026-10-09 09:55:20 UTC',
    user: 'floor.tech@gigalibs.io',
    role: 'WORKFORCE_MEMBER',
    promptSummary: 'Total electricity consumption of the last 24 hrs',
    toolInvoked: 'smart_meter_telemetry',
    egressBytes: 0,
    durationMs: 29,
    status: 'COMMITTED',
  },
  {
    id: 'aud-8918-d',
    timestamp: '2026-10-09 09:22:45 UTC',
    user: 'supervisor@gigalibs.io',
    role: 'OPERATIONS_SUPERVISOR',
    promptSummary: 'Generate work order for motor vibration exceeding 4.2 mm/s',
    toolInvoked: 'cmms_work_orders',
    egressBytes: 0,
    durationMs: 84,
    status: 'CONFIRMED',
  },
  {
    id: 'aud-8917-e',
    timestamp: '2026-10-09 08:41:10 UTC',
    user: 'storekeeper@gigalibs.io',
    role: 'WORKFORCE_MEMBER',
    promptSummary: 'Check inventory for transformer parts and bushings',
    toolInvoked: 'inventory_mro_check',
    egressBytes: 0,
    durationMs: 31,
    status: 'COMMITTED',
  },
];

export default function AssistantAuditPage() {
  const [logs] = useState<AuditLogEntry>(SAMPLE_LOGS as any);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = SAMPLE_LOGS.filter(
    (l) =>
      l.promptSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.toolInvoked.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-ui-bg-subtle/40 p-4 md:p-6 pb-16">
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ui-fg-base">
                  Agent Telemetry & Audit Logs
                </h1>
                <Badge color="green" size="small">
                  AIR-GAPPED
                </Badge>
                <StatusBadge color="green">0 BYTES EGRESS</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-ui-fg-muted">
                Immutable record of prompt executions, tool invocations, and zero-egress cryptographic verification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="small" onClick={() => alert('Audit logs exported as CSV.')}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Audit CSV
          </Button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ui-fg-muted">
            External Telemetry Egress
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ui-fg-interactive">0 Bytes</span>
            <span className="text-[11px] text-ui-fg-muted">(100% Sovereign)</span>
          </div>
        </div>

        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ui-fg-muted">
            Inference Protocol
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-ui-fg-base">Same-Origin SSE</span>
          </div>
        </div>

        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ui-fg-muted">
            Average Tool Latency
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ui-fg-base">44.8 ms</span>
          </div>
        </div>

        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ui-fg-muted">
            Security Isolation
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-ui-fg-base">PostgreSQL RLS</span>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ui-fg-muted" />
          <input
            type="text"
            placeholder="Search audit events by user, tool, or prompt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ui-bg-subtle border-b border-ui-border-base text-ui-fg-muted uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp & ID</th>
                <th className="px-4 py-3">User & Persona</th>
                <th className="px-4 py-3">Operational Prompt</th>
                <th className="px-4 py-3">Tool Invocations</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3">Egress Traffic</th>
                <th className="px-4 py-3 text-right">Commit State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-subtle">
              {filteredLogs.map((entry) => (
                <tr key={entry.id} className="hover:bg-ui-bg-subtle/50 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-mono text-[11px] text-ui-fg-base">{entry.timestamp}</div>
                    <div className="font-mono text-[10px] text-ui-fg-muted">{entry.id}</div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-medium text-ui-fg-base">{entry.user}</div>
                    <div className="text-[10px] text-ui-fg-muted">{entry.role}</div>
                  </td>
                  <td className="px-4 py-3.5 max-w-xs">
                    <div className="text-ui-fg-base font-medium line-clamp-1">
                      {entry.promptSummary}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-ui-fg-subtle">
                    {entry.toolInvoked}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-ui-fg-muted">
                    {entry.durationMs} ms
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="font-mono font-semibold text-ui-fg-interactive">
                      {entry.egressBytes} B
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <Badge color="green" size="small">
                      {entry.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
