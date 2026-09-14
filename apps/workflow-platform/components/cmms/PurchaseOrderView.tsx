'use client';

import React, { useState, useEffect } from 'react';
import { Badge, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, toast } from '@medusajs/ui';
import { ShoppingCart, Plus, CheckCircle2, XCircle, Truck, Package, ArrowUpRight } from 'lucide-react';
import type { CmmsPart } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

interface PurchaseOrder {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  vendorId: string | null;
  vendorName: string;
  category: string;
  lines: Array<{
    id: string;
    partId: string | null;
    partNumber: string;
    description: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalCost: number;
  shippingDueDate: string | null;
  shippingAddress: string;
  notes: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

interface Props {
  parts: CmmsPart[];
  onRefresh: () => void;
}

export default function PurchaseOrderView({ parts, onRefresh }: Props) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  // New PO Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPo, setNewPo] = useState({
    name: '',
    vendorName: 'Motion Industries',
    category: 'MRO Replenishment',
    partId: parts[0]?.id || '',
    quantity: 10,
    unitCost: parts[0]?.unitCost || 50,
    shippingDueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    notes: '',
  });

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await requestCmms<PurchaseOrder[]>('purchase-orders');
      setOrders(data || []);
    } catch (err: any) {
      toast.error('Failed to load purchase orders', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await requestCmms(`purchase-orders/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'Plant Maintenance Director' }),
      });
      toast.success('PO Approved & Restocked', {
        description: 'Parts inventory balances have been incremented automatically.',
      });
      loadOrders();
      onRefresh();
    } catch (err: any) {
      toast.error('PO Approval Failed', { description: err.message });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await requestCmms(`purchase-orders/${id}/reject`, {
        method: 'PATCH',
      });
      toast.info('PO Rejected', { description: 'Purchase requisition closed without issuing goods receipt.' });
      loadOrders();
    } catch (err: any) {
      toast.error('PO Rejection Failed', { description: err.message });
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPo.name.trim()) {
      toast.error('Validation Error', { description: 'PO Title is required.' });
      return;
    }

    const selectedPart = parts.find((p) => p.id === newPo.partId);
    const lineItem = {
      id: `pol-${Date.now()}`,
      partId: newPo.partId,
      partNumber: selectedPart?.partNumber || 'SKU-CUSTOM',
      description: selectedPart?.name || 'Custom MRO Part',
      quantity: Number(newPo.quantity),
      unitCost: Number(newPo.unitCost),
      totalCost: Number(newPo.quantity) * Number(newPo.unitCost),
    };

    try {
      await requestCmms('purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPo.name,
          vendorName: newPo.vendorName,
          category: newPo.category,
          lines: [lineItem],
          shippingDueDate: newPo.shippingDueDate,
          notes: newPo.notes,
        }),
      });
      toast.success('PO Requisition Created', { description: `${newPo.name} submitted for authorization.` });
      setShowCreateModal(false);
      loadOrders();
    } catch (err: any) {
      toast.error('Failed to create PO', { description: err.message });
    }
  };

  const totalCommittedSpend = orders
    .filter((o) => o.status === 'APPROVED')
    .reduce((sum, o) => sum + o.totalCost, 0);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 border border-orange-500/20">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              MRO Purchase Orders & Replenishment Requisitions
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Vendor procurement, warehouse goods receipt, and stock replenishment approvals
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-ui-fg-muted tracking-wider">
              Authorized Spend
            </span>
            <p className="text-sm font-bold font-mono text-emerald-600">
              ${totalCommittedSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Purchase Order
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-ui-border-base rounded-xl overflow-hidden bg-ui-bg-base shadow-xs">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>PO Identifier & Summary</Table.HeaderCell>
              <Table.HeaderCell>Supplier / Vendor</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell>Order Value</Table.HeaderCell>
              <Table.HeaderCell>Expected Delivery</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                  Loading purchase orders...
                </Table.Cell>
              </Table.Row>
            ) : orders.length === 0 ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                  No purchase orders logged.
                </Table.Cell>
              </Table.Row>
            ) : (
              orders.map((po) => (
                <Table.Row key={po.id}>
                  <Table.Cell>
                    <StatusBadge
                      color={
                        po.status === 'APPROVED'
                          ? 'green'
                          : po.status === 'PENDING'
                          ? 'orange'
                          : 'red'
                      }
                    >
                      {po.status}
                    </StatusBadge>
                  </Table.Cell>

                  <Table.Cell>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-xs text-ui-fg-base">{po.name}</p>
                      <p className="text-[10px] text-ui-fg-muted font-mono">{po.category}</p>
                    </div>
                  </Table.Cell>

                  <Table.Cell className="text-xs text-ui-fg-base font-medium">
                    {po.vendorName}
                  </Table.Cell>

                  <Table.Cell className="text-xs text-ui-fg-subtle">
                    {po.lines.length} SKU{po.lines.length !== 1 ? 's' : ''} ({po.lines.reduce((s, l) => s + l.quantity, 0)} units)
                  </Table.Cell>

                  <Table.Cell className="text-xs font-mono font-bold text-ui-fg-base">
                    ${po.totalCost.toFixed(2)}
                  </Table.Cell>

                  <Table.Cell className="text-xs font-mono text-ui-fg-muted">
                    {po.shippingDueDate || 'TBD'}
                  </Table.Cell>

                  <Table.Cell className="text-right">
                    {po.status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="small"
                          variant="primary"
                          onClick={() => handleApprove(po.id)}
                          className="h-7 text-xs font-semibold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Authorize & Receive
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => handleReject(po.id)}
                          className="h-7 text-xs"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : po.status === 'APPROVED' ? (
                      <span className="text-[11px] font-mono text-emerald-600 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Received into Stock
                      </span>
                    ) : (
                      <span className="text-[11px] text-ui-fg-muted italic">Declined</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>

      {/* New PO Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Container className="max-w-lg w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                Draft MRO Purchase Order
              </Heading>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">PO Title / Requisition Name *</Label>
                <Input
                  value={newPo.name}
                  onChange={(e) => setNewPo({ ...newPo, name: e.target.value })}
                  placeholder="e.g. PO-2026-0043 – Slurry Impellers & Seals"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Vendor / Supplier</Label>
                  <Input
                    value={newPo.vendorName}
                    onChange={(e) => setNewPo({ ...newPo, vendorName: e.target.value })}
                    placeholder="e.g. Flowserve Corporation"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Category</Label>
                  <Input
                    value={newPo.category}
                    onChange={(e) => setNewPo({ ...newPo, category: e.target.value })}
                    placeholder="e.g. Emergency Restock"
                  />
                </div>
              </div>

              {/* Line Item */}
              <div className="p-3 bg-ui-bg-subtle rounded-lg border border-ui-border-base space-y-2">
                <span className="font-semibold text-xs text-ui-fg-base">Item Line Requisition</span>
                <div className="space-y-1">
                  <Label className="text-[10px] text-ui-fg-subtle">Catalog Part</Label>
                  <select
                    value={newPo.partId}
                    onChange={(e) => {
                      const p = parts.find((part) => part.id === e.target.value);
                      setNewPo({
                        ...newPo,
                        partId: e.target.value,
                        unitCost: p?.unitCost || newPo.unitCost,
                      });
                    }}
                    className="w-full h-8 px-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                  >
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.partNumber} - {p.name} (${p.unitCost?.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-ui-fg-subtle">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newPo.quantity}
                      onChange={(e) => setNewPo({ ...newPo, quantity: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-ui-fg-subtle">Unit Price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newPo.unitCost}
                      onChange={(e) => setNewPo({ ...newPo, unitCost: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="text-right text-xs font-mono font-bold text-ui-fg-base pt-1">
                  Line Total: ${(newPo.quantity * newPo.unitCost).toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Expected Shipping Due Date</Label>
                <Input
                  type="date"
                  value={newPo.shippingDueDate}
                  onChange={(e) => setNewPo({ ...newPo, shippingDueDate: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Requisition Notes</Label>
                <textarea
                  rows={2}
                  value={newPo.notes}
                  onChange={(e) => setNewPo({ ...newPo, notes: e.target.value })}
                  placeholder="Justification, project charge codes, or delivery instructions..."
                  className="w-full p-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Submit Purchase Order
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
