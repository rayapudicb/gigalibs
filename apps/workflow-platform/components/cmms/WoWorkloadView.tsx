'use client';

import React from 'react';
import { Badge, Button, Container, Heading, StatusBadge, Text } from '@medusajs/ui';
import { Users, AlertTriangle, Clock, CheckCircle2, UserCheck, Flame } from 'lucide-react';
import type { CmmsWorkOrder } from '@/lib/cmms-api';

interface TechnicianWorkload {
  name: string;
  role: string;
  utilization: number;
  wos: CmmsWorkOrder[];
}

interface Props {
  workOrders: CmmsWorkOrder[];
  onSelectWo: (wo: CmmsWorkOrder) => void;
  onCreateWo: () => void;
}

export default function WoWorkloadView({
  workOrders,
  onSelectWo,
  onCreateWo,
}: Props) {
  // Pre-seeded technician profiles
  const technicians = [
    { name: 'Marcus Vance', role: 'Lead Millwright', targetUtilization: 94 },
    { name: 'Elena Rostova', role: 'Electrical Specialist', targetUtilization: 88 },
    { name: 'David Kim', role: 'Instrumentation & SCADA', targetUtilization: 96 },
    { name: 'Carlos Mendez', role: 'Mechanical Technician', targetUtilization: 82 },
  ];

  // Unassigned pool
  const unassignedWos = workOrders.filter((w) => !w.assignedTo || w.assignedTo === 'Unassigned');

  // Technician boards
  const techBoards: TechnicianWorkload[] = technicians.map((t) => ({
    name: t.name,
    role: t.role,
    utilization: t.targetUtilization,
    wos: workOrders.filter((w) => w.assignedTo && w.assignedTo.toLowerCase().includes(t.name.toLowerCase().split(' ')[0]!)),
  }));

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 border border-purple-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              Technician Capacity & Dispatch Workload
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Real-time resource allocation, wrench-time balance, and active ticket distribution
            </Text>
          </div>
        </div>

        <Button variant="primary" size="small" onClick={onCreateWo} className="h-8 text-xs font-semibold">
          + Dispatch Work Order
        </Button>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-5 gap-4 items-start">
        {/* Unassigned Pool Column */}
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-2">
            <div>
              <span className="font-bold text-xs text-ui-fg-base">Unassigned Queue</span>
              <p className="text-[10px] text-ui-fg-muted">Awaiting Dispatch</p>
            </div>
            <Badge size="small" color={unassignedWos.length > 0 ? 'orange' : 'grey'}>
              {unassignedWos.length}
            </Badge>
          </div>

          <div className="space-y-2.5 min-h-[300px]">
            {unassignedWos.length === 0 ? (
              <div className="py-12 text-center text-[11px] text-ui-fg-muted border border-dashed border-ui-border-base rounded-lg">
                No unassigned tickets
              </div>
            ) : (
              unassignedWos.map((wo) => renderWoCard(wo, onSelectWo))
            )}
          </div>
        </div>

        {/* Technician Columns */}
        {techBoards.map((tech) => (
          <div key={tech.name} className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3 space-y-3">
            <div className="border-b border-ui-border-base pb-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-ui-fg-base truncate">{tech.name}</span>
                <Badge
                  size="small"
                  color={tech.utilization >= 90 ? 'orange' : 'green'}
                  className="text-[10px] font-mono"
                >
                  {tech.utilization}%
                </Badge>
              </div>
              <p className="text-[10px] text-ui-fg-subtle truncate">{tech.role}</p>

              {/* Utilization Bar */}
              <div className="h-1.5 w-full bg-ui-bg-base rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    tech.utilization >= 90 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${tech.utilization}%` }}
                />
              </div>
            </div>

            <div className="space-y-2.5 min-h-[300px]">
              {tech.wos.length === 0 ? (
                <div className="py-12 text-center text-[11px] text-ui-fg-muted border border-dashed border-ui-border-base rounded-lg">
                  No active work orders
                </div>
              ) : (
                tech.wos.map((wo) => renderWoCard(wo, onSelectWo))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderWoCard(wo: CmmsWorkOrder, onSelectWo: (wo: CmmsWorkOrder) => void) {
  const isEmerg = wo.priority === 'EMERGENCY';
  const isHigh = wo.priority === 'HIGH';

  return (
    <div
      key={wo.id}
      onClick={() => onSelectWo(wo)}
      className={`p-3 rounded-lg border bg-ui-bg-base cursor-pointer transition-all hover:shadow-md hover:border-ui-fg-muted text-xs space-y-2 ${
        isEmerg
          ? 'border-rose-500/40 bg-rose-500/5'
          : isHigh
          ? 'border-amber-500/40'
          : 'border-ui-border-base'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-ui-fg-muted font-bold">
          {wo.woNumber}
        </span>
        <Badge
          size="small"
          color={isEmerg ? 'orange' : isHigh ? 'orange' : 'blue'}
          className="text-[10px]"
        >
          {wo.priority}
        </Badge>
      </div>

      <h4 className="font-semibold text-xs text-ui-fg-base line-clamp-2">
        {wo.title}
      </h4>

      <div className="flex items-center justify-between pt-1 border-t border-ui-border-base/50 text-[10px] text-ui-fg-subtle">
        <span className="capitalize font-medium text-ui-fg-muted">{wo.type.toLowerCase()}</span>
        <StatusBadge
          color={
            wo.status === 'COMPLETED'
              ? 'green'
              : wo.status === 'IN_PROGRESS'
              ? 'blue'
              : 'orange'
          }
        >
          {wo.status}
        </StatusBadge>
      </div>
    </div>
  );
}
