'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Heading,
  Table,
  Text,
  Alert,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';
import {
  Workflow,
  Zap,
  RotateCcw,
  ShieldCheck,
  Play,
  Layers,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Lock,
} from 'lucide-react';

interface SagaStep {
  id: string;
  stepIndex: number;
  name: string;
  targetSystem: string;
  forwardAction: string;
  compensatingAction: string;
  status: 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  fipsSha256Checksum?: string;
  executedAt?: string;
  compensatedAt?: string;
  error?: string;
}

interface SagaInstance {
  id: string;
  sagaId: string;
  sagaType: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED' | 'FAILED';
  payload: Record<string, any>;
  compensationTriggered: boolean;
  auditLedgerDigest?: string;
  logSummary: string[];
  failAtStep?: number;
  createdAt: string;
  completedAt?: string;
  steps: SagaStep[];
}

interface SagaStats {
  totalSagas: number;
  completedCount: number;
  compensatedCount: number;
  failedCount: number;
  transactionalIntegrityPercent: number;
  avgStepLatencyMs: number;
}

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red' | 'blue' | 'purple'> = {
  COMPLETED: 'green',
  COMPENSATED: 'orange',
  IN_PROGRESS: 'blue',
  STARTED: 'blue',
  FAILED: 'red',
  SUCCESS: 'green',
  PENDING: 'purple',
  EXECUTING: 'blue',
};

export default function SagaPage() {
  const [instances, setInstances] = useState<SagaInstance[]>([]);
  const [stats, setStats] = useState<SagaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [expandedSagaId, setExpandedSagaId] = useState<string | null>(null);

  // Execution form
  const [selectedType, setSelectedType] = useState<
    'DISPUTE_ESCROW_SETTLEMENT' | 'GRID_CONTINGENCY_FAILOVER' | 'TREASURY_RTGS_SETTLEMENT'
  >('DISPUTE_ESCROW_SETTLEMENT');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [instRes, statsRes] = await Promise.all([
        fetch('/api/saga/instances'),
        fetch('/api/saga/stats'),
      ]);

      if (instRes.status === 403) {
        const body = await instRes.json().catch(() => ({}));
        setError(body.title || 'Access denied: "saga-orchestrator" entitlement or "saga:read" permission required.');
        return;
      }

      if (instRes.ok) setInstances(await instRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err: any) {
      setError(`Unable to connect to Distributed Saga Orchestrator: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExecute = async () => {
    setExecuting(true);
    setExecutionMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/saga/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sagaType: selectedType,
          payload: { initiatedAt: new Date().toISOString() },
          failAtStep: simulateFailure ? 2 : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.title || 'Execution failed');
      }

      const saga: SagaInstance = await res.json();
      setExecutionMessage(
        saga.status === 'COMPLETED'
          ? `Saga ${saga.sagaId} completed successfully across all target systems.`
          : `Saga ${saga.sagaId} encountered simulated failure and performed automatic compensating rollback.`
      );
      setExpandedSagaId(saga.sagaId);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Heading level="h1" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Distributed Saga Orchestrator
            </Heading>
            <Badge color="blue" size="small">ATOMIC COORDINATOR</Badge>
            <Badge color="green" size="small">ONLINE</Badge>
          </div>
          <Text className="text-gray-500 dark:text-gray-400 mt-1">
            Multi-system distributed transactions with forward execution, automated compensating rollbacks, and cryptographic audit ledger.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={loadData} disabled={loading} className="flex items-center gap-1.5">
          <ArrowPath className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {executionMessage && <Alert variant="success" className="mb-4">{executionMessage}</Alert>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Sagas', value: stats?.totalSagas ?? instances.length, icon: <Workflow className="w-4 h-4 text-blue-500" /> },
          { label: 'Committed Forward', value: stats?.completedCount ?? 0, icon: <ShieldCheck className="w-4 h-4 text-emerald-500" /> },
          { label: 'Compensated (Rolled Back)', value: stats?.compensatedCount ?? 0, icon: <RotateCcw className="w-4 h-4 text-orange-500" /> },
          { label: 'Integrity %', value: `${stats?.transactionalIntegrityPercent ?? 100}%`, icon: <Zap className="w-4 h-4 text-purple-500" /> },
        ].map((card) => (
          <div key={card.label} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</span>
              {card.icon}
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-gray-900 dark:text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Execution Panel */}
      <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Play className="w-4 h-4 text-blue-500" /> Execute Distributed Saga
        </h3>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Saga Scenario</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="DISPUTE_ESCROW_SETTLEMENT">Dispute Escrow Settlement (4 steps: SAP → CRM → DTS → Vault)</option>
              <option value="GRID_CONTINGENCY_FAILOVER">Grid Contingency Failover (3 steps: SCADA → SAP → CRM)</option>
              <option value="TREASURY_RTGS_SETTLEMENT">Treasury RTGS Settlement (3 steps: DTS → Vault → SAP)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="simulateFailure"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="simulateFailure" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Simulate Failure (trigger compensating rollback)
            </label>
          </div>
          <Button
            variant="primary"
            size="small"
            onClick={handleExecute}
            disabled={executing}
            className="flex items-center gap-1.5"
          >
            {executing ? 'Executing...' : 'Run Saga'}
          </Button>
        </div>
      </div>

      {/* Sagas Table */}
      <div className="flex flex-col gap-4">
        {instances.length === 0 && !loading ? (
          <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
            <Workflow className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <Heading level="h3" className="text-base font-semibold text-gray-900 dark:text-white">No Saga Instances</Heading>
            <Text className="text-gray-500 text-sm mt-1">Execute a saga scenario above to observe atomic execution and compensation.</Text>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-xs">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-8"></Table.HeaderCell>
                  <Table.HeaderCell>Saga ID</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Steps</Table.HeaderCell>
                  <Table.HeaderCell>Compensation</Table.HeaderCell>
                  <Table.HeaderCell>Created At</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {instances.map((saga) => (
                  <React.Fragment key={saga.id}>
                    <Table.Row
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => setExpandedSagaId(expandedSagaId === saga.sagaId ? null : saga.sagaId)}
                    >
                      <Table.Cell>
                        {expandedSagaId === saga.sagaId ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                        {saga.sagaId}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-600 dark:text-gray-400">
                        {saga.sagaType.replace(/_/g, ' ')}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={STATUS_COLOR[saga.status] || 'blue'} size="small">
                          {saga.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500 font-mono">
                        {saga.steps?.filter((s) => s.status === 'SUCCESS' || s.status === 'COMPENSATED').length ?? 0} / {saga.steps?.length ?? 0}
                      </Table.Cell>
                      <Table.Cell>
                        {saga.compensationTriggered ? (
                          <Badge color="orange" size="small">ROLLBACK TRIGGERED</Badge>
                        ) : (
                          <Badge color="green" size="small">NONE</Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-xs text-gray-500">
                        {new Date(saga.createdAt).toLocaleTimeString()}
                      </Table.Cell>
                    </Table.Row>

                    {/* Expanded Steps View */}
                    {expandedSagaId === saga.sagaId && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-gray-50 dark:bg-gray-800/60 p-4 border-t border-b border-gray-200 dark:border-gray-700">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5" /> Step Execution Ledger ({saga.steps.length} steps)
                            </h4>
                            <div className="flex flex-col gap-2">
                              {saga.steps.map((step) => (
                                <div
                                  key={step.id}
                                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono font-bold text-gray-400">#{step.stepIndex}</span>
                                    <div>
                                      <p className="font-semibold text-gray-900 dark:text-white">{step.name}</p>
                                      <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                                        Target: {step.targetSystem} | Action: {step.forwardAction}
                                      </p>
                                      {step.status === 'COMPENSATED' && (
                                        <p className="text-orange-500 font-mono text-[11px]">
                                          Compensated via: {step.compensatingAction}
                                        </p>
                                      )}
                                      {step.error && (
                                        <p className="text-red-500 font-mono text-[11px]">Error: {step.error}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {step.fipsSha256Checksum && (
                                      <span className="font-mono text-[10px] text-gray-400 max-w-[120px] truncate" title={step.fipsSha256Checksum}>
                                        SHA: {step.fipsSha256Checksum.slice(0, 8)}...
                                      </span>
                                    )}
                                    <Badge color={STATUS_COLOR[step.status] || 'blue'} size="small">
                                      {step.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {saga.auditLedgerDigest && (
                              <p className="text-[11px] font-mono text-gray-400 mt-3">
                                FIPS-140-3 Ledger Digest: {saga.auditLedgerDigest}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
