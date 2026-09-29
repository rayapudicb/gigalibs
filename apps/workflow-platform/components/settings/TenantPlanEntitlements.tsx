'use client';

import React from 'react';
import Link from 'next/link';
import type { VerifiedSession } from '@/lib/verified-session';
import { canUseTenantModule } from '@/lib/module-access';
import { platformModuleCatalog } from '@gigalibs/contracts';
import { MaturityBadge } from '@/components/modules/MaturityBadge';

interface TenantPlanEntitlementsProps {
  session: VerifiedSession;
  planName?: string | null;
  isolationMode?: string | null;
  region?: string | null;
}

export function TenantPlanEntitlements({
  session,
  planName = null,
  isolationMode = null,
  region = null,
}: TenantPlanEntitlementsProps) {
  const trialEndsAt = session.tenant?.trialEndsAt;
  const isTrial = !!trialEndsAt;
  const daysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const isExpired = daysRemaining !== null && daysRemaining <= 0;
  const enabledModuleKeys = new Set(session.tenant?.features ?? []);
  const entitledModules = platformModuleCatalog.filter(
    (module) => module.entitlementEligible && enabledModuleKeys.has(module.key),
  );
  const marketplaceAvailable = canUseTenantModule(
    'module-marketplace',
    enabledModuleKeys,
    session.permissions,
  );
  const contractStatus = isExpired
    ? 'TRIAL EXPIRED'
    : isTrial
      ? 'ACTIVE TRIAL'
      : planName
        ? 'ACTIVE CONTRACT'
        : 'PLAN DATA UNAVAILABLE';

  return (
    <div className="space-y-6">
      {/* Hero Plan Overview */}
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold text-ui-fg-base">
                {planName ?? 'Plan not configured'}
              </h3>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isExpired
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : isTrial
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : planName
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {contractStatus}
              </span>
            </div>
            <p className="text-xs text-ui-fg-subtle mt-1 font-mono">
              Tenant Workspace: <strong>{session.tenant?.name ?? 'No active workspace'}</strong> ({session.tenant?.slug ?? 'not-selected'}) · ID: <code className="text-[11px] font-mono">{session.tenant?.id ?? 'unavailable'}</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={marketplaceAvailable ? '/marketplace' : '/modules'}
              className="px-4 py-2 rounded-lg bg-ui-fg-base text-ui-bg-base text-xs font-semibold hover:bg-ui-fg-subtle transition shadow-sm"
            >
              {marketplaceAvailable ? 'Open Module Marketplace →' : 'Review Module Catalogue →'}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ui-fg-muted">Trial / Contract Expiration</p>
            <p className="mt-1 text-sm font-bold text-ui-fg-base">
              {trialEndsAt ? new Date(trialEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not provided'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ui-fg-muted">Days Remaining</p>
            <p className="mt-1 text-sm font-bold text-blue-600">
              {daysRemaining !== null ? (daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Grace period expired') : 'Not provided'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ui-fg-muted">Database Isolation Tier</p>
            <p className="mt-1 text-sm font-mono font-semibold text-ui-fg-base">
              {isolationMode ?? 'Not configured'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ui-fg-muted">Cloud Region</p>
            <p className="mt-1 text-sm font-mono font-semibold text-ui-fg-base">
              {region ?? 'Not configured'}
            </p>
          </div>
        </div>
      </div>

      {/* Active Enterprise Capabilities Matrix */}
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-elevation-card-rest space-y-4">
        <div>
          <h4 className="text-base font-semibold text-ui-fg-base">
            Tenant Module Entitlements ({entitledModules.length})
          </h4>
          <p className="text-xs text-ui-fg-muted mt-0.5">
            Module access is derived from the canonical catalogue, persisted tenant entitlements and the current user permissions.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platformModuleCatalog.filter((module) => module.entitlementEligible).map((module) => {
            const isEntitled = enabledModuleKeys.has(module.key);
            const canOpen = canUseTenantModule(
              module.key,
              enabledModuleKeys,
              session.permissions,
            );
            return (
              <div
                key={module.key}
                className={`p-4 rounded-xl border transition-all ${
                  isEntitled
                    ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                    : 'border-ui-border-base bg-ui-bg-subtle opacity-60'
                } space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ui-fg-base">{module.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isEntitled ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {isEntitled ? (canOpen ? 'ENTITLED' : 'NO ACCESS') : 'NOT ENTITLED'}
                  </span>
                </div>
                <MaturityBadge maturity={module.maturity} />
                <p className="text-[11px] text-ui-fg-subtle">{module.reason}</p>
                {canOpen && (
                  <div className="pt-1">
                    <Link
                      href={module.route}
                      className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1"
                    >
                      Open Module →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
