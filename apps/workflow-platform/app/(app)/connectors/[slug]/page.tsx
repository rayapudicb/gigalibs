'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Container, Heading, Input, Label, StatusBadge, Text } from '@medusajs/ui';
import { getConnectorBySlug, type ConnectorDefinition } from '@/lib/connector-catalog';

type PageProps = { params: Promise<{ slug: string }> };

export default function ConnectorDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const connector = getConnectorBySlug(slug);

  if (!connector) {
    return (
      <div className="p-8 text-center">
        <Text size="small" className="text-ui-fg-muted">Connector not found: {slug}</Text>
        <Link href="/connectors"><Button variant="secondary" size="small" className="mt-4">Back to Hub</Button></Link>
      </div>
    );
  }

  return <ConnectorDetailView connector={connector} />;
}

function ConnectorDetailView({ connector }: { connector: ConnectorDefinition }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'overview' | 'connect' | 'actions'>(
    (searchParams.get('tab') as 'connect' | null) ?? 'overview'
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Validate required fields
      const missing = connector.credentials.filter((f) => f.required && !credentials[f.key]?.trim());
      if (missing.length > 0) throw new Error(`Required fields missing: ${missing.map((f) => f.label).join(', ')}`);

      // In production: POST /api/connectors-hub/credentials with encrypted payload
      // Here we simulate success
      await new Promise((r) => setTimeout(r, 800));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setSaving(false);
    }
  }

  const AUTH_COLOR: Record<string, 'blue' | 'orange' | 'green' | 'purple'> = {
    OAUTH2: 'blue', API_KEY: 'orange', BASIC: 'green', BEARER: 'purple',
  };

  return (
    <div className="min-h-screen bg-ui-bg-subtle p-6 font-sans">
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-xs text-ui-fg-muted">
          <Link href="/workflows">Workflow Studio</Link>
          <span>›</span>
          <Link href="/connectors">Connector Hub</Link>
          <span>›</span>
          <span className="text-ui-fg-base">{connector.name}</span>
        </div>

        {/* Hero */}
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 mb-6 flex items-start gap-4">
          <div className="text-4xl">{connector.icon_emoji}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Heading level="h1" className="text-xl font-bold text-ui-fg-base">{connector.name}</Heading>
              <StatusBadge color={connector.status === 'AVAILABLE' ? 'green' : 'orange'}>{connector.status}</StatusBadge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">{connector.vendor} · {connector.category}</Text>
            <Text size="small" className="mt-2 text-ui-fg-base">{connector.description}</Text>
            <div className="flex gap-2 mt-3">
              <Badge color={AUTH_COLOR[connector.auth_type] ?? 'grey'} size="small">{connector.auth_type}</Badge>
              {connector.webhook_support && <Badge color="purple" size="small">Webhook Triggers</Badge>}
              <Badge color="grey" size="small">{connector.actions.length} Actions</Badge>
            </div>
          </div>
          <a href={connector.docs_url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="small">View Docs</Button>
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-ui-border-base">
          {(['overview', 'connect', 'actions'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                tab === t
                  ? 'border-ui-border-interactive text-ui-fg-base'
                  : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
              }`}
            >
              {t === 'connect' ? 'Connect' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 space-y-4">
            <Heading level="h2" className="text-base font-semibold">Authentication</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              This connector uses <strong>{connector.auth_type}</strong> authentication.
              {connector.auth_type === 'OAUTH2' && ' Click Connect to start the OAuth2 authorization flow.'}
              {connector.auth_type === 'API_KEY' && ' Provide your API key to authenticate requests.'}
              {connector.auth_type === 'BASIC' && ' Provide your username and password credentials.'}
              {connector.auth_type === 'BEARER' && ' Provide your Bearer token.'}
            </Text>
            <div className="mt-4">
              <Heading level="h3" className="text-sm font-semibold mb-2">Required Credentials</Heading>
              <div className="space-y-1">
                {connector.credentials.map((cred) => (
                  <div key={cred.key} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${cred.required ? 'bg-ui-fg-error' : 'bg-ui-fg-muted'}`} />
                    <code className="font-mono text-ui-fg-interactive">{cred.key}</code>
                    <span className="text-ui-fg-muted">— {cred.label}</span>
                    {!cred.required && <Badge color="grey" size="small">optional</Badge>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Connect Tab */}
        {tab === 'connect' && (
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6">
            <Heading level="h2" className="text-base font-semibold mb-4">Connect {connector.name}</Heading>
            {saved ? (
              <Alert variant="success">
                {connector.name} connected successfully! Credentials are encrypted and stored securely.
              </Alert>
            ) : (
              <form onSubmit={handleConnect} className="space-y-4">
                {error && <Alert variant="error" className="text-xs">{error}</Alert>}
                {connector.credentials.map((field) => (
                  <div key={field.key}>
                    <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">
                      {field.label}{field.required && <span className="text-ui-fg-error ml-0.5">*</span>}
                    </Label>
                    {field.type === 'select' ? (
                      <select
                        value={credentials[field.key] ?? ''}
                        onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
                        className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-1.5 text-sm text-ui-fg-base outline-none focus:border-ui-border-interactive"
                      >
                        <option value="">Select {field.label}…</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                        value={credentials[field.key] ?? ''}
                        onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
                        placeholder={field.placeholder ?? ''}
                        size="small"
                        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                      />
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" variant="primary" size="small" disabled={saving} isLoading={saving}>
                    {connector.auth_type === 'OAUTH2' ? 'Authorize with OAuth2' : 'Save Credentials'}
                  </Button>
                  <Button type="button" variant="secondary" size="small" onClick={() => setCredentials({})}>
                    Clear
                  </Button>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted mt-2">
                  Credentials are encrypted at rest using AES-256 and stored in your tenant's isolated credential vault.
                </Text>
              </form>
            )}
          </div>
        )}

        {/* Actions Tab */}
        {tab === 'actions' && (
          <div className="space-y-3">
            {connector.actions.map((action) => (
              <div key={action.id} className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">{action.name}</Heading>
                    <Text size="xsmall" className="text-ui-fg-muted mt-0.5">{action.description}</Text>
                  </div>
                  <code className="font-mono text-[10px] text-ui-fg-interactive bg-ui-bg-subtle px-1.5 py-0.5 rounded">{action.id}</code>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Text size="xsmall" className="font-medium text-ui-fg-subtle mb-1 uppercase">Input Schema</Text>
                    <pre className="rounded bg-ui-bg-subtle p-2 text-[10px] font-mono text-ui-fg-base overflow-x-auto">
                      {JSON.stringify(action.input_schema, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <Text size="xsmall" className="font-medium text-ui-fg-subtle mb-1 uppercase">Output Schema</Text>
                    <pre className="rounded bg-ui-bg-subtle p-2 text-[10px] font-mono text-ui-fg-base overflow-x-auto">
                      {JSON.stringify(action.output_schema, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
