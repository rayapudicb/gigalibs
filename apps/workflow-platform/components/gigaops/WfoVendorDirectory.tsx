'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoSupportTicketRecordV1, WfoVendorRecordV1 } from '@gigalibs/contracts';
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

export function WfoVendorDirectory() {
  const [activeTab, setActiveTab] = useState<'vendors' | 'tickets'>('vendors');
  const [vendors, setVendors] = useState<WfoVendorRecordV1[]>([]);
  const [tickets, setTickets] = useState<WfoSupportTicketRecordV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [vendorName, setVendorName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('NET30');
  const [taxId, setTaxId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [vData, tData] = await Promise.all([
        workforceApi.wfoListVendors(),
        workforceApi.wfoListSupportTickets().catch(() => []),
      ]);
      setVendors(vData || []);
      setTickets(tData || []);
    } catch (err: any) {
      console.error('Failed to load vendors:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRegisterVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName) return;

    try {
      setSaving(true);
      await workforceApi.wfoCreateVendor({
        name: vendorName,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        paymentTerms,
        taxId: taxId || undefined,
      });
      setActionAlert({
        type: 'success',
        message: `Vendor agency "${vendorName}" registered successfully.`,
      });
      setShowRegister(false);
      setVendorName('');
      setContactEmail('');
      setContactPhone('');
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Failed to register vendor agency.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level="h2" className="text-xl font-bold">Staffing Agencies & Vendors</Heading>
          <Text className="text-ui-fg-subtle text-sm">
            Third-party agency partnerships, contingency worker attribution, and help desk tickets.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ui-bg-subtle p-1 rounded-md border border-ui-border-base gap-1">
            <Button
              size="small"
              variant={activeTab === 'vendors' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('vendors')}
            >
              Agencies ({vendors.length})
            </Button>
            <Button
              size="small"
              variant={activeTab === 'tickets' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('tickets')}
            >
              Support Tickets ({tickets.length})
            </Button>
          </div>
          {activeTab === 'vendors' && (
            <Button size="small" variant="secondary" onClick={() => setShowRegister(true)}>
              Register Agency
            </Button>
          )}
        </div>
      </div>

      {actionAlert && (
        <Alert variant={actionAlert.type === 'success' ? 'success' : 'error'}>
          {actionAlert.message}
        </Alert>
      )}

      {/* Tab 1: Vendors */}
      {activeTab === 'vendors' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Vendor Agencies Directory</Heading>
              <Text className="text-xs text-ui-fg-subtle">Authorized suppliers and worker headcounts</Text>
            </div>
            <Badge color="green">{vendors.length} Partners</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Loading vendor partners...</div>
          ) : vendors.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">No staffing vendors registered yet.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Agency Name</Table.HeaderCell>
                  <Table.HeaderCell>Contact Email</Table.HeaderCell>
                  <Table.HeaderCell>Phone</Table.HeaderCell>
                  <Table.HeaderCell>Attributed Workers</Table.HeaderCell>
                  <Table.HeaderCell>Payment Terms</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {vendors.map((v) => (
                  <Table.Row key={v.id} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium text-ui-fg-base">{v.name}</Table.Cell>
                    <Table.Cell className="text-xs">{v.contactEmail || '—'}</Table.Cell>
                    <Table.Cell className="text-xs">{v.contactPhone || '—'}</Table.Cell>
                    <Table.Cell>
                      <Badge color="purple">{v.activeWorkersCount ?? 0} active</Badge>
                    </Table.Cell>
                    <Table.Cell className="text-xs">{v.paymentTerms || 'NET30'}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={v.status === 'ACTIVE' ? 'green' : 'orange'}>
                        {v.status}
                      </StatusBadge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}

      {/* Tab 2: Support Tickets */}
      {activeTab === 'tickets' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Frontline Support Desk</Heading>
              <Text className="text-xs text-ui-fg-subtle">Worker inquiries regarding payroll, schedules, and compliance</Text>
            </div>
            <Badge color="orange">{tickets.length} Tickets</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">No support tickets recorded.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Category</Table.HeaderCell>
                  <Table.HeaderCell>Subject</Table.HeaderCell>
                  <Table.HeaderCell>Priority</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Logged</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {tickets.map((t) => (
                  <Table.Row key={t.id} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium">{t.workerName || t.workerId.slice(0, 8)}</Table.Cell>
                    <Table.Cell><Badge color="grey">{t.category}</Badge></Table.Cell>
                    <Table.Cell className="font-medium text-xs">{t.subject}</Table.Cell>
                    <Table.Cell>
                      <Badge color={t.priority === 'HIGH' || t.priority === 'URGENT' ? 'red' : 'blue'}>
                        {t.priority}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={t.status === 'OPEN' ? 'orange' : t.status === 'RESOLVED' ? 'green' : 'grey'}>
                        {t.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-muted">{new Date(t.createdAt).toLocaleDateString()}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}

      {/* Modal: Register Agency */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Container className="w-full max-w-md p-6 bg-ui-bg-base border border-ui-border-base rounded-xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-ui-border-base pb-3">
              <Heading level="h3" className="text-base font-bold">Register Staffing Agency</Heading>
              <Button size="small" variant="transparent" onClick={() => setShowRegister(false)}>✕</Button>
            </div>

            <form onSubmit={handleRegisterVendor} className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Agency Name</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Adecco / Randstad / Kelly Services"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Contact Email</Label>
                <Input
                  className="mt-1"
                  type="email"
                  placeholder="e.g. accounts@agency.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. +1 800 555 0100"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Payment Terms</Label>
                  <Input
                    className="mt-1"
                    placeholder="NET30"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Tax ID / EIN</Label>
                  <Input
                    className="mt-1"
                    placeholder="XX-XXXXXXX"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button size="small" variant="secondary" onClick={() => setShowRegister(false)} type="button">
                  Cancel
                </Button>
                <Button size="small" variant="primary" type="submit" disabled={saving}>
                  {saving ? 'Registering...' : 'Register Agency'}
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
