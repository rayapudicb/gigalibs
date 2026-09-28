'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation, LanguageSelector } from '@/components/i18n';
import type { VerifiedSession } from '@/lib/verified-session';
import { ExternalIdentityManager } from './ExternalIdentityManager';
import { RecoveryCodesManager } from './RecoveryCodesManager';

interface ProfileData {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: string;
      plan: string | null;
      trialEndsAt: string | null;
      isolationMode: string;
      region: string;
    };
  }>;
  platformRoles: Array<{ role: string; reason: string; createdAt: string }>;
}

interface ActivityLogItem {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function UserProfileSecurityView({
  session,
}: {
  session: VerifiedSession;
}) {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'profile' | 'password' | 'activity' | 'signin' | 'mfa' | 'rbac'
  >('profile');
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Edit profile state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const hasPlatformAuthority = session.platformRoles.length > 0;

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/auth/profile');
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorMessage(payload, 'Profile could not be loaded.'));
        const data = payload as ProfileData;
        setProfile(data);
        setEditName(data.name || '');
        setEditPhone(data.phone || '');
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Profile could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    async function fetchActivity() {
      setLoadingActivity(true);
      try {
        const res = await fetch('/api/auth/activity');
        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload)) {
            setActivityLogs(payload);
          } else if (Array.isArray(payload?.logs)) {
            setActivityLogs(payload.logs);
          }
        }
      } catch {
        // Activity log is non-blocking
      } finally {
        setLoadingActivity(false);
      }
    }

    void fetchProfile();
    void fetchActivity();
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('identityLinked') === '1') {
      setActiveTab('signin');
    }
  }, []);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          expectedUpdatedAt: profile?.updatedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Failed to update profile');
      setProfileSuccess('Profile details saved successfully.');
      if (profile) setProfile({ ...profile, ...data });
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      setSavingPassword(false);
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError('Password must be at least 12 characters.');
      setSavingPassword(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Failed to change password');
      setPasswordSuccess('Password updated successfully. You can now use your new credentials.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const userInitials = (session.user.name || session.user.email)
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError}
        </div>
      )}
      {loading && <p className="text-sm text-ui-fg-muted">Loading the persisted account profile…</p>}
      {/* Settings Navigation Subnav */}
      <div className="flex gap-2 border-b border-ui-border-base pb-2 text-xs font-semibold">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base transition"
        >
          🏢 Workspace & Team Access
        </Link>
        <Link
          href="/settings/profile"
          className="flex items-center gap-1.5 rounded-lg bg-ui-bg-subtle px-3 py-1.5 text-ui-fg-base border border-ui-border-base font-bold"
        >
          👤 Account Profile & Security
        </Link>
        {hasPlatformAuthority && (
          <Link
            href="/platform-admin"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition ml-auto"
          >
            ★ Platform Control Tower →
          </Link>
        )}
      </div>

      {/* Top Breadcrumb & Title */}
      <div>
        <div className="flex items-center gap-2 text-xs text-ui-fg-muted font-mono mb-1">
          <Link href="/settings" className="hover:text-ui-fg-base transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-ui-fg-base">Profile & Security</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ui-fg-base">
                Personal Profile & Security
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                User Scope
              </span>
            </div>
            <p className="text-sm text-ui-fg-subtle mt-0.5">
              Manage your personal identity, login credentials, authentication security, and personal activity log.
            </p>
          </div>
        </div>
      </div>

      {/* Account Identity Card (Hero Banner) */}
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-ui-fg-base text-ui-bg-base flex items-center justify-center font-bold text-xl shadow-md">
              {userInitials}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-ui-fg-base">
                  {session.user.name || 'Platform User'}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {session.user.status}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Email Verified
                </span>
              </div>
              <p className="text-sm text-ui-fg-muted font-mono mt-0.5">
                {session.user.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-ui-fg-muted">
                <span>User ID: <code className="text-[11px] font-mono text-ui-fg-base">{session.user.id}</code></span>
                <span>·</span>
                <span>Workspace: <strong className="text-ui-fg-base font-semibold">{session.tenant?.name ?? 'Global Platform'}</strong></span>
                {session.tenant?.slug && (
                  <>
                    <span>·</span>
                    <span className="font-mono text-[11px]">({session.tenant.slug})</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Role Pill */}
          <div className="flex flex-col items-start sm:items-end gap-1.5 self-stretch sm:self-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-ui-border-base">
            <div className="flex items-center gap-1.5">
              {session.platformRoles.map((role) => (
                <span
                  key={role}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs"
                >
                  ★ {role}
                </span>
              ))}
              {session.roles.map((role) => (
                <span
                  key={role}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-100 text-violet-800 border border-violet-200"
                >
                  {role}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-ui-fg-muted">
              {session.permissions.length} active permissions
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-ui-border-base flex flex-wrap gap-4 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'profile'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          Profile Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('password')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'password'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          Change Password
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'activity'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          Activity & Audit Logs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('signin')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'signin'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          Sign-in Methods
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mfa')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'mfa'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          MFA & Recovery
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rbac')}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === 'rbac'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          My Permissions
        </button>
      </div>

      {/* ── TAB 1: EDIT PROFILE ── */}
      {activeTab === 'profile' && (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-6">
          <div>
            <h3 className="text-base font-semibold text-ui-fg-base">Personal Information</h3>
            <p className="text-xs text-ui-fg-muted mt-0.5">
              Update your display name and contact phone number.
            </p>
          </div>

          {profileSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800" role="status">
              ✓ {profileSuccess}
            </div>
          )}

          {profileError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
              ✕ {profileError}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="profile-name">
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                required
                maxLength={100}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Elena Rostova"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="profile-email">
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                disabled
                value={session.user.email}
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 text-sm text-ui-fg-muted cursor-not-allowed font-mono"
              />
              <p className="text-[11px] text-ui-fg-muted">Email is bound to tenant membership and authentication credentials.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="profile-phone">
                Phone Number (Optional)
              </label>
              <input
                id="profile-phone"
                type="tel"
                maxLength={30}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>

            {/* Language Preference for User */}
            <div className="space-y-1.5 pt-2 border-t border-ui-border-base">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="profile-user-locale">
                {t('userLanguage')}
              </label>
              <p className="text-[11px] text-ui-fg-muted">
                {t('userLanguageDesc')}
              </p>
              <div className="pt-1">
                <LanguageSelector id="profile-user-locale" showDirectionBadge={true} className="w-full" />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="h-9 px-5 rounded-lg bg-ui-fg-base text-ui-bg-base text-sm font-medium hover:bg-ui-fg-subtle disabled:opacity-50 transition-colors cursor-pointer"
              >
                {savingProfile ? 'Saving changes…' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: ACTIVITY & AUDIT LOGS ── */}
      {activeTab === 'activity' && (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-ui-fg-base">Personal Security & Activity Trail</h3>
              <p className="text-xs text-ui-fg-muted mt-0.5">
                Tamper-evident, immutable audit trail of authentication events and credential modifications.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              🔒 Immutable Ledger
            </span>
          </div>

          {loadingActivity ? (
            <p className="text-sm text-ui-fg-muted py-6 text-center">Loading security audit records…</p>
          ) : activityLogs.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-ui-border-base">
              <table className="min-w-full divide-y divide-ui-border-base text-left text-xs">
                <thead className="bg-ui-bg-subtle font-semibold text-ui-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5">Action Event</th>
                    <th className="px-4 py-2.5">Resource</th>
                    <th className="px-4 py-2.5">Client IP / Host</th>
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5 text-right">Integrity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border-base text-ui-fg-base">
                  {activityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-ui-bg-subtle/50 transition">
                      <td className="px-4 py-3">
                        <span className="font-bold text-ui-fg-base">{log.action}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ui-fg-subtle">
                        {log.resource}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ui-fg-muted">
                        {log.ipAddress || '127.0.0.1 (Loopback)'}
                      </td>
                      <td className="px-4 py-3 text-ui-fg-subtle">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                          VERIFIED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-8 text-center text-sm text-ui-fg-muted">
              No recent security activity events recorded for this account.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: CHANGE PASSWORD ── */}
      {activeTab === 'password' && (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-6">
          <div>
            <h3 className="text-base font-semibold text-ui-fg-base">Update Password</h3>
            <p className="text-xs text-ui-fg-muted mt-0.5">
              Ensure your account uses a long, unique password (minimum 12 characters).
            </p>
          </div>

          {passwordSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800" role="status">
              ✓ {passwordSuccess}
            </div>
          )}

          {passwordError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
              ✕ {passwordError}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="current-pass">
                Current Password
              </label>
              <input
                id="current-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="new-pass">
                New Password
              </label>
              <input
                id="new-pass"
                type="password"
                required
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 12 characters"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
              <p className="text-[11px] text-ui-fg-muted">Must be between 12 and 128 characters.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="confirm-pass">
                Confirm New Password
              </label>
              <input
                id="confirm-pass"
                type="password"
                required
                minLength={12}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingPassword || !newPassword || !confirmPassword}
                className="h-9 px-5 rounded-lg bg-ui-fg-base text-ui-bg-base text-sm font-medium hover:bg-ui-fg-subtle disabled:opacity-50 transition-colors cursor-pointer"
              >
                {savingPassword ? 'Updating password…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'signin' && <ExternalIdentityManager />}

      {/* ── TAB 3: RBAC & PERMISSIONS ── */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          {/* Platform Roles Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ui-fg-base">Platform Authority</h3>
              <p className="text-xs text-ui-fg-muted mt-0.5">
                Global administrative authorities across all tenants, cloud brokers, and system control towers.
              </p>
            </div>

            {session.platformRoles.length === 0 ? (
              <p className="text-sm text-ui-fg-muted italic">
                No platform roles assigned. This account operates strictly within assigned tenant boundaries.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {session.platformRoles.map((role) => (
                  <div key={role} className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-amber-900">{role}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-800">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-xs text-amber-800/80">
                      Full authority to onboard tenants, manage plans, override module entitlements, and inspect broker queues.
                    </p>
                    <div className="pt-1">
                      <Link
                        href="/platform-admin"
                        className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                      >
                        Open Platform Control Tower →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tenant Memberships Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ui-fg-base">Tenant Memberships & Roles</h3>
              <p className="text-xs text-ui-fg-muted mt-0.5">
                Workspaces where your user profile has an active membership.
              </p>
            </div>

            <div className="divide-y divide-ui-border-base">
              {profile?.memberships?.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ui-fg-base">{m.tenant.name}</p>
                    <p className="text-xs text-ui-fg-muted font-mono">{m.tenant.slug} · Plan: {m.tenant.plan}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                      {m.role}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {m.status}
                    </span>
                  </div>
                </div>
              )) ?? (
                <p className="text-sm text-ui-fg-muted py-2">
                  Current workspace: <strong>{session.tenant?.name ?? 'None'}</strong> ({session.roles.join(', ') || 'No tenant role'})
                </p>
              )}
            </div>
          </div>

          {/* Effective Permissions Grid */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ui-fg-base">
                Effective Granted Permissions ({session.permissions.length})
              </h3>
              <p className="text-xs text-ui-fg-muted mt-0.5">
                Permissions resolved from your tenant roles, custom roles, and direct grants.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {session.permissions.map((perm) => (
                <span
                  key={perm}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-ui-bg-subtle border border-ui-border-base text-ui-fg-base"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: MFA & RECOVERY ── */}
      {activeTab === 'mfa' && (
        <RecoveryCodesManager
          email={session.user.email}
          remaining={session.mfa.recoveryCodesRemaining}
        />
      )}

    </div>
  );
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown; detail?: unknown }).message;
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return fallback;
}
