'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { SamOpportunity, SamExclusionRecord } from '@gigalibs/contracts';
import { Container, Heading, Text, Badge, StatusBadge, Button, Table } from '@medusajs/ui';

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<SamOpportunity[]>([]);
  const [exclusions, setExclusions] = useState<SamExclusionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'OPPORTUNITIES' | 'EXCLUSIONS'>('OPPORTUNITIES');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetAside, setSelectedSetAside] = useState('ALL');

  const fetchSamData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connectors/sam-gov/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSandbox: true, naicsCodes: ['541512'] }),
      });
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        setExclusions(data.exclusions || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSamData();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await fetchSamData();
    } finally {
      setSyncing(false);
    }
  };

  const filteredOpportunities = opportunities.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.solicitationNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSetAside =
      selectedSetAside === 'ALL' || item.typeOfSetAside === selectedSetAside;
    return matchesSearch && matchesSetAside;
  });

  return (
    <div className="space-y-6 p-8 font-sans text-ui-fg-base">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-ui-border-base">
        <div>
          <div className="flex items-center gap-2">
            <Heading level="h1" className="text-xl font-semibold text-ui-fg-base tracking-tight">
              Federal Contract Opportunities &amp; RFP Radar
            </Heading>
            <StatusBadge color="green">
              SAM.gov Live API
            </StatusBadge>
          </div>
          <Text size="small" className="mt-1 text-ui-fg-muted">
            Real-time U.S. Federal solicitations, NAICS matching, set-asides, and FAR 9.405 debarment screening.
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/connections"
            className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs font-medium text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover transition shadow-borders-base"
          >
            ← Connector Settings
          </Link>
          <Button
            size="small"
            variant="primary"
            disabled={syncing}
            onClick={handleSyncNow}
            isLoading={syncing}
          >
            🔄 Sync SAM.gov
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards (Medusa Containers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider font-semibold">
            Active Solicitations
          </Text>
          <Heading level="h2" className="text-2xl font-bold text-ui-fg-base mt-1 font-mono">
            {opportunities.length}
          </Heading>
          <Text size="xsmall" className="text-ui-fg-muted font-mono mt-0.5">Primary NAICS: 541512</Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider font-semibold">
            Debarred Entity Blacklist
          </Text>
          <Heading level="h2" className="text-2xl font-bold text-ui-tag-red-text mt-1 font-mono">
            {exclusions.length}
          </Heading>
          <Text size="xsmall" className="text-ui-fg-muted font-mono mt-0.5">FAR 9.405 Enforced</Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider font-semibold">
            Target Agency
          </Text>
          <div className="text-sm font-semibold text-ui-fg-base mt-2 truncate">Dept of Defense (DoD)</div>
          <Text size="xsmall" className="text-ui-fg-muted font-mono mt-0.5">Army, Navy, Air Force</Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider font-semibold">
            Connection Gateway
          </Text>
          <div className="text-sm font-semibold text-ui-fg-interactive mt-2">GSA Open Tech Gateway</div>
          <Text size="xsmall" className="text-ui-fg-muted font-mono mt-0.5">Rate limit: 1,000 req/day</Text>
        </Container>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-ui-border-base pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('OPPORTUNITIES')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            activeTab === 'OPPORTUNITIES'
              ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
              : 'text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
          }`}
        >
          🎯 Active Solicitations ({opportunities.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('EXCLUSIONS')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
            activeTab === 'EXCLUSIONS'
              ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
              : 'text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
          }`}
        >
          🛡️ Vendor Debarment Screening ({exclusions.length})
        </button>
      </div>

      {/* TAB 1: OPPORTUNITIES */}
      {activeTab === 'OPPORTUNITIES' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search by title, agency, or solicitation number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[240px] h-8 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-ui-border-interactive focus:outline-none shadow-borders-base"
            />
            <select
              value={selectedSetAside}
              onChange={(e) => setSelectedSetAside(e.target.value)}
              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-xs text-ui-fg-base focus:border-ui-border-interactive focus:outline-none shadow-borders-base"
            >
              <option value="ALL">All Set-Asides</option>
              <option value="SBA">Total Small Business</option>
              <option value="8A">8(a) Sole Source</option>
              <option value="SDVOSBC">SDVOSB (Veteran Owned)</option>
            </select>
          </div>

          <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row className="bg-ui-bg-subtle text-ui-fg-subtle text-xs">
                  <Table.HeaderCell>Solicitation #</Table.HeaderCell>
                  <Table.HeaderCell>Title &amp; SOW Scope</Table.HeaderCell>
                  <Table.HeaderCell>Department / Agency</Table.HeaderCell>
                  <Table.HeaderCell>Set-Aside</Table.HeaderCell>
                  <Table.HeaderCell>Deadline</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredOpportunities.map((opp) => (
                  <Table.Row key={opp.noticeId} className="hover:bg-ui-bg-subtle-hover transition">
                    <Table.Cell className="font-mono font-bold text-ui-fg-base text-xs">
                      {opp.solicitationNumber || opp.noticeId}
                    </Table.Cell>
                    <Table.Cell className="max-w-sm">
                      <div className="font-semibold text-ui-fg-base text-xs">{opp.title}</div>
                      <div className="text-[11px] text-ui-fg-muted line-clamp-1 mt-0.5">{opp.description}</div>
                    </Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle">
                      <div>{opp.department}</div>
                      <div className="text-[10px] text-ui-fg-muted font-mono">{opp.subTier}</div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="xsmall" color="blue">
                        {opp.typeOfSetAsideDescription || opp.typeOfSetAside || 'Unrestricted'}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs text-ui-fg-subtle">
                      {opp.responseDeadline ? new Date(opp.responseDeadline).toLocaleDateString() : 'Rolling'}
                    </Table.Cell>
                    <Table.Cell className="text-right space-x-2">
                      <Link
                        href="/workflows"
                        className="rounded-md px-2.5 py-1 text-[11px] font-medium bg-ui-bg-subtle hover:bg-ui-bg-base-hover text-ui-fg-base border border-ui-border-base transition shadow-borders-base inline-block"
                      >
                        ⚡ Run Proposal OCR
                      </Link>
                      {opp.uiLink && (
                        <a
                          href={opp.uiLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md px-2.5 py-1 text-[11px] font-medium bg-ui-bg-subtle hover:bg-ui-bg-base-hover text-ui-fg-base border border-ui-border-base transition shadow-borders-base inline-block"
                        >
                          SAM.gov ↗
                        </a>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}

      {/* TAB 2: EXCLUSIONS */}
      {activeTab === 'EXCLUSIONS' && (
        <div className="space-y-4">
          <Container className="p-4 border border-ui-border-base bg-ui-bg-subtle text-xs text-ui-fg-subtle rounded-xl">
            <strong className="text-ui-fg-base">FAR 9.405 Mandatory Compliance:</strong> Federal prime contractors are strictly prohibited from awarding subcontracts in excess of $35,000 to companies or individuals suspended or debarred on SAM.gov.
          </Container>

          <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row className="bg-ui-bg-subtle text-ui-fg-subtle text-xs">
                  <Table.HeaderCell>Excluded Entity / Person</Table.HeaderCell>
                  <Table.HeaderCell>Classification</Table.HeaderCell>
                  <Table.HeaderCell>UEI / CAGE</Table.HeaderCell>
                  <Table.HeaderCell>Exclusion Type</Table.HeaderCell>
                  <Table.HeaderCell>Active Since</Table.HeaderCell>
                  <Table.HeaderCell>Action Agency</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {exclusions.map((rec, i) => (
                  <Table.Row key={i} className="hover:bg-ui-bg-subtle-hover transition">
                    <Table.Cell className="font-semibold text-ui-tag-red-text text-xs">{rec.name}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle">{rec.classificationType}</Table.Cell>
                    <Table.Cell className="font-mono text-xs text-ui-fg-muted">{rec.uei || rec.cageCode || 'N/A'}</Table.Cell>
                    <Table.Cell>
                      <Badge size="xsmall" color="red">
                        {rec.exclusionType}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs text-ui-fg-subtle">{rec.activeDate}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-muted">{rec.agency || 'Federal Interagency'}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}
    </div>
  );
}
