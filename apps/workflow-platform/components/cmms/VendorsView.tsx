'use client';

import React, { useState, useEffect } from 'react';
import { Badge, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, toast } from '@medusajs/ui';
import { Truck, Plus, Mail, Phone, MapPin, Star, DollarSign } from 'lucide-react';
import { requestCmms } from '@/lib/cmms-api';

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  hourlyRate: number | null;
  description: string;
  rating: number;
}

export default function VendorsView() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    hourlyRate: 120,
    description: '',
  });

  const loadVendors = async () => {
    setLoading(true);
    try {
      const data = await requestCmms<Vendor[]>('vendors');
      setVendors(data || []);
    } catch (err: any) {
      toast.error('Failed to load vendors', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor.name.trim()) {
      toast.error('Validation Error', { description: 'Vendor name is required' });
      return;
    }
    try {
      await requestCmms('vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newVendor,
          hourlyRate: newVendor.hourlyRate ? Number(newVendor.hourlyRate) : null,
        }),
      });
      toast.success('Vendor Registered', { description: `${newVendor.name} added to approved supplier list.` });
      setShowCreateModal(false);
      setNewVendor({ name: '', email: '', phone: '', address: '', hourlyRate: 120, description: '' });
      loadVendors();
    } catch (err: any) {
      toast.error('Failed to create vendor', { description: err.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <Heading level="h2" className="text-base font-bold text-ui-fg-base">
              Approved MRO Suppliers & Maintenance Contractors
            </Heading>
            <Text className="text-xs text-ui-fg-subtle">
              Vendor directories, service level agreements, contractor labor billing rates, and parts catalogues
            </Text>
          </div>
        </div>

        <Button
          variant="primary"
          size="small"
          onClick={() => setShowCreateModal(true)}
          className="text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Approved Supplier
        </Button>
      </div>

      {/* Vendors Table */}
      <div className="border border-ui-border-base rounded-xl overflow-hidden bg-ui-bg-base shadow-xs">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Supplier Company</Table.HeaderCell>
              <Table.HeaderCell>Product Lines & Service Scope</Table.HeaderCell>
              <Table.HeaderCell>Contractor Rate</Table.HeaderCell>
              <Table.HeaderCell>Vendor Rating</Table.HeaderCell>
              <Table.HeaderCell>Contact</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Facility Location</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 6 } as any)}>
                  Loading vendors...
                </Table.Cell>
              </Table.Row>
            ) : vendors.length === 0 ? (
              <Table.Row>
                <Table.Cell className="text-center py-8 text-ui-fg-muted" {...({ colSpan: 6 } as any)}>
                  No vendors registered.
                </Table.Cell>
              </Table.Row>
            ) : (
              vendors.map((v) => (
                <Table.Row key={v.id}>
                  <Table.Cell>
                    <div>
                      <p className="font-semibold text-xs text-ui-fg-base">{v.name}</p>
                      <p className="text-[10px] text-ui-fg-muted font-mono">{v.email}</p>
                    </div>
                  </Table.Cell>

                  <Table.Cell className="text-xs text-ui-fg-subtle max-w-xs">
                    {v.description}
                  </Table.Cell>

                  <Table.Cell className="text-xs font-mono font-bold text-ui-fg-base">
                    {v.hourlyRate ? `$${v.hourlyRate}/hr` : 'Catalog Pricing'}
                  </Table.Cell>

                  <Table.Cell>
                    <div className="flex items-center gap-1 text-amber-500 font-bold text-xs font-mono">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {v.rating ? v.rating.toFixed(1) : '5.0'}
                    </div>
                  </Table.Cell>

                  <Table.Cell className="text-xs font-mono text-ui-fg-muted">
                    {v.phone || '—'}
                  </Table.Cell>

                  <Table.Cell className="text-right text-xs text-ui-fg-subtle max-w-xs truncate">
                    {v.address || '—'}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>

      {/* New Vendor Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Container className="max-w-md w-full p-6 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                Enroll Approved MRO Supplier
              </Heading>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Company Name *</Label>
                <Input
                  value={newVendor.name}
                  onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                  placeholder="e.g. SKF Bearing Services Inc."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Orders Email</Label>
                  <Input
                    type="email"
                    value={newVendor.email}
                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                    placeholder="orders@supplier.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Phone</Label>
                  <Input
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                    placeholder="+1 800-555-0100"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Contractor Labor Rate ($/hr if applicable)</Label>
                <Input
                  type="number"
                  value={newVendor.hourlyRate}
                  onChange={(e) => setNewVendor({ ...newVendor, hourlyRate: parseFloat(e.target.value) || 0 })}
                  placeholder="120"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Product Line / Maintenance Capability</Label>
                <textarea
                  rows={2}
                  value={newVendor.description}
                  onChange={(e) => setNewVendor({ ...newVendor, description: e.target.value })}
                  placeholder="Bearings, mechanical seals, gearbox overhauls, dynamic balancing..."
                  className="w-full p-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Headquarters / Warehouse Address</Label>
                <Input
                  value={newVendor.address}
                  onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                  placeholder="100 Industrial Parkway, Reno, NV"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button variant="secondary" size="small" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" type="submit">
                  Enroll Supplier
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
