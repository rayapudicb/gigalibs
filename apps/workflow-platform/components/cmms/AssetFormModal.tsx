'use client';

import React, { useState } from 'react';
import { Button, Container, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { Factory, X, Layers, Save, Cpu } from 'lucide-react';
import type { CmmsAsset } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

interface Props {
  asset?: CmmsAsset | null;
  parentAssets: CmmsAsset[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AssetFormModal({
  asset,
  parentAssets,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!asset;
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: asset?.name || '',
    description: asset?.description || '',
    hierarchyLevel: asset?.hierarchyLevel || 'MACHINE',
    parentAssetId: asset?.parentAssetId || '',
    status: asset?.status || 'OPERATIONAL',
    criticality: asset?.criticality || 'MEDIUM',
    manufacturer: asset?.manufacturer || '',
    model: asset?.model || '',
    serialNumber: asset?.serialNumber || '',
    assetTag: asset?.assetTag || '',
    power: asset?.power || '',
    area: asset?.area || '',
    acquisitionCost: asset?.acquisitionCost || 0,
    ravCost: asset?.ravCost || 0,
    assignedTo: asset?.assignedTo || '',
    purchaseDate: asset?.purchaseDate || '',
    warrantyExpiry: asset?.warrantyExpiry || '',
    iotDeviceId: asset?.iotDeviceId || '',
    scadaEndpoint: asset?.scadaEndpoint || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Validation Error', { description: 'Asset name is required.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        parentAssetId: formData.parentAssetId || null,
        acquisitionCost: Number(formData.acquisitionCost) || null,
        ravCost: Number(formData.ravCost) || null,
      };

      if (isEdit && asset) {
        await requestCmms(`assets/${asset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Asset Updated', { description: `${formData.name} specifications saved successfully.` });
      } else {
        await requestCmms('assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Asset Registered', { description: `${formData.name} registered into digital twin hierarchy.` });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Failed to Save Asset', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <Container className="max-w-3xl w-full p-0 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-ui-border-base bg-ui-bg-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <Heading level="h2" className="text-base font-bold text-ui-fg-base">
                {isEdit ? `Edit Asset: ${asset?.name}` : 'Register New Enterprise Asset'}
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                ISO 14224 equipment classification, SCADA bindings, and maintenance parameters
              </Text>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-base transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
          {/* Section 1: Core Identity */}
          <div className="space-y-3">
            <h3 className="font-semibold text-xs text-ui-fg-muted uppercase tracking-wider">
              Asset Identity & Hierarchy
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs text-ui-fg-subtle">Asset Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Warman 6x4 Primary Centrifugal Slurry Pump"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Hierarchy Level (ISO 14224)</Label>
                <select
                  value={formData.hierarchyLevel}
                  onChange={(e) => setFormData({ ...formData, hierarchyLevel: e.target.value as any })}
                  className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="SITE">Site / Plant</option>
                  <option value="BUILDING">Building / Sector</option>
                  <option value="LINE">Production Line / Circuit</option>
                  <option value="MACHINE">Machine / Primary Asset</option>
                  <option value="ASSEMBLY">Assembly / Sub-System</option>
                  <option value="COMPONENT">Component / Wear Part</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Parent Asset</Label>
                <select
                  value={formData.parentAssetId}
                  onChange={(e) => setFormData({ ...formData, parentAssetId: e.target.value })}
                  className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="">(None - Top Level Node)</option>
                  {parentAssets
                    .filter((a) => !asset || a.id !== asset.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.hierarchyLevel}] {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Operational Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="OPERATIONAL">OPERATIONAL</option>
                  <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Asset Criticality</Label>
                <select
                  value={formData.criticality}
                  onChange={(e) => setFormData({ ...formData, criticality: e.target.value as any })}
                  className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL (Direct Plant Trip Risk)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Technical Specifications */}
          <div className="space-y-3 pt-2 border-t border-ui-border-base">
            <h3 className="font-semibold text-xs text-ui-fg-muted uppercase tracking-wider">
              Technical Specifications & OEM
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Manufacturer</Label>
                <Input
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g. Metso Outotec"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Model / Spec</Label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g. Warman 6x4"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Serial Number</Label>
                <Input
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="e.g. SN-9812-B"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Asset Tag / QR Code</Label>
                <Input
                  value={formData.assetTag}
                  onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                  placeholder="e.g. TAG-PMP-01"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Power Rating</Label>
                <Input
                  value={formData.power}
                  onChange={(e) => setFormData({ ...formData, power: e.target.value })}
                  placeholder="e.g. 480V 75kW"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Area / Bay</Label>
                <Input
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  placeholder="e.g. Mill Floor Bay 3"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Financial & Reliability Valuation */}
          <div className="space-y-3 pt-2 border-t border-ui-border-base">
            <h3 className="font-semibold text-xs text-ui-fg-muted uppercase tracking-wider">
              Financial & Capital Accounting
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Acquisition Cost ($)</Label>
                <Input
                  type="number"
                  value={formData.acquisitionCost}
                  onChange={(e) => setFormData({ ...formData, acquisitionCost: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Replacement Asset Value (RAV $)</Label>
                <Input
                  type="number"
                  value={formData.ravCost}
                  onChange={(e) => setFormData({ ...formData, ravCost: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Primary Lead Tech</Label>
                <Input
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="e.g. Marcus Vance"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Purchase / Commission Date</Label>
                <Input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Warranty Expiration</Label>
                <Input
                  type="date"
                  value={formData.warrantyExpiry}
                  onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 4: SCADA & IoT Telemetry */}
          <div className="space-y-3 pt-2 border-t border-ui-border-base">
            <h3 className="font-semibold text-xs text-ui-fg-muted uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-600" />
              SCADA & IoT Telemetry Binding
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">IoT Gateway / Device ID</Label>
                <Input
                  value={formData.iotDeviceId}
                  onChange={(e) => setFormData({ ...formData, iotDeviceId: e.target.value })}
                  placeholder="e.g. SCADA-PMP-VIB-01"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">MQTT / Telemetry Topic</Label>
                <Input
                  value={formData.scadaEndpoint}
                  onChange={(e) => setFormData({ ...formData, scadaEndpoint: e.target.value })}
                  placeholder="e.g. telemetry/slurry-pump-01/vibration"
                />
              </div>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border-base">
            <Button variant="secondary" size="small" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="small" type="submit" disabled={submitting}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Register Asset'}
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
}
