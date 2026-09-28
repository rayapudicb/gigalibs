'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Container,
  Heading,
  Tabs,
  Text,
} from '@medusajs/ui';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  Clock,
  Coins,
  Cpu,
  CreditCard,
  DollarSign,
  Eye,
  Factory,
  FileCheck2,
  Flame,
  Gauge,
  HardHat,
  Layers,
  Lock,
  MapPin,
  RefreshCw,
  Scale,
  Search,
  Server,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import type { PlatformContextPersona } from '@gigalibs/contracts';
import { workforceApi } from '@/lib/workforce-api';
import { requestCmms } from '@/lib/cmms-api';

export interface ExecutiveControlTowerProps {
  initialPersona?: PlatformContextPersona;
  initialDepartment?: string;
}

interface ExecutiveKpiState {
  // Cash Velocity & DSO
  netRevenueUsd: number;
  monthlyRevenueVelocityUsd: number;
  committedSpendUsd: number;
  dsoDays: number;
  dsoTargetDays: number;
  dsoTrendChangeDays: number;
  arAging: {
    current: number; // 0-30 days
    tier30to60: number; // 31-60 days
    tier60to90: number; // 61-90 days
    over90: number; // 90+ days
  };

  // OEE & Reliability (CMMS)
  oeePercent: number;
  availabilityPercent: number;
  performancePercent: number;
  qualityPercent: number;
  mtbfHours: number;
  mttrHours: number;
  operationalAssetsCount: number;
  maintenanceRatio: {
    preventivePercent: number;
    reactivePercent: number;
  };

  // Universal Workforce & Capacity
  totalWorkforceResources: number;
  activeAllocationsCount: number;
  allocationCoveragePercent: number;
  capabilityCompliancePercent: number;
  onSiteActiveCount: number;
  scheduleConflictsCount: number;

  // Transactional Integrity & Governance
  transactionalIntegrityPercent: number;
  auditLedgerDigest: string;
  verifiedAt: string;
}

export default function ExecutiveControlTower({
  initialPersona = 'C_LEVEL',
  initialDepartment = 'ALL',
}: ExecutiveControlTowerProps) {
  const [activeTab, setActiveTab] = useState<'kpis' | 'cash_velocity' | 'oee_telemetry' | 'workforce_ops' | 'integrity_ledger'>('kpis');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [upstreamErrors, setUpstreamErrors] = useState<string[]>([]);

  const [sourceStatus, setSourceStatus] = useState({
    workforce: false,
    reliability: false,
    accountsReceivable: false,
    integrity: false,
  });

  // Dynamic Metrics State (honest real data with zero synthetic defaults)
  const [kpis, setKpis] = useState<ExecutiveKpiState>({
    netRevenueUsd: 0,
    monthlyRevenueVelocityUsd: 0,
    committedSpendUsd: 0,
    dsoDays: 0,
    dsoTargetDays: 0,
    dsoTrendChangeDays: 0,
    arAging: {
      current: 0,
      tier30to60: 0,
      tier60to90: 0,
      over90: 0,
    },
    oeePercent: 0,
    availabilityPercent: 0,
    performancePercent: 0,
    qualityPercent: 0,
    mtbfHours: 0,
    mttrHours: 0,
    operationalAssetsCount: 0,
    maintenanceRatio: {
      preventivePercent: 0,
      reactivePercent: 0,
    },
    totalWorkforceResources: 0,
    activeAllocationsCount: 0,
    allocationCoveragePercent: 0,
    capabilityCompliancePercent: 0,
    onSiteActiveCount: 0,
    scheduleConflictsCount: 0,
    transactionalIntegrityPercent: 0,
    auditLedgerDigest: '',
    verifiedAt: new Date().toISOString(),
  });

  // Load live telemetry across modules
  const loadExecutiveTelemetry = useCallback(async () => {
    setRefreshing(true);
    const errors: string[] = [];

    try {
      // 1. Fetch real workforce metrics
      let totalResources = 0;
      let activeAllocations = 0;
      let onSiteCount = 0;
      let allocationCoverage = 0;
      let workforceAvailable = false;

      try {
        const workforceResources = await workforceApi.listResources({ pageSize: 1 });
        totalResources = workforceResources.total;
        workforceAvailable = true;
      } catch {
        errors.push('Workforce Telemetry Offline');
      }

      // 2. Fetch real CMMS reliability metrics
      let operationalAssets = 0;
      let mttr = 0;
      let reliabilityAvailable = false;

      try {
        const reliabilityData = await requestCmms<any>('analytics/assets/reliability');
        if (reliabilityData) {
          if (reliabilityData.overallMttrHours) mttr = reliabilityData.overallMttrHours;
          if (reliabilityData.operationalAssetsCount !== undefined) {
            operationalAssets = Number(reliabilityData.operationalAssetsCount);
          }
          reliabilityAvailable = true;
        }
      } catch {
        errors.push('CMMS Reliability Service Unreachable');
      }

      setUpstreamErrors(errors);
      setSourceStatus({
        workforce: workforceAvailable,
        reliability: reliabilityAvailable,
        accountsReceivable: false,
        integrity: false,
      });

      // 5. Update state with real values
      setKpis((prev) => ({
        ...prev,
        totalWorkforceResources: totalResources,
        activeAllocationsCount: activeAllocations,
        onSiteActiveCount: onSiteCount,
        allocationCoveragePercent: allocationCoverage,
        mtbfHours: 0,
        mttrHours: mttr,
        oeePercent: 0,
        availabilityPercent: 0,
        operationalAssetsCount: operationalAssets,
        verifiedAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      console.warn('Executive telemetry sync notice:', err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExecutiveTelemetry();
  }, [loadExecutiveTelemetry]);

  return (
    <div className="space-y-6">
      {/* ── Action Toolbar & Persona Lens Bar ────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl border border-ui-border-base bg-ui-bg-subtle shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="purple" size="small" className="font-mono text-[10px] font-bold">
            ADR-0003 Phase 6
          </Badge>
          <Badge color="blue" size="small" className="font-mono text-[10px]">
            Scope: {initialDepartment === 'ALL' ? 'FLAT_TENANT' : 'SCOPED_DEPARTMENTS'}
          </Badge>
        </div>

        {/* Department & Persona Lens Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope and persona are derived from the verified server session. */}
          <div className="flex items-center gap-1.5 bg-ui-bg-base border border-ui-border-base rounded-lg px-2.5 py-1">
            <Building2 className="w-3.5 h-3.5 text-ui-fg-muted" />
            <span className="text-xs text-ui-fg-base font-semibold">
              Server-enforced organizational scope
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-ui-bg-base border border-ui-border-base rounded-lg px-2.5 py-1">
            <Eye className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs text-ui-fg-base font-semibold">Lens: {initialPersona}</span>
          </div>

          <Button
            variant="secondary"
            size="small"
            onClick={loadExecutiveTelemetry}
            disabled={refreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Sync
          </Button>

          <Button
            variant="secondary"
            size="small"
            disabled
            title="No production action-command API is configured"
            className="gap-1.5 text-xs"
          >
            <Zap className="w-3.5 h-3.5" />
            Levers unavailable
          </Button>
        </div>
      </div>

      {/* Upstream Telemetry Notice if any services are degraded */}
      {upstreamErrors.length > 0 && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Telemetry Notice: {upstreamErrors.join(' · ')}</span>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={loadExecutiveTelemetry}
            className="text-[11px] h-7"
          >
            Retry Sync
          </Button>
        </div>
      )}

      {/* ── 4 Executive Pillars Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pillar 1: Cash Velocity */}
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between text-xs text-ui-fg-muted font-medium uppercase tracking-wider">
              <span>Cash Velocity</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-ui-fg-base font-mono">
                {sourceStatus.accountsReceivable && kpis.monthlyRevenueVelocityUsd > 0
                  ? `$${(kpis.monthlyRevenueVelocityUsd / 1_000_000).toFixed(2)}M`
                  : '—'}
              </span>
              <span className="text-xs font-bold text-ui-fg-muted flex items-center">
                Not measured
              </span>
            </div>
            <Text className="text-[11px] text-ui-fg-subtle mt-1">
              {sourceStatus.accountsReceivable
                ? 'Net operating monthly inflow rate across billing contracts'
                : 'Accounts Receivable aggregate telemetry is not connected'}
            </Text>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-base flex items-center justify-between text-[11px] font-mono text-ui-fg-muted">
            <span>Committed: —</span>
            <span className="text-ui-fg-muted font-semibold">Collections: —</span>
          </div>
        </Container>

        {/* Pillar 2: Days Sales Outstanding (DSO) */}
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between text-xs text-ui-fg-muted font-medium uppercase tracking-wider">
              <span>Days Sales Outstanding</span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-ui-fg-base font-mono">
                {sourceStatus.accountsReceivable && kpis.dsoDays > 0 ? `${kpis.dsoDays} days` : '—'}
              </span>
              <span className="text-xs font-bold text-emerald-600 flex items-center">
                Not measured
              </span>
            </div>
            <Text className="text-[11px] text-ui-fg-subtle mt-1">
              DSO requires reconciled receivables and period sales from the AR aggregate API.
            </Text>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-base flex items-center justify-between text-[11px] font-mono text-ui-fg-muted">
            <span>0-30d: —</span>
            <span className="text-ui-fg-muted font-semibold">&gt;60d: —</span>
          </div>
        </Container>

        {/* Pillar 3: OEE (Overall Equipment Effectiveness) */}
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between text-xs text-ui-fg-muted font-medium uppercase tracking-wider">
              <span>Equipment OEE</span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-ui-fg-base font-mono">
                {kpis.oeePercent > 0 ? `${kpis.oeePercent}%` : '—'}
              </span>
              <Badge color="grey" size="small" className="text-[10px] font-mono">
                OEE unavailable
              </Badge>
            </div>
            <Text className="text-[11px] text-ui-fg-subtle mt-1">
              {kpis.oeePercent > 0
                ? `Availability (${kpis.availabilityPercent}%) × Performance (${kpis.performancePercent}%) × Quality (${kpis.qualityPercent}%)`
                : 'Performance and quality production facts are not connected'}
            </Text>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-base flex items-center justify-between text-[11px] font-mono text-ui-fg-muted">
            <span>MTBF: {kpis.mtbfHours > 0 ? `${kpis.mtbfHours}h` : '—'}</span>
            <span className="text-purple-600 font-semibold">MTTR: {kpis.mttrHours > 0 ? `${kpis.mttrHours}h` : '—'}</span>
          </div>
        </Container>

        {/* Pillar 4: Universal Workforce Capacity */}
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between text-xs text-ui-fg-muted font-medium uppercase tracking-wider">
              <span>Workforce & Accreditation</span>
              <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-ui-fg-base font-mono">
                {sourceStatus.workforce ? `${kpis.allocationCoveragePercent}%` : '—'}
              </span>
              <Badge color={sourceStatus.workforce ? 'blue' : 'grey'} size="small" className="text-[10px] font-mono">
                {sourceStatus.workforce ? 'Live counts' : 'Unavailable'}
              </Badge>
            </div>
            <Text className="text-[11px] text-ui-fg-subtle mt-1">
              Allocation coverage · {kpis.totalWorkforceResources} resources · {kpis.activeAllocationsCount} active allocations
            </Text>
          </div>
          <div className="mt-4 pt-3 border-t border-ui-border-base flex items-center justify-between text-[11px] font-mono text-ui-fg-muted">
            <span>On-Site: {kpis.onSiteActiveCount}</span>
            <span className="text-ui-fg-muted font-semibold">Compliance: not measured</span>
          </div>
        </Container>
      </div>

      {/* ── Main Deep Dive Tabs ────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <Tabs.List className="border-b border-ui-border-base">
          <Tabs.Trigger value="kpis" className="text-xs gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            Executive Radar
          </Tabs.Trigger>
          <Tabs.Trigger value="cash_velocity" className="text-xs gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Cash Velocity & DSO Aging
          </Tabs.Trigger>
          <Tabs.Trigger value="oee_telemetry" className="text-xs gap-1.5">
            <Factory className="w-3.5 h-3.5" />
            OEE & Asset Telemetry
          </Tabs.Trigger>
          <Tabs.Trigger value="workforce_ops" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Workforce Deployment
          </Tabs.Trigger>
          <Tabs.Trigger value="integrity_ledger" className="text-xs gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Cross-Suite Integrity Ledger
          </Tabs.Trigger>
        </Tabs.List>

        {/* ── Tab 1: Executive Radar ────────────────────────────────────── */}
        <Tabs.Content value="kpis" className="pt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Quick Links / Operations Hub */}
            <div className="lg:col-span-2 space-y-4">
              <Container className="p-5 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Heading level="h3" className="text-sm font-bold text-ui-fg-base">
                      Cross-Module Velocity Matrix
                    </Heading>
                    <Text className="text-xs text-ui-fg-subtle">
                      Source-backed telemetry only; unavailable aggregates remain blank.
                    </Text>
                  </div>
                  <Badge color="blue" size="small" className="font-mono text-xs">
                    Server scoped
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                    <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">
                      Working Capital Velocity
                    </Text>
                    <div className="text-lg font-bold font-mono text-ui-fg-base">
                      —
                    </div>
                    <Text className="text-[10px] text-emerald-600 font-semibold">
                      AR aggregate not connected
                    </Text>
                  </div>

                  <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                    <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">
                      Plant Production OEE
                    </Text>
                    <div className="text-lg font-bold font-mono text-ui-fg-base">
                      —
                    </div>
                    <Text className="text-[10px] text-purple-600 font-semibold">
                      OEE performance and quality not measured
                    </Text>
                  </div>

                  <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                    <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">
                      Allocation Coverage
                    </Text>
                    <div className="text-lg font-bold font-mono text-ui-fg-base">
                      {sourceStatus.workforce ? `${kpis.allocationCoveragePercent}%` : '—'}
                    </div>
                    <Text className="text-[10px] text-sky-600 font-semibold">
                      Capability compliance not measured
                    </Text>
                  </div>
                </div>

                {/* Operations Jump Grid */}
                <div className="pt-3 border-t border-ui-border-base">
                  <Text className="text-xs font-semibold text-ui-fg-base mb-2">
                    Direct Domain Navigators
                  </Text>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Link
                      href="/cmms"
                      className="p-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-base hover:border-purple-500 transition-colors flex items-center justify-between text-xs font-medium"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Factory className="w-3.5 h-3.5 text-purple-600" />
                        CMMS Board
                      </span>
                      <ArrowRight className="w-3 h-3 text-ui-fg-muted" />
                    </Link>

                    <Link
                      href="/ar"
                      className="p-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-base hover:border-blue-500 transition-colors flex items-center justify-between text-xs font-medium"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Coins className="w-3.5 h-3.5 text-blue-600" />
                        AR Ledger
                      </span>
                      <ArrowRight className="w-3 h-3 text-ui-fg-muted" />
                    </Link>

                    <Link
                      href="/analytics"
                      className="p-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-base hover:border-emerald-500 transition-colors flex items-center justify-between text-xs font-medium"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                        Analytics Studio
                      </span>
                      <ArrowRight className="w-3 h-3 text-ui-fg-muted" />
                    </Link>

                    <Link
                      href="/settings?tab=hierarchy"
                      className="p-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-base hover:border-amber-500 transition-colors flex items-center justify-between text-xs font-medium"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-amber-600" />
                        Hierarchy Tree
                      </span>
                      <ArrowRight className="w-3 h-3 text-ui-fg-muted" />
                    </Link>
                  </div>
                </div>
              </Container>
            </div>

            {/* Live Operational Alerts */}
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <Heading level="h3" className="text-sm font-bold text-ui-fg-base">
                  Executive Signals
                </Heading>
                <Badge color="grey" size="small" className="font-mono text-[10px]">
                  Source status
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                  <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Working Capital Velocity
                    </span>
                    <span className="text-[10px] font-mono">Unavailable</span>
                  </div>
                  <Text className="text-[11px] text-ui-fg-subtle">
                    No reconciled AR aggregate endpoint is connected, so no cash or DSO claim is displayed.
                  </Text>
                </div>

                <div className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-1">
                  <div className="flex items-center justify-between font-bold text-purple-700 dark:text-purple-300">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> OEE Data Readiness
                    </span>
                    <span className="text-[10px] font-mono">{sourceStatus.reliability ? 'Connected' : 'Unavailable'}</span>
                  </div>
                  <Text className="text-[11px] text-ui-fg-subtle">
                    {sourceStatus.reliability
                      ? `CMMS reliability facts are connected${kpis.mttrHours > 0 ? `; recorded MTTR is ${kpis.mttrHours} hours` : ''}. OEE is withheld until availability, performance, and quality facts are available.`
                      : 'CMMS reliability telemetry is unavailable.'}
                  </Text>
                </div>

                <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-1">
                  <div className="flex items-center justify-between font-bold text-blue-700 dark:text-blue-300">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Universal Workforce
                    </span>
                    <span className="text-[10px] font-mono">{sourceStatus.workforce ? 'Connected' : 'Unavailable'}</span>
                  </div>
                  <Text className="text-[11px] text-ui-fg-subtle">
                    {sourceStatus.workforce
                      ? `${kpis.totalWorkforceResources} resources and ${kpis.activeAllocationsCount} allocations loaded. Compliance rate is not yet aggregated.`
                      : 'Workforce telemetry is unavailable.'}
                  </Text>
                </div>
              </div>
            </Container>
          </div>
        </Tabs.Content>

        {/* ── Tab 2: Cash Velocity & DSO Aging ──────────────────────────── */}
        <Tabs.Content value="cash_velocity" className="pt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
              <Text className="text-xs font-bold uppercase text-ui-fg-muted tracking-wider">
                Aging Bracket 0-30d
              </Text>
              <div className="text-2xl font-bold font-mono text-emerald-600">
                {sourceStatus.accountsReceivable ? `${kpis.arAging.current}%` : '—'}
              </div>
              <Text className="text-xs text-ui-fg-subtle">
                Current invoices within contractual terms.
              </Text>
            </Container>

            <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
              <Text className="text-xs font-bold uppercase text-ui-fg-muted tracking-wider">
                Aging Bracket 31-60d
              </Text>
              <div className="text-2xl font-bold font-mono text-blue-600">
                {sourceStatus.accountsReceivable ? `${kpis.arAging.tier30to60}%` : '—'}
              </div>
              <Text className="text-xs text-ui-fg-subtle">
                Grace period collections under dunning queue.
              </Text>
            </Container>

            <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
              <Text className="text-xs font-bold uppercase text-ui-fg-muted tracking-wider">
                Aging Bracket 61-90d
              </Text>
              <div className="text-2xl font-bold font-mono text-amber-600">
                {sourceStatus.accountsReceivable ? `${kpis.arAging.tier60to90}%` : '—'}
              </div>
              <Text className="text-xs text-ui-fg-subtle">
                Escalated dispute and recovery tracking.
              </Text>
            </Container>

            <Container className="p-4 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
              <Text className="text-xs font-bold uppercase text-ui-fg-muted tracking-wider">
                Overdue 90d+
              </Text>
              <div className="text-2xl font-bold font-mono text-rose-600">
                {sourceStatus.accountsReceivable ? `${kpis.arAging.over90}%` : '—'}
              </div>
              <Text className="text-xs text-ui-fg-subtle">
                Default provision reserve allocation.
              </Text>
            </Container>
          </div>
        </Tabs.Content>

        {/* ── Tab 3: OEE & Asset Telemetry ──────────────────────────────── */}
        <Tabs.Content value="oee_telemetry" className="pt-4 space-y-4">
          <Container className="p-5 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-sm font-bold text-ui-fg-base">
                  Overall Equipment Effectiveness Deconstruction
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Telemetry parameters governed by Physical Operations / CMMS
                </Text>
              </div>
              <span className="font-mono text-base font-bold text-purple-600">
                OEE: —
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Availability</span>
                  <span className="font-mono text-ui-fg-muted">—</span>
                </div>
                <div className="w-full bg-ui-border-base h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full" style={{ width: `${kpis.availabilityPercent}%` }} />
                </div>
                <Text className="text-[10px] text-ui-fg-subtle">
                  Operating Time vs Planned Production Time
                </Text>
              </div>

              <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Performance</span>
                  <span className="font-mono text-ui-fg-muted">—</span>
                </div>
                <div className="w-full bg-ui-border-base h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: `${kpis.performancePercent}%` }} />
                </div>
                <Text className="text-[10px] text-ui-fg-subtle">
                  Net Operating Run Rate vs Nameplate Ideal Speed
                </Text>
              </div>

              <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Quality</span>
                  <span className="font-mono text-ui-fg-muted">—</span>
                </div>
                <div className="w-full bg-ui-border-base h-2 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full" style={{ width: `${kpis.qualityPercent}%` }} />
                </div>
                <Text className="text-[10px] text-ui-fg-subtle">
                  Conforming Units vs Total Production Units
                </Text>
              </div>
            </div>
          </Container>
        </Tabs.Content>

        {/* ── Tab 4: Workforce Deployment ───────────────────────────────── */}
        <Tabs.Content value="workforce_ops" className="pt-4 space-y-4">
          <Container className="p-5 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-sm font-bold text-ui-fg-base">
                  Universal Workforce Deployment & Accreditation Health
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Cross-industry capacity, scheduling state machine, and 422 capability verification
                </Text>
              </div>
              <Link href="/cmms">
                <Button variant="secondary" size="small" className="text-xs gap-1">
                  Open Visual Dispatch Board <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">Rostered Capacity</Text>
                <div className="text-xl font-bold font-mono text-ui-fg-base">{kpis.totalWorkforceResources}</div>
                <Text className="text-[10px] text-ui-fg-subtle">Total Registered</Text>
              </div>
              <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">Active Allocations</Text>
                <div className="text-xl font-bold font-mono text-purple-600">{kpis.activeAllocationsCount}</div>
                <Text className="text-[10px] text-ui-fg-subtle">Committed Shifts</Text>
              </div>
              <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">On-Site Verified</Text>
                <div className="text-xl font-bold font-mono text-emerald-600">{kpis.onSiteActiveCount}</div>
                <Text className="text-[10px] text-ui-fg-subtle">Geo-Fence Check-in</Text>
              </div>
              <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1">
                <Text className="text-[11px] font-semibold text-ui-fg-muted uppercase">422 Guard Enforced</Text>
                <div className="text-xl font-bold font-mono text-ui-fg-muted">—</div>
                <Text className="text-[10px] text-ui-fg-subtle">Compliance aggregate not connected</Text>
              </div>
            </div>
          </Container>
        </Tabs.Content>

        {/* ── Tab 5: Cross-Suite Integrity Ledger ───────────────────────── */}
        <Tabs.Content value="integrity_ledger" className="pt-4 space-y-4">
          <Container className="p-5 border border-ui-border-base bg-ui-bg-base rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-sm font-bold text-ui-fg-base">
                  Distributed Saga & Cross-Module Attestation
                </Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Only server-issued, persisted execution receipts are shown here.
                </Text>
              </div>
              <Badge color="grey" size="small" className="font-mono text-xs">
                {sourceStatus.integrity ? 'Verified' : 'Not connected'}
              </Badge>
            </div>

            <div className="p-8 border border-dashed border-ui-border-base rounded-xl text-center space-y-2">
              <Lock className="w-8 h-8 text-ui-fg-muted mx-auto opacity-50" />
              <Heading level="h3" className="text-xs font-semibold text-ui-fg-base">
                Execution receipt service not connected
              </Heading>
              <Text className="text-[11px] text-ui-fg-subtle max-w-sm mx-auto">
                Executive mutations remain disabled until a production command API returns a persisted receipt and reconciliation state.
              </Text>
            </div>
          </Container>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
