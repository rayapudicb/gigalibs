'use client';

import React, { useState } from 'react';
import { Button, Container, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { Clock, X, Calendar, Gauge, Save } from 'lucide-react';
import type { CmmsAsset, CmmsMeter, CmmsPmSchedule } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

interface Props {
  schedule?: CmmsPmSchedule | null;
  assets: CmmsAsset[];
  meters: CmmsMeter[];
  onClose: () => void;
  onSaved: () => void;
}

export default function PmScheduleFormModal({
  schedule,
  assets,
  meters,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!schedule;
  const [submitting, setSubmitting] = useState(false);

  // Recurrence preset vs custom cron
  const [frequencyPreset, setFrequencyPreset] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom'>('monthly');

  const [formData, setFormData] = useState({
    name: schedule?.name || '',
    description: schedule?.description || '',
    assetId: schedule?.assetId || assets[0]?.id || '',
    triggerType: schedule?.triggerType || 'CALENDAR',
    cronExpression: schedule?.cronExpression || '0 8 1 * *',
    meterId: schedule?.meterId || '',
    meterThreshold: schedule?.meterThreshold || 1000,
    woTitleTemplate: schedule?.woTitleTemplate || '',
    woDescription: schedule?.woDescription || '',
    woPriority: schedule?.woPriority || 'MEDIUM',
    assignedTo: schedule?.assignedTo || 'Marcus Vance',
    isActive: schedule?.isActive ?? true,
    nextDueAt: schedule?.nextDueAt || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const handlePresetChange = (preset: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom') => {
    setFrequencyPreset(preset);
    if (preset === 'daily') setFormData((prev) => ({ ...prev, cronExpression: '0 8 * * *' }));
    if (preset === 'weekly') setFormData((prev) => ({ ...prev, cronExpression: '0 8 * * 1' }));
    if (preset === 'monthly') setFormData((prev) => ({ ...prev, cronExpression: '0 8 1 * *' }));
    if (preset === 'quarterly') setFormData((prev) => ({ ...prev, cronExpression: '0 8 1 */3 *' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Validation Error', { description: 'Schedule name is required.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        woTitleTemplate: formData.woTitleTemplate || formData.name,
        meterThreshold: formData.triggerType !== 'CALENDAR' ? Number(formData.meterThreshold) : null,
        meterId: formData.triggerType !== 'CALENDAR' ? formData.meterId || null : null,
      };

      if (isEdit && schedule) {
        await requestCmms(`pm-schedules/${schedule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('PM Schedule Updated', { description: `${formData.name} frequency rules modified.` });
      } else {
        await requestCmms('pm-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('PM Schedule Created', { description: `${formData.name} added to auto-dispatch queue.` });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Failed to Save PM Schedule', { description: err.message });
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
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <Heading level="h2" className="text-base font-bold text-ui-fg-base">
                {isEdit ? `Edit PM Schedule: ${schedule?.name}` : 'Create Preventive Maintenance Rule'}
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Automated calendar recurrence or SCADA meter threshold work order generator
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
          <div className="space-y-1">
            <Label className="text-xs text-ui-fg-subtle">Schedule Title *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Slurry Pump 500-Hour Bearing Lubrication & Seal Flush"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-ui-fg-subtle">Target Asset *</Label>
              <select
                value={formData.assetId}
                onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                required
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.hierarchyLevel}] {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-ui-fg-subtle">Trigger Mechanism</Label>
              <select
                value={formData.triggerType}
                onChange={(e) => setFormData({ ...formData, triggerType: e.target.value as any })}
                className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none font-semibold"
              >
                <option value="CALENDAR">Calendar Frequency (Cron)</option>
                <option value="METER_THRESHOLD">Meter Threshold / Runtime Hours</option>
                <option value="BOTH">Dual Trigger (Whichever Reached First)</option>
              </select>
            </div>
          </div>

          {/* Calendar Frequency Options */}
          {(formData.triggerType === 'CALENDAR' || formData.triggerType === 'BOTH') && (
            <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-ui-fg-base flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  Recurrence Frequency
                </span>
                <span className="font-mono text-[11px] text-ui-fg-muted">
                  Cron: <code className="text-cyan-600 font-bold">{formData.cronExpression}</code>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(['daily', 'weekly', 'monthly', 'quarterly', 'custom'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetChange(preset)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${
                      frequencyPreset === preset
                        ? 'bg-ui-fg-base text-ui-bg-base'
                        : 'bg-ui-bg-base border border-ui-border-base text-ui-fg-muted hover:text-ui-fg-base'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {frequencyPreset === 'custom' && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-ui-fg-subtle">Standard 5-Field Cron Expression</Label>
                  <Input
                    value={formData.cronExpression}
                    onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                    placeholder="0 8 1 * *"
                    className="font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Next Due Date</Label>
                <Input
                  type="date"
                  value={formData.nextDueAt}
                  onChange={(e) => setFormData({ ...formData, nextDueAt: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Meter Trigger Options */}
          {(formData.triggerType === 'METER_THRESHOLD' || formData.triggerType === 'BOTH') && (
            <div className="p-3.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-3">
              <span className="font-semibold text-xs text-ui-fg-base flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-purple-500" />
                Condition-Based Meter Trigger
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-ui-fg-subtle">Select Sensor / Meter</Label>
                  <select
                    value={formData.meterId}
                    onChange={(e) => setFormData({ ...formData, meterId: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                  >
                    <option value="">(Select Meter)</option>
                    {meters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (Current: {m.currentValue} {m.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-ui-fg-subtle">Trigger Threshold</Label>
                  <Input
                    type="number"
                    value={formData.meterThreshold}
                    onChange={(e) => setFormData({ ...formData, meterThreshold: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Generated WO Details */}
          <div className="space-y-3 pt-2 border-t border-ui-border-base">
            <h4 className="font-semibold text-xs text-ui-fg-muted uppercase tracking-wider">
              Generated Work Order Template
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Generated Priority</Label>
                <select
                  value={formData.woPriority}
                  onChange={(e) => setFormData({ ...formData, woPriority: e.target.value as any })}
                  className="w-full h-8 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="EMERGENCY">EMERGENCY</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-ui-fg-subtle">Auto-Assign Technician</Label>
                <Input
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  placeholder="e.g. Marcus Vance"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-ui-fg-subtle">Standard Work Instructions</Label>
                <textarea
                  rows={3}
                  value={formData.woDescription}
                  onChange={(e) => setFormData({ ...formData, woDescription: e.target.value })}
                  placeholder="Provide step-by-step instructions for technicians executing this PM..."
                  className="w-full p-2 rounded-md border border-ui-border-base bg-ui-bg-base text-xs text-ui-fg-base outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="sched-active"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="sched-active" className="text-xs text-ui-fg-base cursor-pointer">
              Schedule active (auto-triggers according to frequency rules)
            </Label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ui-border-base">
            <Button variant="secondary" size="small" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="small" type="submit" disabled={submitting}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create PM Schedule'}
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
}
