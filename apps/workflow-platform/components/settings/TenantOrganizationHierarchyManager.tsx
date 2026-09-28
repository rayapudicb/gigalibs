'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { EmploymentType } from '@gigalibs/contracts';

interface Department {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  managerId: string | null;
  spendingLimit: string | number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string; code: string } | null;
  manager?: { id: string; name: string; email: string } | null;
  _count?: { members: number; children: number };
}

interface Member {
  id: string;
  role: string;
  status: string;
  departmentId?: string | null;
  employmentType?: string | null;
  updatedAt: string;
  user: { id: string; name: string; email: string };
  department?: { id: string; name: string; code: string } | null;
}

interface Props {
  tenantId: string;
  canManage: boolean;
}

export function TenantOrganizationHierarchyManager({ tenantId, canManage }: Props) {
  const [hierarchyEnabled, setHierarchyEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [modalParentId, setModalParentId] = useState<string>('');
  const [modalName, setModalName] = useState('');
  const [modalCode, setModalCode] = useState('');
  const [modalManagerId, setModalManagerId] = useState('');
  const [modalSpendingLimit, setModalSpendingLimit] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  // Member assignment modal
  const [assigningMember, setAssigningMember] = useState<Member | null>(null);
  const [assignDeptId, setAssignDeptId] = useState<string>('');
  const [assignEmploymentType, setAssignEmploymentType] = useState<string>('');
  const [assignReason, setAssignReason] = useState('Department realignment');
  const [savingMember, setSavingMember] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, deptsRes, membersRes] = await Promise.all([
        fetch('/api/control/tenants/current/organization/settings', { cache: 'no-store' }),
        fetch('/api/control/tenants/current/departments', { cache: 'no-store' }),
        fetch('/api/control/tenants/current/members', { cache: 'no-store' }),
      ]);

      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setHierarchyEnabled(Boolean(settings.hierarchyEnabled));
      } else {
        setHierarchyEnabled(false);
      }

      if (deptsRes.ok) {
        const depts = await deptsRes.json();
        setDepartments(Array.isArray(depts) ? depts : []);
      }

      if (membersRes.ok) {
        const mems = await membersRes.json();
        setMembers(Array.isArray(mems) ? mems : []);
      }
    } catch {
      setError('Unable to load organization hierarchy data from control plane.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleHierarchy = async (enable: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/control/tenants/current/organization/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hierarchyEnabled: enable }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update organization hierarchy settings');
      }
      setHierarchyEnabled(enable);
      setSuccess(
        enable
          ? 'Organization hierarchy enabled. You can now define nested departments.'
          : 'Organization hierarchy disabled. Workspace returned to flat tenant mode.',
      );
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating hierarchy settings');
    }
  };

  const openCreateModal = (defaultParentId = '') => {
    setEditingDepartment(null);
    setModalParentId(defaultParentId);
    setModalName('');
    setModalCode('');
    setModalManagerId('');
    setModalSpendingLimit('');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDepartment(dept);
    setModalParentId(dept.parentId ?? '');
    setModalName(dept.name);
    setModalCode(dept.code);
    setModalManagerId(dept.managerId ?? '');
    setModalSpendingLimit(dept.spendingLimit ? String(dept.spendingLimit) : '');
    setIsCreateModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    setError(null);
    setSuccess(null);

    const payload: any = {
      name: modalName.trim(),
      code: modalCode.trim().toUpperCase(),
      parentId: modalParentId ? modalParentId : null,
      managerId: modalManagerId ? modalManagerId : null,
      spendingLimit: modalSpendingLimit ? Number(modalSpendingLimit) : null,
    };

    try {
      const url = editingDepartment
        ? `/api/control/tenants/current/departments/${editingDepartment.id}`
        : '/api/control/tenants/current/departments';
      const method = editingDepartment ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to save department');
      }

      setIsCreateModalOpen(false);
      setSuccess(editingDepartment ? 'Department updated successfully.' : 'Department created successfully.');
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving department');
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    if (dept._count && dept._count.children > 0) {
      setError(`Cannot delete '${dept.name}': it has ${dept._count.children} child department(s).`);
      return;
    }
    if (dept._count && dept._count.members > 0) {
      setError(`Cannot delete '${dept.name}': it has ${dept._count.members} assigned member(s).`);
      return;
    }

    if (!confirm(`Are you sure you want to delete department '${dept.name}' (${dept.code})?`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/control/tenants/current/departments/${dept.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to delete department');
      }
      setSuccess(`Department '${dept.name}' deleted.`);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting department');
    }
  };

  const openAssignModal = (member: Member) => {
    setAssigningMember(member);
    setAssignDeptId(member.departmentId ?? '');
    setAssignEmploymentType(member.employmentType ?? 'FULL_TIME');
    setAssignReason('Department realignment');
  };

  const handleSaveMemberAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningMember) return;
    setSavingMember(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/control/tenants/current/members/${assigningMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: assigningMember.updatedAt,
          departmentId: assignDeptId ? assignDeptId : null,
          employmentType: assignEmploymentType ? assignEmploymentType : null,
          reason: assignReason.trim() || 'Department assignment updated',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update member assignment');
      }

      setAssigningMember(null);
      setSuccess(`Updated department assignment for ${assigningMember.user.name}.`);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating member assignment');
    } finally {
      setSavingMember(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-ui-fg-muted font-mono text-sm animate-pulse">
        Loading organization hierarchy & departments...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between">
          <span>✓ {success}</span>
          <button type="button" onClick={() => setSuccess(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Opt-In Hierarchy Banner & Switch */}
      <div className="p-5 bg-ui-bg-base border border-ui-border-base rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ui-fg-base">Organization Hierarchy Mode</h3>
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                hierarchyEnabled
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}
            >
              {hierarchyEnabled ? 'OPT-IN HIERARCHY ACTIVE' : 'FLAT TENANT DEFAULT'}
            </span>
          </div>
          <p className="text-xs text-ui-fg-subtle mt-1 max-w-2xl">
            {hierarchyEnabled
              ? 'Multi-tiered departmental structures, divisional managers, spending limits, and department-scoped access boundaries are active.'
              : 'By default, this workspace operates in flat tenant mode. All members belong directly to the workspace without divisional boundaries. Enable hierarchy to organize teams into departments.'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => handleToggleHierarchy(!hierarchyEnabled)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition whitespace-nowrap ${
              hierarchyEnabled
                ? 'bg-zinc-100 text-zinc-800 border border-zinc-300 hover:bg-zinc-200'
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            {hierarchyEnabled ? 'Disable Hierarchy (Revert to Flat)' : 'Enable Organization Hierarchy'}
          </button>
        )}
      </div>

      {hierarchyEnabled && (
        <>
          {/* Department Statistics Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
              <span className="text-[11px] font-medium text-ui-fg-muted uppercase tracking-wider block">
                Total Departments
              </span>
              <span className="text-2xl font-bold text-ui-fg-base mt-1 block">
                {departments.length}
              </span>
            </div>
            <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
              <span className="text-[11px] font-medium text-ui-fg-muted uppercase tracking-wider block">
                Root Divisions
              </span>
              <span className="text-2xl font-bold text-ui-fg-base mt-1 block">
                {departments.filter((d) => !d.parentId).length}
              </span>
            </div>
            <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
              <span className="text-[11px] font-medium text-ui-fg-muted uppercase tracking-wider block">
                Assigned Workforce
              </span>
              <span className="text-2xl font-bold text-ui-fg-base mt-1 block">
                {members.filter((m) => Boolean(m.departmentId)).length} / {members.length}
              </span>
            </div>
            <div className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
              <span className="text-[11px] font-medium text-ui-fg-muted uppercase tracking-wider block">
                Total Budget Caps
              </span>
              <span className="text-2xl font-bold text-emerald-600 mt-1 block">
                $
                {departments
                  .reduce((acc, d) => acc + (d.spendingLimit ? Number(d.spendingLimit) : 0), 0)
                  .toLocaleString()}
              </span>
            </div>
          </div>

          {/* Department Tree & Table View */}
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden">
            <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-ui-fg-base">Department Hierarchy</h4>
                <p className="text-xs text-ui-fg-subtle">
                  Define business units, operational branches, and departmental managers.
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="px-3 py-1.5 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                >
                  + Add Department
                </button>
              )}
            </div>

            {departments.length === 0 ? (
              <div className="p-8 text-center text-ui-fg-muted text-xs">
                No departments defined yet. Click "+ Add Department" to create your first organizational unit.
              </div>
            ) : (
              <div className="divide-y divide-ui-border-base">
                {departments.map((dept) => {
                  const parentDept = departments.find((d) => d.id === dept.parentId);
                  return (
                    <div
                      key={dept.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-ui-bg-subtle transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ui-fg-base">{dept.name}</span>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {dept.code}
                          </span>
                          {dept.spendingLimit && (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Limit: ${Number(dept.spendingLimit).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ui-fg-muted flex items-center gap-3">
                          {parentDept ? (
                            <span>
                              Parent: <strong className="text-ui-fg-base">{parentDept.name}</strong>
                            </span>
                          ) : (
                            <span className="text-blue-600 font-medium">★ Top-Level Division</span>
                          )}
                          {dept.manager && (
                            <span>
                              Manager: <strong className="text-ui-fg-base">{dept.manager.name}</strong>
                            </span>
                          )}
                          <span>
                            Workforce:{' '}
                            <strong className="text-ui-fg-base">
                              {dept._count?.members ?? 0} members
                            </strong>
                          </span>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openCreateModal(dept.id)}
                            className="text-xs px-2.5 py-1 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded cursor-pointer"
                          >
                            + Subdepartment
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(dept)}
                            className="text-xs px-2.5 py-1 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDepartment(dept)}
                            className="text-xs px-2.5 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Workforce Member Assignment Table */}
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl overflow-hidden">
            <div className="p-4 border-b border-ui-border-base">
              <h4 className="text-sm font-bold text-ui-fg-base">Workforce Department Assignments</h4>
              <p className="text-xs text-ui-fg-subtle">
                Assign team members to departments and configure cross-industry employment classifications.
              </p>
            </div>

            <div className="divide-y divide-ui-border-base">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-ui-bg-subtle transition"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ui-fg-base">
                        {member.user.name}
                      </span>
                      <span className="text-[11px] text-ui-fg-muted font-mono">
                        {member.user.email}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
                        {member.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ui-fg-subtle">
                      <span>
                        Department:{' '}
                        {member.department ? (
                          <strong className="text-ui-fg-base font-medium">
                            {member.department.name} ({member.department.code})
                          </strong>
                        ) : (
                          <span className="italic text-zinc-400">Unassigned (Flat Tenant)</span>
                        )}
                      </span>
                      <span>
                        Type:{' '}
                        <strong className="text-ui-fg-base font-medium">
                          {member.employmentType || 'FULL_TIME'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openAssignModal(member)}
                      className="text-xs px-3 py-1 font-medium bg-ui-bg-subtle hover:bg-zinc-200 border border-ui-border-base rounded-lg transition cursor-pointer self-start sm:self-auto"
                    >
                      Assign Dept & Type
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Department Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <form onSubmit={handleSaveDepartment}>
              <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
                <h3 className="text-sm font-bold text-ui-fg-base">
                  {editingDepartment ? `Edit Department: ${editingDepartment.name}` : 'Create New Department'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-ui-fg-muted hover:text-ui-fg-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    placeholder="e.g. Operations & Field Support"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Department Code * (Unique, Alphanumeric)
                  </label>
                  <input
                    type="text"
                    required
                    value={modalCode}
                    onChange={(e) => setModalCode(e.target.value.toUpperCase())}
                    placeholder="e.g. OPS-FIELD"
                    className="w-full text-xs font-mono uppercase px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Parent Department (Optional)
                  </label>
                  <select
                    value={modalParentId}
                    onChange={(e) => setModalParentId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="">None (Top-Level Division)</option>
                    {departments
                      .filter((d) => !editingDepartment || d.id !== editingDepartment.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Department Manager (Optional)
                  </label>
                  <select
                    value={modalManagerId}
                    onChange={(e) => setModalManagerId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="">No manager assigned</option>
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name} ({m.user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Spending Cap / Budget ($ USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={modalSpendingLimit}
                    onChange={(e) => setModalSpendingLimit(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-ui-border-base bg-ui-bg-subtle flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="px-4 py-1.5 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50"
                >
                  {savingDept ? 'Saving...' : editingDepartment ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Assignment Modal */}
      {assigningMember && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <form onSubmit={handleSaveMemberAssignment}>
              <div className="p-4 border-b border-ui-border-base flex items-center justify-between">
                <h3 className="text-sm font-bold text-ui-fg-base">
                  Assign Department & Employment Type
                </h3>
                <button
                  type="button"
                  onClick={() => setAssigningMember(null)}
                  className="text-ui-fg-muted hover:text-ui-fg-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-3.5">
                <div>
                  <span className="text-xs text-ui-fg-muted block">Member</span>
                  <span className="text-sm font-semibold text-ui-fg-base block mt-0.5">
                    {assigningMember.user.name} ({assigningMember.user.email})
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Assigned Department
                  </label>
                  <select
                    value={assignDeptId}
                    onChange={(e) => setAssignDeptId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="">Unassigned (Flat Workspace)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Employment Classification
                  </label>
                  <select
                    value={assignEmploymentType}
                    onChange={(e) => setAssignEmploymentType(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="FULL_TIME">Full-Time Employee</option>
                    <option value="PART_TIME">Part-Time Employee</option>
                    <option value="CONTRACTOR">Contractor / Agency Worker</option>
                    <option value="TEMPORARY">Temporary / Fixed Term</option>
                    <option value="SEASONAL">Seasonal Worker</option>
                    <option value="INTERN">Intern / Trainee</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ui-fg-base mb-1">
                    Audit Reason *
                  </label>
                  <input
                    type="text"
                    required
                    value={assignReason}
                    onChange={(e) => setAssignReason(e.target.value)}
                    placeholder="e.g. Department realignment"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle text-ui-fg-base focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-ui-border-base bg-ui-bg-subtle flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningMember(null)}
                  className="px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-4 py-1.5 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50"
                >
                  {savingMember ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
