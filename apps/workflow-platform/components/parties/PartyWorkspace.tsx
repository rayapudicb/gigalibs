'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Building2,
  User,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronRight,
  Shield,
  Layers,
  MapPin,
  Phone,
  Mail,
  FileText,
  GitMerge,
  Archive,
  RotateCcw,
} from 'lucide-react';
import type {
  PartyV1,
  PartyDetailResponseV1,
  PartyRoleV1,
  PartyAddressV1,
  PartyContactPointV1,
  PartyIdentifierV1,
} from '@gigalibs/contracts';

type DossierTab =
  | 'overview'
  | 'roles'
  | 'contacts'
  | 'addresses'
  | 'identifiers'
  | 'orgScope'
  | 'extensions'
  | 'actions';

export function PartyWorkspace() {
  const [parties, setParties] = useState<PartyV1[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [partyTypeFilter, setPartyTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Selected party dossier
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [partyDetail, setPartyDetail] = useState<PartyDetailResponseV1 | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState<boolean>(false);
  const [showAddContactModal, setShowAddContactModal] = useState<boolean>(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState<boolean>(false);

  // Form states
  const [newParty, setNewParty] = useState({
    code: '',
    legalName: '',
    displayName: '',
    partyType: 'ORGANIZATION',
    classification: 'STANDARD',
    initialRole: 'CUSTOMER',
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Merge state
  const [targetPartyId, setTargetPartyId] = useState<string>('');
  const [mergeReason, setMergeReason] = useState<string>('');
  const [mergePreview, setMergePreview] = useState<{
    combinedRoles: string[];
    contactsToTransfer: number;
    addressesToTransfer: number;
    identifiersToTransfer: number;
  } | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  // Sub-entity creation states
  const [newRole, setNewRole] = useState({ roleType: 'SUPPLIER' });
  const [newContact, setNewContact] = useState({ channel: 'EMAIL', value: '', label: 'General' });
  const [newAddress, setNewAddress] = useState({
    addressType: 'HEADQUARTERS',
    street1: '',
    city: '',
    countryCode: 'US',
  });

  const fetchParties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (partyTypeFilter !== 'ALL') params.set('partyType', partyTypeFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (roleFilter !== 'ALL') params.set('roleType', roleFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/control/parties?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load parties: HTTP ${res.status}`);
      }
      const data = await res.json();
      setParties(data.items ?? []);
      setTotalCount(data.totalCount ?? 0);
    } catch (err: any) {
      setError(err.message || 'Could not connect to Party service.');
    } finally {
      setLoading(false);
    }
  }, [search, partyTypeFilter, statusFilter, roleFilter]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  const loadPartyDetail = async (id: string) => {
    setSelectedPartyId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/control/parties/${id}`);
      if (!res.ok) throw new Error(`Could not load party detail: HTTP ${res.status}`);
      const data = await res.json();
      setPartyDetail(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/control/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newParty.code.trim().toUpperCase(),
          legalName: newParty.legalName.trim(),
          displayName: (newParty.displayName.trim() || newParty.legalName.trim()),
          partyType: newParty.partyType,
          classification: newParty.classification,
          initialRoles: [newParty.initialRole],
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.detail || `Create failed (HTTP ${res.status})`);
      }

      const created = await res.json();
      setShowCreateModal(false);
      setNotice(`Party "${created.party.code}" successfully created.`);
      setNewParty({
        code: '',
        legalName: '',
        displayName: '',
        partyType: 'ORGANIZATION',
        classification: 'STANDARD',
        initialRole: 'CUSTOMER',
      });
      await fetchParties();
      loadPartyDetail(created.party.id);
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!partyDetail) return;
    const reason = window.prompt('Please enter the reason for archiving this party:', 'Duplicate record or ceased operations');
    if (!reason) return;

    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: partyDetail.party.version,
          reason,
        }),
      });
      if (!res.ok) throw new Error('Archive failed.');
      setNotice(`Party ${partyDetail.party.code} archived.`);
      await fetchParties();
      loadPartyDetail(partyDetail.party.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRestore = async () => {
    if (!partyDetail) return;
    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/restore`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Restore failed.');
      setNotice(`Party ${partyDetail.party.code} restored to ACTIVE.`);
      await fetchParties();
      loadPartyDetail(partyDetail.party.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePreviewMerge = async () => {
    if (!partyDetail || !targetPartyId) return;
    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/merge-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPartyId }),
      });
      if (!res.ok) throw new Error('Could not calculate merge preview.');
      const data = await res.json();
      setMergePreview(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExecuteMerge = async () => {
    if (!partyDetail || !targetPartyId || !mergeReason.trim()) return;
    setMergeSubmitting(true);
    try {
      const targetDetailRes = await fetch(`/api/control/parties/${targetPartyId}`);
      if (!targetDetailRes.ok) throw new Error('Target party not found.');
      const targetDetail = await targetDetailRes.json();

      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePartyId: partyDetail.party.id,
          targetPartyId,
          sourceExpectedVersion: partyDetail.party.version,
          targetExpectedVersion: targetDetail.party.version,
          reason: mergeReason.trim(),
        }),
      });

      if (!res.ok) throw new Error('Merge execution failed.');
      setShowMergeModal(false);
      setNotice(`Party successfully merged into ${targetDetail.party.code}.`);
      setTargetPartyId('');
      setMergeReason('');
      setMergePreview(null);
      await fetchParties();
      loadPartyDetail(targetPartyId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMergeSubmitting(false);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyDetail) return;
    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleType: newRole.roleType }),
      });
      if (!res.ok) throw new Error('Failed to add role.');
      setShowAddRoleModal(false);
      setNotice(`Role ${newRole.roleType} assigned.`);
      loadPartyDetail(partyDetail.party.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyDetail) return;
    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: newContact.channel,
          value: newContact.value.trim(),
          label: newContact.label.trim(),
          isPrimary: partyDetail.contacts.length === 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to add contact.');
      setShowAddContactModal(false);
      setNewContact({ channel: 'EMAIL', value: '', label: 'General' });
      setNotice('Contact added.');
      loadPartyDetail(partyDetail.party.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyDetail) return;
    try {
      const res = await fetch(`/api/control/parties/${partyDetail.party.id}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressType: newAddress.addressType,
          street1: newAddress.street1.trim(),
          city: newAddress.city.trim(),
          countryCode: newAddress.countryCode.trim().toUpperCase(),
          isPrimary: partyDetail.addresses.length === 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to add address.');
      setShowAddAddressModal(false);
      setNewAddress({ addressType: 'HEADQUARTERS', street1: '', city: '', countryCode: 'US' });
      setNotice('Address added.');
      loadPartyDetail(partyDetail.party.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Counters
  const orgCount = parties.filter((p) => p.partyType === 'ORGANIZATION').length;
  const personCount = parties.filter((p) => p.partyType === 'INDIVIDUAL').length;
  const activeCount = parties.filter((p) => p.status === 'ACTIVE').length;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Top Banner / Alerts */}
      {notice && (
        <div className="flex items-center justify-between p-4 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-200 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-200 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-400" />
            Core Parties & Counterparties
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Canonical master identity for organizations, suppliers, customers, and contractors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchParties()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
            title="Refresh Directory"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Party
          </button>
        </div>
      </div>

      {/* Overview Stat Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Records</div>
          <div className="text-2xl font-semibold text-white mt-1">{totalCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Parties</div>
          <div className="text-2xl font-semibold text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Organizations</div>
          <div className="text-2xl font-semibold text-indigo-400 mt-1">{orgCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Individuals</div>
          <div className="text-2xl font-semibold text-purple-400 mt-1">{personCount}</div>
        </div>
      </div>

      {/* Main Workspace Layout: List Table & Detail Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filter Bar & Table (7 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Filters */}
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, legal or display name..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={partyTypeFilter}
                onChange={(e) => setPartyTypeFilter(e.target.value)}
                aria-label="Filter by Party Type"
                className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Types</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
                className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PROSPECT">Prospect</option>
                <option value="ARCHIVED">Archived</option>
                <option value="MERGED">Merged</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by Role"
                className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="CUSTOMER">Customer</option>
                <option value="SUPPLIER">Supplier</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="AGENCY">Agency</option>
                <option value="CARRIER">Carrier</option>
                <option value="PARTNER">Partner</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-zinc-400">Loading parties...</div>
            ) : parties.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <div className="text-zinc-300 font-medium">No parties found</div>
                <div className="text-sm text-zinc-500 mt-1">
                  Adjust your search filters or create a new party.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-800/60 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Code / Name</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Classification</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {parties.map((party) => {
                      const isSelected = selectedPartyId === party.id;
                      return (
                        <tr
                          key={party.id}
                          onClick={() => loadPartyDetail(party.id)}
                          className={`cursor-pointer transition hover:bg-zinc-800/50 ${
                            isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{party.displayName || party.legalName}</div>
                            <div className="text-xs text-zinc-400 font-mono">{party.code}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">
                              {party.partyType === 'ORGANIZATION' ? (
                                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-purple-400" />
                              )}
                              {party.partyType}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                party.status === 'ACTIVE'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : party.status === 'ARCHIVED'
                                  ? 'bg-zinc-800 text-zinc-400'
                                  : party.status === 'MERGED'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-blue-950 text-blue-400'
                              }`}
                            >
                              {party.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-zinc-400">
                            {party.classification || '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-zinc-400">
                            <ChevronRight className="w-4 h-4 ml-auto text-zinc-500" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Dossier Details (5 cols on desktop) */}
        <div className="lg:col-span-5">
          {selectedPartyId && partyDetail ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm sticky top-6">
              {/* Dossier Header */}
              <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">
                      {partyDetail.party.displayName || partyDetail.party.legalName}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-zinc-400">{partyDetail.party.code}</span>
                    <span className="text-xs text-zinc-600">•</span>
                    <span className="text-xs text-zinc-400">v{partyDetail.party.version}</span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    partyDetail.party.status === 'ACTIVE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {partyDetail.party.status}
                </span>
              </div>

              {/* Dossier Tabs */}
              <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 pb-2 text-xs">
                {(
                  [
                    'overview',
                    'roles',
                    'contacts',
                    'addresses',
                    'identifiers',
                    'orgScope',
                    'extensions',
                    'actions',
                  ] as DossierTab[]
                ).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-1 rounded-md font-medium capitalize whitespace-nowrap transition ${
                      activeTab === tab
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="min-h-[280px]">
                {activeTab === 'overview' && (
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Legal Name</div>
                      <div className="text-zinc-200 font-medium">{partyDetail.party.legalName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Party Type</div>
                      <div className="text-zinc-200">{partyDetail.party.partyType}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Classification</div>
                      <div className="text-zinc-200">{partyDetail.party.classification || 'None'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Created / Updated</div>
                      <div className="text-xs text-zinc-400">
                        Created {new Date(partyDetail.party.createdAt).toLocaleString()}
                      </div>
                      <div className="text-xs text-zinc-400">
                        Updated {new Date(partyDetail.party.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'roles' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">Assigned Business Roles</span>
                      <button
                        onClick={() => setShowAddRoleModal(true)}
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Role
                      </button>
                    </div>
                    {partyDetail.roles.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic py-4">No business roles assigned.</div>
                    ) : (
                      <div className="divide-y divide-zinc-800/80">
                        {partyDetail.roles.map((r) => (
                          <div key={r.id} className="py-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-indigo-300">{r.roleType}</span>
                            <span className="text-zinc-400">{r.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'contacts' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">Contact Points</span>
                      <button
                        onClick={() => setShowAddContactModal(true)}
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Contact
                      </button>
                    </div>
                    {partyDetail.contacts.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic py-4">No contact points recorded.</div>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {partyDetail.contacts.map((c) => (
                          <div key={c.id} className="py-2 flex items-start justify-between text-xs">
                            <div>
                              <div className="font-medium text-zinc-200">{c.value}</div>
                              <div className="text-zinc-500">{c.channel} ({c.label || 'Default'})</div>
                            </div>
                            {c.isPrimary && (
                              <span className="text-[10px] bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'addresses' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">Addresses & Locations</span>
                      <button
                        onClick={() => setShowAddAddressModal(true)}
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Address
                      </button>
                    </div>
                    {partyDetail.addresses.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic py-4">No addresses recorded.</div>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {partyDetail.addresses.map((a) => (
                          <div key={a.id} className="py-2 text-xs">
                            <div className="font-medium text-zinc-200">{a.street1}</div>
                            <div className="text-zinc-400">
                              {a.city}, {a.countryCode}
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase mt-0.5">{a.addressType}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'identifiers' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-zinc-400">Registered Identifiers</div>
                    {partyDetail.identifiers.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic py-4">No tax or registration numbers.</div>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {partyDetail.identifiers.map((i) => (
                          <div key={i.id} className="py-2 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-mono text-zinc-200">{i.value}</div>
                              <div className="text-zinc-500">{i.identifierType} ({i.issuerCountry || 'Global'})</div>
                            </div>
                            {i.isRestricted && (
                              <span className="text-[10px] bg-rose-950 text-rose-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Restricted
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'orgScope' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-zinc-400">WI-OI-109 Organization Assignments</div>
                    {partyDetail.orgAssignments.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic py-4">
                        Global within tenant (no unit restrictions).
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800">
                        {partyDetail.orgAssignments.map((o) => (
                          <div key={o.id} className="py-2 text-xs flex justify-between">
                            <span className="font-mono text-indigo-300">{o.orgUnitId}</span>
                            <span className="text-zinc-400">{o.assignmentPurpose}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'extensions' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-zinc-400">Application Dictionary Overlays</div>
                    {partyDetail.customExtensions && Object.keys(partyDetail.customExtensions).length > 0 ? (
                      <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-800">
                        <pre className="text-xs font-mono text-zinc-300 overflow-x-auto">
                          {JSON.stringify(partyDetail.customExtensions, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500 italic py-4">
                        No custom fields configured for this party.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'actions' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-zinc-400">Governed Operations</div>
                    <div className="flex flex-col gap-2 pt-2">
                      {partyDetail.party.status === 'ACTIVE' && (
                        <button
                          onClick={handleArchive}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded border border-zinc-700 transition"
                        >
                          <Archive className="w-4 h-4" />
                          Archive Party
                        </button>
                      )}

                      {partyDetail.party.status === 'ARCHIVED' && (
                        <button
                          onClick={handleRestore}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded border border-zinc-700 transition"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restore to Active
                        </button>
                      )}

                      {partyDetail.party.status !== 'MERGED' && (
                        <button
                          onClick={() => setShowMergeModal(true)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-indigo-300 rounded border border-zinc-700 transition"
                        >
                          <GitMerge className="w-4 h-4" />
                          Merge with Another Party...
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
              Select a party from the table to view its dossier.
            </div>
          )}
        </div>
      </div>

      {/* Create Party Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-semibold text-white">Create Core Party</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mt-3 p-3 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateParty} className="space-y-4 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Party Code *</label>
                <input
                  type="text"
                  required
                  value={newParty.code}
                  onChange={(e) => setNewParty({ ...newParty, code: e.target.value })}
                  placeholder="e.g. ACME_CORP"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Legal Name *</label>
                <input
                  type="text"
                  required
                  value={newParty.legalName}
                  onChange={(e) => setNewParty({ ...newParty, legalName: e.target.value })}
                  placeholder="Official registered name"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={newParty.displayName}
                  onChange={(e) => setNewParty({ ...newParty, displayName: e.target.value })}
                  placeholder="Trading or common name"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Party Type</label>
                  <select
                    value={newParty.partyType}
                    onChange={(e) => setNewParty({ ...newParty, partyType: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  >
                    <option value="ORGANIZATION">Organization</option>
                    <option value="INDIVIDUAL">Individual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Initial Role</label>
                  <select
                    value={newParty.initialRole}
                    onChange={(e) => setNewParty({ ...newParty, initialRole: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  >
                    <option value="CUSTOMER">Customer</option>
                    <option value="SUPPLIER">Supplier</option>
                    <option value="CONTRACTOR">Contractor</option>
                    <option value="PARTNER">Partner</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
                >
                  {createSubmitting ? 'Creating...' : 'Create Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Governed Merge Modal */}
      {showMergeModal && partyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-400" />
                Merge Counterparties
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-200 text-xs rounded">
                <strong>Warning:</strong> Merging will permanently retire{' '}
                <span className="font-mono text-white">{partyDetail.party.code}</span> and point all future operations
                to the selected survivor.
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Target Survivor Party</label>
                <select
                  value={targetPartyId}
                  onChange={(e) => {
                    setTargetPartyId(e.target.value);
                    setMergePreview(null);
                  }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                >
                  <option value="">Select survivor party...</option>
                  {parties
                    .filter((p) => p.id !== partyDetail.party.id && p.status === 'ACTIVE')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.displayName || p.legalName}
                      </option>
                    ))}
                </select>
              </div>

              {targetPartyId && !mergePreview && (
                <button
                  type="button"
                  onClick={handlePreviewMerge}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700"
                >
                  Calculate Merge Impact Preview
                </button>
              )}

              {mergePreview && (
                <div className="p-3 bg-zinc-800/80 rounded-lg text-xs space-y-1 text-zinc-300">
                  <div>
                    <strong>Transferred Contacts:</strong> {mergePreview.contactsToTransfer}
                  </div>
                  <div>
                    <strong>Transferred Addresses:</strong> {mergePreview.addressesToTransfer}
                  </div>
                  <div>
                    <strong>Combined Roles:</strong> {mergePreview.combinedRoles.join(', ')}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Merge Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  placeholder="Justification for counterparty consolidation..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  disabled={!targetPartyId || !mergeReason.trim() || mergeSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50"
                >
                  {mergeSubmitting ? 'Merging...' : 'Confirm & Merge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">Add Business Role</h3>
            <form onSubmit={handleAddRole} className="space-y-3 text-sm">
              <select
                value={newRole.roleType}
                onChange={(e) => setNewRole({ roleType: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
              >
                <option value="CUSTOMER">Customer</option>
                <option value="SUPPLIER">Supplier</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="AGENCY">Agency</option>
                <option value="CARRIER">Carrier</option>
                <option value="PARTNER">Partner</option>
              </select>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">Add Contact Point</h3>
            <form onSubmit={handleAddContact} className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-zinc-400">Channel</label>
                <select
                  value={newContact.channel}
                  onChange={(e) => setNewContact({ ...newContact, channel: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                >
                  <option value="EMAIL">Email</option>
                  <option value="PHONE">Phone</option>
                  <option value="MOBILE">Mobile</option>
                  <option value="WEBSITE">Website</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Value *</label>
                <input
                  type="text"
                  required
                  value={newContact.value}
                  onChange={(e) => setNewContact({ ...newContact, value: e.target.value })}
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Label</label>
                <input
                  type="text"
                  value={newContact.label}
                  onChange={(e) => setNewContact({ ...newContact, label: e.target.value })}
                  placeholder="Billing, Support, Dispatch..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Address Modal */}
      {showAddAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">Add Address</h3>
            <form onSubmit={handleAddAddress} className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-zinc-400">Address Type</label>
                <select
                  value={newAddress.addressType}
                  onChange={(e) => setNewAddress({ ...newAddress, addressType: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                >
                  <option value="HEADQUARTERS">Headquarters</option>
                  <option value="BILLING">Billing</option>
                  <option value="SHIPPING">Shipping</option>
                  <option value="SERVICE">Service</option>
                  <option value="BRANCH">Branch</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Street Address *</label>
                <input
                  type="text"
                  required
                  value={newAddress.street1}
                  onChange={(e) => setNewAddress({ ...newAddress, street1: e.target.value })}
                  placeholder="100 Main St"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">City *</label>
                  <input
                    type="text"
                    required
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    placeholder="City"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Country Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={newAddress.countryCode}
                    onChange={(e) => setNewAddress({ ...newAddress, countryCode: e.target.value.toUpperCase() })}
                    placeholder="US"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs mt-1 uppercase font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAddressModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                >
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
