'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
  CommandLine,
  InformationCircleSolid,
  Sparkles,
} from '@medusajs/icons';

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
  webhook_secret: string;
  target_workflow_code: string | null;
  configuration: Record<string, any>;
  status: 'READY' | 'SYNCING' | 'ERROR' | 'DISABLED';
  last_sync_at: string | null;
  events_count: number;
  created_at: string;
  updated_at: string;
  definition_name: string;
  category: string;
  icon: string;
  supported_events: string[];
}

export default function OAuthStudioPage() {
  const [catalog, setCatalog] = useState<ConnectorDefinition[]>([]);
  const [connections, setConnections] = useState<TenantConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Modal / Initiation state
  const [selectedConnector, setSelectedConnector] = useState<ConnectorDefinition | null>(null);
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [initClientId, setInitClientId] = useState('');
  const [initRedirectUri, setInitRedirectUri] = useState('');
  const [oauthResult, setOauthResult] = useState<any | null>(null);

  // Test probe outcome state
  const [probeResult, setProbeResult] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, connRes] = await Promise.all([
        fetch('/api/connectors-hub/catalog'),
        fetch('/api/connectors-hub/connections'),
      ]);

      if (!catRes.ok) {
        const payload = await catRes.json().catch(() => null);
        throw new Error(payload?.detail || `Catalog returned status ${catRes.status}`);
      }
      if (!connRes.ok) {
        const payload = await connRes.json().catch(() => null);
        throw new Error(payload?.detail || `Connections returned status ${connRes.status}`);
      }

      const catData = await catRes.json();
      const connData = await connRes.json();

      setCatalog(catData.catalog || []);
      setConnections(connData.connections || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load connector catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    if (typeof window !== 'undefined') {
      setInitRedirectUri(`${window.location.origin}/connections/oauth-callback`);
    }
  }, [loadData]);

  // Filter for providers that support OAuth2 or API_KEY
  const oauthProviders = useMemo(() => {
    return catalog.filter((c) =>
      c.auth_types && (c.auth_types.includes('OAUTH2') || c.auth_types.includes('API_KEY'))
    );
  }, [catalog]);

  const handleStartOAuth = (provider: ConnectorDefinition) => {
    setSelectedConnector(provider);
    setOauthResult(null);
    setInitClientId(`client-${provider.connector_code.toLowerCase()}`);
    setShowInitiateModal(true);
  };

  const handleExecuteInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnector) return;

    setBusyAction('initiate');
    setError(null);
    setOauthResult(null);

    try {
      const res = await fetch('/api/connectors-hub/oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connector_code: selectedConnector.connector_code,
          redirect_uri: initRedirectUri,
          client_id: initClientId,
          scopes: ['api', 'read_records', 'offline_access'],
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.detail || payload.message || 'Failed to initiate OAuth');
      }

      setOauthResult(payload);
      setSuccessNotice(`OAuth 2.0 PKCE Handshake initialized for ${selectedConnector.name}.`);
    } catch (err: any) {
      setError(err.message || 'OAuth initiation failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestConnection = async (connId: string) => {
    setBusyAction(`test-${connId}`);
    setError(null);
    setProbeResult(null);

    try {
      const res = await fetch(`/api/connectors-hub/connections/${connId}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Connection probe failed');
      }
      setProbeResult(data);
      setSuccessNotice(`Health probe executed: Status ${data.status} (${data.latency_ms}ms)`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Connection probe failed');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* ── Action Toolbar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Link href="/connections" className="text-ui-fg-muted hover:text-ui-fg-base transition-colors">
            ← Back to Connector Hub
          </Link>
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
        </div>
      </div>

      {/* ── Status Banners ───────────────────────────────── */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      {successNotice && (
        <Alert variant="success" className="mb-4">
          {successNotice}
        </Alert>
      )}

      {/* ── Metrics Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Supported OAuth Connectors
          </Text>
          <div className="text-2xl font-bold text-ui-fg-base mt-2">
            {oauthProviders.length}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Pre-registered RFC 7636 PKCE specifications
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Active Tenant Handshakes
          </Text>
          <div className="text-2xl font-bold text-blue-600 mt-2">
            {connections.length}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Persisted in PostgreSQL gigalibs_connectors
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Credential Encryption
          </Text>
          <div className="text-2xl font-bold text-emerald-600 mt-2">
            AES-256-GCM
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Hardware-grade cryptographic envelope protection
          </Text>
        </Container>
      </div>

      {/* ── Live Health Probe Result Banner (if run) ─────── */}
      {probeResult && (
        <Container className="p-5 border border-blue-200 bg-blue-50/50 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <Text weight="plus" className="text-blue-950 font-semibold text-sm">
                Real-Time Health Probe Result ({probeResult.slug})
              </Text>
            </div>
            <Badge color={probeResult.success ? 'green' : 'red'}>
              {probeResult.status} · {probeResult.latency_ms}ms
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-blue-100">
            {Object.entries(probeResult.checks || {}).map(([key, val]) => (
              <div key={key} className="bg-white/80 p-2 rounded-lg border border-blue-100">
                <span className="text-zinc-500 font-mono text-[10px] block uppercase">{key.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-zinc-900">{String(val)}</span>
              </div>
            ))}
          </div>
        </Container>
      )}

      {/* ── Pre-Configured Enterprise OAuth Providers Grid ── */}
      <div className="space-y-4">
        <div>
          <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
            Commercial SaaS & ERP Providers
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Select an enterprise cloud provider to initiate a governed OAuth 2.0 PKCE handshake.
          </Text>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {oauthProviders.map((provider) => {
            const activeConn = connections.find((c) => c.connector_code === provider.connector_code);

            return (
              <div
                key={provider.connector_code}
                className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest flex flex-col justify-between space-y-4 hover:border-ui-border-interactive transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                        {provider.name.slice(0, 1)}
                      </div>
                      <div>
                        <h3 className="font-bold text-ui-fg-base text-sm leading-tight">
                          {provider.name}
                        </h3>
                        <span className="text-[11px] font-mono text-ui-fg-muted uppercase">
                          {provider.category}
                        </span>
                      </div>
                    </div>
                    <Badge color={activeConn ? (activeConn.status === 'READY' ? 'green' : 'red') : 'grey'}>
                      {activeConn ? activeConn.status : 'NOT CONNECTED'}
                    </Badge>
                  </div>

                  <p className="mt-3 text-xs text-ui-fg-subtle line-clamp-2">
                    {provider.description}
                  </p>

                  <div className="mt-4 pt-3 border-t border-ui-border-base/60 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-ui-fg-muted">
                      <span>Auth Protocols:</span>
                      <span className="font-mono text-[11px] text-ui-fg-base">
                        {provider.auth_types?.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ui-fg-muted">
                      <span>Events Supported:</span>
                      <span className="font-medium text-ui-fg-base">
                        {provider.supported_events?.length || 0} event types
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => handleStartOAuth(provider)}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    1-Click Handshake
                  </Button>
                  {activeConn && (
                    <Button
                      variant="transparent"
                      size="small"
                      disabled={busyAction === `test-${activeConn.id}`}
                      isLoading={busyAction === `test-${activeConn.id}`}
                      onClick={() => void handleTestConnection(activeConn.id)}
                      title="Run Live Health Probe"
                    >
                      <PlaySolid className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active Tenant Connections Table ─────────────── */}
      <div className="space-y-4 pt-6">
        <div>
          <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
            Configured Tenant Connections
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Real integrations bound to this workspace in PostgreSQL.
          </Text>
        </div>

        <Container className="p-0 border border-ui-border-base bg-ui-bg-base overflow-hidden shadow-elevation-card-rest">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Connection</Table.HeaderCell>
                <Table.HeaderCell>Slug</Table.HeaderCell>
                <Table.HeaderCell>Auth Type</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Processed Events</Table.HeaderCell>
                <Table.HeaderCell>Last Sync</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {connections.map((conn) => (
                <Table.Row key={conn.id}>
                  <Table.Cell>
                    <div className="font-semibold text-ui-fg-base">{conn.name}</div>
                    <div className="text-[11px] text-ui-fg-muted">{conn.connector_code}</div>
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs text-ui-fg-subtle">
                    {conn.slug}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="blue">{conn.auth_type}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={conn.status === 'READY' ? 'green' : 'red'}>
                      {conn.status}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="text-xs font-semibold text-ui-fg-base">
                    {conn.events_count || 0}
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-muted">
                    {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString() : 'Never synced'}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={busyAction === `test-${conn.id}`}
                      isLoading={busyAction === `test-${conn.id}`}
                      onClick={() => void handleTestConnection(conn.id)}
                    >
                      Probe Health
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
              {connections.length === 0 && (
                <Table.Row>
                  <td colSpan={7} className="text-center py-8 text-ui-fg-muted text-sm">
                    No active connections configured yet for this workspace.
                  </td>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </Container>
      </div>

      {/* ── 1-Click PKCE Initiation Modal ─────────────────── */}
      {showInitiateModal && selectedConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-ui-border-base pb-3">
              <div>
                <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                  Initiate OAuth 2.0 PKCE Handshake
                </Heading>
                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                  Provider: <strong className="text-ui-fg-base">{selectedConnector.name}</strong> ({selectedConnector.connector_code})
                </Text>
              </div>
              <button
                type="button"
                onClick={() => setShowInitiateModal(false)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleExecuteInitiate(e)} className="space-y-4 text-xs">
              <div>
                <Label className="block text-xs font-semibold text-ui-fg-base mb-1">
                  Client ID
                </Label>
                <Input
                  required
                  value={initClientId}
                  onChange={(e) => setInitClientId(e.target.value)}
                  placeholder="e.g. gigalibs-client-salesforce"
                />
              </div>

              <div>
                <Label className="block text-xs font-semibold text-ui-fg-base mb-1">
                  Tenant Callback URI (Registered in Provider Console)
                </Label>
                <Input
                  required
                  value={initRedirectUri}
                  onChange={(e) => setInitRedirectUri(e.target.value)}
                  placeholder="http://localhost:5180/connections/oauth-callback"
                />
              </div>

              <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3 space-y-1">
                <Text size="xsmall" weight="plus" className="text-ui-fg-base">
                  PKCE Security Parameters:
                </Text>
                <p className="text-[11px] text-ui-fg-muted">
                  • Challenge Method: <strong>S256 (SHA-256)</strong>
                </p>
                <p className="text-[11px] text-ui-fg-muted">
                  • Secret Custody: Stored in PostgreSQL <code>gigalibs_connectors.connector_credentials</code> with AES-256-GCM encryption.
                </p>
              </div>

              {oauthResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2 text-emerald-900">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircleSolid className="w-4 h-4 text-emerald-600" />
                    Handshake Session Generated
                  </div>
                  <div className="font-mono text-[10px] break-all bg-white/80 p-2 rounded border border-emerald-200">
                    <div>State: {oauthResult.state}</div>
                    <div>Code Challenge: {oauthResult.code_challenge}</div>
                    {oauthResult.authorization_url && (
                      <div className="mt-1">
                        Auth URL: <span className="text-blue-600 underline">{oauthResult.authorization_url}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-ui-border-base flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setShowInitiateModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={busyAction === 'initiate'}
                  isLoading={busyAction === 'initiate'}
                >
                  Generate PKCE Session
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
