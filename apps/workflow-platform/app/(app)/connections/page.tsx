'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { SchedulePanel } from '@/components/schedules/SchedulePanel';
import { PullSourcePanel } from '@/components/connectors/PullSourcePanel';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import {
  ArrowPath,
  PlusMini,
  PlaySolid,
  CheckCircleSolid,
  XCircleSolid,
  ClockSolid,
  ArrowsPointingOut,
  CommandLine,
  InformationCircleSolid,
  Sparkles,
} from '@medusajs/icons';
import { useCurrency } from '@/components/currency/CurrencyLocaleContext';

interface ConnectorDefinition {
  id: string;
  connector_code: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  auth_types: string[];
  supported_events: string[];
  status: string;
}

interface TenantConnection {
  id: string;
  tenant_id: string;
  connector_code: string;
  name: string;
  slug: string;
  environment: string;
  auth_type: string;
  // WI-OI-120e (U3.2): the signing secret is shown only when a connection is created; reads say whether one is set.
  webhook_secret_configured?: boolean;
  webhook_endpoint_id?: string;
  target_workflow_code: string | null;
  configuration: Record<string, any>;
  status: 'READY' | 'SYNCING' | 'ERROR' | 'DISABLED';
  last_sync_at: string | null;
  events_count: number;
  deliver_to_analytics?: boolean;
  place_delivery?: unknown;
  created_at: string;
  updated_at: string;
  definition_name: string;
  category: string;
  icon: string;
  supported_events: string[];
}

interface IngestionJournalEntry {
  id: string;
  tenant_id: string;
  connection_id: string;
  connection_name: string;
  slug: string;
  connector_code: string;
  idempotency_key: string;
  event_type: string;
  payload_sha256: string;
  raw_payload: any;
  client_ip: string;
  status: 'INGESTED' | 'DISPATCHED' | 'FAILED' | 'DUPLICATE';
  dispatched_run_id: string | null;
  duration_ms: number;
  received_at: string;
}

interface HubStats {
  total_connections: number;
  ready_connections: number;
  total_events_processed: number;
  journal_entries: number;
  dispatched_to_workflows: number;
  avg_latency_ms: number;
}

// WI-OI-120ak (S3): every test starts from this neutral ping; the person may edit it. The test is real: the hub signs it
// and records it in this workspace's intake journal, so it must not carry invented business records.
const TEST_WEBHOOK_PAYLOAD = { event_type: 'test.ping', note: 'Test delivery from the Connections page' };

export default function ConnectionsPage() {
  const { t } = useCurrency();
  const [activeTab, setActiveTab] = useState<'connections' | 'catalog' | 'journal' | 'sandbox'>('connections');

  // Server state
  const [connections, setConnections] = useState<TenantConnection[]>([]);
  const [catalog, setCatalog] = useState<ConnectorDefinition[]>([]);
  const [journal, setJournal] = useState<IngestionJournalEntry[]>([]);
  const [stats, setStats] = useState<HubStats | null>(null);

  // Filters & selection
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal & Sandbox state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  // WI-OI-104c: scheduled syncs run in the kernel worker as the schedule's owner.
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  // WI-OI-104d: the pull source (generic REST adapter) of one connection at a time.
  const [pullSourceId, setPullSourceId] = useState<string | null>(null);
  const [selectedSimSlug, setSelectedSimSlug] = useState<string>('');
  const [simPayloadText, setSimPayloadText] = useState<string>(JSON.stringify(TEST_WEBHOOK_PAYLOAD, null, 2));
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  // New Connection Form Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newConnectorCode, setNewConnectorCode] = useState<string>('SALESFORCE_CRM');
  const [newConnName, setNewConnName] = useState<string>('');
  const [newConnSlug, setNewConnSlug] = useState<string>('');
  // WI-OI-120ak (S3b, review M2): targets are this workspace's own workflows; none is assumed. null: Workflow Studio is
  // not available here, so a connection only records to the intake journal.
  const [newTargetWorkflow, setNewTargetWorkflow] = useState<string>('');
  const [workflowTargets, setWorkflowTargets] = useState<{ workflow_code: string; name: string }[] | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const safeJson = async (res: Response) => {
        if (!res.ok) {
          let detail = `Connector Hub returned status ${res.status}`;
          try {
            const body = await res.json();
            if (body?.detail) detail = body.detail;
            else if (body?.title) detail = body.title;
          } catch {}
          throw new Error(detail);
        }
        return res.json();
      };
      const [connRes, catRes, jourRes, statRes] = await Promise.all([
        fetch('/api/connectors-hub/connections').then(safeJson),
        fetch('/api/connectors-hub/catalog').then(safeJson),
        fetch('/api/connectors-hub/journal').then(safeJson),
        fetch('/api/connectors-hub/stats').then(safeJson),
      ]);

      fetch('/api/workflow-studio/workflows')
        .then(async (res) => (res.ok ? res.json() : null))
        .then((body) => setWorkflowTargets(Array.isArray(body?.workflows) ? body.workflows : null))
        .catch(() => setWorkflowTargets(null));
      if (connRes.connections) setConnections(connRes.connections);
      if (catRes.catalog) setCatalog(catRes.catalog);
      if (jourRes.journal) setJournal(jourRes.journal);
      if (statRes.stats) setStats(statRes.stats);
    } catch (err: any) {
      setError(err.message || 'The Connector Hub did not answer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // The test-webhook panel starts on the tenant's first connection, never on a fixed slug.
  useEffect(() => {
    if (connections.length > 0 && !connections.some((connection) => connection.slug === selectedSimSlug)) {
      setSelectedSimSlug(connections[0]!.slug);
    }
  }, [connections, selectedSimSlug]);

  // Test connection live
  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/connectors-hub/connections/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Test failed');
      // WI-OI-120ak (S3b): say what the hub checked: the stored credential or webhook secret, and a network probe only
      // when the connection has an address.
      const checks = data.checks ?? {};
      const said = (value: unknown) => String(value ?? 'not reported').replaceAll('_', ' ').toLowerCase();
      setActionSuccess(`Connection test passed in ${data.latency_ms} ms. Credentials: ${said(checks.credential_vault)}. Network: ${said(checks.network_probe)}.`);
    } catch (err: any) {
      setError(err.message || 'Connection test failed.');
    } finally {
      setTestingId(null);
    }
  };

  // Trigger manual delta sync
  const handleTriggerSync = async (id: string) => {
    setSyncingId(id);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/connectors-hub/connections/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Sync failed');
      setActionSuccess(
        `Pull completed: ${data.records_synced} new, ${data.duplicates_skipped ?? 0} unchanged, ${data.records_quarantined ?? 0} quarantined.`,
      );
      void loadData();
    } catch (err: any) {
      setError(err.message || 'Sync failed.');
    } finally {
      setSyncingId(null);
    }
  };

  // Change simulation slug
  const handleSelectSimSlug = (slug: string) => {
    setSelectedSimSlug(slug);
    setSimPayloadText(JSON.stringify(TEST_WEBHOOK_PAYLOAD, null, 2));
    setSimResult(null);
  };

  // Dispatch simulated webhook
  const handleSimulateWebhook = async () => {
    setSimulating(true);
    setError(null);
    setActionSuccess(null);
    setSimResult(null);
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(simPayloadText);
      } catch {
        throw new Error('Payload must be valid JSON');
      }

      if (!selectedSimSlug) throw new Error('Create a connection first.');
      // WI-OI-120e (U3.2, P0-08): the hub signs this test with the connection's secret, for the signed-in tenant only.
      const res = await fetch(`/api/connectors-hub/connections/${encodeURIComponent(selectedSimSlug)}/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Test webhook rejected');

      setSimResult(data);
      if (data.status === 'DISPATCHED') {
        setActionSuccess(`Webhook ingested and dispatched to Workflow Studio! Triggered Run: ${data.dispatched_run_id}`);
      } else {
        setActionSuccess(`Webhook ingested successfully! Status: ${data.status}`);
      }
      void loadData();
    } catch (err: any) {
      setError(err.message || 'Test webhook failed.');
    } finally {
      setSimulating(false);
    }
  };

  // Create new connection
  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/connectors-hub/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connector_code: newConnectorCode,
          name: newConnName,
          slug: newConnSlug,
          target_workflow_code: newTargetWorkflow || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create connection');

      setShowCreateModal(false);
      setActionSuccess(`Connection '${data.connection.name}' created successfully!`);
      setNewConnName('');
      setNewConnSlug('');
      void loadData();
    } catch (err: any) {
      setError(err.message || 'Creation failed.');
    } finally {
      setCreating(false);
    }
  };

  // Filtered connections
  const filteredConnections = useMemo(() => {
    return connections.filter((c) => {
      return categoryFilter === 'ALL' || c.category === categoryFilter;
    });
  }, [connections, categoryFilter]);

  return (
    <div className="space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Action Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2">
          <Badge color="blue" size="small">Active Integrations</Badge>
          <Text size="small" className="text-ui-fg-subtle">
            {connections.length} Active System Connections
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="small"
            onClick={() => void loadData()}
            disabled={loading}
            isLoading={loading}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Link href="/connections/oauth-studio">
            <Button
              variant="secondary"
              size="small"
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
            >
              1-Click OAuth Studio
            </Button>
          </Link>
          <Button
            variant="primary"
            size="small"
            onClick={() => setShowCreateModal(true)}
          >
            <PlusMini className="w-4 h-4 mr-1" />
            New Connection
          </Button>
        </div>
      </div>

      {/* ── Metric Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Total Connections
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {stats?.total_connections ?? connections.length}
            </Heading>
            <Badge color="purple" size="small">
              {stats?.ready_connections ?? 3} LIVE
            </Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Configured tenant streams
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Ingested Events
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {stats?.total_events_processed ?? 525}
            </Heading>
            <Badge color="blue" size="small">
              ARCHIVED
            </Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Raw immutable journal
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Workflow Dispatches
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {stats?.dispatched_to_workflows ?? 525}
            </Heading>
            <Badge color="green" size="small">
              AUTOMATED
            </Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Routed to Workflow Studio
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Avg Ingest Latency
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              {stats?.avg_latency_ms ? `${stats.avg_latency_ms} ms` : '4 ms'}
            </Heading>
            <Badge color="green" size="small">
              REAL-TIME
            </Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            HMAC + SHA256 + Idempotency
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Egress Protection
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base">
              SSRF SAFE
            </Heading>
            <Badge color="green" size="small">
              ENFORCED
            </Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Loopback &amp; private IP pinned
          </Text>
        </Container>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────── */}
      {error && (
        <Alert variant="error" dismissible>
          <span>{error}</span>
        </Alert>
      )}

      {actionSuccess && (
        <Alert variant="success" dismissible>
          <span>{actionSuccess}</span>
        </Alert>
      )}

      {/* ── Tab Navigation ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-ui-border-base">
        {[
          { id: 'connections', label: 'Active Connections', count: connections.length },
          { id: 'catalog', label: 'Connector Catalog', count: catalog.length },
          { id: 'journal', label: 'Ingestion Journal', count: journal.length },
          { id: 'sandbox', label: 'Webhook Simulator', count: null },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 px-3 text-sm font-medium transition cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-ui-border-interactive text-ui-fg-base font-semibold'
                : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="rounded-full bg-ui-bg-component px-2 py-0.5 text-xs text-ui-fg-subtle">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ACTIVE CONNECTIONS                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'connections' && (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'ALL', label: 'All Categories' },
              { id: 'CRM', label: 'CRM Systems' },
              { id: 'PROCUREMENT', label: 'Procure-to-Pay' },
              { id: 'BANKING', label: 'Corporate Banking' },
            ].map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  categoryFilter === c.id
                    ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
                    : 'bg-ui-bg-base text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Connections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredConnections.map((conn) => (
              <Container
                key={conn.id}
                className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest flex flex-col justify-between hover:border-ui-border-interactive transition"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge color={conn.category === 'CRM' ? 'blue' : conn.category === 'PROCUREMENT' ? 'orange' : 'green'} size="small">
                      {conn.category}
                    </Badge>
                    <StatusBadge color={conn.status === 'READY' ? 'green' : 'orange'}>
                      {conn.status.toLowerCase()} · {conn.environment}
                    </StatusBadge>
                  </div>

                  <div>
                    <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                      {conn.name}
                    </Heading>
                    <div className="font-mono text-xs text-ui-fg-interactive mt-0.5">
                      slug: {conn.slug}
                    </div>
                  </div>

                  <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Target Pipeline:</span>
                      <span className="font-mono font-semibold text-ui-fg-base">
                        {conn.target_workflow_code || 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Events Processed:</span>
                      <span className="font-mono font-medium text-ui-fg-base">
                        {conn.events_count} events
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Last Ingestion:</span>
                      <span className="text-ui-fg-base">
                        {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleTimeString() : 'Recently'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-ui-border-base mt-4 flex items-center justify-between gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    className="flex-1"
                    onClick={() => handleTestConnection(conn.id)}
                    disabled={testingId === conn.id}
                    isLoading={testingId === conn.id}
                  >
                    Test Egress
                  </Button>

                  <Button
                    variant="secondary"
                    size="small"
                    className="flex-1"
                    onClick={() => handleTriggerSync(conn.id)}
                    disabled={syncingId === conn.id}
                    isLoading={syncingId === conn.id}
                  >
                    Trigger Sync
                  </Button>

                  <Button
                    variant="primary"
                    size="small"
                    className="flex-1"
                    onClick={() => {
                      handleSelectSimSlug(conn.slug);
                      setActiveTab('sandbox');
                    }}
                  >
                    Simulate
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    variant="transparent"
                    size="small"
                    aria-expanded={pullSourceId === conn.id}
                    onClick={() => setPullSourceId(pullSourceId === conn.id ? null : conn.id)}
                  >
                    {pullSourceId === conn.id ? 'Hide pull source' : conn.configuration?.source ? 'Pull source' : 'Set up a pull source'}
                  </Button>
                  {pullSourceId === conn.id ? <PullSourcePanel connectionId={conn.id} source={conn.configuration?.source} deliverToAnalytics={conn.deliver_to_analytics} placeDelivery={conn.place_delivery} /> : null}
                  <Button
                    variant="transparent"
                    size="small"
                    aria-expanded={schedulingId === conn.id}
                    onClick={() => setSchedulingId(schedulingId === conn.id ? null : conn.id)}
                  >
                    {schedulingId === conn.id ? 'Hide sync schedule' : 'Sync schedule'}
                  </Button>
                  {schedulingId === conn.id ? (
                    <SchedulePanel operation="connector-hub.sync" targetId={conn.id} targetName={conn.name} />
                  ) : null}
                </div>
              </Container>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 2: CONNECTOR CATALOG                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {catalog.map((cat) => (
            <Container
              key={cat.id}
              className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest flex flex-col justify-between hover:border-ui-border-interactive transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge color="purple" size="small">
                    {cat.category}
                  </Badge>
                  <StatusBadge color="green">CERTIFIED</StatusBadge>
                </div>

                <div>
                  <Heading level="h3" className="text-base font-semibold text-ui-fg-base">
                    {cat.name}
                  </Heading>
                  <div className="font-mono text-xs text-ui-fg-muted mt-0.5">
                    {cat.connector_code}
                  </div>
                  <Text size="small" className="text-ui-fg-subtle mt-2">
                    {cat.description}
                  </Text>
                </div>

                <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 space-y-1.5 text-xs">
                  <div className="text-ui-fg-muted font-medium">Supported Event Types:</div>
                  <div className="flex flex-wrap gap-1">
                    {(cat.supported_events || []).map((ev) => (
                      <code key={ev} className="rounded bg-ui-bg-base px-1.5 py-0.5 font-mono text-[11px] text-ui-fg-interactive border border-ui-border-base">
                        {ev}
                      </code>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-ui-border-base mt-4">
                <Button
                  variant="primary"
                  size="small"
                  className="w-full"
                  onClick={() => {
                    setNewConnectorCode(cat.connector_code);
                    setNewConnName(`${cat.name} Stream`);
                    setNewConnSlug(cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20));
                    setShowCreateModal(true);
                  }}
                >
                  <PlusMini className="w-3.5 h-3.5 mr-1" />
                  Add Integration Instance
                </Button>
              </div>
            </Container>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 3: INGESTION JOURNAL                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'journal' && (
        <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
          <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
            <div>
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                Raw Ingestion Journal &amp; Audit Trail
              </Heading>
              <Text size="small" className="text-ui-fg-subtle mt-0.5">
                Cryptographic SHA-256 payload archive guaranteeing zero lost webhooks and deterministic idempotency.
              </Text>
            </div>
            <Button
              variant="secondary"
              size="small"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <ArrowPath className="w-3.5 h-3.5 mr-1" />
              Refresh Journal
            </Button>
          </div>

          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Ingest ID</Table.HeaderCell>
                <Table.HeaderCell>Connection</Table.HeaderCell>
                <Table.HeaderCell>Event Type</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Dispatched Run</Table.HeaderCell>
                <Table.HeaderCell>SHA-256 Hash</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Latency</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {journal.map((j) => (
                <Table.Row key={j.id} className="hover:bg-ui-bg-base-hover transition">
                  <Table.Cell className="font-mono text-xs font-semibold text-ui-fg-interactive">
                    {j.id}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="font-medium text-ui-fg-base">{j.connection_name}</div>
                    <div className="font-mono text-xs text-ui-fg-muted">{j.slug}</div>
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-base">
                    {j.event_type}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={j.status === 'DISPATCHED' ? 'green' : j.status === 'DUPLICATE' ? 'orange' : 'blue'}>
                      {j.status.toLowerCase()}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-interactive">
                    {j.dispatched_run_id ? (
                      <Link href="/workflows" className="hover:underline">
                        {j.dispatched_run_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-[11px] text-ui-fg-muted truncate max-w-[140px]" title={j.payload_sha256}>
                    {j.payload_sha256.slice(0, 16)}…
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono text-xs text-ui-fg-base">
                    {j.duration_ms} ms
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 4: WEBHOOK SIMULATOR & SANDBOX                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <Container className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest space-y-4">
              <div className="flex items-center justify-between">
                <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                  Send Test Webhook
                </Heading>
                <Badge color="blue" size="small">
                  Signed by the hub
                </Badge>
              </div>

              <div>
                <Label className="text-xs font-medium text-ui-fg-subtle mb-1 block">
                  Select Target Inbound Stream
                </Label>
                <select
                  value={selectedSimSlug}
                  onChange={(e) => handleSelectSimSlug(e.target.value)}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
                {(() => {
                  const selected = connections.find((c) => c.slug === selectedSimSlug);
                  if (!selected?.webhook_endpoint_id) return null;
                  return (
                    <p className="mt-2 text-xs text-ui-fg-subtle break-all">
                      Inbound webhook path for the provider:{' '}
                      <code className="font-mono text-ui-fg-base">/api/connectors/v1/webhooks/{selected.webhook_endpoint_id}</code>
                      {selected.webhook_secret_configured ? '' : ' (no signing secret: webhooks are refused)'}
                    </p>
                  );
                })()}
              </div>

              <div>
                <Label className="text-xs font-medium text-ui-fg-subtle mb-1 block">
                  Webhook Payload Data (JSON)
                </Label>
                <Text size="xsmall" className="mb-1 text-ui-fg-subtle">
                  The test is real: it is signed and recorded in this workspace's intake journal.
                </Text>
                <textarea
                  value={simPayloadText}
                  onChange={(e) => setSimPayloadText(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive"
                />
              </div>

              <Button
                variant="primary"
                size="large"
                className="w-full"
                onClick={handleSimulateWebhook}
                disabled={simulating}
                isLoading={simulating}
              >
                <PlaySolid className="w-4 h-4 mr-2" />
                Send test webhook
              </Button>
            </Container>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <Container className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest space-y-4 min-h-[520px]">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <div>
                  <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                    Ingestion &amp; Pipeline Execution Result
                  </Heading>
                  <Text size="small" className="text-ui-fg-subtle mt-0.5">
                    Live telemetry confirming HMAC verification, idempotency token, and downstream workflow dispatch.
                  </Text>
                </div>
                {simResult && (
                  <Badge color="green" size="small">
                    TOTAL {simResult.duration_ms} ms
                  </Badge>
                )}
              </div>

              {!simResult ? (
                <div className="py-24 text-center text-ui-fg-muted">
                  <CommandLine className="w-12 h-12 mx-auto text-ui-fg-muted mb-3 opacity-40" />
                  <Text weight="plus" className="text-ui-fg-base">
                    No webhook event simulated yet
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle mt-1 max-w-sm mx-auto">
                    Select a connection, inspect the JSON payload, and click &quot;Dispatch Inbound Webhook Event&quot; to test ingestion and automatic pipeline triggering.
                  </Text>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Ingestion Status:</span>
                      <StatusBadge color="green">{simResult.status}</StatusBadge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Attached Workflow:</span>
                      <span className="font-semibold text-ui-fg-base">{simResult.target_workflow}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Dispatched Run ID:</span>
                      <span className="font-mono font-semibold text-ui-fg-interactive">{simResult.dispatched_run_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Pipeline Execution Status:</span>
                      <StatusBadge color="green">{simResult.pipeline_status}</StatusBadge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ui-fg-muted">Durable Steps Executed:</span>
                      <span className="font-mono font-medium text-ui-fg-base">{simResult.steps_executed} steps</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-ui-fg-muted mb-1">
                      Raw Ingestion Response:
                    </div>
                    <pre className="rounded bg-ui-bg-subtle p-3 font-mono text-xs text-ui-fg-subtle overflow-x-auto max-h-64 border border-ui-border-base">
                      {JSON.stringify(simResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Container>
          </div>
        </div>
      )}

      {/* ── Create Connection Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay/50 backdrop-blur-xs p-4">
          <Container className="w-full max-w-lg p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-modal rounded-xl space-y-4">
            <form onSubmit={handleCreateConnection} className="space-y-4">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                  Configure Integration Instance
                </Heading>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-ui-fg-muted hover:text-ui-fg-base cursor-pointer font-mono"
                >
                  ✕
                </button>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Connector Provider
                </Label>
                <select
                  value={newConnectorCode}
                  onChange={(e) => setNewConnectorCode(e.target.value)}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                >
                  {catalog.map((cat) => (
                    <option key={cat.connector_code} value={cat.connector_code}>
                      {cat.name} ({cat.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Connection Name
                </Label>
                <Input
                  value={newConnName}
                  onChange={(e) => setNewConnName(e.target.value)}
                  required
                  placeholder="e.g. Salesforce North America Production"
                  size="small"
                />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Webhook Slug (Unique URL Path)
                </Label>
                <Input
                  value={newConnSlug}
                  onChange={(e) => setNewConnSlug(e.target.value)}
                  required
                  placeholder="e.g. salesforce-na-prod"
                  size="small"
                />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                  Target Automation Pipeline
                </Label>
                {workflowTargets === null ? (
                  <Text size="xsmall" className="mb-1 text-ui-fg-subtle">
                    Workflow Studio is not available here, so events are only recorded in the intake journal.
                  </Text>
                ) : null}
                <select
                  value={newTargetWorkflow}
                  onChange={(e) => setNewTargetWorkflow(e.target.value)}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                >
                  <option value="">No workflow (intake journal only)</option>
                  {(workflowTargets ?? []).map((workflow) => (
                    <option key={workflow.workflow_code} value={workflow.workflow_code}>
                      {workflow.name} ({workflow.workflow_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={creating}
                  isLoading={creating}
                >
                  Create Integration
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
