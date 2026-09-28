'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge, Button, Container, Heading, Input, StatusBadge, Text } from '@medusajs/ui';
import { CONNECTOR_CATALOG, type ConnectorDefinition } from '@/lib/connector-catalog';

const CATEGORIES = ['ALL', 'CRM', 'ERP', 'PAYMENTS', 'COMMUNICATION', 'SPREADSHEET', 'TICKETING', 'BANKING', 'ACCOUNTING', 'PROCUREMENT'];

const AUTH_COLOR: Record<string, 'blue' | 'orange' | 'green' | 'purple'> = {
  OAUTH2: 'blue', API_KEY: 'orange', BASIC: 'green', BEARER: 'purple',
};

export default function ConnectorsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');

  const filtered = useMemo(() => {
    return CONNECTOR_CATALOG.filter((c) => {
      const matchCat = category === 'ALL' || c.category === category;
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.slug.includes(q);
      return matchCat && matchSearch;
    });
  }, [search, category]);

  return (
    <div className="min-h-screen bg-ui-bg-subtle p-6 font-sans">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/workflows" className="text-xs text-ui-fg-muted hover:text-ui-fg-base">Workflow Studio</Link>
            <span className="text-ui-fg-muted text-xs">›</span>
            <span className="text-xs text-ui-fg-base">Connector Hub</span>
          </div>
          <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">Connector Hub</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {CONNECTOR_CATALOG.length} production-ready connectors. Connect once, use across all workflows.
          </Text>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Input
            type="search"
            placeholder="Search connectors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
            size="small"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                  category === cat
                    ? 'bg-ui-bg-interactive text-ui-fg-on-color border-ui-border-interactive'
                    : 'bg-ui-bg-base text-ui-fg-muted border-ui-border-base hover:bg-ui-bg-hover'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((connector) => (
            <ConnectorCard key={connector.id} connector={connector} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 py-16 text-center">
              <Text size="small" className="text-ui-fg-muted">No connectors match your search.</Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({ connector }: { connector: ConnectorDefinition }) {
  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 flex flex-col gap-3 hover:shadow-elevation-card-rest transition group">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl mb-1">{connector.icon_emoji}</div>
          <Heading level="h3" className="text-sm font-semibold text-ui-fg-base">{connector.name}</Heading>
          <Text size="xsmall" className="text-ui-fg-muted">{connector.vendor}</Text>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <StatusBadge color={connector.status === 'AVAILABLE' ? 'green' : connector.status === 'BETA' ? 'orange' : 'grey'}>
            {connector.status}
          </StatusBadge>
          {connector.webhook_support && (
            <Badge color="purple" size="small">Webhooks</Badge>
          )}
        </div>
      </div>

      <Text size="xsmall" className="text-ui-fg-subtle flex-1 leading-relaxed">{connector.description}</Text>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={AUTH_COLOR[connector.auth_type] ?? 'grey'} size="small">{connector.auth_type}</Badge>
        <Badge color="grey" size="small">{connector.category}</Badge>
        <Text size="xsmall" className="text-ui-fg-muted">{connector.actions.length} actions</Text>
      </div>

      <div className="flex gap-2 mt-1">
        <Link href={`/connectors/${connector.slug}`} className="flex-1">
          <Button variant="secondary" size="small" className="w-full">View Details</Button>
        </Link>
        <Link href={`/connectors/${connector.slug}?tab=connect`} className="flex-1">
          <Button variant="primary" size="small" className="w-full">Connect</Button>
        </Link>
      </div>
    </div>
  );
}
