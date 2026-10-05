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
        <div className="flex items-center justify-between p-4 bg-ui-tag-green-bg border border-ui-tag-green-border rounded-lg text-ui-tag-green-text text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-ui-tag-green-text" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-ui-tag-green-text hover:text-ui-tag-green-icon">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-ui-tag-red-bg border border-ui-tag-red-border rounded-lg text-ui-fg-error text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-ui-fg-error" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-ui-fg-error hover:text-ui-fg-error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ui-fg-base flex items-center gap-3">
            <Users className="w-7 h-7 text-ui-fg-interactive" />
            Core Parties & Counterparties
          </h1>
          <p className="text-sm text-ui-fg-subtle mt-1">
            Canonical master identity for organizations, suppliers, customers, and contractors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchParties()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-ui-bg-field hover:bg-ui-bg-field-hover text-ui-fg-base rounded-lg transition"
            title="Refresh Directory"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Party
          </button>
        </div>
      </div>

      {/* Overview Stat Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-xl">
          <div className="text-xs font-medium text-ui-fg-subtle uppercase tracking-wider">Total Records</div>
          <div className="text-2xl font-semibold text-ui-fg-base mt-1">{totalCount}</div>
        </div>
        <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-xl">
          <div className="text-xs font-medium text-ui-fg-subtle uppercase tracking-wider">Active Parties</div>
          <div className="text-2xl font-semibold text-ui-tag-green-text mt-1">{activeCount}</div>
        </div>
        <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-xl">
          <div className="text-xs font-medium text-ui-fg-subtle uppercase tracking-wider">Organizations</div>
          <div className="text-2xl font-semibold text-ui-fg-interactive mt-1">{orgCount}</div>
        </div>
        <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-xl">
          <div className="text-xs font-medium text-ui-fg-subtle uppercase tracking-wider">Individuals</div>
          <div className="text-2xl font-semibold text-ui-tag-purple-text mt-1">{personCount}</div>
        </div>
      </div>

      {/* Main Workspace Layout: List Table & Detail Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filter Bar & Table (7 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Filters */}
          <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-xl flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-ui-fg-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, legal or display name..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base placeholder-ui-fg-muted focus:outline-none focus:border-ui-border-interactive"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={partyTypeFilter}
                onChange={(e) => setPartyTypeFilter(e.target.value)}
                aria-label="Filter by Party Type"
                className="px-3 py-2 text-sm bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base focus:outline-none"
              >
                <option value="ALL">All Types</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
                className="px-3 py-2 text-sm bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base focus:outline-none"
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
                className="px-3 py-2 text-sm bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base focus:outline-none"
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
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-ui-fg-subtle">Loading parties...</div>
            ) : parties.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-ui-fg-muted mx-auto mb-3" />
                <div className="text-ui-fg-base font-medium">No parties found</div>
                <div className="text-sm text-ui-fg-muted mt-1">
                  Adjust your search filters or create a new party.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-ui-fg-base">
                  <thead className="bg-ui-bg-subtle text-xs font-semibold text-ui-fg-subtle uppercase tracking-wider border-b border-ui-border-base">
                    <tr>
                      <th className="px-4 py-3">Code / Name</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Classification</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base">
                    {parties.map((party) => {
                      const isSelected = selectedPartyId === party.id;
                      return (
                        <tr
                          key={party.id}
                          onClick={() => loadPartyDetail(party.id)}
                          className={`cursor-pointer transition hover:bg-ui-bg-base-hover ${
                            isSelected ? 'bg-ui-tag-blue-bg border-l-2 border-ui-border-interactive' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-ui-fg-base">{party.displayName || party.legalName}</div>
                            <div className="text-xs text-ui-fg-subtle font-mono">{party.code}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-ui-bg-field text-ui-fg-base">
                              {party.partyType === 'ORGANIZATION' ? (
                                <Building2 className="w-3.5 h-3.5 text-ui-fg-interactive" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-ui-tag-purple-text" />
                              )}
                              {party.partyType}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                party.status === 'ACTIVE'
                                  ? 'bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border'
                                  : party.status === 'ARCHIVED'
                                  ? 'bg-ui-bg-field text-ui-fg-subtle'
                                  : party.status === 'MERGED'
                                  ? 'bg-ui-tag-orange-bg text-ui-tag-orange-text border border-ui-tag-orange-border'
                                  : 'bg-ui-tag-blue-bg text-ui-tag-blue-text'
                              }`}
                            >
                              {party.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-ui-fg-subtle">
                            {party.classification || '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-ui-fg-subtle">
                            <ChevronRight className="w-4 h-4 ml-auto text-ui-fg-muted" />
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
            <div className="bg-ui-bg-base border border-ui-border-base rounded-xl p-5 flex flex-col gap-4 shadow-sm sticky top-6">
              {/* Dossier Header */}
              <div className="flex items-start justify-between border-b border-ui-border-base pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-ui-fg-base">
                      {partyDetail.party.displayName || partyDetail.party.legalName}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-ui-fg-subtle">{partyDetail.party.code}</span>
                    <span className="text-xs text-ui-fg-muted">•</span>
                    <span className="text-xs text-ui-fg-subtle">v{partyDetail.party.version}</span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    partyDetail.party.status === 'ACTIVE'
                      ? 'bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border'
                      : 'bg-ui-bg-field text-ui-fg-subtle'
                  }`}
                >
                  {partyDetail.party.status}
                </span>
              </div>

              {/* Dossier Tabs */}
              <div className="flex gap-1 overflow-x-auto border-b border-ui-border-base pb-2 text-xs">
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
                        ? 'bg-ui-button-inverted text-ui-contrast-fg-primary'
                        : 'text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover'
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
                      <div className="text-xs text-ui-fg-muted">Legal Name</div>
                      <div className="text-ui-fg-base font-medium">{partyDetail.party.legalName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ui-fg-muted">Party Type</div>
                      <div className="text-ui-fg-base">{partyDetail.party.partyType}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ui-fg-muted">Classification</div>
                      <div className="text-ui-fg-base">{partyDetail.party.classification || 'None'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ui-fg-muted">Created / Updated</div>
                      <div className="text-xs text-ui-fg-subtle">
                        Created {new Date(partyDetail.party.createdAt).toLocaleString()}
                      </div>
                      <div className="text-xs text-ui-fg-subtle">
                        Updated {new Date(partyDetail.party.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'roles' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ui-fg-subtle">Assigned Business Roles</span>
                      <button
                        onClick={() => setShowAddRoleModal(true)}
                        className="text-xs text-ui-fg-interactive hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Role
                      </button>
                    </div>
                    {partyDetail.roles.length === 0 ? (
                      <div className="text-xs text-ui-fg-muted italic py-4">No business roles assigned.</div>
                    ) : (
                      <div className="divide-y divide-ui-border-base">
                        {partyDetail.roles.map((r) => (
                          <div key={r.id} className="py-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-ui-fg-interactive">{r.roleType}</span>
                            <span className="text-ui-fg-subtle">{r.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'contacts' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ui-fg-subtle">Contact Points</span>
                      <button
                        onClick={() => setShowAddContactModal(true)}
                        className="text-xs text-ui-fg-interactive hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Contact
                      </button>
                    </div>
                    {partyDetail.contacts.length === 0 ? (
                      <div className="text-xs text-ui-fg-muted italic py-4">No contact points recorded.</div>
                    ) : (
                      <div className="divide-y divide-ui-border-base">
                        {partyDetail.contacts.map((c) => (
                          <div key={c.id} className="py-2 flex items-start justify-between text-xs">
                            <div>
                              <div className="font-medium text-ui-fg-base">{c.value}</div>
                              <div className="text-ui-fg-muted">{c.channel} ({c.label || 'Default'})</div>
                            </div>
                            {c.isPrimary && (
                              <span className="text-[10px] bg-ui-tag-blue-bg text-ui-fg-interactive px-1.5 py-0.5 rounded">
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
                      <span className="text-xs font-medium text-ui-fg-subtle">Addresses & Locations</span>
                      <button
                        onClick={() => setShowAddAddressModal(true)}
                        className="text-xs text-ui-fg-interactive hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Address
                      </button>
                    </div>
                    {partyDetail.addresses.length === 0 ? (
                      <div className="text-xs text-ui-fg-muted italic py-4">No addresses recorded.</div>
                    ) : (
                      <div className="divide-y divide-ui-border-base">
                        {partyDetail.addresses.map((a) => (
                          <div key={a.id} className="py-2 text-xs">
                            <div className="font-medium text-ui-fg-base">{a.street1}</div>
                            <div className="text-ui-fg-subtle">
                              {a.city}, {a.countryCode}
                            </div>
                            <div className="text-[10px] text-ui-fg-muted uppercase mt-0.5">{a.addressType}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'identifiers' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-ui-fg-subtle">Registered Identifiers</div>
                    {partyDetail.identifiers.length === 0 ? (
                      <div className="text-xs text-ui-fg-muted italic py-4">No tax or registration numbers.</div>
                    ) : (
                      <div className="divide-y divide-ui-border-base">
                        {partyDetail.identifiers.map((i) => (
                          <div key={i.id} className="py-2 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-mono text-ui-fg-base">{i.value}</div>
                              <div className="text-ui-fg-muted">{i.identifierType} ({i.issuerCountry || 'Global'})</div>
                            </div>
                            {i.isRestricted && (
                              <span className="text-[10px] bg-ui-tag-red-bg text-ui-fg-error px-1.5 py-0.5 rounded flex items-center gap-1">
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
                    <div className="text-xs font-medium text-ui-fg-subtle">WI-OI-109 Organization Assignments</div>
                    {partyDetail.orgAssignments.length === 0 ? (
                      <div className="text-xs text-ui-fg-muted italic py-4">
                        Global within tenant (no unit restrictions).
                      </div>
                    ) : (
                      <div className="divide-y divide-ui-border-base">
                        {partyDetail.orgAssignments.map((o) => (
                          <div key={o.id} className="py-2 text-xs flex justify-between">
                            <span className="font-mono text-ui-fg-interactive">{o.orgUnitId}</span>
                            <span className="text-ui-fg-subtle">{o.assignmentPurpose}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'extensions' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-ui-fg-subtle">Application Dictionary Overlays</div>
                    {partyDetail.customExtensions && Object.keys(partyDetail.customExtensions).length > 0 ? (
                      <div className="bg-ui-bg-subtle p-3 rounded-lg border border-ui-border-base">
                        <pre className="text-xs font-mono text-ui-fg-base overflow-x-auto">
                          {JSON.stringify(partyDetail.customExtensions, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-xs text-ui-fg-muted italic py-4">
                        No custom fields configured for this party.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'actions' && (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-ui-fg-subtle">Governed Operations</div>
                    <div className="flex flex-col gap-2 pt-2">
                      {partyDetail.party.status === 'ACTIVE' && (
                        <button
                          onClick={handleArchive}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-ui-bg-field hover:bg-ui-bg-field-hover text-ui-tag-orange-text rounded border border-ui-border-base transition"
                        >
                          <Archive className="w-4 h-4" />
                          Archive Party
                        </button>
                      )}

                      {partyDetail.party.status === 'ARCHIVED' && (
                        <button
                          onClick={handleRestore}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-ui-bg-field hover:bg-ui-bg-field-hover text-ui-tag-green-text rounded border border-ui-border-base transition"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restore to Active
                        </button>
                      )}

                      {partyDetail.party.status !== 'MERGED' && (
                        <button
                          onClick={() => setShowMergeModal(true)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-ui-bg-field hover:bg-ui-bg-field-hover text-ui-fg-interactive rounded border border-ui-border-base transition"
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
            <div className="bg-ui-bg-base border border-ui-border-base rounded-xl p-8 text-center text-ui-fg-muted">
              Select a party from the table to view its dossier.
            </div>
          )}
        </div>
      </div>

      {/* Create Party Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <h3 className="text-lg font-semibold text-ui-fg-base">Create Core Party</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-ui-fg-subtle hover:text-ui-fg-base">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mt-3 p-3 bg-ui-tag-red-bg border border-ui-tag-red-border text-ui-fg-error text-xs rounded">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateParty} className="space-y-4 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Party Code *</label>
                <input
                  type="text"
                  required
                  value={newParty.code}
                  onChange={(e) => setNewParty({ ...newParty, code: e.target.value })}
                  placeholder="e.g. ACME_CORP"
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Legal Name *</label>
                <input
                  type="text"
                  required
                  value={newParty.legalName}
                  onChange={(e) => setNewParty({ ...newParty, legalName: e.target.value })}
                  placeholder="Official registered name"
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Display Name</label>
                <input
                  type="text"
                  value={newParty.displayName}
                  onChange={(e) => setNewParty({ ...newParty, displayName: e.target.value })}
                  placeholder="Trading or common name"
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Party Type</label>
                  <select
                    value={newParty.partyType}
                    onChange={(e) => setNewParty({ ...newParty, partyType: e.target.value })}
                    className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
                  >
                    <option value="ORGANIZATION">Organization</option>
                    <option value="INDIVIDUAL">Individual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Initial Role</label>
                  <select
                    value={newParty.initialRole}
                    onChange={(e) => setNewParty({ ...newParty, initialRole: e.target.value })}
                    className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
                  >
                    <option value="CUSTOMER">Customer</option>
                    <option value="SUPPLIER">Supplier</option>
                    <option value="CONTRACTOR">Contractor</option>
                    <option value="PARTNER">Partner</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-ui-border-base">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-ui-fg-subtle hover:text-ui-fg-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded-lg disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
              <h3 className="text-lg font-semibold text-ui-fg-base flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-ui-fg-interactive" />
                Merge Counterparties
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="text-ui-fg-subtle hover:text-ui-fg-base">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div className="p-3 bg-ui-tag-orange-bg border border-ui-tag-orange-border text-ui-tag-orange-text text-xs rounded">
                <strong>Warning:</strong> Merging will permanently retire{' '}
                <span className="font-mono text-ui-fg-base">{partyDetail.party.code}</span> and point all future operations
                to the selected survivor.
              </div>

              <div>
                <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Target Survivor Party</label>
                <select
                  value={targetPartyId}
                  onChange={(e) => {
                    setTargetPartyId(e.target.value);
                    setMergePreview(null);
                  }}
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
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
                  className="px-3 py-1.5 text-xs font-medium bg-ui-bg-field hover:bg-ui-bg-field-hover text-ui-fg-base rounded border border-ui-border-base"
                >
                  Calculate Merge Impact Preview
                </button>
              )}

              {mergePreview && (
                <div className="p-3 bg-ui-bg-subtle rounded-lg text-xs space-y-1 text-ui-fg-base">
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
                <label className="block text-xs font-medium text-ui-fg-subtle mb-1">Merge Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  placeholder="Justification for counterparty consolidation..."
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-ui-border-base">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 text-sm text-ui-fg-subtle hover:text-ui-fg-base"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  disabled={!targetPartyId || !mergeReason.trim() || mergeSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded-lg disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-ui-fg-base mb-3">Add Business Role</h3>
            <form onSubmit={handleAddRole} className="space-y-3 text-sm">
              <select
                value={newRole.roleType}
                onChange={(e) => setNewRole({ roleType: e.target.value })}
                className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base"
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
                  className="px-3 py-1.5 text-xs text-ui-fg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-ui-fg-base mb-3">Add Contact Point</h3>
            <form onSubmit={handleAddContact} className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-ui-fg-subtle">Channel</label>
                <select
                  value={newContact.channel}
                  onChange={(e) => setNewContact({ ...newContact, channel: e.target.value })}
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                >
                  <option value="EMAIL">Email</option>
                  <option value="PHONE">Phone</option>
                  <option value="MOBILE">Mobile</option>
                  <option value="WEBSITE">Website</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-ui-fg-subtle">Value *</label>
                <input
                  type="text"
                  required
                  value={newContact.value}
                  onChange={(e) => setNewContact({ ...newContact, value: e.target.value })}
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-ui-fg-subtle">Label</label>
                <input
                  type="text"
                  value={newContact.label}
                  onChange={(e) => setNewContact({ ...newContact, label: e.target.value })}
                  placeholder="Billing, Support, Dispatch..."
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="px-3 py-1.5 text-xs text-ui-fg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-sm p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-ui-fg-base mb-3">Add Address</h3>
            <form onSubmit={handleAddAddress} className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-ui-fg-subtle">Address Type</label>
                <select
                  value={newAddress.addressType}
                  onChange={(e) => setNewAddress({ ...newAddress, addressType: e.target.value })}
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                >
                  <option value="HEADQUARTERS">Headquarters</option>
                  <option value="BILLING">Billing</option>
                  <option value="SHIPPING">Shipping</option>
                  <option value="SERVICE">Service</option>
                  <option value="BRANCH">Branch</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-ui-fg-subtle">Street Address *</label>
                <input
                  type="text"
                  required
                  value={newAddress.street1}
                  onChange={(e) => setNewAddress({ ...newAddress, street1: e.target.value })}
                  placeholder="100 Main St"
                  className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-ui-fg-subtle">City *</label>
                  <input
                    type="text"
                    required
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    placeholder="City"
                    className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-ui-fg-subtle">Country Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={newAddress.countryCode}
                    onChange={(e) => setNewAddress({ ...newAddress, countryCode: e.target.value.toUpperCase() })}
                    placeholder="US"
                    className="w-full px-3 py-2 bg-ui-bg-field border border-ui-border-base rounded-lg text-ui-fg-base text-xs mt-1 uppercase font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAddressModal(false)}
                  className="px-3 py-1.5 text-xs text-ui-fg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-ui-button-inverted hover:bg-ui-button-inverted-hover text-ui-contrast-fg-primary rounded"
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
