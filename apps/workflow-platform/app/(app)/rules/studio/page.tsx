'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  Eye,
  FileCheck2,
  Filter,
  Flame,
  Layers,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  GenericRule,
  DiscoveredField,
  UniversalOperator,
  UniversalActionType,
  RuleLifecycleStatus,
  SimulationReport,
} from '@/lib/universal-rule-kernel-store';

const SAMPLE_PAYLOADS: Record<string, { label: string; payload: any }> = {
  ecommerce: {
    label: 'E-Commerce Order Stream',
    payload: {
      order_id: 'ORD-99012',
      customer: {
        id: 'cust-4410',
        email: 'alice@enterprise.com',
        tier: 'ENTERPRISE',
        country_code: 'US',
      },
      cart: {
        total_usd: 14500.0,
        currency: 'USD',
        items_count: 12,
      },
      payment: {
        method: 'CREDIT_CARD',
        fraud_risk_score: 88,
      },
    },
  },
  fleet: {
    label: 'Logistics Fleet Telemetry',
    payload: {
      truck_id: 'TRK-ALPHA-09',
      driver_id: 'DRV-771',
      speed_mph: 84.2,
      engine_temp_c: 114.5,
      cargo: {
        type: 'COLD_CHAIN_PHARMA',
        temp_c: 8.5,
        target_temp_c: 2.0,
      },
      gps: { lat: 34.0522, lng: -118.2437 },
    },
  },
  invoice: {
    label: 'Inbound Supplier Bill',
    payload: {
      invoice_number: 'INV-2026-881',
      vendor: {
        name: 'Apex Tactical Logistics LLC',
        tax_id: 'US-EIN-88492019',
      },
      po_number: 'PO-2026-4401',
      amounts: {
        subtotal_usd: 84000.0,
        freight_usd: 14500.0,
        grand_total_usd: 98500.0,
      },
      variance_pct: 17.3,
    },
  },
};

export default function NoCodeRuleStudioPage() {
  const [activeTab, setActiveTab] = useState<'builder' | 'inventory' | 'simulator' | 'integration'>('builder');
  const [rules, setRules] = useState<GenericRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Schema Drop Zone State
  const [selectedSampleKey, setSelectedSampleKey] = useState<string>('ecommerce');
  const [rawPayloadInput, setRawPayloadInput] = useState<string>(
    JSON.stringify(SAMPLE_PAYLOADS.ecommerce.payload, null, 2)
  );
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([]);
  const [introspecting, setIntrospecting] = useState<boolean>(false);

  // Sentence Builder State
  const [ruleName, setRuleName] = useState<string>('Block High-Risk High-Value Orders');
  const [ruleCode, setRuleCode] = useState<string>('RULE-HIGH-RISK-CHECKOUT');
  const [ruleDescription, setRuleDescription] = useState<string>('Automatically block checkout transactions when fraud score exceeds 80 and amount exceeds $5,000');
  const [triggerEvent, setTriggerEvent] = useState<string>('ORDER_CHECKOUT_INGRESS');
  const [selectedField, setSelectedField] = useState<string>('payment.fraud_risk_score');
  const [selectedOperator, setSelectedOperator] = useState<UniversalOperator>('GREATER_THAN');
  const [comparisonValue, setComparisonValue] = useState<string>('80');
  const [selectedAction, setSelectedAction] = useState<UniversalActionType>('BLOCK_DROP');
  const [actionTarget, setActionTarget] = useState<string>('Reject with 403 & notify fraud team');
  const [lifecycleMode, setLifecycleMode] = useState<RuleLifecycleStatus>('ACTIVE');
  const [savingRule, setSavingRule] = useState<boolean>(false);

  // Simulator State
  const [selectedSimRuleId, setSelectedSimRuleId] = useState<string>('');
  const [simReport, setSimReport] = useState<SimulationReport | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Load rules
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/rules/kernel/rules', {
        headers: { 'x-tenant-id': 'demo-tenant' },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
        if (data.rules?.length > 0 && !selectedSimRuleId) {
          setSelectedSimRuleId(data.rules[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load rules', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSimRuleId]);

  // Run Introspection on Sample or Custom JSON
  const handleIntrospect = useCallback(async (payloadText?: string) => {
    setIntrospecting(true);
    try {
      const parsed = JSON.parse(payloadText || rawPayloadInput);
      const res = await fetch('/api/rules/kernel/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: parsed }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredFields(data.fields || []);
        if (data.fields?.length > 0) {
          setSelectedField(data.fields[0].path);
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', message: `Invalid JSON payload: ${err.message}` });
    } finally {
      setIntrospecting(false);
    }
  }, [rawPayloadInput]);

  useEffect(() => {
    fetchRules();
    handleIntrospect();
  }, [fetchRules, handleIntrospect]);

  // Switch sample payload
  const handleSelectSample = (key: string) => {
    setSelectedSampleKey(key);
    const sample = SAMPLE_PAYLOADS[key];
    if (sample) {
      const text = JSON.stringify(sample.payload, null, 2);
      setRawPayloadInput(text);
      handleIntrospect(text);
    }
  };

  // Save new rule from Sentence Builder
  const handleSaveRule = async () => {
    if (!ruleName.trim() || !ruleCode.trim() || !selectedField) {
      setNotice({ type: 'error', message: 'Please fill in rule name, rule code, and select a field.' });
      return;
    }

    setSavingRule(true);
    setNotice(null);
    try {
      const res = await fetch('/api/rules/kernel/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'demo-tenant',
        },
        body: JSON.stringify({
          ruleCode: ruleCode.toUpperCase().replace(/\s+/g, '-'),
          name: ruleName,
          description: ruleDescription,
          triggerEvent,
          scope: 'TENANT_DEFAULT',
          lifecycleStatus: lifecycleMode,
          priority: 200,
          conditions: [
            {
              id: 'c-1',
              fieldPath: selectedField,
              operator: selectedOperator,
              value: isNaN(Number(comparisonValue)) ? comparisonValue : Number(comparisonValue),
            },
          ],
          action: {
            actionType: selectedAction,
            holdReason: actionTarget,
            targetChannel: selectedAction === 'REROUTE_TOPIC' ? actionTarget : undefined,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNotice({
          type: 'success',
          message: `Rule ${data.rule.ruleCode} successfully created in ${data.rule.lifecycleStatus} mode!`,
        });
        await fetchRules();
        setActiveTab('inventory');
      } else {
        const err = await res.json();
        setNotice({ type: 'error', message: err.error || 'Failed to create rule' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSavingRule(false);
    }
  };

  // Emergency Hijack / Kill-Switch
  const handleToggleHijack = async (rule: GenericRule) => {
    try {
      const res = await fetch(`/api/rules/kernel/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_HIJACK',
          reason: 'Invoked emergency kill-switch from Rule Studio UI',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotice({
          type: data.rule.lifecycleStatus === 'HIJACKED' ? 'error' : 'success',
          message: `Rule ${data.rule.ruleCode} status changed to ${data.rule.lifecycleStatus}`,
        });
        await fetchRules();
      }
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message });
    }
  };

  // Run Shadow Simulation
  const handleRunSimulation = async () => {
    const targetRule = rules.find((r) => r.id === selectedSimRuleId);
    if (!targetRule) return;

    setSimulating(true);
    try {
      const res = await fetch('/api/rules/kernel/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: targetRule }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimReport(data.report);
      }
    } catch (err: any) {
      console.error('Simulation error', err);
    } finally {
      setSimulating(false);
    }
  };

  // KPI calculations
  const activeCount = rules.filter((r) => r.lifecycleStatus === 'ACTIVE').length;
  const shadowCount = rules.filter((r) => r.lifecycleStatus === 'SHADOW').length;
  const hijackedCount = rules.filter((r) => r.lifecycleStatus === 'HIJACKED').length;
  const totalEvals = rules.reduce((sum, r) => sum + r.stats.totalEvaluations, 0);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-ui-fg-muted">
          <Link href="/rules" className="hover:text-ui-fg-base flex items-center gap-1 font-medium text-ui-fg-subtle">
            <ArrowLeft className="w-3.5 h-3.5" /> Traditional Rule Pro
          </Link>
          <span>/</span>
          <span className="text-ui-fg-base font-semibold">Universal Rule Studio</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Heading className="text-2xl font-bold tracking-tight text-ui-fg-base flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-500" />
                No-Code Universal Rule Studio
              </Heading>
              <Badge color="purple" size="small" className="font-semibold">
                Zero-Knowledge Kernel
              </Badge>
              <Badge color="green" size="small" className="font-semibold">
                Plug & Play
              </Badge>
            </div>
            <Text className="text-sm text-ui-fg-subtle mt-1">
              Construct dynamic business guardrails without code. Drop any JSON payload, auto-discover fields, simulate against historical traffic, and deploy or emergency-hijack rules in 1 click.
            </Text>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={fetchRules}
              disabled={loading}
              className="flex items-center gap-1 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Top KPI Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Container className="p-4 border-l-4 border-l-emerald-500 bg-ui-bg-subtle/50">
          <div className="flex items-center justify-between text-xs text-ui-fg-muted uppercase font-semibold">
            <span>Live Active Rules</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 font-mono">
            {activeCount} Rules
          </div>
          <div className="text-xs text-ui-fg-muted mt-0.5">Enforcing in real time (&lt;2ms)</div>
        </Container>

        <Container className="p-4 border-l-4 border-l-purple-500 bg-ui-bg-subtle/50">
          <div className="flex items-center justify-between text-xs text-ui-fg-muted uppercase font-semibold">
            <span>Shadow Simulation</span>
            <Eye className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 font-mono">
            {shadowCount} Rules
          </div>
          <div className="text-xs text-ui-fg-muted mt-0.5">Testing without blocking traffic</div>
        </Container>

        <Container className="p-4 border-l-4 border-l-amber-500 bg-ui-bg-subtle/50">
          <div className="flex items-center justify-between text-xs text-ui-fg-muted uppercase font-semibold">
            <span>Emergency Hijacked</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 font-mono">
            {hijackedCount} Paused
          </div>
          <div className="text-xs text-ui-fg-muted mt-0.5">1-click kill-switched policies</div>
        </Container>

        <Container className="p-4 border-l-4 border-l-blue-500 bg-ui-bg-subtle/50">
          <div className="flex items-center justify-between text-xs text-ui-fg-muted uppercase font-semibold">
            <span>Evaluations Handled</span>
            <Zap className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ui-fg-base font-mono">
            {totalEvals.toLocaleString()} Hits
          </div>
          <div className="text-xs text-ui-fg-muted mt-0.5">Zero-crash JSONPath evaluation</div>
        </Container>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between border ${
            notice.type === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            {notice.type === 'error' ? <ShieldAlert className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs font-bold opacity-70 hover:opacity-100 ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex items-center gap-2 border-b border-ui-border-base pb-3">
        <button
          onClick={() => setActiveTab('builder')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'builder'
              ? 'bg-ui-button-neutral text-ui-button-neutral-fg'
              : 'text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle'
          }`}
        >
          <Sliders className="w-4 h-4 text-emerald-500" />
          No-Code Sentence Builder
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'inventory'
              ? 'bg-ui-button-neutral text-ui-button-neutral-fg'
              : 'text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-500" />
          Rule Lifecycle & Inventory ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'simulator'
              ? 'bg-ui-button-neutral text-ui-button-neutral-fg'
              : 'text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle'
          }`}
        >
          <Play className="w-4 h-4 text-purple-500" />
          Shadow Simulator & Historical Replay
        </button>

        <button
          onClick={() => setActiveTab('integration')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'integration'
              ? 'bg-ui-button-neutral text-ui-button-neutral-fg'
              : 'text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle'
          }`}
        >
          <Terminal className="w-4 h-4 text-amber-500" />
          Plug & Play Gateway Hook
        </button>
      </div>

      {/* TAB 1: NO-CODE SENTENCE BUILDER */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Zero-Knowledge Schema Drop Zone */}
          <div className="lg:col-span-5 space-y-4">
            <Container className="p-5 border border-ui-border-base">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <div>
                  <Heading level="h3" className="text-sm font-bold text-ui-fg-base flex items-center gap-2">
                    <Database className="w-4 h-4 text-ui-fg-interactive" /> Schema Drop Zone
                  </Heading>
                  <Text className="text-xs text-ui-fg-muted mt-0.5">
                    Paste ANY unknown JSON payload from external APIs, topics, or sensors.
                  </Text>
                </div>
              </div>

              {/* Sample payload quick selector */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-medium text-ui-fg-muted">Sample:</span>
                {Object.keys(SAMPLE_PAYLOADS).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleSelectSample(key)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      selectedSampleKey === key
                        ? 'bg-ui-bg-interactive text-white border-ui-border-interactive'
                        : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base hover:bg-ui-bg-base'
                    }`}
                  >
                    {SAMPLE_PAYLOADS[key].label.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* JSON Textarea */}
              <div className="mt-3">
                <textarea
                  rows={8}
                  value={rawPayloadInput}
                  onChange={(e) => setRawPayloadInput(e.target.value)}
                  className="w-full font-mono text-xs p-3 rounded-md border border-ui-border-base bg-ui-bg-field text-ui-fg-base"
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Text className="text-xs text-ui-fg-muted">
                  Discovered <strong>{discoveredFields.length}</strong> fields dynamically.
                </Text>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => handleIntrospect()}
                  disabled={introspecting}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  {introspecting ? 'Discovering...' : 'Introspect Schema'}
                </Button>
              </div>

              {/* Discovered Fields List */}
              <div className="mt-4 pt-3 border-t border-ui-border-base max-h-56 overflow-y-auto space-y-1.5">
                {discoveredFields.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => setSelectedField(f.path)}
                    className={`p-2 rounded flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      selectedField === f.path
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : 'hover:bg-ui-bg-subtle/50'
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-semibold text-ui-fg-base">{f.label}</span>
                      <span className="font-mono text-[11px] text-ui-fg-muted ml-1.5">({f.path})</span>
                    </div>
                    <Badge color="grey" size="small" className="text-[10px] uppercase font-mono">
                      {f.detectedType}
                    </Badge>
                  </div>
                ))}
              </div>
            </Container>
          </div>

          {/* Right 7 Cols: The Natural Language Sentence Builder */}
          <div className="lg:col-span-7 space-y-4">
            <Container className="p-6 border border-ui-border-base space-y-5">
              <div className="border-b border-ui-border-base pb-3">
                <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                  Constrained Sentence Rule Builder
                </Heading>
                <Text className="text-xs text-ui-fg-muted mt-0.5">
                  Write rules in plain English. The kernel automatically compiles this into high-speed JSON pointer evaluation logic.
                </Text>
              </div>

              {/* Rule Identifiers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ui-fg-base block mb-1">Rule Name</label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    className="w-full text-xs border border-ui-border-base rounded-md px-3 py-2 bg-ui-bg-field text-ui-fg-base"
                    placeholder="e.g. Block High-Risk Orders"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ui-fg-base block mb-1">Rule Code</label>
                  <input
                    type="text"
                    value={ruleCode}
                    onChange={(e) => setRuleCode(e.target.value)}
                    className="w-full text-xs font-mono uppercase border border-ui-border-base rounded-md px-3 py-2 bg-ui-bg-field text-ui-fg-base"
                    placeholder="e.g. RULE-FRAUD-BLOCK"
                  />
                </div>
              </div>

              {/* Natural Language Sentence Visual Card */}
              <div className="p-5 rounded-xl border border-ui-border-base bg-ui-bg-subtle/30 space-y-4">
                {/* 1. WHEN */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-emerald-600 w-16">WHEN</span>
                  <div className="flex-1">
                    <select
                      value={triggerEvent}
                      onChange={(e) => setTriggerEvent(e.target.value)}
                      className="w-full text-xs font-semibold border border-ui-border-base rounded-md px-3 py-2 bg-ui-bg-field text-ui-fg-base"
                    >
                      <option value="ALL_EVENTS">Any Inbound Event / Stream (*)</option>
                      <option value="ORDER_CHECKOUT_INGRESS">Order Checkout Ingress (E-Commerce)</option>
                      <option value="INVOICE_INGESTION">Invoice & Document Ingestion (P2P)</option>
                      <option value="KAFKA_TOPIC_INGEST">Kafka Message Topic Bus (Broker)</option>
                      <option value="API_GATEWAY_INGRESS">API Gateway Edge Request</option>
                      <option value="FLEET_STREAM">Fleet Telemetry Ping (IoT)</option>
                    </select>
                  </div>
                </div>

                {/* 2. IF (Condition) */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-blue-600 w-16">IF</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
                    {/* Discovered Field */}
                    <select
                      value={selectedField}
                      onChange={(e) => setSelectedField(e.target.value)}
                      className="text-xs font-mono border border-ui-border-base rounded-md px-2.5 py-2 bg-ui-bg-field text-ui-fg-base truncate"
                    >
                      {discoveredFields.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.label} ({f.path})
                        </option>
                      ))}
                    </select>

                    {/* Operator */}
                    <select
                      value={selectedOperator}
                      onChange={(e) => setSelectedOperator(e.target.value as UniversalOperator)}
                      className="text-xs font-semibold border border-ui-border-base rounded-md px-2.5 py-2 bg-ui-bg-field text-ui-fg-base"
                    >
                      <option value="GREATER_THAN">&gt; Greater Than</option>
                      <option value="GREATER_THAN_OR_EQUAL">&gt;= Greater Or Equal</option>
                      <option value="LESS_THAN">&lt; Less Than</option>
                      <option value="EQUALS">= Equals</option>
                      <option value="NOT_EQUALS">!= Not Equals</option>
                      <option value="CONTAINS">Contains Substring</option>
                      <option value="IN_SET">In Allowed List</option>
                      <option value="IS_EMPTY">Is Missing or Empty</option>
                      <option value="EXCEEDS_PERCENT_OF_FIELD">Exceeds % of Baseline Field</option>
                      <option value="REGEX_MATCH">Regex Match</option>
                    </select>

                    {/* Target Value */}
                    <input
                      type="text"
                      value={comparisonValue}
                      onChange={(e) => setComparisonValue(e.target.value)}
                      className="text-xs border border-ui-border-base rounded-md px-2.5 py-2 bg-ui-bg-field text-ui-fg-base font-mono"
                      placeholder="e.g. 80 or 'US'"
                    />
                  </div>
                </div>

                {/* 3. THEN (Action) */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <span className="font-bold text-xs uppercase tracking-wider text-red-600 w-16">THEN</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1">
                    <select
                      value={selectedAction}
                      onChange={(e) => setSelectedAction(e.target.value as UniversalActionType)}
                      className="text-xs font-bold border border-ui-border-base rounded-md px-2.5 py-2 bg-ui-bg-field text-ui-fg-base"
                    >
                      <option value="BLOCK_DROP">⛔ BLOCK_DROP (Reject / Drop)</option>
                      <option value="HOLD_TRANSACTION">⏸️ HOLD_TRANSACTION (ERP Hold & Alert)</option>
                      <option value="REROUTE_TOPIC">🔀 REROUTE_TOPIC (Divert to Topic/DLQ)</option>
                      <option value="MUTATE_ENRICH">✨ MUTATE_ENRICH (Inject Tags/Headers)</option>
                      <option value="PASS">✅ PASS (Allow Clean Execution)</option>
                    </select>

                    <input
                      type="text"
                      value={actionTarget}
                      onChange={(e) => setActionTarget(e.target.value)}
                      className="text-xs border border-ui-border-base rounded-md px-2.5 py-2 bg-ui-bg-field text-ui-fg-base"
                      placeholder="Target topic, reason, or channel"
                    />
                  </div>
                </div>
              </div>

              {/* Lifecycle Deployment Mode */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ui-fg-base">Deployment Mode:</span>
                  <button
                    onClick={() => setLifecycleMode('ACTIVE')}
                    className={`text-xs px-3 py-1 rounded-md font-semibold border transition-colors ${
                      lifecycleMode === 'ACTIVE'
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                    }`}
                  >
                    Active (Enforcing)
                  </button>
                  <button
                    onClick={() => setLifecycleMode('SHADOW')}
                    className={`text-xs px-3 py-1 rounded-md font-semibold border transition-colors ${
                      lifecycleMode === 'SHADOW'
                        ? 'bg-purple-600 text-white border-purple-700'
                        : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                    }`}
                  >
                    Shadow Mode (Audit Only)
                  </button>
                  <button
                    onClick={() => setLifecycleMode('DRAFT')}
                    className={`text-xs px-3 py-1 rounded-md font-semibold border transition-colors ${
                      lifecycleMode === 'DRAFT'
                        ? 'bg-ui-button-neutral text-ui-button-neutral-fg border-ui-border-base'
                        : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                    }`}
                  >
                    Draft
                  </button>
                </div>

                <Button
                  variant="primary"
                  size="small"
                  onClick={handleSaveRule}
                  disabled={savingRule}
                  className="!bg-emerald-600 hover:!bg-emerald-700 !text-white font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  {savingRule ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Registering...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Deploy Rule
                    </>
                  )}
                </Button>
              </div>
            </Container>
          </div>
        </div>
      )}

      {/* TAB 2: RULE INVENTORY & LIFECYCLE MANAGEMENT */}
      {activeTab === 'inventory' && (
        <Container className="p-5 border border-ui-border-base">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
            <div>
              <Heading level="h3" className="text-base font-bold text-ui-fg-base">
                Active Tenant & System Rule Inventory
              </Heading>
              <Text className="text-xs text-ui-fg-muted mt-0.5">
                Real-time operational guardrails running across pipelines, gateways, and business modules.
              </Text>
            </div>
            <Button
              variant="primary"
              size="small"
              onClick={() => setActiveTab('builder')}
              className="flex items-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Create New Rule
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table className="text-xs">
              <Table.Header>
                <Table.Row className="bg-ui-bg-subtle/40">
                  <Table.HeaderCell>Rule Identifier</Table.HeaderCell>
                  <Table.HeaderCell>Trigger Event</Table.HeaderCell>
                  <Table.HeaderCell>Condition</Table.HeaderCell>
                  <Table.HeaderCell>Enforced Action</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Hits</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rules.map((r) => {
                  const cond = r.conditions[0];
                  return (
                    <Table.Row key={r.id} className="hover:bg-ui-bg-subtle/20">
                      <Table.Cell>
                        <div className="font-bold text-ui-fg-base">{r.name}</div>
                        <div className="font-mono text-[11px] text-ui-fg-muted">{r.ruleCode}</div>
                      </Table.Cell>
                      <Table.Cell className="font-mono text-[11px]">{r.triggerEvent}</Table.Cell>
                      <Table.Cell className="font-mono text-[11px]">
                        {cond ? `${cond.fieldPath} ${cond.operator} ${cond.value}` : 'No conditions'}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={
                            r.action.actionType === 'BLOCK_DROP'
                              ? 'red'
                              : r.action.actionType === 'HOLD_TRANSACTION'
                              ? 'orange'
                              : r.action.actionType === 'REROUTE_TOPIC'
                              ? 'purple'
                              : 'green'
                          }
                          size="small"
                          className="font-mono"
                        >
                          {r.action.actionType}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-right font-mono font-medium">
                        {r.stats.matchesCount} / {r.stats.totalEvaluations}
                      </Table.Cell>
                      <Table.Cell>
                        {r.lifecycleStatus === 'ACTIVE' && <StatusBadge color="green">ACTIVE</StatusBadge>}
                        {r.lifecycleStatus === 'SHADOW' && <StatusBadge color="purple">SHADOW</StatusBadge>}
                        {r.lifecycleStatus === 'DRAFT' && <StatusBadge color="grey">DRAFT</StatusBadge>}
                        {r.lifecycleStatus === 'HIJACKED' && <StatusBadge color="red">HIJACKED</StatusBadge>}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {!r.systemLocked && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="transparent"
                              size="small"
                              onClick={() => handleToggleHijack(r)}
                              className={`text-[11px] px-2 py-1 border ${
                                r.lifecycleStatus === 'HIJACKED'
                                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                  : 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'
                              }`}
                            >
                              <Power className="w-3 h-3 inline mr-1" />
                              {r.lifecycleStatus === 'HIJACKED' ? 'Resume' : 'Kill-Switch'}
                            </Button>

                            <button
                              onClick={() => {
                                setSelectedSimRuleId(r.id);
                                setActiveTab('simulator');
                              }}
                              className="text-xs text-ui-fg-muted hover:text-ui-fg-base px-1"
                              title="Run simulation"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {r.systemLocked && (
                          <Badge color="grey" size="small">
                            SYSTEM LOCKED
                          </Badge>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        </Container>
      )}

      {/* TAB 3: SHADOW SIMULATOR */}
      {activeTab === 'simulator' && (
        <Container className="p-5 border border-ui-border-base space-y-5">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
            <div>
              <Heading level="h3" className="text-base font-bold text-ui-fg-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-600" /> Historical Shadow Simulator
              </Heading>
              <Text className="text-xs text-ui-fg-muted mt-0.5">
                Replay live historical events against drafted rules to verify accuracy and prevent false positives before deploying.
              </Text>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedSimRuleId}
                onChange={(e) => setSelectedSimRuleId(e.target.value)}
                className="text-xs font-semibold border border-ui-border-base rounded-md px-3 py-2 bg-ui-bg-field text-ui-fg-base"
              >
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ruleCode})
                  </option>
                ))}
              </select>

              <Button
                variant="primary"
                size="small"
                onClick={handleRunSimulation}
                disabled={simulating}
                className="!bg-purple-600 hover:!bg-purple-700 !text-white flex items-center gap-1.5 shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                {simulating ? 'Replaying Events...' : 'Run Simulation'}
              </Button>
            </div>
          </div>

          {/* Simulation Output */}
          {simReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
                  <div className="text-xs text-ui-fg-muted">Events Replayed</div>
                  <div className="text-xl font-bold font-mono text-ui-fg-base mt-1">
                    {simReport.totalEvaluated} Events
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
                  <div className="text-xs text-ui-fg-muted">Simulated Matches</div>
                  <div className="text-xl font-bold font-mono text-purple-600 mt-1">
                    {simReport.matchedCount} Matches ({simReport.matchRatePct}%)
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
                  <div className="text-xs text-ui-fg-muted">Simulated Action</div>
                  <div className="text-xl font-bold font-mono text-ui-fg-base mt-1">
                    {simReport.simulatedAction}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
                  <div className="text-xs text-ui-fg-muted">False-Positive Safety</div>
                  <div className="mt-1">
                    {simReport.safetyCheck === 'PASSED' ? (
                      <Badge color="green" size="small">PASSED (Safe to Deploy)</Badge>
                    ) : (
                      <Badge color="red" size="small">HIGH FALSE-POSITIVE RISK</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Sample Matches Table */}
              <div className="mt-4">
                <Text className="text-xs font-semibold text-ui-fg-base mb-2">Simulated Event Match Traces</Text>
                <Table className="text-xs">
                  <Table.Header>
                    <Table.Row className="bg-ui-bg-subtle/40">
                      <Table.HeaderCell>Event #</Table.HeaderCell>
                      <Table.HeaderCell>Extracted Field Values</Table.HeaderCell>
                      <Table.HeaderCell>Simulated Verdict</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {simReport.sampleMatches.map((sm) => (
                      <Table.Row key={sm.eventIndex}>
                        <Table.Cell className="font-mono">#{sm.eventIndex}</Table.Cell>
                        <Table.Cell className="font-mono text-[11px]">
                          {JSON.stringify(sm.matchedValues)}
                        </Table.Cell>
                        <Table.Cell>
                          <Badge color="orange" size="small">{sm.verdict}</Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            </div>
          )}
        </Container>
      )}

      {/* TAB 4: PLUG & PLAY INTEGRATION SNIPPETS */}
      {activeTab === 'integration' && (
        <Container className="p-6 border border-ui-border-base space-y-6">
          <div className="border-b border-ui-border-base pb-3">
            <Heading level="h3" className="text-base font-bold text-ui-fg-base flex items-center gap-2">
              <Code className="w-5 h-5 text-amber-500" /> Plug-and-Play Universal Integration Hook
            </Heading>
            <Text className="text-xs text-ui-fg-muted mt-0.5">
              Drop this rule engine into ANY external system, pipeline, Kafka worker, or API Gateway in 3 lines of code.
            </Text>
          </div>

          <div className="space-y-4">
            <div>
              <Text className="text-xs font-bold text-ui-fg-base mb-1">1. TypeScript / Node.js Middleware</Text>
              <pre className="p-4 rounded-lg bg-ui-bg-subtle text-ui-fg-base font-mono text-xs overflow-x-auto border border-ui-border-base">
{`import { universalRuleKernelStore } from '@gigalibs/rule-kernel';

// In any API gateway, Kafka listener, or pipeline step:
const verdict = universalRuleKernelStore.evaluate(tenantId, 'ORDER_CHECKOUT_INGRESS', incomingPayload);

if (verdict.actionTaken === 'BLOCK_DROP') {
  return response.status(403).json({ error: 'Blocked by Rule: ' + verdict.primaryMatchedRule.ruleName });
}
if (verdict.actionTaken === 'REROUTE_TOPIC') {
  kafkaProducer.send({ topic: verdict.primaryMatchedRule.action.targetChannel, messages: [incomingPayload] });
}`}
              </pre>
            </div>

            <div>
              <Text className="text-xs font-bold text-ui-fg-base mb-1">2. HTTP REST Hook (cURL / Python / Go)</Text>
              <pre className="p-4 rounded-lg bg-ui-bg-subtle text-ui-fg-base font-mono text-xs overflow-x-auto border border-ui-border-base">
{`curl -X POST http://localhost:5180/api/rules/kernel/evaluate \\
  -H "x-tenant-id: demo-tenant" \\
  -H "Content-Type: application/json" \\
  -d '{
    "triggerEvent": "API_GATEWAY_INGRESS",
    "payload": {
      "payment": { "fraud_risk_score": 85, "amount_usd": 12000 }
    }
  }'`}
              </pre>
            </div>
          </div>
        </Container>
      )}
    </div>
  );
}
