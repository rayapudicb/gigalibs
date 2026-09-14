'use client';

import React, { useState } from 'react';
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
  Boxes,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  Factory,
  FileText,
  Gauge,
  HardHat,
  Layers,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wrench,
  Zap,
} from 'lucide-react';
import type { CmmsAsset, CmmsPart } from '@/lib/cmms-api';

interface Props {
  assets: CmmsAsset[];
  parts: CmmsPart[];
  onSelectAsset?: (asset: CmmsAsset) => void;
  onCreateWoForAsset?: (asset: CmmsAsset) => void;
}

export default function AssetHierarchyExplorer({
  assets,
  parts,
  onSelectAsset,
  onCreateWoForAsset,
}: Props) {
  // Find top level root assets
  const rootAssets = assets.filter((a) => !a.parentAssetId);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    assets.find((a) => a.id === 'asset-slurry-01')?.id || assets[0]?.id || ''
  );
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'asset-site-01': true,
    'asset-line-01': true,
  });

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) || assets[0];

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderTree = (parentId: string | null = null, depth = 0) => {
    const children = assets.filter((a) => a.parentAssetId === parentId);
    if (children.length === 0) return null;

    return (
      <div className="space-y-1">
        {children.map((child) => {
          const hasChildren = assets.some((a) => a.parentAssetId === child.id);
          const isExpanded = !!expandedNodes[child.id];
          const isSelected = selectedAsset?.id === child.id;

          return (
            <div key={child.id} className="select-none">
              <div
                onClick={() => {
                  setSelectedAssetId(child.id);
                  if (onSelectAsset) onSelectAsset(child);
                }}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                className={`flex items-center justify-between py-1.5 pr-2.5 rounded-md text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-ui-bg-base-hover text-ui-fg-base font-semibold shadow-borders-base'
                    : 'text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {hasChildren ? (
                    <button
                      onClick={(e) => toggleNode(child.id, e)}
                      className="p-0.5 hover:bg-ui-bg-base rounded text-ui-fg-muted"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-3.5 h-3.5 inline-block" />
                  )}

                  <Factory className={`w-3.5 h-3.5 flex-shrink-0 ${child.criticality === 'CRITICAL' ? 'text-red-500' : 'text-ui-fg-muted'}`} />
                  <span className="truncate">{child.name}</span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`h-1.5 w-1.5 rounded-full ${child.status === 'OPERATIONAL' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-[10px] font-mono text-ui-fg-muted">{child.hierarchyLevel || 'MACH'}</span>
                </div>
              </div>

              {hasChildren && isExpanded && renderTree(child.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Tree Column */}
      <Container className="p-4 bg-ui-bg-base border border-ui-border-base lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
          <div>
            <h3 className="font-semibold text-sm text-ui-fg-base">Digital Twin Hierarchy</h3>
            <p className="text-[11px] text-ui-fg-subtle">Recursive plant asset model (ISO 14224)</p>
          </div>
          <Badge size="small" color="purple">7 LEVELS</Badge>
        </div>

        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
          {renderTree(null, 0)}
        </div>
      </Container>

      {/* Right Asset 360 Passport Column */}
      <div className="lg:col-span-8 space-y-6">
        {selectedAsset ? (
          <Container className="p-6 bg-ui-bg-base border border-ui-border-base space-y-6">
            {/* Header & Quick Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ui-border-base pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-ui-bg-subtle border border-ui-border-base">
                    {selectedAsset.assetTag || 'TAG-000'}
                  </span>
                  <Badge size="small" color={selectedAsset.criticality === 'CRITICAL' ? 'orange' : 'blue'}>
                    {selectedAsset.criticality}
                  </Badge>
                  <StatusBadge color={selectedAsset.status === 'OPERATIONAL' ? 'green' : 'orange'}>
                    {selectedAsset.status}
                  </StatusBadge>
                </div>
                <Heading level="h2" className="text-xl font-bold text-ui-fg-base">
                  {selectedAsset.name}
                </Heading>
                <p className="text-xs text-ui-fg-subtle">
                  {selectedAsset.manufacturer} • Model: {selectedAsset.model} • S/N: {selectedAsset.serialNumber}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {onCreateWoForAsset && (
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => onCreateWoForAsset(selectedAsset)}
                    className="flex items-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Dispatch Work Order
                  </Button>
                )}
              </div>
            </div>

            {/* Operational Health & Reliability KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
                <p className="text-[11px] text-ui-fg-muted uppercase font-mono">Asset Health Score</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold font-mono text-emerald-500">
                    {selectedAsset.healthScore || 90}%
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold">GOOD</span>
                </div>
                <div className="w-full bg-ui-border-base h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${selectedAsset.healthScore || 90}%` }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
                <p className="text-[11px] text-ui-fg-muted uppercase font-mono">MTBF</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold font-mono text-ui-fg-base">
                    {selectedAsset.mtbfHours || 1200}
                  </span>
                  <span className="text-xs text-ui-fg-subtle">hours</span>
                </div>
                <p className="text-[10px] text-ui-fg-muted mt-1">Mean Time Between Failures</p>
              </div>

              <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
                <p className="text-[11px] text-ui-fg-muted uppercase font-mono">MTTR</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold font-mono text-ui-fg-base">
                    {selectedAsset.mttrHours || 2.5}
                  </span>
                  <span className="text-xs text-ui-fg-subtle">hours</span>
                </div>
                <p className="text-[10px] text-ui-fg-muted mt-1">Mean Time To Repair</p>
              </div>

              <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
                <p className="text-[11px] text-ui-fg-muted uppercase font-mono">Replacement Value</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold font-mono text-ui-fg-base">
                    ${((selectedAsset.ravCost || selectedAsset.acquisitionCost || 50000) / 1000).toFixed(0)}k
                  </span>
                  <span className="text-xs text-ui-fg-subtle">RAV</span>
                </div>
                <p className="text-[10px] text-ui-fg-muted mt-1">Capital Replacement Cost</p>
              </div>
            </div>

            {/* Bill of Materials (BOM) Linked Parts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-ui-fg-base flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-amber-500" />
                  Bill of Materials (BOM) & Spare Parts Catalog
                </h4>
                <span className="text-xs text-ui-fg-subtle">
                  {selectedAsset.bomParts?.length || 0} designated components
                </span>
              </div>

              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Part Number</Table.HeaderCell>
                    <Table.HeaderCell>Component Name</Table.HeaderCell>
                    <Table.HeaderCell>Required Qty</Table.HeaderCell>
                    <Table.HeaderCell>Stock On Hand</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Status</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {!selectedAsset.bomParts || selectedAsset.bomParts.length === 0 ? (
                    <Table.Row>
                      <Table.Cell className="py-6 text-center text-ui-fg-muted">
                        No BOM parts associated with this equipment.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    selectedAsset.bomParts.map((b) => (
                      <Table.Row key={b.partId}>
                        <Table.Cell className="font-mono text-xs font-semibold text-ui-fg-base">
                          {b.partNumber}
                        </Table.Cell>
                        <Table.Cell className="text-xs text-ui-fg-base">{b.name}</Table.Cell>
                        <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{b.requiredQty}</Table.Cell>
                        <Table.Cell className="font-mono text-xs font-bold text-ui-fg-base">
                          {b.onHand} in MRO
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          <Badge size="small" color={b.onHand >= b.requiredQty ? 'green' : 'orange'}>
                            {b.onHand >= b.requiredQty ? 'Available' : 'Reorder Needed'}
                          </Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table>
            </div>

            {/* Downtime History Timeline */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-ui-fg-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                Downtime History & Root Cause Analysis (RCA)
              </h4>

              <div className="space-y-2">
                {!selectedAsset.downtimeHistory || selectedAsset.downtimeHistory.length === 0 ? (
                  <p className="text-xs text-ui-fg-muted italic p-4 bg-ui-bg-subtle rounded border border-ui-border-base text-center">
                    Zero unplanned downtime events recorded in last 90 days.
                  </p>
                ) : (
                  selectedAsset.downtimeHistory.map((dt) => (
                    <div
                      key={dt.id}
                      className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ui-fg-base">{dt.reason}</span>
                          <Badge size="small" color="purple">{dt.category}</Badge>
                        </div>
                        <p className="text-[11px] text-ui-fg-muted font-mono">
                          Started: {new Date(dt.startedAt).toLocaleString()} • Restored: {new Date(dt.endedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-red-500">{dt.durationHours}h Outage</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Document Attachments */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-ui-fg-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Technical Library, Schematics & OEM Manuals
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {!selectedAsset.documents || selectedAsset.documents.length === 0 ? (
                  <p className="text-xs text-ui-fg-muted italic col-span-2">No documents attached.</p>
                ) : (
                  selectedAsset.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-ui-fg-base truncate">{doc.name}</p>
                          <p className="text-[10px] text-ui-fg-muted font-mono">{doc.type} • {doc.size}</p>
                        </div>
                      </div>
                      <Button size="small" variant="secondary" className="h-7 px-2 text-[10px] flex items-center gap-1">
                        <Download className="w-3 h-3" /> View
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Container>
        ) : (
          <Container className="p-12 text-center text-ui-fg-muted bg-ui-bg-base border border-ui-border-base">
            Select an asset from the digital twin tree to open its 360 passport.
          </Container>
        )}
      </div>
    </div>
  );
}
