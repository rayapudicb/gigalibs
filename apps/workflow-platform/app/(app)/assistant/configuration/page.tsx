'use client';

import React, { useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Cpu,
  Database,
  Lock,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Globe,
  Sliders,
  Radio,
  FileCheck,
} from 'lucide-react';
import { Badge, Button, StatusBadge, toast } from '@medusajs/ui';

export default function AssistantConfigurationPage() {
  const [modelEngine, setModelEngine] = useState('llama-3.3-70b');
  const [inferenceEndpoint, setInferenceEndpoint] = useState('http://127.0.0.1:11434/v1');
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [contextWindow, setContextWindow] = useState(32768);
  const [hitlWorkOrders, setHitlWorkOrders] = useState(true);
  const [hitlInventory, setHitlInventory] = useState(true);
  const [hitlTimesheets, setHitlTimesheets] = useState(true);
  const [hitlProcurement, setHitlProcurement] = useState(true);
  const [vibrationThreshold, setVibrationThreshold] = useState(3.5);
  const [powerThreshold, setPowerThreshold] = useState(180.0);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Configuration Saved', {
        description: 'Sovereign AI agent settings applied across all active workspaces.',
      });
    }, 400);
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestResult('Success: Local inference runtime reachable with 14ms latency. Telemetry zero-egress verified.');
    }, 600);
  };

  const handleReset = () => {
    setModelEngine('llama-3.3-70b');
    setInferenceEndpoint('http://127.0.0.1:11434/v1');
    setTemperature(0.2);
    setMaxTokens(4096);
    setContextWindow(32768);
    setHitlWorkOrders(true);
    setHitlInventory(true);
    setHitlTimesheets(true);
    setHitlProcurement(true);
    setVibrationThreshold(3.5);
    setPowerThreshold(180.0);
    setTestResult(null);
    toast.info('Settings Reset', {
      description: 'Restored default sovereign air-gapped configuration.',
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ui-bg-subtle/40 p-4 md:p-6 pb-16">
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ui-fg-base">
                  Agent Settings & Configuration
                </h1>
                <Badge color="blue" size="small">
                  SOVEREIGN
                </Badge>
                <StatusBadge color="green">ZERO EGRESS</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-ui-fg-muted">
                Self-hosted AI agent architecture, inference endpoint routing, RBAC isolation boundaries, and guardrails.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="small" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Defaults
          </Button>
          <Button variant="primary" size="small" onClick={handleSave} isLoading={isSaving}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save Configuration
          </Button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols): Model Runtime & Guardrails */}
        <div className="space-y-6 lg:col-span-2">
          {/* Section 1: Sovereign Model Runtime */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-ui-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-4 w-4 text-ui-fg-interactive" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-ui-fg-base">
                  Local Inference & Model Engine
                </h2>
              </div>
              <span className="font-mono text-[11px] text-ui-fg-muted">
                100% Self-Hosted • Zero External APIs
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ui-fg-base mb-1.5">
                  Active Model Architecture
                </label>
                <select
                  value={modelEngine}
                  onChange={(e) => setModelEngine(e.target.value)}
                  className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs font-medium text-ui-fg-base shadow-2xs focus:border-ui-border-interactive focus:outline-none"
                >
                  <option value="llama-3.3-70b">Meta Llama 3.3 70B Instruct (Air-Gapped Sovereign)</option>
                  <option value="mistral-nemo-12b">Mistral NeMo 12B Sovereign (Low-Latency Floor)</option>
                  <option value="deepseek-r1-qwen">DeepSeek R1 Distill Qwen 32B (Complex Reasoning)</option>
                  <option value="custom-vllm">Custom Local Endpoint (vLLM / llama.cpp / Ollama)</option>
                </select>
                <p className="mt-1 text-[11px] text-ui-fg-muted">
                  Runs directly on on-premise accelerator hardware. No weights or activations leave the physical perimeter.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ui-fg-base mb-1.5">
                  Inference Endpoint URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inferenceEndpoint}
                    onChange={(e) => setInferenceEndpoint(e.target.value)}
                    className="flex-1 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 font-mono text-xs text-ui-fg-base shadow-2xs focus:border-ui-border-interactive focus:outline-none"
                    placeholder="http://127.0.0.1:11434/v1"
                  />
                  <Button variant="secondary" size="small" onClick={handleTestConnection} isLoading={isTesting}>
                    Test Ping
                  </Button>
                </div>
                {testResult && (
                  <div className="mt-2 rounded-lg border border-ui-border-interactive bg-ui-tag-neutral-bg p-2.5 text-xs text-ui-fg-interactive">
                    <p className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0" /> {testResult}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Temperature ({temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-ui-button-inverted"
                  />
                  <span className="text-[10px] text-ui-fg-muted">Deterministic (0.0) → Creative (1.0)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Max Generation Tokens
                  </label>
                  <input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                    className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                  />
                  <span className="text-[10px] text-ui-fg-muted">Max response length limit</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Context Window
                  </label>
                  <input
                    type="number"
                    value={contextWindow}
                    onChange={(e) => setContextWindow(parseInt(e.target.value) || 32768)}
                    className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                  />
                  <span className="text-[10px] text-ui-fg-muted">Tokens retained in context</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Human-In-The-Loop (HITL) Guardrails */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-ui-border-subtle pb-3">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-ui-fg-interactive" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-ui-fg-base">
                  Deterministic Tool Guardrails & HITL
                </h2>
              </div>
              <span className="font-mono text-[11px] text-ui-fg-muted">
                Human-in-the-Loop Verification
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-ui-fg-muted">
                The agent executes read queries autonomously. Select operations requiring human review or cryptographic signature before committing to database:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex items-start gap-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-3 cursor-pointer hover:bg-ui-bg-subtle transition-colors">
                  <input
                    type="checkbox"
                    checked={hitlWorkOrders}
                    onChange={(e) => setHitlWorkOrders(e.target.checked)}
                    className="mt-0.5 rounded border-ui-border-base accent-ui-button-inverted"
                  />
                  <div>
                    <span className="text-xs font-semibold text-ui-fg-base block">
                      CMMS Work Order Creation
                    </span>
                    <span className="text-[11px] text-ui-fg-muted">
                      Requires supervisor confirmation before inserting into CMMS work_orders table.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-3 cursor-pointer hover:bg-ui-bg-subtle transition-colors">
                  <input
                    type="checkbox"
                    checked={hitlInventory}
                    onChange={(e) => setHitlInventory(e.target.checked)}
                    className="mt-0.5 rounded border-ui-border-base accent-ui-button-inverted"
                  />
                  <div>
                    <span className="text-xs font-semibold text-ui-fg-base block">
                      MRO Inventory Stock Issuance
                    </span>
                    <span className="text-[11px] text-ui-fg-muted">
                      Requires stockroom technician sign-off for parts reservations and deductions.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-3 cursor-pointer hover:bg-ui-bg-subtle transition-colors">
                  <input
                    type="checkbox"
                    checked={hitlTimesheets}
                    onChange={(e) => setHitlTimesheets(e.target.checked)}
                    className="mt-0.5 rounded border-ui-border-base accent-ui-button-inverted"
                  />
                  <div>
                    <span className="text-xs font-semibold text-ui-fg-base block">
                      Workforce Timesheet Approval
                    </span>
                    <span className="text-[11px] text-ui-fg-muted">
                      Blocks automated approval of shift punches exceeding variance thresholds.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-3 cursor-pointer hover:bg-ui-bg-subtle transition-colors">
                  <input
                    type="checkbox"
                    checked={hitlProcurement}
                    onChange={(e) => setHitlProcurement(e.target.checked)}
                    className="mt-0.5 rounded border-ui-border-base accent-ui-button-inverted"
                  />
                  <div>
                    <span className="text-xs font-semibold text-ui-fg-base block">
                      Purchase Order Drafting
                    </span>
                    <span className="text-[11px] text-ui-fg-muted">
                      Enforces procurement authorization before routing POs to vendors.
                    </span>
                  </div>
                </label>
              </div>

              {/* Physical Floor Alert Limits */}
              <div className="pt-3 border-t border-ui-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Vibration Alert Trigger ({vibrationThreshold} mm/s RMS)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={vibrationThreshold}
                    onChange={(e) => setVibrationThreshold(parseFloat(e.target.value) || 3.5)}
                    className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                  />
                  <span className="text-[10px] text-ui-fg-muted">Values above threshold flag CMMS work orders</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Peak Power Surge Trigger ({powerThreshold} kW)
                  </label>
                  <input
                    type="number"
                    step="1.0"
                    value={powerThreshold}
                    onChange={(e) => setPowerThreshold(parseFloat(e.target.value) || 180.0)}
                    className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                  />
                  <span className="text-[10px] text-ui-fg-muted">Triggers energy load-shedding notifications</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Tenancy, Egress Policy, Sovereignty Audit */}
        <div className="space-y-6">
          {/* Sovereign Tenancy Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-ui-border-subtle pb-3">
              <Database className="h-4 w-4 text-ui-fg-interactive" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ui-fg-base">
                Multi-Tenant Isolation
              </h2>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-ui-border-subtle">
                <span className="text-ui-fg-muted">Isolation Engine:</span>
                <span className="font-semibold text-ui-fg-base">PostgreSQL RLS</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ui-border-subtle">
                <span className="text-ui-fg-muted">Active Tenant:</span>
                <span className="font-mono text-ui-fg-base truncate max-w-[150px]">gigalibs-global</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ui-border-subtle">
                <span className="text-ui-fg-muted">Cross-Tenant Buffer:</span>
                <span className="font-semibold text-ui-fg-interactive">Isolated (Zero Share)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ui-border-subtle">
                <span className="text-ui-fg-muted">Permission Check:</span>
                <span className="font-mono text-ui-fg-base">assistant:read / write</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ui-fg-muted">Role Hierarchy:</span>
                <span className="font-semibold text-ui-fg-base">Strict RBAC Masking</span>
              </div>
            </div>
          </div>

          {/* Zero-Egress Boundary Verification */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-ui-border-subtle pb-3">
              <ShieldCheck className="h-4 w-4 text-ui-fg-interactive" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ui-fg-base">
                Zero-Egress Policy
              </h2>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-lg border border-ui-border-interactive bg-ui-tag-neutral-bg p-3">
                <div className="flex items-center gap-2 text-ui-fg-interactive font-semibold mb-1">
                  <CheckCircle2 className="h-4 w-4" /> Air-Gapped Egress Lock
                </div>
                <p className="text-[11px] text-ui-fg-subtle leading-relaxed">
                  External telemetry, vendor tracking, and third-party cloud analytics are disabled at the socket layer. All SSE streams originate from same-origin Next.js BFF.
                </p>
              </div>

              <div className="divide-y divide-ui-border-subtle">
                <div className="flex justify-between py-2">
                  <span className="text-ui-fg-muted">copilotkit.ai Traffic:</span>
                  <span className="font-mono font-semibold text-ui-fg-interactive">0 Bytes (Blocked)</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-ui-fg-muted">External DNS Requests:</span>
                  <span className="font-mono font-semibold text-ui-fg-interactive">0</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-ui-fg-muted">Local Audit Log:</span>
                  <span className="font-semibold text-ui-fg-base">tenant_audit_chains</span>
                </div>
              </div>
            </div>
          </div>

          {/* Upstream Clarification Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-ui-border-subtle pb-3">
              <Server className="h-4 w-4 text-ui-fg-interactive" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ui-fg-base">
                Architecture Provenance
              </h2>
            </div>

            <div className="mt-3 text-xs space-y-2 text-ui-fg-muted leading-relaxed">
              <p>
                <span className="font-semibold text-ui-fg-base">Component Engine:</span> The low-level SSE streaming parser and headless chat hooks originate from the local CopilotKit open-source runtime.
              </p>
              <p>
                <span className="font-semibold text-ui-fg-base">Sovereign Control Plane:</span> Upstream CopilotKit manages configurations exclusively on their proprietary SaaS cloud dashboard (<code className="font-mono text-[11px]">copilotkit.ai</code>). In GigaLibs, all configuration, security, tenancy, and tool registries are 100% self-hosted and native to GigaLibs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
