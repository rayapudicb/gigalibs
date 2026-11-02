'use client';

import React from 'react';
import { EmptyState, ModulePage } from '@gigalibs/web-sdk';
import type { VerifiedSession } from '@/lib/verified-session';
import { TenantAccessManager } from './TenantAccessManager';
import { PeopleAdministration } from './PeopleAdministration';
import { TenantPlanEntitlements } from './TenantPlanEntitlements';
import { TenantLocalizationSettings } from './TenantLocalizationSettings';
import { ConfiguredTenantFields } from './ConfiguredTenantFields';
import { TenantOrganizationHierarchyManager } from './TenantOrganizationHierarchyManager';
import { OrganizationAdministration } from '@/components/organization/OrganizationAdministration';
import { TenantSpatialScopeManager } from './TenantSpatialScopeManager';
import { hasPermission } from '@/lib/module-access';

/** The Settings screens; each is its own route in the Settings sidebar (WI-OI-145). */
export type SettingsSection = 'team' | 'people' | 'organization' | 'plan' | 'general' | 'security';

export const SETTINGS_SECTIONS: Readonly<Record<SettingsSection, { readonly title: string; readonly description: string }>> = {
  team: { title: 'Team & access', description: 'Invite members, give them roles and create custom roles for your workspace.' },
  people: { title: 'People', description: 'Invitations and off-boarding for the units you administer.' },
  organization: {
    title: 'Organization & hierarchy',
    description: 'Your units, sites and who belongs where; access follows this structure.',
  },
  plan: { title: 'Plan & entitlements', description: 'The modules your workspace has and what each allows.' },
  general: { title: 'General & localization', description: 'Language, time zone, formats and your workspace fields.' },
  security: { title: 'Security & SSO', description: 'Sign-in rules, single sign-on and sessions.' },
};

interface TenantSettingsViewProps {
  session: VerifiedSession;
  tenantId: string;
  canUpdateConfiguredValues: boolean;
  /** The server's UAT preview setting; a client component cannot read it from process.env. */
  uatPreview?: boolean;
  /** The screen this route shows (WI-OI-145: routes replace the former ?tab= tabs). */
  section: SettingsSection;
}

export function TenantSettingsView({
  session,
  tenantId,
  canUpdateConfiguredValues,
  uatPreview = false,
  section,
}: TenantSettingsViewProps) {
  const activeTab = section;
  const geospatialEntitled = !!session.tenant?.entitlements.some(
    (entitlement) => entitlement.moduleKey === 'geospatial-studio' && entitlement.status === 'ENABLED',
  );
  // WI-OI-120x: a workspace administrator may change their own access; anyone else asks one.
  const isWorkspaceAdministrator = session.roles.some((role) => role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN');
  const tenantName = session.tenant?.name ?? 'Current workspace';
  // WI-OI-120p (S17): People is for delegated people administration — a head who can manage or read invites into their
  // units, or an administrator who can off-board. Tenant Admins reach the same endpoints through their wildcard
  // permissions, so it also opens for them.
  const canSeePeople =
    hasPermission(session.permissions, 'people:manage') ||
    hasPermission(session.permissions, 'people:read') ||
    hasPermission(session.permissions, 'users:update');
  const { title, description } = SETTINGS_SECTIONS[section];

  return (
    <ModulePage title={title} description={description}>
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

        {activeTab === 'people' ? (
          canSeePeople ? (
            <PeopleAdministration permissions={session.permissions} />
          ) : (
            <EmptyState
              title="People is not open to you"
              description="Ask your workspace administrator for people administration in your units."
            />
          )
        ) : null}

        {activeTab === 'organization' && (
          <div className="space-y-6">
            <OrganizationAdministration grantedPermissions={session.permissions} userId={session.user.id} isAdministrator={isWorkspaceAdministrator} />
            {/* WI-OI-109d: departments stay reachable until the 109e bridge turns them into units and grants;
                member department and employment-type assignment still lives here. */}
            <details className="rounded-lg border border-ui-border-base bg-ui-bg-base">
              <summary className="cursor-pointer px-4 py-3 text-sm text-ui-fg-subtle">
                Departments (legacy, replaced by the organization above)
              </summary>
              <div className="p-4">
                <TenantOrganizationHierarchyManager
                  tenantId={tenantId}
                  canManage={canUpdateConfiguredValues}
                  currentUserId={session.user.id}
                  isAdministrator={isWorkspaceAdministrator}
                />
              </div>
            </details>
            {geospatialEntitled ? (
              <TenantSpatialScopeManager
                canToggle={hasPermission(session.permissions, 'tenant:update')}
                canAssign={hasPermission(session.permissions, 'users:update')}
                currentUserId={session.user.id}
                isAdministrator={isWorkspaceAdministrator}
              />
            ) : null}
          </div>
        )}

        {activeTab === 'plan' && (
          <TenantPlanEntitlements session={session} uatPreview={uatPreview} />
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
    </ModulePage>
  );
}
