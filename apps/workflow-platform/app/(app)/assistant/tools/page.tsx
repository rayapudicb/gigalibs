'use client';

import React, { useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Zap,
  Package,
  Layers,
  Search,
  Filter,
  Check,
  X,
  Lock,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { Badge, Button, StatusBadge, toast } from '@medusajs/ui';

interface ToolItem {
  id: string;
  name: string;
  module: string;
  description: string;
  mode: 'READ_ONLY' | 'WRITE_HITL' | 'WRITE_AUTONOMOUS';
  status: 'ACTIVE' | 'DISABLED';
  permission: string;
  generativeUI: boolean;
}

const INITIAL_TOOLS: ToolItem[] = [
  {
    id: 'daily_inspections',
    name: 'CMMS Daily Inspections & Checklists',
    module: 'Physical Operations (CMMS)',
    description: 'Retrieves unit inspection tasks, equipment statuses, and renders interactive generative UI checklist cards.',
    mode: 'WRITE_HITL',
    status: 'ACTIVE',
    permission: 'cmms:inspections:read',
    generativeUI: true,
  },
  {
    id: 'plant_downtimes',
    name: 'Equipment Downtime Analyzer',
    module: 'Physical Operations (CMMS)',
    description: 'Queries live and historical equipment downtimes, MTBF/MTTR metrics, and active stoppage root causes.',
    mode: 'READ_ONLY',
    status: 'ACTIVE',
    permission: 'cmms:analytics:read',
    generativeUI: true,
  },
  {
    id: 'smart_meter_telemetry',
    name: '24h Energy & Power Telemetry',
    module: 'Smart Facilities / IoT',
    description: 'Streams power consumption, peak load kW, power factor, and voltage variance from floor sub-meters.',
    mode: 'READ_ONLY',
    status: 'ACTIVE',
    permission: 'facilities:meters:read',
    generativeUI: true,
  },
  {
    id: 'cmms_work_orders',
    name: 'Work Order Management & Dispatch',
    module: 'Physical Operations (CMMS)',
    description: 'Generates preventive and corrective work orders for maintenance technicians upon vibration/heat triggers.',
    mode: 'WRITE_HITL',
    status: 'ACTIVE',
    permission: 'cmms:work_orders:manage',
    generativeUI: false,
  },
  {
    id: 'inventory_mro_check',
    name: 'MRO Storeroom Inventory & Spares',
    module: 'Universal Inventory',
    description: 'Checks stock quantities, bin locations, lead times, and reserve quantities for maintenance spare parts.',
    mode: 'READ_ONLY',
    status: 'ACTIVE',
    permission: 'inventory:stock:read',
    generativeUI: false,
  },
  {
    id: 'procurement_po_draft',
    name: 'Automated Replenishment PO Drafting',
    module: 'Universal Procurement',
    description: 'Drafts purchase orders for low-stock critical spares and routes them to authorized procurement managers.',
    mode: 'WRITE_HITL',
    status: 'ACTIVE',
    permission: 'procurement:po:create',
    generativeUI: false,
  },
  {
    id: 'workforce_dispatch',
    name: 'Workforce Shift & Skill Matcher',
    module: 'GigaOps Workforce',
    description: 'Finds qualified certified technicians available for urgent plant repairs based on active shift schedules.',
    mode: 'READ_ONLY',
    status: 'ACTIVE',
    permission: 'workforce:scheduling:read',
    generativeUI: false,
  },
];

export default function AssistantToolsPage() {
  const [tools, setTools] = useState<ToolItem[]>(INITIAL_TOOLS);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const filteredTools = tools.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.module.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = moduleFilter === 'ALL' || t.module.includes(moduleFilter);
    return matchesSearch && matchesModule;
  });

  const toggleToolStatus = (id: string) => {
    setTools((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } : t
      )
    );
    toast.info('Tool Status Updated', {
      description: 'Changes will apply to the sovereign assistant runtime immediately.',
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ui-bg-subtle/40 p-4 md:p-6 pb-16">
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ui-fg-base">
                  Operational Tool Allowlist
                </h1>
                <Badge color="green" size="small">
                  {tools.filter((t) => t.status === 'ACTIVE').length} ACTIVE TOOLS
                </Badge>
                <StatusBadge color="blue">RBAC ENFORCED</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-ui-fg-muted">
                Multi-tenant deterministic functions available to the GigaLibs Assistant across CMMS, Inventory, and Telemetry.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setTools(INITIAL_TOOLS);
              toast.info('Allowlist Reset', { description: 'All default tools restored.' });
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </header>

      {/* Filter / Search Bar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ui-fg-muted" />
          <input
            type="text"
            placeholder="Search tools by name, module, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-ui-fg-muted" />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
          >
            <option value="ALL">All Operational Modules</option>
            <option value="CMMS">Physical Operations (CMMS)</option>
            <option value="Inventory">Universal Inventory</option>
            <option value="Procurement">Universal Procurement</option>
            <option value="IoT">Smart Facilities / IoT</option>
            <option value="Workforce">GigaOps Workforce</option>
          </select>
        </div>
      </div>

      {/* Tools Table / Card List */}
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ui-bg-subtle border-b border-ui-border-base text-ui-fg-muted uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Tool Name & Function</th>
                <th className="px-4 py-3">Domain Module</th>
                <th className="px-4 py-3">Execution Sandbox</th>
                <th className="px-4 py-3">Generative UI</th>
                <th className="px-4 py-3">Required Permission</th>
                <th className="px-4 py-3 text-right">Status & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-subtle">
              {filteredTools.map((tool) => (
                <tr key={tool.id} className="hover:bg-ui-bg-subtle/50 transition-colors">
                  <td className="px-4 py-3.5 max-w-xs">
                    <div className="font-semibold text-ui-fg-base flex items-center gap-1.5">
                      <span className="font-mono text-xs">{tool.name}</span>
                    </div>
                    <div className="text-[11px] text-ui-fg-muted mt-0.5 line-clamp-2">
                      {tool.description}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-ui-fg-subtle font-medium">
                      <Layers className="h-3.5 w-3.5 text-ui-fg-muted" /> {tool.module}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {tool.mode === 'READ_ONLY' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-ui-tag-neutral-bg px-2 py-0.5 text-[11px] font-medium text-ui-fg-subtle border border-ui-border-base">
                        Read-Only Auto
                      </span>
                    )}
                    {tool.mode === 'WRITE_HITL' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-ui-tag-neutral-bg px-2 py-0.5 text-[11px] font-medium text-ui-fg-interactive border border-ui-border-interactive">
                        <Lock className="h-3 w-3" /> Write (HITL Confirm)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {tool.generativeUI ? (
                      <Badge color="green" size="small">
                        INTERACTIVE CARD
                      </Badge>
                    ) : (
                      <span className="text-ui-fg-muted text-[11px]">Markdown / Text</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-ui-fg-muted">
                    {tool.permission}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => toggleToolStatus(tool.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        tool.status === 'ACTIVE'
                          ? 'bg-ui-tag-neutral-bg text-ui-fg-interactive hover:bg-ui-bg-subtle-hover border border-ui-border-interactive'
                          : 'bg-ui-bg-subtle text-ui-fg-muted hover:bg-ui-bg-subtle-hover border border-ui-border-base'
                      }`}
                    >
                      {tool.status === 'ACTIVE' ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Enabled
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" /> Disabled
                        </>
                      )}
                    </button>
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
