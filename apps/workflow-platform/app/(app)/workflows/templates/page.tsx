'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Container, Heading, StatusBadge, Text } from '@medusajs/ui';
import { PlaySolid, ArrowsPointingOut } from '@medusajs/icons';

interface DagNode {
  id: string;
  name: string;
  type: string;
  service_target: string;
  action: string;
}

interface DagEdge {
  from: string;
  to: string;
  condition?: string;
}

interface WorkflowTemplate {
  id: string;
  workflow_code: string;
  name: string;
  description: string;
  category: string;
  active_version: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  status: 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'ARCHIVED';
  dag_definition: {
    nodes: DagNode[];
    edges: DagEdge[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  ORDER_TO_CASH: 'Order to Cash',
  PROCURE_TO_PAY: 'Procure to Pay',
  TREASURY_HEDGING: 'Treasury & Hedging',
  ACCOUNTS_RECEIVABLE: 'Accounts Receivable',
};

const CATEGORY_COLORS: Record<string, 'blue' | 'orange' | 'green' | 'purple' | 'grey'> = {
  ORDER_TO_CASH: 'blue',
  PROCURE_TO_PAY: 'orange',
  TREASURY_HEDGING: 'green',
  ACCOUNTS_RECEIVABLE: 'purple',
};

const TRIGGER_ICONS: Record<string, string> = {
  EVENT_WEBHOOK: '⚡',
  WEBHOOK_OR_EVENT: '⚡',
  SCHEDULED_CRON: '⏰',
  MANUAL: '▶',
  API_TRIGGER: '🔌',
};

export default function WorkflowTemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflow-studio/workflows?status=ACTIVE');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title ?? `Service responded with ${res.status}`);
      }
      const data = await res.json();
      setTemplates(data.workflows ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Workflow Studio service is temporarily unavailable.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function handleUseTemplate(wf: WorkflowTemplate) {
    setCloning(wf.id);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/workflow-studio/workflows/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_workflow_code: wf.workflow_code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title ?? `Failed to clone template (${res.status})`);
      }
      const data = await res.json();
      setNotice(
        `Template "${wf.name}" cloned to your workspace as "${data.workflow?.workflow_code ?? wf.workflow_code}". Navigate to Pipelines to activate it.`,
      );
    } catch (err: any) {
      setError(err.message ?? 'Failed to clone template.');
    } finally {
      setCloning(null);
    }
  }

  return (
    <div className="min-h-screen bg-ui-bg-subtle p-6 font-sans">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1 text-xs text-ui-fg-muted">
            <Link href="/workflows">Workflow Studio</Link>
            <span>›</span>
            <span className="text-ui-fg-base">Templates</span>
          </div>
          <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">Workflow Templates</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Production-ready workflow blueprints built for enterprise finance and operations. Clone and customize.
          </Text>
        </div>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {notice && (
          <div className="mb-6 rounded-lg border border-ui-border-base bg-ui-bg-base px-4 py-3">
            <Text size="small" className="text-ui-fg-base">{notice}</Text>
          </div>
        )}

        {loading ? (
          <Container className="p-12 text-center border border-ui-border-base bg-ui-bg-base">
            <Text size="small" className="text-ui-fg-muted">Loading workflow templates…</Text>
          </Container>
        ) : templates.length === 0 && !error ? (
          <Container className="p-12 text-center border border-dashed border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
            <Heading level="h3" className="text-base font-semibold text-ui-fg-base">No Templates Available</Heading>
            <Text size="small" className="text-ui-fg-muted max-w-md mx-auto">
              No workflow templates found. Create your own pipeline from scratch.
            </Text>
            <Link href="/workflows/new">
              <Button variant="primary" size="small">+ New Pipeline</Button>
            </Link>
          </Container>
        ) : (
          /* Template grid */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {templates.map((wf) => (
              <div
                key={wf.id}
                className={`rounded-xl border bg-ui-bg-base p-6 flex flex-col gap-4 transition cursor-pointer ${
                  selected === wf.id ? 'border-ui-border-interactive shadow-elevation-card-hover' : 'border-ui-border-base hover:border-ui-border-strong'
                }`}
                onClick={() => setSelected(selected === wf.id ? null : wf.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{TRIGGER_ICONS[wf.trigger_type] ?? '▶'}</span>
                      <Heading level="h2" className="text-sm font-semibold text-ui-fg-base">{wf.name}</Heading>
                    </div>
                    <code className="font-mono text-[10px] text-ui-fg-interactive">{wf.workflow_code}</code>
                  </div>
                  <StatusBadge color={wf.status === 'ACTIVE' ? 'green' : 'orange'}>{wf.status.toLowerCase()}</StatusBadge>
                </div>

                <Text size="xsmall" className="text-ui-fg-subtle leading-relaxed">{wf.description}</Text>

                {/* Metadata chips */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge color={CATEGORY_COLORS[wf.category] ?? 'grey'} size="small">
                    {CATEGORY_LABELS[wf.category] ?? wf.category}
                  </Badge>
                  <Badge color="grey" size="small">{wf.trigger_type.replace(/_/g, ' ')}</Badge>
                  {wf.dag_definition?.nodes && (
                    <Badge color="grey" size="small">{wf.dag_definition.nodes.length} nodes</Badge>
                  )}
                  <Badge color="grey" size="small">v{wf.active_version}</Badge>
                </div>

                {/* DAG node list (expanded) */}
                {selected === wf.id && wf.dag_definition?.nodes && (
                  <div className="border-t border-ui-border-base pt-4">
                    <Text size="xsmall" className="font-medium text-ui-fg-subtle uppercase mb-2">DAG Steps</Text>
                    <div className="space-y-1.5">
                      {wf.dag_definition.nodes.map((node: DagNode, idx: number) => (
                        <div key={node.id} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded-full bg-ui-bg-subtle border border-ui-border-base flex items-center justify-center text-[10px] font-mono text-ui-fg-muted flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-ui-fg-base">{node.name}</span>
                          <Badge color="grey" size="small">{node.type}</Badge>
                          <span className="text-ui-fg-muted font-mono text-[10px] ml-auto">{node.service_target}</span>
                        </div>
                      ))}
                    </div>
                    {wf.trigger_type === 'SCHEDULED_CRON' && Boolean(wf.trigger_config?.cron_expression) && (
                      <div className="mt-3 rounded bg-ui-bg-subtle px-2.5 py-1.5 text-xs font-mono text-ui-fg-subtle">
                        Cron: {String(wf.trigger_config?.cron_expression)}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2">
                  <Link href={`/workflows/${wf.workflow_code}/canvas`} className="flex-1">
                    <Button variant="secondary" size="small" className="w-full">
                      <ArrowsPointingOut className="w-3.5 h-3.5 mr-1" />
                      Preview Canvas
                    </Button>
                  </Link>
                  <Button
                    variant="primary"
                    size="small"
                    className="flex-1"
                    onClick={(e) => { e.stopPropagation(); void handleUseTemplate(wf); }}
                    disabled={cloning === wf.id}
                    isLoading={cloning === wf.id}
                  >
                    <PlaySolid className="w-3.5 h-3.5 mr-1" />
                    Use Template
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA for custom */}
        <div className="mt-10 rounded-xl border border-dashed border-ui-border-base p-8 text-center">
          <Heading level="h2" className="text-base font-semibold text-ui-fg-base mb-2">Build from scratch</Heading>
          <Text size="small" className="text-ui-fg-muted mb-4">
            Start with a blank canvas and compose your own workflow with any combination of nodes.
          </Text>
          <Link href="/workflows/new">
            <Button variant="primary" size="small">+ New Pipeline</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
