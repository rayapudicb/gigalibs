'use client';

import '@xyflow/react/dist/style.css';
import React, { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Background, BackgroundVariant, type Connection, Controls, type Edge,
  MiniMap, type Node, type NodeProps, Handle, Position,
  ReactFlow, addEdge, useEdgesState, useNodesState,
} from '@xyflow/react';
import { Alert, Badge, Button, Container, Heading, Input, Label, StatusBadge, Text } from '@medusajs/ui';
import { ArrowPath, PlaySolid, CheckCircleSolid, XCircleSolid, Plus, ChevronRight } from '@medusajs/icons';

interface CanvasNodeData extends Record<string, unknown> {
  label: string; name: string; nodeType: string;
  serviceTarget: string; action: string; config: Record<string, any>;
}
type CanvasNode = Node<CanvasNodeData>;

const NODE_PALETTE: Record<string, { bg: string; border: string; icon: string }> = {
  SCHEMA_VALIDATE:    { bg: '#eff6ff', border: '#3b82f6', icon: '🔍' },
  FX_NORMALIZATION:   { bg: '#f5f3ff', border: '#8b5cf6', icon: '💱' },
  RULE_EVALUATION:    { bg: '#fffbeb', border: '#f59e0b', icon: '📋' },
  TAX_ASSESS:         { bg: '#f0fdf4', border: '#10b981', icon: '🧾' },
  LEDGER_DISPATCH:    { bg: '#eef2ff', border: '#6366f1', icon: '📒' },
  BUDGET_CHECK:       { bg: '#fefce8', border: '#eab308', icon: '💰' },
  TOLERANCE_MATCH:    { bg: '#f0fdfa', border: '#14b8a6', icon: '⚖️' },
  APPROVAL_DISPATCH:  { bg: '#fdf2f8', border: '#ec4899', icon: '✅' },
  DATA_INGEST:        { bg: '#ecfeff', border: '#06b6d4', icon: '📥' },
  ML_CLASSIFY:        { bg: '#fef2f2', border: '#ef4444', icon: '🤖' },
  PORTFOLIO_INGEST:   { bg: '#f5f3ff', border: '#7c3aed', icon: '📊' },
  QUANT_EVAL:         { bg: '#f0fdf4', border: '#059669', icon: '📈' },
  EXECUTION_DISPATCH: { bg: '#f8fafc', border: '#64748b', icon: '🚀' },
  HTTP_REQUEST:       { bg: '#eff6ff', border: '#2563eb', icon: '🌐' },
  CODE_JS:            { bg: '#fefce8', border: '#ca8a04', icon: '⚡' },
  IF_CONDITION:       { bg: '#f5f3ff', border: '#9333ea', icon: '🔀' },
  SWITCH:             { bg: '#fff7ed', border: '#ea580c', icon: '🔄' },
  SET_FIELDS:         { bg: '#f0fdf4', border: '#16a34a', icon: '✏️' },
  LOOP:               { bg: '#f0fdfa', border: '#0d9488', icon: '🔁' },
  MERGE:              { bg: '#eef2ff', border: '#4f46e5', icon: '🔗' },
  WAIT:               { bg: '#f9fafb', border: '#6b7280', icon: '⏳' },
  CREDIT_SWEEP:       { bg: '#f0fdf4', border: '#22c55e', icon: '💳' },
  LLM_INFERENCE:      { bg: '#fdf4ff', border: '#a855f7', icon: '🧠' },
  AI_EXTRACT:         { bg: '#fdf4ff', border: '#9333ea', icon: '📤' },
  AI_CLASSIFY:        { bg: '#eef2ff', border: '#4f46e5', icon: '🏷️' },
  AI_TRANSFORM:       { bg: '#f0fdf4', border: '#16a34a', icon: '✨' },
};
function getNodeStyle(t: string) { return NODE_PALETTE[t] ?? { bg: '#f8fafc', border: '#94a3b8', icon: '⚙️' }; }

function GigaNode({ data, selected }: NodeProps) {
  const nd = data as CanvasNodeData;
  const s = getNodeStyle(nd.nodeType);
  return (
    <div style={{ background: s.bg, borderLeft: `4px solid ${s.border}`, border: selected ? `1.5px solid ${s.border}` : '1.5px solid #e2e8f0', borderRadius: 10, minWidth: 200, maxWidth: 230, boxShadow: selected ? `0 0 0 2px ${s.border}40,0 4px 16px ${s.border}20` : '0 2px 8px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s' }}>
      <Handle type="target" position={Position.Left} style={{ background: s.border, width: 10, height: 10, border: '2px solid white' }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{s.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{nd.name}</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', background: s.border + '18', color: s.border, borderRadius: 4, padding: '2px 5px' }}>{nd.nodeType.replace(/_/g, ' ')}</span>
        {nd.serviceTarget && <div style={{ marginTop: 4, fontSize: 9, color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nd.serviceTarget}</div>}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: s.border, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  );
}
const nodeTypes = { giga: GigaNode };

const PALETTE_NODES = [
  { type: 'SCHEMA_VALIDATE',    label: 'Schema Validate',    service: 'Data Studio' },
  { type: 'HTTP_REQUEST',       label: 'HTTP Request',       service: 'External API' },
  { type: 'CODE_JS',            label: 'Run Code (JS)',      service: 'Sandbox' },
  { type: 'IF_CONDITION',       label: 'If / Condition',     service: 'Logic' },
  { type: 'SWITCH',             label: 'Switch Branch',      service: 'Logic' },
  { type: 'SET_FIELDS',         label: 'Set Fields',         service: 'Transform' },
  { type: 'LOOP',               label: 'Loop (Array)',       service: 'Transform' },
  { type: 'MERGE',              label: 'Merge Branches',     service: 'Logic' },
  { type: 'WAIT',               label: 'Wait / Delay',       service: 'Control' },
  { type: 'RULE_EVALUATION',    label: 'Rule Evaluate',      service: 'Rule Pro' },
  { type: 'FX_NORMALIZATION',   label: 'FX Normalize',       service: 'FX Engine' },
  { type: 'TAX_ASSESS',         label: 'Tax Assess',         service: 'Tax Service' },
  { type: 'LEDGER_DISPATCH',    label: 'Ledger Dispatch',    service: 'AR Core' },
  { type: 'LLM_INFERENCE',      label: 'LLM Inference',      service: 'AI Engine' },
  { type: 'AI_EXTRACT',         label: 'AI Extract',         service: 'AI Engine' },
  { type: 'AI_CLASSIFY',        label: 'AI Classify',        service: 'AI Engine' },
  { type: 'AI_TRANSFORM',       label: 'AI Transform',       service: 'AI Engine' },
  { type: 'ML_CLASSIFY',        label: 'ML Classify',        service: 'AI Engine' },
  { type: 'EXECUTION_DISPATCH', label: 'Execution Dispatch', service: 'Connector Hub' },
  { type: 'DATA_INGEST',        label: 'Data Ingest',        service: 'Data Studio' },
];

interface WorkflowDetails {
  id: string; tenant_id: string; workflow_code: string; name: string; description: string;
  category: string; active_version: string; trigger_type: string; trigger_config: Record<string,any>;
  status: string;
  dag_definition: {
    nodes: Array<{ id:string;name:string;type:string;service_target:string;action:string;config?:Record<string,any>;position?:{x:number;y:number} }>;
    edges: Array<{ id?:string;from?:string;to?:string;source?:string;target?:string }>;
  };
}

export default function WorkflowCanvasPage() {
  const params = useParams<{ wfId: string }>();
  const workflowId = params.wfId;
  const [workflow, setWorkflow] = useState<WorkflowDetails | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configText, setConfigText] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runInputText, setRunInputText] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/workflow-studio/workflows/${encodeURIComponent(workflowId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title || `Workflow "${workflowId}" not found.`);
      }
      const data = await res.json();
      const loaded = data.workflow as WorkflowDetails;
      if (!loaded) {
        throw new Error(`Workflow "${workflowId}" not found.`);
      }
      setWorkflow(loaded);
      if (loaded.trigger_config && Object.keys(loaded.trigger_config).length > 0) {
        setRunInputText(JSON.stringify(loaded.trigger_config, null, 2));
      } else {
        setRunInputText(JSON.stringify({ order_id:'SO-2026-8819',customer_id:'CUST-EU-901',currency:'EUR',amount:145000 }, null, 2));
      }
      const rawNodes = loaded.dag_definition?.nodes || [];
      const mappedNodes: CanvasNode[] = rawNodes.map((node, i) => ({
        id: node.id, type: 'giga',
        position: { x: node.position?.x ?? i * 280 + 60, y: node.position?.y ?? (180 + (i % 2 === 1 ? 100 : 0)) },
        data: { label:node.name||node.id, name:node.name||node.id, nodeType:node.type||'STEP', serviceTarget:node.service_target||'INTERNAL', action:node.action||'EXECUTE', config:node.config||{} },
      }));
      const rawEdges = loaded.dag_definition?.edges || [];
      const mappedEdges: Edge[] = rawEdges.map((edge, i) => {
        const source = edge.source || edge.from || '';
        const target = edge.target || edge.to || '';
        return { id:edge.id||`edge-${source}-${target}-${i}`, source, target, animated:true, style:{ stroke:'#6366f1', strokeWidth:2.5 } };
      });
      setNodes(mappedNodes); setEdges(mappedEdges); setSelectedId(null);
    } catch (cause: any) { setError(cause.message || 'Unable to load workflow.'); }
    finally { setLoading(false); }
  }, [setEdges, setNodes, workflowId]);

  useEffect(() => { void load(); }, [load]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge({ ...connection, animated:true, style:{ stroke:'#6366f1', strokeWidth:2.5 } }, eds)),
    [setEdges],
  );

  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId]);
  function selectNode(n: CanvasNode) { setSelectedId(n.id); setConfigText(JSON.stringify(n.data.config, null, 2)); setError(null); }

  function handleSaveNodeConfig() {
    if (!selectedId) return;
    try {
      const parsed = JSON.parse(configText);
      setNodes(ns => ns.map(n => n.id === selectedId ? { ...n, data:{ ...n.data, config:parsed } } : n));
      setNotice('Node config updated.'); setError(null);
    } catch { setError('Invalid JSON config.'); }
  }

  function handleAddNode(item: typeof PALETTE_NODES[0]) {
    setNodes(ns => [...ns, { id:`node-${Date.now()}`, type:'giga',
      position:{ x: 80 + ((ns.length * 50) % 300), y: 80 + ((ns.length * 40) % 200) },
      data:{ label:item.label, name:item.label, nodeType:item.type, serviceTarget:item.service, action:'EXECUTE', config:{} },
    }]);
    setShowPalette(false); setNotice(`Added "${item.label}" node.`);
  }

  async function handleSaveDag() {
    if (!workflow) return; setSaving(true); setError(null);
    try {
      const dagDef = {
        nodes: nodes.map(n => ({ id:n.id, name:n.data.name, type:n.data.nodeType, service_target:n.data.serviceTarget, action:n.data.action, config:n.data.config, position:n.position })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, from: e.source, to: e.target })),
      };
      const res = await fetch(`/api/workflow-studio/workflows/${workflow.workflow_code}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json',  },
        body: JSON.stringify({ dag_definition: dagDef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed.');
      setNotice('DAG saved successfully.');
    } catch (cause: any) { setError(cause.message); } finally { setSaving(false); }
  }

  async function handleExecuteRun(event: FormEvent) {
    event.preventDefault(); if (!workflow) return;
    setExecuting(true); setError(null); setExecutionResult(null);
    try {
      let parsedInput = {};
      try { parsedInput = JSON.parse(runInputText); } catch { throw new Error('Input must be valid JSON.'); }
      const res = await fetch(`/api/workflow-studio/workflows/${workflow.workflow_code}/execute`, {
        method:'POST', headers:{ 'Content-Type':'application/json',  },
        body: JSON.stringify({ trigger_type:'MANUAL', input_payload:parsedInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Execution failed');
      setExecutionResult(data);
      setNotice(`Run ${data.run?.id??''} completed in ${data.run?.duration_ms??0}ms`);
      setShowRunModal(false);
    } catch (cause: any) { setError(cause.message || 'Unable to start run.'); } finally { setExecuting(false); }
  }

  const filteredPalette = PALETTE_NODES.filter(p =>
    p.label.toLowerCase().includes(paletteFilter.toLowerCase()) ||
    p.type.toLowerCase().includes(paletteFilter.toLowerCase())
  );

  if (loading && !workflow) {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="text-center"><div className="text-3xl mb-2">⚡</div><Text size="small" className="text-ui-fg-muted">Loading canvas…</Text></div></div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden font-sans" style={{ background: '#f8fafc' }}>
      <header style={{ background:'white', borderBottom:'1px solid #e2e8f0', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}
        className="flex min-h-[52px] items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/workflows" className="text-xs text-ui-fg-muted hover:text-ui-fg-base transition font-medium">← Pipelines</Link>
          <span className="text-ui-border-strong">|</span>
          <span className="text-base">⚡</span>
          <Heading level="h1" className="truncate text-sm font-semibold text-ui-fg-base">{workflow?.name ?? workflowId}</Heading>
          {workflow && <StatusBadge color={workflow.status === 'ACTIVE' ? 'green' : 'orange'}>{workflow.status.toLowerCase()}</StatusBadge>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="transparent" size="small" onClick={() => void load()} disabled={loading}><ArrowPath className="w-3.5 h-3.5" /></Button>
          <div style={{ position:'relative' }}>
            <Button type="button" variant="secondary" size="small" onClick={() => setShowPalette(v => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Node
            </Button>
            {showPalette && (
              <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50, background:'white', border:'1px solid #e2e8f0', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', width:256, padding:10 }}>
                <Input placeholder="Search nodes…" size="small" value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)} autoFocus />
                <div style={{ maxHeight:280, overflowY:'auto', marginTop:8 }}>
                  {filteredPalette.map(item => {
                    const s = getNodeStyle(item.type);
                    return (
                      <button key={item.type} onClick={() => handleAddNode(item)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                        <span style={{ fontSize:14, color:s.border }}>{s.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{item.label}</div>
                          <div style={{ fontSize:10, color:'#64748b' }}>{item.service}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <Button type="button" variant="secondary" size="small" onClick={handleSaveDag} isLoading={saving}>💾 Save</Button>
          <Button type="button" variant="primary" size="small" onClick={() => setShowRunModal(true)}><PlaySolid className="w-3.5 h-3.5 mr-1" /> Run</Button>
        </div>
      </header>

      {(error || notice) && (
        <div className="px-5 pt-2">
          <Alert variant={error ? 'error' : 'success'} className="text-xs py-1.5">
            {error ?? notice}
          </Alert>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        <div className="relative flex-1" style={{ background:'#f0f4ff' }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_e, node) => selectNode(node)}
            onPaneClick={() => { setSelectedId(null); setShowPalette(false); }}
            nodesDraggable nodesConnectable fitView fitViewOptions={{ padding:0.3 }}>
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#c7d2fe" />
            <Controls style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }} />
            <MiniMap style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8 }}
              nodeColor={node => getNodeStyle(((node.data) as CanvasNodeData).nodeType).border} />
          </ReactFlow>
        </div>

        <aside style={{ width:300, borderLeft:'1px solid #e2e8f0', background:'white', overflowY:'auto', padding:16 }}>
          {selected ? (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ paddingBottom:12, borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>{getNodeStyle(selected.data.nodeType).icon}</span>
                <div><Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted">Inspector</Text>
                  <div style={{ fontFamily:'monospace', fontSize:10, color:'#64748b' }}>{selected.id}</div></div>
              </div>
              <div><Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Step Name</Label><Input value={selected.data.name} readOnly size="small" /></div>
              <div><Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Node Type</Label>
                <span style={{ display:'inline-flex', alignItems:'center', background:getNodeStyle(selected.data.nodeType).border+'15', color:getNodeStyle(selected.data.nodeType).border, borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:600 }}>
                  {selected.data.nodeType.replace(/_/g, ' ')}
                </span>
              </div>
              <div><Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Microservice</Label><Input value={selected.data.serviceTarget} readOnly size="small" /></div>
              <div><Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Action</Label><Input value={selected.data.action} readOnly size="small" /></div>
              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Config (JSON)</Label>
                <textarea value={configText} onChange={e => setConfigText(e.target.value)} rows={8} spellCheck={false}
                  style={{ width:'100%', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', padding:10, fontFamily:'monospace', fontSize:11, color:'#1e293b', outline:'none', boxSizing:'border-box', resize:'vertical' }} />
              </div>
              <Button type="button" variant="secondary" size="small" className="w-full" onClick={handleSaveNodeConfig}>Apply Config</Button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ paddingBottom:12, borderBottom:'1px solid #e2e8f0' }}>
                <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted">Pipeline</Text>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {([[ 'Code', workflow?.workflow_code??'—' ],[ 'Trigger', workflow?.trigger_type??'—' ],[ 'Nodes', String(workflow?.dag_definition?.nodes?.length??0) ],[ 'Version', workflow?`v${workflow.active_version}`:'—' ]] as [string,string][]).map(([label, value]) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'#64748b' }}>{label}</span>
                    <span style={{ fontFamily:'monospace', fontWeight:600, color:'#1e293b' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#f0f4ff', borderRadius:10, border:'1px solid #c7d2fe', padding:10 }}>
                <Text size="xsmall" className="text-ui-fg-muted">Click any node to inspect. Drag to rearrange. Connect by dragging handles.</Text>
              </div>
              <div>
                <Text size="xsmall" weight="plus" className="uppercase text-ui-fg-muted mb-2">DAG Nodes</Text>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {nodes.map(n => {
                    const s = getNodeStyle(n.data.nodeType);
                    return (
                      <button key={n.id} onClick={() => selectNode(n)}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', width:'100%' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                        <span style={{ fontSize:14 }}>{s.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.data.name}</div>
                          <div style={{ fontSize:9, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>{n.data.nodeType.replace(/_/g,' ')}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>
      </main>

      {showRunModal && workflow && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.18)', backdropFilter:'blur(4px)', padding:16 }}>
          <div style={{ width:'100%', maxWidth:540, background:'white', border:'1px solid #e2e8f0', borderRadius:20, boxShadow:'0 20px 60px rgba(0,0,0,0.12)', padding:24, maxHeight:'90vh', overflowY:'auto' }}>
            <form onSubmit={handleExecuteRun}>
              <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', paddingBottom:12, marginBottom:16 }}>
                <div><Heading level="h2" className="text-base font-semibold">Execute Pipeline</Heading>
                  <Text size="xsmall" className="text-ui-fg-muted">{workflow.name}</Text></div>
                <button onClick={() => { setShowRunModal(false); setError(null); setExecutionResult(null); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:16 }}>✕</button>
              </div>
              <Label className="mb-1.5 block text-xs font-medium text-ui-fg-subtle">Input Payload (JSON)</Label>
              <textarea value={runInputText} onChange={e => setRunInputText(e.target.value)} rows={8} spellCheck={false}
                style={{ width:'100%', borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', padding:12, fontFamily:'monospace', fontSize:12, outline:'none', marginBottom:12, boxSizing:'border-box', resize:'vertical' }} />
              {executionResult && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:10, marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#166534' }}>✅ Run Complete</div>
                  <div style={{ fontFamily:'monospace', fontSize:10, color:'#15803d', marginTop:4 }}>
                    ID: {executionResult.run?.id} · {executionResult.run?.duration_ms}ms
                  </div>
                </div>
              )}
              {error && <Alert variant="error" className="text-xs mb-3">{error}</Alert>}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:12, borderTop:'1px solid #e2e8f0' }}>
                <Button type="button" variant="secondary" size="small" onClick={() => { setShowRunModal(false); setError(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" size="small" isLoading={executing}>
                  <PlaySolid className="w-3.5 h-3.5 mr-1" /> Execute
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
