'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { VerifiedSession } from '@/lib/verified-session';
import { TenantAccessManager } from './TenantAccessManager';
import { TenantPlanEntitlements } from './TenantPlanEntitlements';
import { TenantLocalizationSettings } from './TenantLocalizationSettings';
import { ConfiguredTenantFields } from './ConfiguredTenantFields';
import { TenantOrganizationHierarchyManager } from './TenantOrganizationHierarchyManager';
import { TenantSpatialScopeManager } from './TenantSpatialScopeManager';
import { hasPermission } from '@/lib/module-access';

interface TenantSettingsViewProps {
  session: VerifiedSession;
  tenantId: string;
  canUpdateConfiguredValues: boolean;
}

type SettingsTab = 'team' | 'hierarchy' | 'plan' | 'general' | 'security';

export function TenantSettingsView({
  session,
  tenantId,
  canUpdateConfiguredValues,
}: TenantSettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const geospatialEntitled = !!session.tenant?.entitlements.some(
    (entitlement) => entitlement.moduleKey === 'geospatial-studio' && entitlement.status === 'ENABLED',
  );
  const initialTab = (searchParams.get('tab') as SettingsTab) || 'team';
  const validTabs: SettingsTab[] = ['team', 'hierarchy', 'plan', 'general', 'security'];
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    validTabs.includes(initialTab) ? initialTab : 'team'
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTab;
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`, { scroll: false });
  };
  const hasPlatformAuthority = session.platformRoles.length > 0;
  const tenantName = session.tenant?.name ?? 'Current workspace';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Settings Cross-Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ui-border-base pb-3 text-xs font-semibold">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-lg bg-ui-bg-subtle px-3 py-1.5 text-ui-fg-base border border-ui-border-base font-bold"
        >
          🏢 Workspace Settings
        </Link>
        <Link
          href="/settings/profile"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base transition"
        >
          👤 My Profile & Security
        </Link>
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Tenant: {tenantName}
        </span>
        {hasPlatformAuthority && (
          <Link
            href="/platform-admin"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition ml-auto"
          >
            ★ Platform Control Tower →
          </Link>
        )}
      </div>

      {/* Primary Section Tabs */}
      <div className="border-b border-ui-border-base flex flex-wrap gap-4 text-sm font-medium">
        <button
          type="button"
          onClick={() => handleTabChange('team')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'team'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <span>👥</span> Team & Access
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('hierarchy')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'hierarchy'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <span>🏢</span> Organization & Hierarchy
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('plan')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'plan'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <span>💳</span> Plan & Entitlements
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('general')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'general'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <span>⚙️</span> General & Localization
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('security')}
          className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'security'
              ? 'border-b-2 border-ui-fg-base text-ui-fg-base font-semibold'
              : 'text-ui-fg-muted hover:text-ui-fg-base'
          }`}
        >
          <span>🔐</span> Security & SSO
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'team' && (
          <TenantAccessManager
            currentUserId={session.user.id}
            permissions={session.permissions}
            roles={session.roles}
            tenantName={tenantName}
            displaySection="team"
          />
        )}

        {activeTab === 'hierarchy' && (
          <div className="space-y-6">
            <TenantOrganizationHierarchyManager
              tenantId={tenantId}
              canManage={canUpdateConfiguredValues}
            />
            {geospatialEntitled ? (
              <TenantSpatialScopeManager
                canToggle={hasPermission(session.permissions, 'tenant:update')}
                canAssign={hasPermission(session.permissions, 'users:update')}
              />
            ) : null}
          </div>
        )}

        {activeTab === 'plan' && (
          <TenantPlanEntitlements session={session} />
        )}

        {activeTab === 'general' && (
          <div className="space-y-6">
            <TenantLocalizationSettings tenantId={tenantId} canUpdate={canUpdateConfiguredValues} />
            {tenantId ? (
              <ConfiguredTenantFields tenantId={tenantId} canUpdate={canUpdateConfiguredValues} />
            ) : null}
          </div>
        )}

        {activeTab === 'security' && (
          <TenantAccessManager
            currentUserId={session.user.id}
            permissions={session.permissions}
            roles={session.roles}
            tenantName={tenantName}
            displaySection="security"
          />
        )}
      </div>
    </div>
  );
}
