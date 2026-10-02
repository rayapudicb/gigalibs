'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoOpenShiftV1, WfoShiftSwapRecordV1 } from '@gigalibs/contracts';
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
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

export function WfoShiftMarketplace() {
  const [activeTab, setActiveTab] = useState<'open_shifts' | 'swaps'>('open_shifts');
  const [openShifts, setOpenShifts] = useState<WfoOpenShiftV1[]>([]);
  const [swaps, setSwaps] = useState<WfoShiftSwapRecordV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Swap modal state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapBookingId, setSwapBookingId] = useState('');
  const [fromWorkerId, setFromWorkerId] = useState('');
  const [toWorkerId, setToWorkerId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [submittingSwap, setSubmittingSwap] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [shiftsData, swapsData] = await Promise.all([
        workforceApi.wfoListOpenShifts(),
        workforceApi.wfoListShiftSwaps(),
      ]);
      setOpenShifts(shiftsData || []);
      setSwaps(swapsData || []);
    } catch (err: any) {
      console.error('Failed to load marketplace data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleClaimShift = async (shift: WfoOpenShiftV1) => {
    try {
      const res = await workforceApi.wfoClaimShift(shift.bookingId);
      setActionAlert({
        type: 'success',
        message: `Shift successfully claimed! Booking status updated to CONFIRMED.`,
      });
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Could not claim shift. Conflict or already filled.',
      });
    }
  };

  const handleApproveSwap = async (swapId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await workforceApi.wfoApproveShiftSwap(swapId, { decision });
      setActionAlert({
        type: 'success',
        message: `Shift swap ${decision === 'APPROVE' ? 'approved and shift atomically reassigned' : 'rejected'}.`,
      });
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Failed to process swap decision.',
      });
    }
  };

  const handleCreateSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapBookingId || !fromWorkerId || !toWorkerId) return;

    try {
      setSubmittingSwap(true);
      await workforceApi.wfoCreateShiftSwap({
        fromBookingId: swapBookingId,
        fromWorkerId,
        toWorkerId,
        reason: swapReason,
      });
      setActionAlert({
        type: 'success',
        message: 'Shift swap request submitted for manager four-eyes approval.',
      });
      setShowSwapModal(false);
      setSwapBookingId('');
      setSwapReason('');
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Error submitting swap request.',
      });
    } finally {
      setSubmittingSwap(false);
    }
  };

  const getSwapStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'green';
      case 'PENDING':
        return 'orange';
      case 'REJECTED':
        return 'red';
      default:
        return 'grey';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level="h2" className="text-xl font-bold">Shift Marketplace & Self-Service Swaps</Heading>
          <Text className="text-ui-fg-subtle text-sm">
            Self-service open shifts claim, peer-to-peer swap requests, and four-eyes manager approvals.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ui-bg-subtle p-1 rounded-md border border-ui-border-base gap-1">
            <Button
              size="small"
              variant={activeTab === 'open_shifts' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('open_shifts')}
            >
              Open Shifts ({openShifts.length})
            </Button>
            <Button
              size="small"
              variant={activeTab === 'swaps' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('swaps')}
            >
              Shift Swaps Queue ({swaps.length})
            </Button>
          </div>
          <Button size="small" variant="secondary" onClick={() => setShowSwapModal(true)}>
            Request Swap
          </Button>
        </div>
      </div>

      {actionAlert && (
        <Alert
          variant={actionAlert.type === 'success' ? 'success' : 'error'}
        >
          {actionAlert.message}
        </Alert>
      )}

      {/* Tab 1: Open Shifts */}
      {activeTab === 'open_shifts' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Available Open Shifts</Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Browse unallocated shifts and claim instantly with automated overlap validation.
              </Text>
            </div>
            <Badge color="green">{openShifts.length} Shifts Open</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Scanning available shifts...</div>
          ) : openShifts.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">No open shifts available right now.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Position</Table.HeaderCell>
                  <Table.HeaderCell>Engagement</Table.HeaderCell>
                  <Table.HeaderCell>Shift Window</Table.HeaderCell>
                  <Table.HeaderCell>Rate</Table.HeaderCell>
                  <Table.HeaderCell>Location</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {openShifts.map((shift) => (
                  <Table.Row key={shift.bookingId} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium text-ui-fg-base">{shift.positionTitle}</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle">{shift.engagementTitle || 'General Operations'}</Table.Cell>
                    <Table.Cell className="text-xs">
                      <div>{new Date(shift.startsAt).toLocaleDateString()}</div>
                      <div className="text-ui-fg-muted">
                        {new Date(shift.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(shift.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-semibold">${shift.hourlyRate || 25}/hr</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle">{shift.location || 'Site Alpha'}</Table.Cell>
                    <Table.Cell className="text-right">
                      <Button size="small" variant="primary" onClick={() => handleClaimShift(shift)}>
                        Claim Shift
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}

      {/* Tab 2: Swaps Queue */}
      {activeTab === 'swaps' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Shift Swap Approval Queue</Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Four-eyes managerial review for peer swap requests with schedule conflict prevention.
              </Text>
            </div>
            <Badge color="orange">{swaps.filter((s) => s.status === 'PENDING').length} Pending Approvals</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Loading swap requests...</div>
          ) : swaps.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">No swap requests logged.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>From Worker</Table.HeaderCell>
                  <Table.HeaderCell>To Worker</Table.HeaderCell>
                  <Table.HeaderCell>Shift Time</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Decision</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {swaps.map((swap) => (
                  <Table.Row key={swap.id} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium">{swap.fromWorkerName || swap.fromWorkerId.slice(0, 8)}</Table.Cell>
                    <Table.Cell className="font-medium">{swap.toWorkerName || swap.toWorkerId.slice(0, 8)}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-muted">
                      {swap.shiftStartsAt ? new Date(swap.shiftStartsAt).toLocaleString() : 'Scheduled Shift'}
                    </Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle text-xs">{swap.reason || 'Personal request'}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={getSwapStatusColor(swap.status) as any}>
                        {swap.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {swap.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="small" variant="primary" onClick={() => handleApproveSwap(swap.id, 'APPROVE')}>
                            Approve
                          </Button>
                          <Button size="small" variant="danger" onClick={() => handleApproveSwap(swap.id, 'REJECT')}>
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-ui-fg-muted">Closed</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}

      {/* Modal: Request Swap */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Container className="w-full max-w-md p-6 bg-ui-bg-base border border-ui-border-base rounded-xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-ui-border-base pb-3">
              <Heading level="h3" className="text-base font-bold">Request Shift Swap</Heading>
              <Button size="small" variant="transparent" onClick={() => setShowSwapModal(false)}>✕</Button>
            </div>

            <form onSubmit={handleCreateSwap} className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Your Booking ID</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 11111111-1111-4111-8111-111111111111"
                  value={swapBookingId}
                  onChange={(e) => setSwapBookingId(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Your Worker ID</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 22222222-2222-4222-8222-222222222222"
                  value={fromWorkerId}
                  onChange={(e) => setFromWorkerId(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Target Peer Worker ID</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 33333333-3333-4333-8333-333333333333"
                  value={toWorkerId}
                  onChange={(e) => setToWorkerId(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Reason for Swap</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Personal emergency, childcare coverage"
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button size="small" variant="secondary" onClick={() => setShowSwapModal(false)} type="button">
                  Cancel
                </Button>
                <Button size="small" variant="primary" type="submit" disabled={submittingSwap}>
                  {submittingSwap ? 'Submitting...' : 'Submit Swap Request'}
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
