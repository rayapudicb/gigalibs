'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Container, Heading, Input, Label, Text } from '@medusajs/ui';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  status: 'ACTIVE' | 'REVOKED';
}

const ALL_SCOPES = [
  { value: 'workflows:read', label: 'Read workflows' },
  { value: 'workflows:execute', label: 'Execute workflows' },
  { value: 'workflows:write', label: 'Create/edit workflows' },
  { value: 'runs:read', label: 'Read run history' },
  { value: 'stats:read', label: 'Read statistics' },
  { value: 'connectors:read', label: 'Read connectors' },
  { value: 'connectors:write', label: 'Manage connectors' },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['workflows:execute', 'runs:read']);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflow-studio/api-keys');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title ?? `Service responded with ${res.status}`);
      }
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Workflow Studio API key service is temporarily unavailable.');
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  function toggleScope(scope: string) {
    setSelectedScopes((s) => s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/workflow-studio/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), scopes: selectedScopes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title ?? `Failed to create API key (${res.status})`);
      }
      const data = await res.json();
      if (data.plaintext_key) setGeneratedKey(data.plaintext_key);
      setNewName('');
      setCreating(false);
      await loadKeys();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create API key.');
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/workflow-studio/api-keys/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.title ?? `Failed to revoke key (${res.status})`);
      }
      await loadKeys();
    } catch (err: any) {
      setError(err.message ?? 'Failed to revoke API key.');
    }
  }

  return (
    <div className="min-h-screen bg-ui-bg-subtle p-6 font-sans">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 mb-1 text-xs text-ui-fg-muted">
          <Link href="/workflows">Workflow Studio</Link>
          <span>›</span>
          <span className="text-ui-fg-base">API Keys</span>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <Heading level="h1" className="text-xl font-bold text-ui-fg-base">API Keys</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-0.5">Authenticate programmatic access to the Workflow Studio API.</Text>
          </div>
          <Button variant="primary" size="small" onClick={() => { setCreating(true); setGeneratedKey(null); }}>
            + New API Key
          </Button>
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {generatedKey && (
          <div className="mb-6 rounded-xl border border-ui-border-interactive bg-ui-bg-base p-4">
            <Text size="xsmall" className="font-semibold text-ui-fg-base mb-2">Copy your API key now — it won&apos;t be shown again.</Text>
            <code className="block font-mono text-xs bg-ui-bg-subtle rounded p-3 text-ui-fg-interactive break-all select-all">
              {generatedKey}
            </code>
            <Button variant="secondary" size="small" className="mt-2" onClick={() => { void navigator.clipboard.writeText(generatedKey); }}>
              Copy to Clipboard
            </Button>
          </div>
        )}

        {creating && (
          <div className="mb-6 rounded-xl border border-ui-border-base bg-ui-bg-base p-6">
            <Heading level="h2" className="text-sm font-semibold mb-4">New API Key</Heading>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label className="mb-1 block text-xs font-medium text-ui-fg-subtle">Key Name *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. GitHub Actions Runner" size="small" />
              </div>
              <div>
                <Label className="mb-2 block text-xs font-medium text-ui-fg-subtle">Scopes</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SCOPES.map((scope) => (
                    <label key={scope.value} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope.value)}
                        onChange={() => toggleScope(scope.value)}
                        className="rounded"
                      />
                      <span className="text-ui-fg-base">{scope.label}</span>
                      <code className="text-ui-fg-muted font-mono text-[10px]">{scope.value}</code>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="small" isLoading={submitting} disabled={submitting}>Generate Key</Button>
                <Button type="button" variant="secondary" size="small" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <Container className="p-8 text-center border border-ui-border-base bg-ui-bg-base">
            <Text size="small" className="text-ui-fg-muted">Loading API keys…</Text>
          </Container>
        ) : keys.length === 0 && !error ? (
          <Container className="p-8 text-center border border-dashed border-ui-border-base bg-ui-bg-base rounded-xl space-y-3">
            <Heading level="h3" className="text-base font-semibold text-ui-fg-base">No API Keys</Heading>
            <Text size="small" className="text-ui-fg-muted max-w-md mx-auto">
              Create an API key to authenticate programmatic access to Workflow Studio pipelines.
            </Text>
            <Button variant="primary" size="small" onClick={() => { setCreating(true); setGeneratedKey(null); }}>
              + Create First API Key
            </Button>
          </Container>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Text size="small" className="font-semibold text-ui-fg-base">{key.name}</Text>
                      <Badge color={key.status === 'ACTIVE' ? 'green' : 'red'} size="small">{key.status}</Badge>
                    </div>
                    <code className="font-mono text-xs text-ui-fg-muted">{key.prefix}...••••••••</code>
                  </div>
                  {key.status === 'ACTIVE' && (
                    <Button variant="danger" size="small" onClick={() => void revokeKey(key.id)}>Revoke</Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {key.scopes.map((s) => <Badge key={s} color="blue" size="small">{s}</Badge>)}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-ui-fg-muted">
                  <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                  {key.last_used_at && <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>}
                  {!key.last_used_at && <span>Never used</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
