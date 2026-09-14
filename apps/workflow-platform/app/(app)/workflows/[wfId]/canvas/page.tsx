'use client';

import '@xyflow/react/dist/style.css';
import React, { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Text,
} from '@medusajs/ui';
import {
  ArrowPath,
  PlaySolid,
  CheckCircleSolid,
  XCircleSolid,
  ClockSolid,
  CommandLine,
} from '@medusajs/icons';

interface CanvasNodeData extends Record<string, unknown> {
  label: string;
  name: string;
  nodeType: string;
  serviceTarget: string;
  action: string;
  config: Record<string, any>;
}

type CanvasNode = Node<CanvasNodeData>;

interface WorkflowDetails {
  id: string;
  tenant_id: string;
  workflow_code: string;
  name: string;
  description: string;
  category: string;
  active_version: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  status: 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'ARCHIVED';
  dag_definition: {
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      service_target: string;
      action: string;
      config?: any;
      position?: { x: number; y: number };
    }>;
    edges: Array<{
      id?: string;
      from?: string;
      source?: string;
      to?: string;
      target?: string;
      condition?: string;
      label?: string;
    }>;
  };
}

export default function WorkflowCanvasPage() {
  const params = useParams<{ wfId: string }>();
  const router = useRouter();
  const workflowId = params.wfId;

  const [workflow, setWorkflow] = useState<WorkflowDetails | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configText, setConfigText] = useState('{}');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Execution modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [runInputText, setRunInputText] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflow-studio/workflows/${encodeURIComponent(workflowId)}`);
      const data = await res.json();
      if (!res.ok || !data.workflow) {
        throw new Error(data.message || 'Workflow not found');
      }

      const loaded: WorkflowDetails = data.workflow;
      setWorkflow(loaded);

      // Prepopulate run input with default payload
      if (loaded.trigger_config && Object.keys(loaded.trigger_config).length > 0) {
        setRunInputText(JSON.stringify(loaded.trigger_config, null, 2));
      } else {
        setRunInputText(
          JSON.stringify(
            {
              order_id: 'SO-2026-8819',
              customer_id: 'CUST-EU-901',
              currency: 'EUR',
              amount: 145000,
            },
            null,
            2
          )
        );
      }

      // Map DAG nodes
      const rawNodes = loaded.dag_definition?.nodes || [];
      const mappedNodes: CanvasNode[] = rawNodes.map((node, index) => {
        const xPos = node.position?.x ?? index * 260 + 60;
        const yPos = node.position?.y ?? (180 + (index % 2 === 1 ? 90 : 0));
        return {
          id: node.id,
          type: index === 0 ? 'input' : index === rawNodes.length - 1 ? 'output' : 'default',
          position: { x: xPos, y: yPos },
          data: {
            label: node.name || node.id,
            name: node.name || node.id,
            nodeType: node.type || 'STEP',
            serviceTarget: node.service_target || 'INTERNAL',
            action: node.action || 'EXECUTE',
            config: node.config || {},
          },
        };
      });

      // Map DAG edges
      const rawEdges = loaded.dag_definition?.edges || [];
      const mappedEdges: Edge[] = rawEdges.map((edge, index) => {
        const source = edge.source || edge.from || '';
        const target = edge.target || edge.to || '';
        return {
          id: edge.id || `edge-${source}-${target}-${index}`,
          source,
          target,
          label: edge.condition || edge.label || undefined,
          animated: true,
          style: { stroke: 'var(--border-interactive, #6366f1)', strokeWidth: 2 },
        };
      });

      setNodes(mappedNodes);
      setEdges(mappedEdges);
      setSelectedId(null);
    } catch (cause: any) {
      setError(cause.message || 'Unable to load workflow.');
    } finally {
      setLoading(false);
    }
  }, [setEdges, setNodes, workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  function selectNode(node: CanvasNode) {
    setSelectedId(node.id);
    setConfigText(JSON.stringify(node.data.config, null, 2));
    setError(null);
  }

  // Execute workflow
  async function handleExecuteRun(event: FormEvent) {
    event.preventDefault();
    if (!workflow) return;
    setExecuting(true);
    setError(null);
    setExecutionResult(null);

    try {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(runInputText);
      } catch {
        throw new Error('Input payload must be valid JSON.');
      }

      const res = await fetch(`/api/workflow-studio/workflows/${workflow.workflow_code}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-corp-01',
        },
        body: JSON.stringify({
          trigger_type: 'MANUAL',
          input_payload: parsedInput,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const rawErr = data.message || data.detail || 'Execution failed';
        const cleanErr = typeof rawErr === 'string' && rawErr.toLowerCase().includes('upstream service is unavailable')
          ? 'Service is temporarily synchronizing. Please try again shortly.'
          : rawErr;
        throw new Error(cleanErr);
      }

      setExecutionResult(data);
      setNotice(`Run ${data.run.id} completed successfully in ${data.run.duration_ms}ms!`);
    } catch (cause: any) {
      const msg = cause.message || 'Unable to start workflow run.';
      setError(msg.toLowerCase().includes('upstream service is unavailable') ? 'Service is temporarily synchronizing. Please try again shortly.' : msg);
    } finally {
      setExecuting(false);
    }
  }

  if (loading && !workflow) {
    return <div className="p-8 text-xs text-ui-fg-muted font-sans">Loading workflow canvas…</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Top Canvas Header ─────────────────────────────────────── */}
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-ui-border-base bg-ui-bg-base px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/workflows"
              className="text-xs text-ui-fg-muted hover:text-ui-fg-base transition"
            >
              ← All Pipelines
            </Link>
            {workflow && (
              <StatusBadge color={workflow.status === 'ACTIVE' ? 'green' : 'orange'}>
                {workflow.status.toLowerCase()} · v{workflow.active_version}
              </StatusBadge>
            )}
            <Badge color="purple" size="small">
              {workflow?.category?.replace(/_/g, ' ') ?? 'ORCHESTRATOR'}
            </Badge>
          </div>
          <Heading level="h1" className="truncate text-base font-semibold text-ui-fg-base mt-0.5">
            {workflow?.name ?? workflowId}
          </Heading>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => void load()}
            disabled={loading}
          >
            <ArrowPath className="w-3.5 h-3.5 mr-1" />
            Reload DAG
          </Button>

          <Button
            type="button"
            variant="primary"
            size="small"
            onClick={() => setShowRunModal(true)}
          >
            <PlaySolid className="w-3.5 h-3.5 mr-1" />
            Execute Pipeline
          </Button>
        </div>
      </header>

      {(error || notice) && (
        <div className="px-6 py-2">
          <Alert variant={error ? 'error' : 'info'} className="text-xs" dismissible>
            {error ?? notice}
          </Alert>
        </div>
      )}

      {/* ── Main Canvas & Inspector ──────────────────────────────── */}
      <main className="flex min-h-0 flex-1">
        {/* ReactFlow Interactive Graph */}
        <div className="relative flex-1 bg-ui-bg-subtle">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_event, node) => selectNode(node)}
            onPaneClick={() => setSelectedId(null)}
            nodesDraggable={true}
            nodesConnectable={false}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <Controls />
            <MiniMap className="!border !border-ui-border-base !bg-ui-bg-base" />
          </ReactFlow>
        </div>

        {/* Inspector Sidebar */}
        <aside className="w-96 overflow-y-auto border-l border-ui-border-base bg-ui-bg-base p-5">
          {selected ? (
            <div className="space-y-5">
              <div>
                <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted">
                  Node Selected
                </Text>
                <div className="break-all font-mono text-xs text-ui-fg-interactive font-semibold mt-0.5">
                  {selected.id}
                </div>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Step Name
                </Label>
                <Input value={selected.data.name} readOnly size="small" />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Node Type
                </Label>
                <Badge color="blue" size="small">
                  {selected.data.nodeType}
                </Badge>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Target Microservice Handshake
                </Label>
                <Badge color="purple" size="small">
                  {selected.data.serviceTarget}
                </Badge>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Target Action
                </Label>
                <Input value={selected.data.action} readOnly size="small" />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Step Configuration (JSON)
                </Label>
                <textarea
                  value={configText}
                  readOnly
                  rows={10}
                  spellCheck={false}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-2.5 font-mono text-xs text-ui-fg-base outline-none shadow-borders-base"
                />
                <Text size="xsmall" className="mt-2 text-ui-fg-muted">
                  Configuration is immutable and enforced by PostgreSQL 16 schema{' '}
                  <code className="font-mono text-xs">gigalibs_workflow</code>.
                </Text>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted">
                Pipeline Information
              </Text>
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 space-y-2 text-xs">
                <div>
                  <span className="text-ui-fg-muted">Code: </span>
                  <span className="font-mono font-semibold text-ui-fg-base">
                    {workflow?.workflow_code}
                  </span>
                </div>
                <div>
                  <span className="text-ui-fg-muted">Trigger: </span>
                  <span className="font-mono font-medium text-ui-fg-base">
                    {workflow?.trigger_type}
                  </span>
                </div>
                <div>
                  <span className="text-ui-fg-muted">Total Steps: </span>
                  <span className="font-mono font-medium text-ui-fg-base">
                    {workflow?.dag_definition?.nodes?.length ?? 0}
                  </span>
                </div>
              </div>
              <Text size="small" className="text-ui-fg-muted">
                Click any DAG node on the canvas to inspect its microservice binding, parameters, and action target.
              </Text>
            </div>
          )}
        </aside>
      </main>

      {/* ── Live Execution Runner Modal ───────────────────────────── */}
      {showRunModal && workflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay/50 backdrop-blur-xs p-4">
          <Container className="w-full max-w-2xl p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-modal rounded-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleExecuteRun} className="space-y-4">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <div>
                  <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                    Execute {workflow.name}
                  </Heading>
                  <Text size="small" className="text-ui-fg-subtle mt-0.5 font-mono">
                    {workflow.workflow_code} (v{workflow.active_version})
                  </Text>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowRunModal(false);
                    setExecutionResult(null);
                  }}
                  className="text-ui-fg-muted hover:text-ui-fg-base cursor-pointer text-lg font-mono"
                >
                  ✕
                </button>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Execution Payload (JSON)
                </Label>
                <textarea
                  value={runInputText}
                  onChange={(event) => setRunInputText(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-2.5 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setShowRunModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={executing}
                  isLoading={executing}
                >
                  <PlaySolid className="w-3.5 h-3.5 mr-1" />
                  Run Pipeline
                </Button>
              </div>
            </form>

            {/* Execution Result Trace */}
            {executionResult && (
              <div className="pt-4 border-t border-ui-border-base space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-ui-fg-base">
                    Execution Trace (Run {executionResult.run?.id})
                  </span>
                  <Badge color="green" size="small">
                    {executionResult.run?.duration_ms} ms · {executionResult.run?.status}
                  </Badge>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(executionResult.steps || []).map((step: any, idx: number) => (
                    <div
                      key={step.id || idx}
                      className="rounded border border-ui-border-base bg-ui-bg-subtle p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ui-fg-base">
                          {idx + 1}. {step.step_name} ({step.service_target})
                        </span>
                        <span className="font-mono text-ui-fg-muted">{step.duration_ms} ms</span>
                      </div>
                      <pre className="font-mono text-[11px] text-ui-fg-subtle overflow-x-auto max-h-20 bg-ui-bg-base p-1.5 rounded">
                        {JSON.stringify(step.output_data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Container>
        </div>
      )}
    </div>
  );
}
