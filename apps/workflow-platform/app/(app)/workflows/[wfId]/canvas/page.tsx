'use client';

import '@xyflow/react/dist/style.css';
import type { JsonValue, RunSummary, WorkflowGraph, WorkflowPipeline } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
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
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

interface CanvasNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  config: Record<string, JsonValue>;
}

type CanvasNode = Node<CanvasNodeData>;

export default function WorkflowCanvasPage() {
  const params = useParams<{ wfId: string }>();
  const router = useRouter();
  const workflowId = params.wfId;
  const [workflow, setWorkflow] = useState<WorkflowPipeline | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configText, setConfigText] = useState('{}');
  const [inputSchemaText, setInputSchemaText] = useState('{}');
  const [outputSchemaText, setOutputSchemaText] = useState('{}');
  const [runInputText, setRunInputText] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<'save' | 'publish' | 'run' | null>(null);
  const [showRun, setShowRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await requestJson<WorkflowPipeline>(
        `/api/workflows/${encodeURIComponent(workflowId)}`,
      );
      setWorkflow(loaded);
      setNodes(
        loaded.definition.nodes.map((node, index) => ({
          id: node.id,
          type: node.type === 'input' ? 'input' : 'default',
          position: node.position ?? { x: index * 280, y: 160 },
          data: {
            ...(node.data ?? {}),
            label: typeof node.data?.label === 'string' ? node.data.label : node.id,
            nodeType: node.type,
            config: node.config ?? {},
          },
        })),
      );
      setEdges(
        loaded.definition.edges.map((edge) => ({
          id: edge.id ?? `${edge.source}:${edge.target}`,
          source: edge.source,
          target: edge.target,
        })),
      );
      setSelectedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load workflow.');
    } finally {
      setLoading(false);
    }
  }, [setEdges, setNodes, workflowId]);

  useEffect(() => {
    void load();
  }, [load]);
  const isDraft = workflow?.status === 'DRAFT';
  const isRunnable = workflow?.status === 'ACTIVE';
  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const connect = useCallback(
    (connection: Connection) => {
      if (!isDraft) return;
      setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID() }, current));
    },
    [isDraft, setEdges],
  );

  function selectNode(node: CanvasNode) {
    setSelectedId(node.id);
    setConfigText(JSON.stringify(node.data.config, null, 2));
    setError(null);
  }

  function addNode(nodeType: 'input' | 'http') {
    if (!isDraft) return;
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type: nodeType === 'input' ? 'input' : 'default',
      position: { x: nodes.length * 280, y: 160 },
      data: { label: `New ${nodeType} node`, nodeType, config: {} },
    };
    setNodes((current) => [...current, node]);
    selectNode(node);
  }

  function graph(): WorkflowGraph {
    return {
      nodes: nodes.map((node) => {
        const { nodeType, config, ...data } = node.data;
        return {
          id: node.id,
          type: nodeType,
          position: node.position,
          data: data as Record<string, JsonValue>,
          config,
        };
      }),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    };
  }

  async function save() {
    if (!workflow || !isDraft) return;
    setPendingAction('save');
    setError(null);
    setNotice(null);
    try {
      const updated = await requestJson<WorkflowPipeline>(
        `/api/workflows/${encodeURIComponent(workflow.id)}/draft`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition: graph() }),
        },
      );
      setWorkflow((current) => (current ? { ...current, updatedAt: updated.updatedAt } : current));
      setNotice('Draft saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save draft.');
    } finally {
      setPendingAction(null);
    }
  }

  async function publish() {
    if (!workflow || !isDraft) return;
    setPendingAction('publish');
    setError(null);
    setNotice(null);
    try {
      const inputSchema = parseObject(inputSchemaText, 'Input schema');
      const outputSchema = parseObject(outputSchemaText, 'Output schema');
      await requestJson(`/api/workflows/${encodeURIComponent(workflow.id)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: graph(), inputSchema, outputSchema }),
      });
      await load();
      setNotice('Immutable workflow version published.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to publish workflow.');
    } finally {
      setPendingAction(null);
    }
  }

  async function startRun(event: FormEvent) {
    event.preventDefault();
    if (!workflow || workflow.status !== 'ACTIVE') return;
    setPendingAction('run');
    setError(null);
    try {
      const inputPayload = parseObject(runInputText, 'Run input');
      const run = await requestJson<RunSummary>('/api/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ workflowId: workflow.id, triggerType: 'manual', inputPayload }),
      });
      router.push(`/runs/${encodeURIComponent(run.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start workflow run.');
      setPendingAction(null);
    }
  }

  function updateSelectedLabel(label: string) {
    if (!selected || !isDraft) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selected.id ? { ...node, data: { ...node.data, label } } : node,
      ),
    );
  }

  function updateSelectedConfig(value: string) {
    setConfigText(value);
    if (!selected || !isDraft) return;
    try {
      const config = parseObject(value, 'Node configuration');
      setNodes((current) =>
        current.map((node) =>
          node.id === selected.id ? { ...node, data: { ...node.data, config } } : node,
        ),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Node configuration must be valid JSON.');
    }
  }

  if (loading && !workflow)
    return <div className="p-8 text-sm text-gray-400">Loading workflow…</div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-100">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-800 bg-gray-900 px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/workflows" className="text-xs text-gray-400 hover:text-white">
              ← Workflows
            </Link>
            {workflow && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${WORKFLOW_STATUS_STYLES[workflow.status]}`}
              >
                {workflow.status.toLowerCase()}
                {workflow.activeVersion ? ` · v${workflow.activeVersion}` : ''}
              </span>
            )}
          </div>
          <h1 className="truncate text-sm font-semibold text-white">
            {workflow?.name ?? workflowId}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isDraft ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={pendingAction !== null}
                className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
              >
                {pendingAction === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={pendingAction !== null}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                {pendingAction === 'publish' ? 'Publishing…' : 'Publish version'}
              </button>
            </>
          ) : isRunnable ? (
            <button
              type="button"
              onClick={() => setShowRun(true)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold hover:bg-emerald-500"
            >
              Run workflow
            </button>
          ) : null}
        </div>
      </header>
      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`border-b px-6 py-2 text-xs ${error ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-emerald-900 bg-emerald-950/30 text-emerald-300'}`}
        >
          {error ?? notice}
        </div>
      )}
      <main className="flex min-h-0 flex-1">
        <div className="relative flex-1">
          <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-xl border border-gray-800 bg-gray-900/95 p-2">
            <button
              type="button"
              onClick={() => addNode('input')}
              disabled={!isDraft}
              className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              + Input
            </button>
            <button
              type="button"
              onClick={() => addNode('http')}
              disabled={!isDraft}
              className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              + HTTP
            </button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            onNodeClick={(_event, node) => selectNode(node)}
            onPaneClick={() => setSelectedId(null)}
            nodesDraggable={isDraft}
            nodesConnectable={isDraft}
            edgesReconnectable={isDraft}
            deleteKeyCode={isDraft ? ['Backspace', 'Delete'] : null}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#30304a" />
            <Controls />
            <MiniMap className="!border !border-gray-800 !bg-gray-900" />
          </ReactFlow>
        </div>
        <aside className="w-96 overflow-y-auto border-l border-gray-800 bg-gray-900 p-5">
          {selected ? (
            <div className="space-y-5">
              <div>
                <div className="text-xs uppercase text-gray-500">Node</div>
                <div className="break-all font-mono text-xs text-indigo-300">{selected.id}</div>
              </div>
              <div>
                <label
                  htmlFor="selected-node-type"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Type
                </label>
                <input
                  id="selected-node-type"
                  value={selected.data.nodeType}
                  readOnly
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-400"
                />
              </div>
              <div>
                <label
                  htmlFor="selected-node-label"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Label
                </label>
                <input
                  id="selected-node-label"
                  value={selected.data.label}
                  readOnly={!isDraft}
                  onChange={(event) => updateSelectedLabel(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label
                  htmlFor="selected-node-config"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Configuration (JSON)
                </label>
                <textarea
                  id="selected-node-config"
                  value={configText}
                  readOnly={!isDraft}
                  onChange={(event) => updateSelectedConfig(event.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-200 outline-none focus:border-indigo-500"
                />
                <p className="mt-2 text-[11px] text-gray-500">
                  Credentials must be referenced by vault-backed identifiers; embedded secrets are
                  rejected by the API.
                </p>
              </div>
            </div>
          ) : isDraft ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Select a node to edit its persisted configuration.
              </p>
              <SchemaEditor
                id="workflow-input-schema"
                label="Input JSON Schema"
                value={inputSchemaText}
                onChange={setInputSchemaText}
              />
              <SchemaEditor
                id="workflow-output-schema"
                label="Output JSON Schema"
                value={outputSchemaText}
                onChange={setOutputSchemaText}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Published versions are immutable. Select a node to inspect it.
            </p>
          )}
        </aside>
      </main>

      {showRun && workflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={startRun}
            className="w-full max-w-xl space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Run {workflow.name}</h2>
              <button
                type="button"
                onClick={() => setShowRun(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div>
              <label
                htmlFor="workflow-run-input"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Input payload (JSON)
              </label>
              <textarea
                id="workflow-run-input"
                value={runInputText}
                onChange={(event) => setRunInputText(event.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-200 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRun(false)}
                className="rounded-lg border border-gray-700 px-3 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pendingAction !== null}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pendingAction === 'run' ? 'Starting…' : 'Start durable run'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SchemaEditor({
  id,
  label,
  value,
  onChange,
}: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-400">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        spellCheck={false}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-200 outline-none focus:border-indigo-500"
      />
    </div>
  );
}

const WORKFLOW_STATUS_STYLES: Record<WorkflowPipeline['status'], string> = {
  DRAFT: 'border-amber-800 text-amber-400',
  ACTIVE: 'border-emerald-800 text-emerald-400',
  PAUSED: 'border-sky-800 text-sky-400',
  ARCHIVED: 'border-gray-700 text-gray-400',
};

function parseObject(value: string, label: string): Record<string, JsonValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${label} must be a JSON object.`);
  return parsed as Record<string, JsonValue>;
}
