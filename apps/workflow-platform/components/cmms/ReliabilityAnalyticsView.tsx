'use client';

import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
} from '@medusajs/ui';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  PieChart,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Wrench,
} from 'lucide-react';
import type { CmmsReliabilityMetrics } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

export default function ReliabilityAnalyticsView() {
  const [metrics, setMetrics] = useState<CmmsReliabilityMetrics>({
    overallMtbfHours: 840,
    overallMttrHours: 2.8,
    overallAvailabilityPercent: 98.4,
    ravRatioPercent: 2.4,
    mtbfTrend: [
      { month: 'Apr', mtbfHours: 680, targetHours: 800 },
      { month: 'May', mtbfHours: 720, targetHours: 800 },
      { month: 'Jun', mtbfHours: 790, targetHours: 800 },
      { month: 'Jul', mtbfHours: 740, targetHours: 800 },
      { month: 'Aug', mtbfHours: 820, targetHours: 800 },
      { month: 'Sep', mtbfHours: 840, targetHours: 800 },
    ],
    paretoFailureModes: [
      { mode: 'Bearing Wear & Lubrication Breakdown', count: 18, cumulativePercent: 44, costImpact: 28400 },
      { mode: 'Hydraulic Seal Blown / Fluid Leak', count: 11, cumulativePercent: 71, costImpact: 19800 },
      { mode: 'Electrical Overload / VFD Trip', count: 6, cumulativePercent: 86, costImpact: 9400 },
      { mode: 'Impeller Cavitation & Slurry Abrasion', count: 4, cumulativePercent: 96, costImpact: 14200 },
      { mode: 'Sensor Signal Drift / Instrument Fault', count: 2, cumulativePercent: 100, costImpact: 1800 },
    ],
    technicianUtilization: [
      { name: 'Marcus Vance', activeWos: 2, completedWos: 14, utilizationPercent: 94 },
      { name: 'Elena Rostova', activeWos: 1, completedWos: 11, utilizationPercent: 88 },
      { name: 'David Kim', activeWos: 1, completedWos: 16, utilizationPercent: 96 },
      { name: 'Carlos Mendez', activeWos: 2, completedWos: 8, utilizationPercent: 82 },
    ],
  });

  useEffect(() => {
    requestCmms<CmmsReliabilityMetrics>('analytics/reliability')
      .then((res) => {
        if (res) setMetrics(res);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Headline Banners */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Container className="p-4 bg-ui-bg-base border border-ui-border-base space-y-1">
          <div className="flex items-center justify-between text-ui-fg-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Overall Plant Availability</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-mono text-emerald-500">{metrics.overallAvailabilityPercent}%</p>
            <span className="text-xs text-emerald-600 font-semibold flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5" /> +0.6%
            </span>
          </div>
          <p className="text-[11px] text-ui-fg-subtle">World-class benchmark &gt; 95%</p>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base space-y-1">
          <div className="flex items-center justify-between text-ui-fg-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Plant MTBF</span>
            <Activity className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-mono text-ui-fg-base">{metrics.overallMtbfHours}</p>
            <span className="text-xs text-ui-fg-subtle">operating hours</span>
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold">Exceeding 800h annual target</p>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base space-y-1">
          <div className="flex items-center justify-between text-ui-fg-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Plant MTTR</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-mono text-ui-fg-base">{metrics.overallMttrHours}</p>
            <span className="text-xs text-ui-fg-subtle">hours to restore</span>
          </div>
          <p className="text-[11px] text-ui-fg-subtle">Mean Time To Repair</p>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base space-y-1">
          <div className="flex items-center justify-between text-ui-fg-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Maintenance / RAV Ratio</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-mono text-ui-fg-base">{metrics.ravRatioPercent}%</p>
            <span className="text-xs text-ui-fg-subtle">of replacement value</span>
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold">Under 3.0% best-practice cap</p>
        </Container>
      </div>

      {/* Charts & Pareto Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MTBF Trend Breakdown */}
        <Container className="p-5 bg-ui-bg-base border border-ui-border-base space-y-4">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
            <div>
              <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                Mean Time Between Failures (MTBF) 6-Month Trend
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Progressive reliability gains from predictive SCADA vibration triggers.
              </Text>
            </div>
            <Badge size="small" color="green">TARGET: 800H</Badge>
          </div>

          <div className="space-y-3 pt-2">
            {metrics.mtbfTrend.map((t) => {
              const pct = Math.min(100, Math.round((t.mtbfHours / 1000) * 100));
              const targetPct = Math.round((t.targetHours / 1000) * 100);

              return (
                <div key={t.month} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-ui-fg-base font-mono">{t.month} 2026</span>
                    <span className="font-mono text-ui-fg-base font-bold">
                      {t.mtbfHours} hrs <span className="text-[10px] text-ui-fg-muted font-normal">(Target: {t.targetHours}h)</span>
                    </span>
                  </div>
                  <div className="w-full bg-ui-border-base h-2 rounded-full relative overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        t.mtbfHours >= t.targetHours ? 'bg-emerald-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                      style={{ left: `${targetPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Container>

        {/* Pareto 80/20 Failure Mode Breakdown */}
        <Container className="p-5 bg-ui-bg-base border border-ui-border-base space-y-4">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
            <div>
              <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                Pareto 80/20 Root Cause Failure Modes
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Cumulative percentage and financial impact of top equipment failure drivers.
              </Text>
            </div>
            <Badge size="small" color="orange">PARETO 80/20</Badge>
          </div>

          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Failure Mechanism</Table.HeaderCell>
                <Table.HeaderCell>Events</Table.HeaderCell>
                <Table.HeaderCell>Cumulative %</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Cost Impact</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {metrics.paretoFailureModes.map((p) => (
                <Table.Row key={p.mode}>
                  <Table.Cell className="font-medium text-xs text-ui-fg-base truncate max-w-[200px]">
                    {p.mode}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-base">{p.count}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 bg-ui-border-base h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${p.cumulativePercent <= 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${p.cumulativePercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-ui-fg-subtle">{p.cumulativePercent}%</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs font-bold text-right text-ui-fg-base">
                    ${p.costImpact.toLocaleString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>

      {/* Technician Workload & Shift Utilization */}
      <Container className="p-5 bg-ui-bg-base border border-ui-border-base space-y-4">
        <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
          <div>
            <Heading level="h3" className="text-base font-semibold text-ui-fg-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              Technician Capacity, Wrench Time & Shift Utilization
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Live workload distribution across mechanical, electrical, and hydraulic field specialists.
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {metrics.technicianUtilization.map((tech) => (
            <div
              key={tech.name}
              className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-ui-fg-base">{tech.name}</span>
                <Badge size="small" color={tech.utilizationPercent >= 90 ? 'orange' : 'green'}>
                  {tech.utilizationPercent}%
                </Badge>
              </div>

              <div className="w-full bg-ui-border-base h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${tech.utilizationPercent >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${tech.utilizationPercent}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-ui-fg-subtle font-mono pt-1">
                <span>Active: <strong className="text-ui-fg-base">{tech.activeWos}</strong></span>
                <span>Completed: <strong className="text-ui-fg-base">{tech.completedWos}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
