'use client';

import Link from 'next/link';
import React, { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
} from '@medusajs/ui';

export default function NewWorkflowPage() {
  const router = useRouter();
  const [workflowCode, setWorkflowCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('ORDER_TO_CASH');
  const [triggerType, setTriggerType] = useState('EVENT_WEBHOOK');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        workflow_code: workflowCode.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        category,
        trigger_type: triggerType,
        trigger_config: {
          source: 'MANUAL_WEBHOOK',
          created_at: new Date().toISOString(),
        },
        dag_definition: {
          nodes: [
            {
              id: 'step-trigger',
              name: `${name.trim()} Ingest Trigger`,
              type: 'TRIGGER',
              service_target: 'WEBHOOK',
              action: 'INGEST',
            },
            {
              id: 'step-validate',
              name: 'Data Studio Schema Verification',
              type: 'CONTRACT_VALIDATION',
              service_target: 'DATA_STUDIO_PORT_3800',
              action: 'VALIDATE_CONTRACT',
            },
          ],
          edges: [
            {
              from: 'step-trigger',
              to: 'step-validate',
            },
          ],
        },
      };

      const res = await fetch('/api/workflow-studio/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-corp-01',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.workflow) {
        throw new Error(data.message || data.detail || 'Unable to create workflow');
      }

      router.replace(`/workflows/${encodeURIComponent(data.workflow.workflow_code)}/canvas`);
    } catch (cause: any) {
      setError(cause.message || 'Unable to create workflow.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      <Link
        href="/workflows"
        className="text-xs font-medium text-ui-fg-subtle hover:text-ui-fg-base transition inline-flex items-center gap-1"
      >
        ← Back to Workflows
      </Link>
      <div className="border-b border-ui-border-base pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Badge color="purple" size="small">
            WORKFLOW STUDIO
          </Badge>
          <Badge color="blue" size="small">
            PORT 4000
          </Badge>
        </div>
        <Heading level="h1" className="text-2xl font-bold tracking-tight text-ui-fg-base">
          Create Deterministic Pipeline Draft
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Creates a tenant-isolated DAG definition with initial ingest &amp; contract verification steps.
        </Text>
      </div>

      <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest space-y-5">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="error" dismissible>
              <span>{error}</span>
            </Alert>
          )}

          <div>
            <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
              Workflow Code (Unique Identifier)
            </Label>
            <Input
              value={workflowCode}
              onChange={(e) => setWorkflowCode(e.target.value)}
              required
              placeholder="e.g. WF-LOGISTICS-CUSTOMS-CLEARANCE"
              size="small"
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
              Pipeline Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Cross-Border Customs & Duty Verification"
              size="small"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
              >
                <option value="ORDER_TO_CASH">Order-to-Cash</option>
                <option value="PROCURE_TO_PAY">Procure-to-Pay</option>
                <option value="TREASURY_HEDGING">Treasury &amp; FX</option>
                <option value="GENERAL_LEDGER">General Ledger</option>
              </select>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Trigger Type</Label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
              >
                <option value="EVENT_WEBHOOK">Inbound Webhook Event</option>
                <option value="SCHEDULE_CRON">Scheduled Cron Job</option>
                <option value="MANUAL">Manual Operator Trigger</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
              Description (Optional)
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Describe business orchestration, microservice handshakes, and retry semantics..."
              className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none transition"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              isLoading={saving}
              className="w-full"
            >
              Create Pipeline &amp; Open Visual Canvas
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
}
