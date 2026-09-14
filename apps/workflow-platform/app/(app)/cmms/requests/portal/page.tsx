'use client';

import React, { useState, useEffect } from 'react';
import { Button, Container, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { ClipboardList, CheckCircle2, ShieldCheck, Factory, AlertTriangle, Send } from 'lucide-react';
import type { CmmsAsset } from '@/lib/cmms-api';
import { requestCmms } from '@/lib/cmms-api';

export default function PublicRequestPortalPage() {
  const [assets, setAssets] = useState<CmmsAsset[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assetId: '',
    priority: 'MEDIUM' as const,
    contact: '',
  });

  useEffect(() => {
    requestCmms<{ data: CmmsAsset[] }>('assets/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSize: 100 }),
    })
      .then((res) => {
        if (res?.data) setAssets(res.data);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Validation Error', { description: 'Please provide a title for the issue.' });
      return;
    }

    setSubmitting(true);
    try {
      await requestCmms('requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          assetId: formData.assetId || null,
        }),
      });
      setSubmitted(true);
      toast.success('Ticket Submitted', {
        description: 'Your request has been routed to the maintenance planning dispatch queue.',
      });
    } catch (err: any) {
      toast.error('Submission Failed', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ui-bg-subtle flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex p-3 bg-blue-500/10 text-blue-600 rounded-2xl border border-blue-500/20">
          <ClipboardList className="w-8 h-8" />
        </div>
        <Heading level="h1" className="text-xl font-bold text-ui-fg-base">
          Plant Operations Service Request Portal
        </Heading>
        <Text className="text-xs text-ui-fg-subtle">
          Facility Maintenance, Equipment Breakdown &amp; Safety Issue Intake
        </Text>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-ui-bg-base py-8 px-6 shadow-xl sm:rounded-2xl sm:px-10 border border-ui-border-base">
          {submitted ? (
            <div className="text-center space-y-4 py-6">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                Request Dispatched to Maintenance
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                A maintenance supervisor has received your notification. A technician will be assigned according to the urgency of the problem.
              </Text>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setSubmitted(false);
                  setFormData({ title: '', description: '', assetId: '', priority: 'MEDIUM', contact: '' });
                }}
                className="mt-4"
              >
                Submit Another Request
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">What is the issue? *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Grinding noise coming from SAG Mill discharge chute"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Associated Machinery / Location</Label>
                <select
                  value={formData.assetId}
                  onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                  className="w-full h-9 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-field text-xs text-ui-fg-base outline-none"
                >
                  <option value="">(Select machinery if known)</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.hierarchyLevel}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Severity / Urgency</Label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-md border border-ui-border-base bg-ui-bg-field text-xs text-ui-fg-base outline-none font-semibold"
                  >
                    <option value="LOW">Low - Cosmetic / Routine</option>
                    <option value="MEDIUM">Medium - Normal Attention</option>
                    <option value="HIGH">High - Impending Failure</option>
                    <option value="EMERGENCY">Emergency - Immediate Hazard</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-ui-fg-subtle">Your Name / Radio Call</Label>
                  <Input
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="e.g. Dave Miller (Operator)"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-ui-fg-subtle">Detailed Observations &amp; Symptoms</Label>
                <textarea
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe abnormal sounds, smoke, hydraulic fluid leaks, vibrations, or error codes displayed on local HMI panels..."
                  className="w-full p-2.5 rounded-md border border-ui-border-base bg-ui-bg-field text-xs text-ui-fg-base outline-none"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="large"
                disabled={submitting}
                className="w-full font-bold flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Transmitting Request...' : 'Transmit Maintenance Request'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
