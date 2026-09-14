'use client';

import React, { useState, useEffect } from 'react';
import { Badge, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, toast } from '@medusajs/ui';
import { ClipboardList, Plus, CheckCircle2, XCircle, ArrowRight, ExternalLink, Filter, Search } from 'lucide-react';
import type { CmmsAsset } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  assetId: string | null;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  contact: string;
  convertedWoId: string | null;
  createdAt: string;
  cancellationReason: string | null;
}

interface Props {
  assets: CmmsAsset[];
  onRefresh: () => void;
}

export default function RequestPortalView({ assets, onRefresh }: Props) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Request Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRequest, setNewRequest] = useState({
    title: '',
    description: '',
    assetId: '',
    priority: 'MEDIUM' as const,
    contact: '',
  });

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await requestCmms<MaintenanceRequest[]>('requests');
      setRequests(data || []);
    } catch (err: any) {
      toast.error('Failed to load requests', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const res = await requestCmms<any>(`requests/${id}/approve`, {
        method: 'PATCH',
      });
      toast.success('Request Approved', {
        description: `Dispatched reactive work order: ${res.workOrder?.woNumber || 'WO Created'}`,
      });
      loadRequests();
      onRefresh();
    } catch (err: any) {
      toast.error('Approval failed', { description: err.message });
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Please enter the reason for rejection:');
    if (reason === null) return;
    try {
      await requestCmms(`requests/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      toast.success('Request Declined', { description: 'Request marked as rejected.' });
      loadRequests();
    } catch (err: any) {
      toast.error('Rejection failed', { description: err.message });
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.title.trim()) {
      toast.error('Validation Error', { description: 'Title is required' });
      return;
    }
    try {
      await requestCmms('requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRequest,
          assetId: newRequest.assetId || null,
        }),
      });
      toast.success('Service Request Logged', { description: 'Ticket submitted for planner review.' });
      setShowCreateModal(false);
      setNewRequest({ title: '', description: '', assetId: '', priority: 'MEDIUM', contact: '' });
      loadRequests();
    } catch (err: any) {
      toast.error('Failed to create request', { description: err.message });
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              Maintenance Service Requests & Intake Queue
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Self-service employee ticketing, triage queue, and work order conversion workflow
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              window.open('/cmms/requests', '_blank');
            }}
            className="text-xs flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Public Portal Link
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Service Request
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="flex items-center gap-2 w-full px-2.5 py-1 rounded-md border border-ui-border-base bg-ui-bg-base text-xs">
            <Search className="w-3.5 h-3.5 text-ui-fg-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search request issues..."
              className="w-full bg-transparent text-xs text-ui-fg-base outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-ui-bg-base border border-ui-border-base rounded-md p-1 text-xs">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterStatus === st
                  ? 'bg-ui-fg-base text-ui-bg-base font-semibold'
                  : 'text-ui-fg-muted hover:text-ui-fg-base'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      <div className="border border-ui-border-base rounded-xl overflow-hidden bg-ui-bg-base shadow-xs">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Issue Summary</Table.HeaderCell>
              <Table.HeaderCell>Affected Asset</Table.HeaderCell>
              <Table.HeaderCell>Priority</Table.HeaderCell>
              <Table.HeaderCell>Submitted By</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                  Loading maintenance requests...
                </Table.Cell>
              </Table.Row>
            ) : filteredRequests.length === 0 ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 7 } as any)}>
                  No service requests matching current filters.
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredRequests.map((req) => {
                const asset = assets.find((a) => a.id === req.assetId);

                return (
                  <Table.Row key={req.id}>
                    <Table.Cell>
                      <StatusBadge
                        color={
                          req.status === 'APPROVED'
                            ? 'green'
                            : req.status === 'PENDING'
                            ? 'blue'
                            : 'red'
                        }
                      >
                        {req.status}
                      </StatusBadge>
                    </Table.Cell>

                    <Table.Cell>
                      <div className="space-y-0.5 max-w-sm">
                        <p className="font-semibold text-xs text-ui-fg-base line-clamp-1">{req.title}</p>
                        <p className="text-[11px] text-ui-fg-subtle line-clamp-2">{req.description}</p>
                        {req.cancellationReason && (
                          <p className="text-[10px] text-rose-500 italic">Reason: {req.cancellationReason}</p>
                        )}
                      </div>
                    </Table.Cell>

                    <Table.Cell className="text-xs text-ui-fg-muted font-medium">
                      {asset ? asset.name : req.assetId || 'Facility General'}
                    </Table.Cell>

                    <Table.Cell>
                      <Badge
                        size="small"
                        color={
                          req.priority === 'EMERGENCY'
                            ? 'orange'
                            : req.priority === 'HIGH'
                            ? 'orange'
                            : 'blue'
                        }
                      >
                        {req.priority}
                      </Badge>
                    </Table.Cell>

                    <Table.Cell className="text-xs text-ui-fg-base font-mono">
                      {req.contact || 'Anonymous'}
                    </Table.Cell>

                    <Table.Cell className="text-xs text-ui-fg-muted font-mono">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </Table.Cell>

                    <Table.Cell className="text-right">
                      {req.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="primary"
                            onClick={() => handleApprove(req.id)}
                            className="h-7 text-xs font-semibold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & Dispatch
                          </Button>
                          <Button
                            size="small"
                            variant="danger"
                            onClick={() => handleReject(req.id)}
                            className="h-7 text-xs"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : req.status === 'APPROVED' ? (
                        <span className="text-[11px] font-mono text-emerald-600 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> WO Dispatched
                        </span>
                      ) : (
                        <span className="text-[11px] text-ui-fg-muted italic">Declined</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
      </div>

      {/* New Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Container className="max-w-lg w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                Submit Maintenance Service Request
              </Heading>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Issue Title *</Label>
                <Input
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                  placeholder="e.g. Conveyor belt vibrating violently near Feed Hopper 2"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Associated Asset</Label>
                <select
                  value={newRequest.assetId}
                  onChange={(e) => setNewRequest({ ...newRequest, assetId: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="">(Select Asset / Equipment)</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.hierarchyLevel}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Perceived Urgency</Label>
                  <select
                    value={newRequest.priority}
                    onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value as any })}
                    className="w-full h-8 px-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                  >
                    <option value="LOW">Low - Routine</option>
                    <option value="MEDIUM">Medium - Priority</option>
                    <option value="HIGH">High - Urgent</option>
                    <option value="EMERGENCY">Emergency - Immediate Hazard</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Your Name / Shift Contact</Label>
                  <Input
                    value={newRequest.contact}
                    onChange={(e) => setNewRequest({ ...newRequest, contact: e.target.value })}
                    placeholder="e.g. Tony N. (Shift Lead)"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Detailed Observations</Label>
                <textarea
                  rows={3}
                  value={newRequest.description}
                  onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                  placeholder="Describe sounds, leaks, fault codes, or equipment performance degradation..."
                  className="w-full p-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Submit Request
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
