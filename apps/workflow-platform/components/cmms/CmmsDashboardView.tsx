'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrency } from '@/components/currency/CurrencyLocaleContext';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Tabs,
  Text,
  toast,
} from '@medusajs/ui';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Factory,
  Gauge,
  HardHat,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Wrench,
  Download,
  Zap,
} from 'lucide-react';
import type {
  CmmsAsset,
  CmmsWorkOrder,
  CmmsMeter,
  CmmsPart,
  CmmsPmSchedule,
  CmmsMetrics,
  CmmsInventoryMetrics,
} from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';
import WorkOrderExecutionWorkbench from './WorkOrderExecutionWorkbench';
import AssetHierarchyExplorer from './AssetHierarchyExplorer';
import ReliabilityAnalyticsView from './ReliabilityAnalyticsView';
import AssetFormModal from './AssetFormModal';
import PmScheduleFormModal from './PmScheduleFormModal';
import PartFormModal from './PartFormModal';
import VisualDispatchBoard from './VisualDispatchBoard';
import {
  ImportWizard,
  ExportButton,
  JobStatusDrawer,
  type ImportableEntityType,
} from '@gigalibs/data-import-export-react';
import { importExportApi } from '@/lib/import-export-api-instance';

export interface CmmsDashboardViewProps {
  initialTab?: string;
  isOverview?: boolean;
}

export default function CmmsDashboardView({
  initialTab = 'work-orders',
  isOverview,
}: CmmsDashboardViewProps = {}) {
  const { currency } = useCurrency();
  const showOverview = isOverview ?? (initialTab === 'overview');
  const normalizedTab = (tab?: string) => {
    if (tab === 'analytics') return 'reliability';
    return tab || 'work-orders';
  };
  const [activeTab, setActiveTab] = useState(() => normalizedTab(initialTab));

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizedTab(initialTab));
    }
  }, [initialTab]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data States
  const [assets, setAssets] = useState<CmmsAsset[]>([]);
  const [workOrders, setWorkOrders] = useState<CmmsWorkOrder[]>([]);
  const [meters, setMeters] = useState<CmmsMeter[]>([]);
  const [parts, setParts] = useState<CmmsPart[]>([]);
  const [schedules, setSchedules] = useState<CmmsPmSchedule[]>([]);
  const [metrics, setMetrics] = useState<CmmsMetrics>({
    completedCount: 0,
    openCount: 0,
    inProgressCount: 0,
    onHoldCount: 0,
    activeEmergencies: 0,
    overdueCount: 0,
    avgCycleTimeHours: 0,
  });
  const [inventoryMetrics, setInventoryMetrics] = useState<CmmsInventoryMetrics>({
    totalParts: 0,
    lowStockCount: 0,
    totalInventoryValuation: 0,
  });

  // Modal / Drawer States
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<CmmsAsset | null>(null);
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const [showPmModal, setShowPmModal] = useState(false);
  const [selectedPmForEdit, setSelectedPmForEdit] = useState<CmmsPmSchedule | null>(null);
  const [showPartModal, setShowPartModal] = useState(false);
  const [selectedPartForEdit, setSelectedPartForEdit] = useState<CmmsPart | null>(null);
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [selectedMeterForReading, setSelectedMeterForReading] = useState<CmmsMeter | null>(null);
  const [showPartTxModal, setShowPartTxModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<CmmsPart | null>(null);
  const [selectedWoForWorkbench, setSelectedWoForWorkbench] = useState<CmmsWorkOrder | null>(null);

  // Import / Export state
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importWizardEntity, setImportWizardEntity] = useState<ImportableEntityType>('assets');
  const [showJobDrawer, setShowJobDrawer] = useState(false);

  // Form States
  const [newAsset, setNewAsset] = useState({
    name: '',
    description: '',
    criticality: 'MEDIUM' as const,
    model: '',
    manufacturer: '',
    serialNumber: '',
    iotDeviceId: '',
    acquisitionCost: 15000,
  });

  const [newWo, setNewWo] = useState({
    title: '',
    description: '',
    type: 'REACTIVE' as const,
    priority: 'MEDIUM' as const,
    assetId: '',
    estimatedDuration: 2,
    assignedTo: '',
  });

  const [readingValue, setReadingValue] = useState<number>(4.2);
  const [partTx, setPartTx] = useState({
    type: 'CONSUME' as 'CONSUME' | 'ADD',
    quantity: 1,
    notes: 'Used during line inspection',
  });

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [woRes, assetRes, partsRes, schedRes, meterRes, metricsRes, invRes] = await Promise.allSettled([
        requestCmms<{ data: CmmsWorkOrder[] }>('work-orders/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageSize: 50 }),
        }),
        requestCmms<{ data: CmmsAsset[] }>('assets/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageSize: 50 }),
        }),
        requestCmms<{ data: CmmsPart[] }>('parts/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageSize: 50 }),
        }),
        requestCmms<CmmsPmSchedule[]>('pm-schedules'),
        requestCmms<CmmsMeter[]>('meters'),
        requestCmms<CmmsMetrics>('analytics/work-orders/overview'),
        requestCmms<CmmsInventoryMetrics>('analytics/inventory/summary'),
      ]);

      if (woRes.status === 'fulfilled' && woRes.value?.data) {
        setWorkOrders(woRes.value.data);
        // If a work order was open in workbench, refresh its state
        if (selectedWoForWorkbench) {
          const refreshed = woRes.value.data.find((w) => w.id === selectedWoForWorkbench.id);
          if (refreshed) setSelectedWoForWorkbench(refreshed);
        }
      }
      if (assetRes.status === 'fulfilled' && assetRes.value?.data) {
        setAssets(assetRes.value.data);
      }
      if (partsRes.status === 'fulfilled' && partsRes.value?.data) {
        setParts(partsRes.value.data);
      }
      if (schedRes.status === 'fulfilled' && Array.isArray(schedRes.value)) {
        setSchedules(schedRes.value);
      }
      if (meterRes.status === 'fulfilled' && Array.isArray(meterRes.value)) {
        setMeters(meterRes.value);
      }
      if (metricsRes.status === 'fulfilled' && metricsRes.value) {
        setMetrics(metricsRes.value);
      }
      if (invRes?.status === 'fulfilled' && invRes.value) {
        setInventoryMetrics(invRes.value);
      } else if (partsRes.status === 'fulfilled' && partsRes.value?.data) {
        const partsList = partsRes.value.data;
        const lowStock = partsList.filter((p) => p.quantityOnHand <= (p.reorderPoint ?? p.minQuantity)).length;
        const totalVal = partsList.reduce((acc, p) => acc + p.quantityOnHand * (p.unitCost ?? 0), 0);
        setInventoryMetrics({
          totalParts: partsList.length,
          lowStockCount: lowStock,
          totalInventoryValuation: Math.round(totalVal),
        });
      }
    } catch (err: any) {
      console.warn('CMMS fetch notice:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedWoForWorkbench]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Work Order Status Machine transition
  const handleTransitionStatus = async (woId: string, currentStatus: string, expectedVersion: number) => {
    const nextStatus = currentStatus === 'OPEN' ? 'IN_PROGRESS' : currentStatus === 'IN_PROGRESS' ? 'COMPLETED' : 'OPEN';
    try {
      await requestCmms(`work-orders/${woId}/change-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          expectedVersion,
          feedback: `Status stepped to ${nextStatus}`,
        }),
      });
      toast.success('Work Order Updated', { description: `Status changed to ${nextStatus}` });
      fetchData();
    } catch (err: any) {
      toast.error('Transition Failed', { description: err.message });
    }
  };

  // Handle Triggering PM WO
  const handleTriggerPm = async (scheduleId: string) => {
    try {
      await requestCmms(`pm-schedules/${scheduleId}/trigger-work-order`, { method: 'POST' });
      toast.success('Preventive WO Fired', { description: 'Scheduled maintenance work order generated.' });
      fetchData();
    } catch (err: any) {
      toast.error('Trigger Failed', { description: err.message });
    }
  };

  // Create Work Order
  const handleCreateWo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await requestCmms('work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newWo.title,
          description: newWo.description || undefined,
          type: newWo.type,
          priority: newWo.priority,
          assetId: newWo.assetId || undefined,
          estimatedDuration: newWo.estimatedDuration,
          assignedTo: newWo.assignedTo || undefined,
        }),
      });
      toast.success('Work Order Created', { description: `${newWo.title} scheduled.` });
      setShowNewWoModal(false);
      setNewWo({
        title: '',
        description: '',
        type: 'REACTIVE',
        priority: 'MEDIUM',
        assetId: '',
        estimatedDuration: 2,
        assignedTo: '',
      });
      fetchData();
    } catch (err: any) {
      toast.error('Creation Failed', { description: err.message });
    }
  };

  // Create Asset
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await requestCmms('assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAsset),
      });
      toast.success('Asset Enrolled', { description: `${newAsset.name} registered into digital twin.` });
      setShowAssetModal(false);
      fetchData();
    } catch (err: any) {
      toast.error('Asset Registration Failed', { description: err.message });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner & Global KPIs — Rendered ONLY for the top overview of EAM */}
      {showOverview && (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ui-border-base pb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Factory className="w-5 h-5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-ui-fg-subtle">
                  Enterprise Asset Management & Operations Hub
                </span>
                <Badge color="green" size="small">
                  Tenant-scoped operational records
                </Badge>
              </div>
              <Heading level="h1" className="text-2xl font-bold tracking-tight text-ui-fg-base">
                Heavy Physical Operations & Digital Twin Execution
              </Heading>
              <Text className="text-sm text-ui-fg-subtle mt-1">
                Asset, work-order, preventive-maintenance, inventory, and meter records from the connected CMMS service.
              </Text>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="small"
                onClick={fetchData}
                isLoading={refreshing}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Sync Telemetry
              </Button>

              <Button
                variant="primary"
                size="small"
                onClick={() => setShowNewWoModal(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New Work Order
              </Button>
            </div>
          </div>

          {/* High-Alert Emergency Banner if active breakdown */}
          {metrics.activeEmergencies > 0 && (
            <Alert variant="error" className="bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-full bg-red-500/20 animate-pulse text-red-500">
                    <AlertOctagon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-sm">
                      {metrics.activeEmergencies} Active Emergency Work Order(s) Requiring Dispatch
                    </p>
                    <p className="text-xs opacity-90">
                      Reported by the CMMS aggregate. Open the kiosk to inspect the loaded emergency work orders.
                    </p>
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => setActiveTab('floor-kiosk')}
                >
                  Open Floor Kiosk View
                </Button>
              </div>
            </Alert>
          )}

          {/* KPI Summary Matrix */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Open WOs</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-ui-fg-base">{metrics.openCount + metrics.inProgressCount}</p>
              <span className="text-[11px] text-ui-fg-subtle">{metrics.inProgressCount} in progress</span>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Emergencies</span>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-500">{metrics.activeEmergencies}</p>
              <span className="text-[11px] text-red-400">Immediate response</span>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Completed WOs</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-ui-fg-base">{metrics.completedCount}</p>
              <span className="text-[11px] text-emerald-600">Audit receipt sealed</span>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Avg MTTR</span>
                <Activity className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-ui-fg-base">{metrics.avgCycleTimeHours}h</p>
              <span className="text-[11px] text-ui-fg-subtle">Mean Time To Repair</span>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">MRO Parts</span>
                <Boxes className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-ui-fg-base">{inventoryMetrics.totalParts}</p>
              <span className="text-[11px] text-amber-600">{inventoryMetrics.lowStockCount} at reorder point</span>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
              <div className="flex items-center justify-between text-ui-fg-muted mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Digital Twin</span>
                <Cpu className="w-4 h-4 text-cyan-500" />
              </div>
              <p className="text-2xl font-bold text-ui-fg-base">{assets.length}</p>
              <span className="text-[11px] text-ui-fg-subtle">Assets in the loaded result</span>
            </Container>
          </div>
        </>
      )}

      {/* Main Submodule Content Driven by Left Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* TAB 0: TOP OVERVIEW OF EAM */}
        <Tabs.Content value="overview">
          {/* Submodule Quick Access Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            <Link
              href="/cmms/work-orders"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20">
                  <Wrench className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">Work Orders</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">{workOrders.length} active</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/assets"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20">
                  <Factory className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">Assets &amp; Twin</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">{assets.length} registered</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/schedules"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20">
                  <Clock className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">PM Schedules</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">{schedules.length} recurring</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/inventory"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20">
                  <Boxes className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">MRO Parts</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">{parts.length} catalog items</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/meters"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500/20">
                  <Gauge className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">Meters &amp; IoT</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">{meters.length} telemetry feeds</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/analytics"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500/20">
                  <BarChart3 className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">Reliability</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">Recorded downtime facts</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>

            <Link
              href="/cmms/floor"
              className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-md bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20">
                  <Radio className="w-4 h-4" />
                </span>
                <div className="truncate">
                  <p className="text-xs font-semibold text-ui-fg-base truncate">Floor Kiosk</p>
                  <p className="text-[11px] text-ui-fg-muted truncate">Shop floor mode</p>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-ui-fg-muted group-hover:text-ui-fg-base shrink-0" />
            </Link>
          </div>

          {/* Technician Dispatch Queue Table */}
          <Container className="p-0 border border-ui-border-base bg-ui-bg-base overflow-hidden">
            <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold">Priority Operations &amp; Dispatch Queue</Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Live operational dispatch board across active plant work orders, emergencies, and corrective tasks.
                </Text>
              </div>
              <Button size="small" variant="primary" onClick={() => setShowNewWoModal(true)}>
                + New Work Order
              </Button>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>WO #</Table.HeaderCell>
                  <Table.HeaderCell>Title &amp; Description</Table.HeaderCell>
                  <Table.HeaderCell>Priority</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Assigned Technician</Table.HeaderCell>
                  <Table.HeaderCell>Due Date</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Execution Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {workOrders.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center py-8 text-ui-fg-muted">
                      No active work orders. Click &quot;+ New Work Order&quot; to log maintenance or repairs.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  workOrders.slice(0, 10).map((wo) => (
                    <Table.Row key={wo.id}>
                      <Table.Cell className="font-mono text-xs font-semibold text-cyan-500">
                        {wo.woNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-medium text-xs text-ui-fg-base">{wo.title}</div>
                        <div className="text-[11px] text-ui-fg-subtle truncate max-w-xs">{wo.description}</div>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge
                          color={
                            wo.priority === 'EMERGENCY'
                              ? 'red'
                              : wo.priority === 'HIGH'
                              ? 'orange'
                              : wo.priority === 'MEDIUM'
                              ? 'blue'
                              : 'grey'
                          }
                        >
                          {wo.priority}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-ui-fg-subtle">{wo.type}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge
                          color={
                            wo.status === 'COMPLETED'
                              ? 'green'
                              : wo.status === 'IN_PROGRESS'
                              ? 'blue'
                              : wo.status === 'OPEN'
                              ? 'orange'
                              : 'red'
                          }
                        >
                          {wo.status}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-base">
                        {wo.assignedTo || 'Unassigned'}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-subtle">
                        {wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : 'ASAP'}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() => setSelectedWoForWorkbench(wo)}
                            className="flex items-center gap-1 text-[11px]"
                          >
                            <Wrench className="w-3 h-3 text-cyan-300" />
                            Inspect &amp; Execute
                          </Button>
                          {wo.status !== 'COMPLETED' && (
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => handleTransitionStatus(wo.id, wo.status, wo.version)}
                            >
                              {wo.status === 'OPEN' ? 'Start' : 'Close'}
                            </Button>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </Container>
        </Tabs.Content>

        {/* TAB 1: WORK ORDERS & DISPATCH */}
        <Tabs.Content value="work-orders">
          <Container className="p-0 border border-ui-border-base bg-ui-bg-base overflow-hidden">
            <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold">Technician Dispatch & Execution Queue</Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Click &quot;Inspect &amp; Execute&quot; to open the technician workbench with checklists, labor timers, and parts consumption.
                </Text>
              </div>
              <Button size="small" variant="primary" onClick={() => setShowNewWoModal(true)}>
                + New Work Order
              </Button>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>WO #</Table.HeaderCell>
                  <Table.HeaderCell>Title & Description</Table.HeaderCell>
                  <Table.HeaderCell>Priority</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Assigned Technician</Table.HeaderCell>
                  <Table.HeaderCell>Due Date</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Execution</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {workOrders.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="py-8 text-center text-ui-fg-muted">
                      No work orders in queue. Click &quot;+ New Work Order&quot; to schedule maintenance.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  workOrders.map((wo) => (
                    <Table.Row key={wo.id} className="hover:bg-ui-bg-base-hover">
                      <Table.Cell className="font-mono text-xs font-bold text-ui-fg-base">
                        {wo.woNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-semibold text-sm text-ui-fg-base">{wo.title}</div>
                        <div className="text-xs text-ui-fg-subtle truncate max-w-sm">{wo.description || 'Standard task'}</div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={
                            wo.priority === 'EMERGENCY'
                              ? 'orange'
                              : wo.priority === 'HIGH'
                              ? 'orange'
                              : wo.priority === 'MEDIUM'
                              ? 'blue'
                              : 'grey'
                          }
                          size="small"
                        >
                          {wo.priority}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-ui-fg-subtle">{wo.type}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge
                          color={
                            wo.status === 'COMPLETED'
                              ? 'green'
                              : wo.status === 'IN_PROGRESS'
                              ? 'blue'
                              : wo.status === 'OPEN'
                              ? 'orange'
                              : 'red'
                          }
                        >
                          {wo.status}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-base">
                        {wo.assignedTo || 'Unassigned'}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-subtle">
                        {wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : 'ASAP'}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() => setSelectedWoForWorkbench(wo)}
                            className="flex items-center gap-1 text-[11px]"
                          >
                            <Wrench className="w-3 h-3 text-cyan-300" />
                            Inspect &amp; Execute
                          </Button>
                          {wo.status !== 'COMPLETED' && (
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => handleTransitionStatus(wo.id, wo.status, wo.version)}
                            >
                              {wo.status === 'OPEN' ? 'Start' : 'Close'}
                            </Button>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </Container>
        </Tabs.Content>

        {/* TAB: MAINTENANCE CALENDAR */}
        <Tabs.Content value="calendar">
          <VisualDispatchBoard
            defaultView="calendar"
            workOrders={workOrders}
            onSelectWo={(wo) => setSelectedWoForWorkbench(wo)}
            onCreateWo={() => setShowNewWoModal(true)}
          />
        </Tabs.Content>

        {/* TAB: TECHNICIAN WORKLOAD & DISPATCH BOARD */}
        <Tabs.Content value="workload">
          <VisualDispatchBoard
            defaultView="timeline"
            workOrders={workOrders}
            onSelectWo={(wo) => setSelectedWoForWorkbench(wo)}
            onCreateWo={() => setShowNewWoModal(true)}
          />
        </Tabs.Content>

        {/* TAB 2: ASSET HIERARCHY & DIGITAL TWIN */}
        <Tabs.Content value="assets">
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="transparent"
                size="small"
                onClick={() => setShowJobDrawer(true)}
                className="text-xs text-ui-fg-subtle border border-ui-border-base"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Jobs
              </Button>
              <ExportButton
                api={importExportApi}
                entityType="assets"
              />
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  setImportWizardEntity('assets');
                  setShowImportWizard(true);
                }}
                className="text-xs font-semibold"
              >
                Import
              </Button>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setSelectedAssetForEdit(null);
                  setShowAssetModal(true);
                }}
                className="text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Register New Asset
              </Button>
            </div>
            <AssetHierarchyExplorer
              assets={assets}
              parts={parts}
              onCreateWoForAsset={(asset) => {
                setNewWo((prev) => ({
                  ...prev,
                  assetId: asset.id,
                  title: `Service Inspection: ${asset.name}`,
                }));
                setShowNewWoModal(true);
              }}
            />
          </div>
        </Tabs.Content>

        {/* TAB 3: RELIABILITY ANALYTICS & WEIBULL (MTBF) */}
        <Tabs.Content value="reliability">
          <ReliabilityAnalyticsView />
        </Tabs.Content>

        {/* TAB 4: PREVENTATIVE SCHEDULES (PM) */}
        <Tabs.Content value="schedules">
          <Container className="p-0 border border-ui-border-base bg-ui-bg-base overflow-hidden">
            <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold">Preventative Maintenance Rules &amp; DAGs</Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Calendar and meter-triggered recurring maintenance cycles linked to Workflow Studio.
                </Text>
              </div>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setSelectedPmForEdit(null);
                  setShowPmModal(true);
                }}
                className="text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> New PM Schedule
              </Button>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Schedule Name</Table.HeaderCell>
                  <Table.HeaderCell>Trigger Type</Table.HeaderCell>
                  <Table.HeaderCell>Rule / Threshold</Table.HeaderCell>
                  <Table.HeaderCell>WO Priority</Table.HeaderCell>
                  <Table.HeaderCell>Last Run</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {schedules.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="py-8 text-center text-ui-fg-muted" {...({ colSpan: 6 } as any)}>
                      No PM schedules active. Connect asset meter triggers to auto-generate WOs.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  schedules.map((pm) => (
                    <Table.Row key={pm.id} className="hover:bg-ui-bg-base-hover">
                      <Table.Cell className="font-medium text-sm text-ui-fg-base">
                        {pm.name}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="purple" size="small">{pm.triggerType}</Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs font-mono text-ui-fg-subtle">
                        {pm.cronExpression || (pm.meterThreshold ? `Every ${pm.meterThreshold} hrs` : 'Standard cycle')}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="blue" size="small">{pm.woPriority}</Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-subtle">
                        {pm.lastTriggeredAt ? new Date(pm.lastTriggeredAt).toLocaleString() : 'Pending'}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                              setSelectedPmForEdit(pm);
                              setShowPmModal(true);
                            }}
                            className="h-7 text-xs"
                          >
                            Edit
                          </Button>
                          <Button size="small" variant="secondary" onClick={() => handleTriggerPm(pm.id)} className="h-7 text-xs">
                            Fire WO Now
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </Container>
        </Tabs.Content>

        {/* TAB 5: SCADA & METERS */}
        <Tabs.Content value="telemetry">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Container className="p-4 bg-ui-bg-base border border-ui-border-base lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <div>
                  <Heading level="h3" className="text-base font-semibold">Active Sensor Channels &amp; Telemetry</Heading>
                  <Text className="text-xs text-ui-fg-subtle">
                    Time-series partitioned metrics from SCADA, IoT MQTT brokers, and manual floor logs.
                  </Text>
                </div>
                <Badge color="blue" size="small">Persisted readings only</Badge>
              </div>

              <div className="space-y-3">
                {meters.length === 0 ? (
                  <div className="p-6 text-center text-sm text-ui-fg-muted border border-dashed border-ui-border-base rounded-lg">
                    No persisted meter channels are available for this tenant.
                  </div>
                ) : meters.map((meter) => (
                  <div key={meter.id} className="p-4 border border-ui-border-base rounded-lg bg-ui-bg-subtle flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="font-semibold text-sm text-ui-fg-base">{meter.name}</span>
                      <p className="text-xs text-ui-fg-subtle font-mono">{meter.iotTopic || 'Manual readings only'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-mono font-bold text-ui-fg-base">
                        {meter.currentValue === null ? '—' : `${meter.currentValue} ${meter.unit}`}
                      </p>
                      <p className="text-[11px] text-ui-fg-muted">
                        {meter.lastReadAt ? `Last read ${new Date(meter.lastReadAt).toLocaleString()}` : 'No reading received'}
                      </p>
                      <Button
                        size="small"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => {
                          setSelectedMeterForReading(meter);
                          setReadingValue(meter.currentValue ?? 0);
                          setShowReadingModal(true);
                        }}
                      >
                        Log reading
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Container>

            <Container className="p-4 bg-ui-bg-base border border-ui-border-base space-y-4">
              <Heading level="h3" className="text-base font-semibold">SCADA Ingress Endpoint</Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Device ingestion must use the configured machine credential and server-derived tenant context.
              </Text>

              <div className="bg-ui-bg-subtle p-3 rounded font-mono text-[11px] text-ui-fg-muted space-y-1">
                <p className="text-emerald-500">POST /v1/iot/readings</p>
                <p>Content-Type: application/json</p>
                <p>Authorization: Bearer &lt;machine-credential&gt;</p>
                <p className="text-ui-fg-subtle mt-2">// Payload Schema:</p>
                <p>{'{ "readings": ['}</p>
                <p>&nbsp;&nbsp;{'{ "iotTopic": "line1/vibe", "value": 5.4 }'}</p>
                <p>{'] }'}</p>
              </div>

              <Text className="text-xs text-ui-fg-muted">
                Select a persisted meter channel to record a manual reading.
              </Text>
            </Container>
          </div>
        </Tabs.Content>

        {/* TAB 6: MULTI-BIN MRO INVENTORY */}
        <Tabs.Content value="inventory">
          <Container className="p-0 border border-ui-border-base bg-ui-bg-base overflow-hidden">
            <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h3" className="text-base font-semibold">MRO Spare Parts Inventory</Heading>
                <Text className="text-xs text-ui-fg-subtle">
                  Persisted stock balances, storage areas, costs, and reorder thresholds. Low-stock consumption emits a reconciliation event.
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <ExportButton
                  api={importExportApi}
                  entityType="parts"
                />
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setImportWizardEntity('parts');
                    setShowImportWizard(true);
                  }}
                  className="text-xs font-semibold"
                >
                  Import
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => {
                    setSelectedPartForEdit(null);
                    setShowPartModal(true);
                  }}
                  className="text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Spare Part
                </Button>
              </div>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Part Number</Table.HeaderCell>
                  <Table.HeaderCell>Description</Table.HeaderCell>
                  <Table.HeaderCell>Storage Area</Table.HeaderCell>
                  <Table.HeaderCell>Stock On Hand</Table.HeaderCell>
                  <Table.HeaderCell>Location Reference</Table.HeaderCell>
                  <Table.HeaderCell>Unit Cost</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {parts.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="py-8 text-center text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                      No spare parts listed. Register catalog items to monitor stock.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  parts.map((part) => (
                    <Table.Row key={part.id} className="hover:bg-ui-bg-base-hover">
                      <Table.Cell className="font-mono text-xs font-semibold text-ui-fg-base">
                        {part.partNumber}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-medium text-sm text-ui-fg-base">{part.name}</div>
                        <div className="text-xs text-ui-fg-subtle">{part.category || '—'}</div>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-xs text-cyan-600 bg-cyan-500/10 px-2 py-0.5 rounded">
                          {part.area || '—'}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className={`font-semibold text-sm ${
                            part.reorderPoint !== null && part.quantityOnHand <= part.reorderPoint
                              ? 'text-red-500 font-bold'
                              : 'text-ui-fg-base'
                          }`}
                        >
                          {part.quantityOnHand} {part.unitOfMeasure}
                        </span>
                        <div className="text-[10px] text-ui-fg-muted">Min: {part.minQuantity} | Reorder: {part.reorderPoint}</div>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-subtle">
                        <div className="font-mono text-[11px]">{part.locationId || '—'}</div>
                      </Table.Cell>
                      <Table.Cell className="text-xs font-mono text-ui-fg-base">
                        {part.unitCost === null ? '—' : `$${part.unitCost.toFixed(2)}`}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                              setSelectedPart(part);
                              setShowPartTxModal(true);
                            }}
                            className="h-7 text-xs"
                          >
                            Log Usage
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </Container>
        </Tabs.Content>

        {/* TAB 7: FLOOR EMERGENCY KIOSK */}
        <Tabs.Content value="floor-kiosk">
          <div className="bg-red-950/20 border-2 border-red-500/40 rounded-xl p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-red-500/20 rounded-full text-red-500 animate-pulse">
              <Radio className="w-8 h-8" />
            </div>
            <Heading level="h2" className="text-xl font-bold text-red-500">
              Floor Emergency Beacon &amp; Kiosk Dispatch
            </Heading>
            <Text className="text-sm text-ui-fg-subtle max-w-xl mx-auto">
              This view shows persisted emergency work orders from the CMMS API. It does not claim an alarm was delivered or acknowledged unless that event is stored by the service.
            </Text>

            {workOrders.filter((workOrder) =>
              (workOrder.type === 'EMERGENCY' || workOrder.priority === 'EMERGENCY') &&
              workOrder.status !== 'COMPLETED' && workOrder.status !== 'CANCELLED'
            ).length === 0 ? (
              <div className="max-w-md mx-auto p-4 bg-ui-bg-base border border-ui-border-base rounded-lg text-sm text-ui-fg-muted">
                No active emergency work orders in the loaded result.
              </div>
            ) : workOrders.filter((workOrder) =>
              (workOrder.type === 'EMERGENCY' || workOrder.priority === 'EMERGENCY') &&
              workOrder.status !== 'COMPLETED' && workOrder.status !== 'CANCELLED'
            ).map((workOrder) => (
              <div key={workOrder.id} className="max-w-md mx-auto p-4 bg-ui-bg-base border border-red-500/50 rounded-lg text-left space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-red-400 font-bold">{workOrder.woNumber}</span>
                  <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold">{workOrder.status}</span>
                </div>
                <p className="font-semibold text-sm text-ui-fg-base">{workOrder.title}</p>
                <p className="text-xs text-ui-fg-muted">{workOrder.description || 'No description supplied.'}</p>
                <div className="pt-2 flex justify-end gap-2">
                  <Button size="small" variant="danger" onClick={() => setSelectedWoForWorkbench(workOrder)}>
                    Open Workbench
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Tabs.Content>
      </Tabs>

      {/* Slide-over Workbench for Work Order Execution */}
      {selectedWoForWorkbench && (
        <WorkOrderExecutionWorkbench
          workOrder={selectedWoForWorkbench}
          availableParts={parts}
          onClose={() => setSelectedWoForWorkbench(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Modal: New Work Order */}
      {showNewWoModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-elevation-modal">
            <Heading level="h2" className="text-lg font-bold text-ui-fg-base mb-3">Create Work Order</Heading>
            <form onSubmit={handleCreateWo} className="space-y-3">
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">Work Order Title</Label>
                <Input
                  required
                  placeholder="e.g. Replace seal on hydraulic pump"
                  value={newWo.title}
                  onChange={(e) => setNewWo({ ...newWo, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-ui-fg-subtle mb-1 block">Priority</Label>
                  <select
                    value={newWo.priority}
                    onChange={(e) => setNewWo({ ...newWo, priority: e.target.value as any })}
                    className="w-full h-8 px-2 py-1 text-xs bg-ui-bg-field text-ui-fg-base border border-ui-border-base rounded-md"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-ui-fg-subtle mb-1 block">Type</Label>
                  <select
                    value={newWo.type}
                    onChange={(e) => setNewWo({ ...newWo, type: e.target.value as any })}
                    className="w-full h-8 px-2 py-1 text-xs bg-ui-bg-field text-ui-fg-base border border-ui-border-base rounded-md"
                  >
                    <option value="REACTIVE">REACTIVE</option>
                    <option value="PREVENTIVE">PREVENTIVE</option>
                    <option value="INSPECTION">INSPECTION</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">Assigned Technician</Label>
                <Input
                  value={newWo.assignedTo}
                  onChange={(e) => setNewWo({ ...newWo, assignedTo: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">Estimated Duration (Hours)</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={newWo.estimatedDuration}
                  onChange={(e) => setNewWo({ ...newWo, estimatedDuration: Number(e.target.value) })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowNewWoModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Dispatch Order
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}

      {/* Modal: Register / Edit Asset */}
      {showAssetModal && (
        <AssetFormModal
          asset={selectedAssetForEdit}
          parentAssets={assets}
          onClose={() => {
            setShowAssetModal(false);
            setSelectedAssetForEdit(null);
          }}
          onSaved={fetchData}
        />
      )}

      {/* Modal: Create / Edit PM Schedule */}
      {showPmModal && (
        <PmScheduleFormModal
          schedule={selectedPmForEdit}
          assets={assets}
          meters={meters}
          onClose={() => {
            setShowPmModal(false);
            setSelectedPmForEdit(null);
          }}
          onSaved={fetchData}
        />
      )}

      {/* Modal: Create / Edit Spare Part */}
      {showPartModal && (
        <PartFormModal
          part={selectedPartForEdit}
          onClose={() => {
            setShowPartModal(false);
            setSelectedPartForEdit(null);
          }}
          onSaved={fetchData}
        />
      )}

      {/* Modal: Part Usage */}
      {showPartTxModal && selectedPart && (
        <div className="fixed inset-0 bg-ui-bg-overlay flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-elevation-modal">
            <Heading level="h2" className="text-lg font-bold text-ui-fg-base mb-3">
              Log Usage: {selectedPart.name}
            </Heading>
            <p className="text-xs text-ui-fg-subtle mb-3">
              Current Quantity On Hand: <span className="font-bold text-ui-fg-base">{selectedPart.quantityOnHand}</span>
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await requestCmms(`parts/${selectedPart.id}/transaction`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(partTx),
                  });
                  toast.success('Inventory Adjusted', { description: 'Usage recorded against ledger.' });
                  setShowPartTxModal(false);
                  fetchData();
                } catch (err: any) {
                  toast.error('Transaction Failed', { description: err.message });
                }
              }}
              className="space-y-3"
            >
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">Quantity to Deduct</Label>
                <Input
                  type="number"
                  min={1}
                  max={selectedPart.quantityOnHand}
                  value={partTx.quantity}
                  onChange={(e) => setPartTx({ ...partTx, quantity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">Work Order / Reason</Label>
                <Input
                  value={partTx.notes}
                  onChange={(e) => setPartTx({ ...partTx, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowPartTxModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  type="submit"
                  disabled={selectedPart.quantityOnHand <= 0}
                >
                  Confirm Deduction
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}

      {/* Modal: Manual Reading */}
      {showReadingModal && selectedMeterForReading && (
        <div className="fixed inset-0 bg-ui-bg-overlay flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-elevation-modal">
            <Heading level="h2" className="text-lg font-bold text-ui-fg-base mb-3">
              Log Reading: {selectedMeterForReading.name}
            </Heading>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await requestCmms(`meters/${selectedMeterForReading.id}/readings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: readingValue, source: 'MANUAL' }),
                  });
                  toast.success('Reading Stored', {
                    description: `Value ${readingValue} ${selectedMeterForReading.unit} was accepted by CMMS.`,
                  });
                  setShowReadingModal(false);
                  setSelectedMeterForReading(null);
                  fetchData();
                } catch (err: any) {
                  toast.error('Reading Failed', { description: err?.message || 'CMMS rejected the reading.' });
                }
              }}
              className="space-y-3"
            >
              <div>
                <Label className="text-xs text-ui-fg-subtle mb-1 block">
                  Sensor Value ({selectedMeterForReading.unit})
                </Label>
                <Input
                  type="number"
                  step={0.1}
                  value={readingValue}
                  onChange={(e) => setReadingValue(Number(e.target.value))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="small"
                  type="button"
                  onClick={() => {
                    setShowReadingModal(false);
                    setSelectedMeterForReading(null);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Log Reading
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
      {/* Import Wizard */}
      {showImportWizard && (
        <ImportWizard
          api={importExportApi}
          defaultEntityType={importWizardEntity}
          onClose={() => setShowImportWizard(false)}
          onComplete={() => setShowImportWizard(false)}
        />
      )}

      {/* Job Status Drawer */}
      <JobStatusDrawer
        api={importExportApi}
        isOpen={showJobDrawer}
        onClose={() => setShowJobDrawer(false)}
      />
    </div>
  );
}
