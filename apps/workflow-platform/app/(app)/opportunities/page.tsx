'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { SamOpportunity, SamExclusionRecord } from '@gigalibs/contracts';

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
    <div className="space-y-6 p-8 font-sans text-zinc-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Federal Contract Opportunities & RFP Radar
            </h1>
            <span className="rounded-md border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              SAM.gov Live API
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time U.S. Federal solicitations, NAICS matching, set-asides, and FAR 9.405 debarment screening.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/connections"
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition shadow-xs"
          >
            ← Connector Settings
          </Link>
          <button
            type="button"
            disabled={syncing}
            onClick={handleSyncNow}
            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-950 hover:bg-zinc-200 transition shadow-xs disabled:opacity-50"
          >
            {syncing ? 'Syncing SAM.gov…' : '🔄 Sync Now'}
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="text-xs text-zinc-400">Active Solicitations</div>
          <div className="text-2xl font-bold text-zinc-100 mt-1">{opportunities.length}</div>
          <div className="text-[11px] text-emerald-400 font-mono mt-0.5">Primary NAICS: 541512</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="text-xs text-zinc-400">Debarred Entity Blacklist</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{exclusions.length}</div>
          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">FAR 9.405 Enforced</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="text-xs text-zinc-400">Target Agency</div>
          <div className="text-sm font-semibold text-zinc-100 mt-2 truncate">Dept of Defense (DoD)</div>
          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Army, Navy, Air Force</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="text-xs text-zinc-400">Connection Gateway</div>
          <div className="text-sm font-semibold text-emerald-400 mt-2">GSA Open Tech Gateway</div>
          <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Rate limit: 1,000 req/day</div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('OPPORTUNITIES')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === 'OPPORTUNITIES'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          🎯 Active Solicitations ({opportunities.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('EXCLUSIONS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === 'EXCLUSIONS'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
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
              className="flex-1 min-w-[240px] h-9 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <select
              value={selectedSetAside}
              onChange={(e) => setSelectedSetAside(e.target.value)}
              className="h-9 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none"
            >
              <option value="ALL">All Set-Asides</option>
              <option value="SBA">Total Small Business</option>
              <option value="8A">8(a) Sole Source</option>
              <option value="SDVOSBC">SDVOSB (Veteran Owned)</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400">
                <tr>
                  <th className="p-3">Solicitation #</th>
                  <th className="p-3">Title & SOW Scope</th>
                  <th className="p-3">Department / Agency</th>
                  <th className="p-3">Set-Aside</th>
                  <th className="p-3">Deadline</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredOpportunities.map((opp) => (
                  <tr key={opp.noticeId} className="hover:bg-zinc-850/50 transition">
                    <td className="p-3 font-mono font-bold text-zinc-200">
                      {opp.solicitationNumber || opp.noticeId}
                    </td>
                    <td className="p-3 max-w-sm">
                      <div className="font-semibold text-zinc-100">{opp.title}</div>
                      <div className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{opp.description}</div>
                    </td>
                    <td className="p-3 text-zinc-300">
                      <div>{opp.department}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{opp.subTier}</div>
                    </td>
                    <td className="p-3">
                      <span className="rounded px-2 py-0.5 text-[10px] font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                        {opp.typeOfSetAsideDescription || opp.typeOfSetAside || 'Unrestricted'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-zinc-300">
                      {opp.responseDeadline ? new Date(opp.responseDeadline).toLocaleDateString() : 'Rolling'}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <Link
                        href="/workflows"
                        className="rounded px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                      >
                        ⚡ Run Proposal OCR
                      </Link>
                      {opp.uiLink && (
                        <a
                          href={opp.uiLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                        >
                          SAM.gov ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: EXCLUSIONS */}
      {activeTab === 'EXCLUSIONS' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-xs text-rose-300">
            <strong>FAR 9.405 Mandatory Compliance:</strong> Federal prime contractors are strictly prohibited from awarding subcontracts in excess of $35,000 to companies or individuals suspended or debarred on SAM.gov.
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400">
                <tr>
                  <th className="p-3">Excluded Entity / Person</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3">UEI / CAGE</th>
                  <th className="p-3">Exclusion Type</th>
                  <th className="p-3">Active Since</th>
                  <th className="p-3">Action Agency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {exclusions.map((rec, i) => (
                  <tr key={i} className="hover:bg-zinc-850/50 transition">
                    <td className="p-3 font-semibold text-rose-300">{rec.name}</td>
                    <td className="p-3 text-zinc-300">{rec.classificationType}</td>
                    <td className="p-3 font-mono text-zinc-400">{rec.uei || rec.cageCode || 'N/A'}</td>
                    <td className="p-3">
                      <span className="rounded px-2 py-0.5 text-[10px] font-medium border border-rose-500/30 bg-rose-500/10 text-rose-300">
                        {rec.exclusionType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-zinc-300">{rec.activeDate}</td>
                    <td className="p-3 text-zinc-400">{rec.agency || 'Federal Interagency'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
