'use client';

import React, { useState } from 'react';
import { Button, Container, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { Boxes, X, Save, MapPin } from 'lucide-react';
import type { CmmsPart } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

interface Props {
  part?: CmmsPart | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PartFormModal({
  part,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!part;
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    partNumber: part?.partNumber || '',
    name: part?.name || '',
    description: part?.description || '',
    category: part?.category || 'Mechanical Components',
    unitOfMeasure: part?.unitOfMeasure || 'EACH',
    unitCost: part?.unitCost || 0,
    quantityOnHand: part?.quantityOnHand || 0,
    minQuantity: part?.minQuantity || 1,
    maxQuantity: part?.maxQuantity || 50,
    reorderPoint: part?.reorderPoint || 2,
    warehouse: part?.warehouse || 'WH-01',
    aisle: part?.aisle || 'A',
    rack: part?.rack || '01',
    bin: part?.bin || '01',
    barcode: part?.barcode || '',
    preferredVendor: part?.preferredVendor || '',
    leadTimeDays: part?.leadTimeDays || 3,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partNumber.trim() || !formData.name.trim()) {
      toast.error('Validation Error', { description: 'Part Number and Name are required.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        unitCost: Number(formData.unitCost),
        quantityOnHand: Number(formData.quantityOnHand),
        minQuantity: Number(formData.minQuantity),
        maxQuantity: Number(formData.maxQuantity),
        reorderPoint: Number(formData.reorderPoint),
        leadTimeDays: Number(formData.leadTimeDays),
      };

      if (isEdit && part) {
        await requestCmms(`parts/${part.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Part Updated', { description: `${formData.partNumber} modified in MRO catalog.` });
      } else {
        await requestCmms('parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Part Cataloged', { description: `${formData.partNumber} added to MRO warehouse.` });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Failed to Save Part', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ui-bg-overlay/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <Container className="max-w-2xl w-full p-0 bg-ui-bg-base border border-ui-border-base shadow-2xl rounded-xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-ui-border-base bg-ui-bg-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 border border-orange-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <Heading level="h2" className="text-base font-bold text-ui-fg-base">
                {isEdit ? `Edit Part: ${part?.partNumber}` : 'Add New Spare Part / MRO Item'}
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Catalog spare parts, warehouse multi-bin addresses, stock replenishment thresholds
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-ui-fg-subtle">Part Number (SKU) *</Label>
              <Input
                value={formData.partNumber}
                onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                placeholder="e.g. BRG-SKF-6314-C3"
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-ui-fg-subtle">Part Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Deep Groove Ball Bearing 70mm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-ui-fg-subtle">Category</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g. Bearings"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-ui-fg-subtle">Unit of Measure</Label>
              <select
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                className="w-full h-8 px-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
              >
                <option value="EACH">EACH</option>
                <option value="SET">SET</option>
                <option value="KIT">KIT</option>
                <option value="LITER">LITER</option>
                <option value="KG">KG</option>
                <option value="METER">METER</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-ui-fg-subtle">Unit Cost ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Stock Thresholds */}
          <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-3">
            <h4 className="font-semibold text-xs text-ui-fg-base">Inventory Levels & Reorder Triggers</h4>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Stock on Hand</Label>
                <Input
                  type="number"
                  value={formData.quantityOnHand}
                  onChange={(e) => setFormData({ ...formData, quantityOnHand: parseFloat(e.target.value) || 0 })}
                  className="font-bold font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorderPoint}
                  onChange={(e) => setFormData({ ...formData, reorderPoint: parseFloat(e.target.value) || 0 })}
                  className="font-mono text-rose-500"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Min Quantity</Label>
                <Input
                  type="number"
                  value={formData.minQuantity}
                  onChange={(e) => setFormData({ ...formData, minQuantity: parseFloat(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Max Capacity</Label>
                <Input
                  type="number"
                  value={formData.maxQuantity}
                  onChange={(e) => setFormData({ ...formData, maxQuantity: parseFloat(e.target.value) || 0 })}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Multi-Bin Coordinates */}
          <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-3">
            <h4 className="font-semibold text-xs text-ui-fg-base flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-600" />
              Multi-Bin Warehouse Address Coordinates
            </h4>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Warehouse</Label>
                <Input
                  value={formData.warehouse}
                  onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                  placeholder="WH-01"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Aisle</Label>
                <Input
                  value={formData.aisle}
                  onChange={(e) => setFormData({ ...formData, aisle: e.target.value })}
                  placeholder="A"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Rack</Label>
                <Input
                  value={formData.rack}
                  onChange={(e) => setFormData({ ...formData, rack: e.target.value })}
                  placeholder="03"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Bin / Shelf</Label>
                <Input
                  value={formData.bin}
                  onChange={(e) => setFormData({ ...formData, bin: e.target.value })}
                  placeholder="12"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Supplier & Logistics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-ui-fg-subtle">Preferred Vendor / Supplier</Label>
              <Input
                value={formData.preferredVendor}
                onChange={(e) => setFormData({ ...formData, preferredVendor: e.target.value })}
                placeholder="e.g. Motion Industries"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-ui-fg-subtle">Lead Time (Days)</Label>
              <Input
                type="number"
                value={formData.leadTimeDays}
                onChange={(e) => setFormData({ ...formData, leadTimeDays: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border-base">
            <Button variant="secondary" size="small" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="small" type="submit" disabled={submitting}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Catalog Part'}
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
}
