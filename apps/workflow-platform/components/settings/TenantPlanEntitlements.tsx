'use client';

import React from 'react';
import Link from 'next/link';
import type { VerifiedSession } from '@/lib/verified-session';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { platformModuleCatalog } from '@gigalibs/contracts';
import { MaturityBadge } from '@/components/modules/MaturityBadge';

const TRIAL_DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const MODULE_REQUESTS_URL = '/api/control/tenants/current/module-requests';

/** WI-OI-147 (QA-035): a module this workspace asked a platform operator to turn on. */
interface ModuleRequest {
  readonly moduleKey: string;
  readonly requestedAt: string;
  readonly requestedBy: string | null;
}

async function readRequests(response: Response): Promise<ModuleRequest[]> {
  const text = await response.text();
  if (!response.ok) {
    const message = (() => {
      try {
        return (JSON.parse(text) as { message?: unknown }).message;
      } catch {
        return undefined;
      }
    })();
    throw new Error(typeof message === 'string' ? message : 'The request could not be sent. Try again.');
  }
  const value: unknown = text ? JSON.parse(text) : [];
  return Array.isArray(value) ? (value as ModuleRequest[]) : [];
}

interface TenantPlanEntitlementsProps {
  session: VerifiedSession;
  planName?: string | null;
  isolationMode?: string | null;
  region?: string | null;
  /** The server's UAT preview setting; without it every PLANNED module read NO ACCESS here while the sidebar opened it. */
  uatPreview?: boolean;
}

export function TenantPlanEntitlements({
  session,
  planName = null,
  isolationMode = null,
  region = null,
  uatPreview = false,
}: TenantPlanEntitlementsProps) {
  const trialEndsAt = session.tenant?.trialEndsAt;
  const isTrial = !!trialEndsAt;
  const daysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const isExpired = daysRemaining !== null && daysRemaining <= 0;
  const enabledModuleKeys = new Set(session.tenant?.features ?? []);
  const canRequest = hasPermission(session.permissions, 'tenant:update');
  const [requests, setRequests] = React.useState<ModuleRequest[]>([]);
  const [requesting, setRequesting] = React.useState<string | null>(null);
  const [requestError, setRequestError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!hasPermission(session.permissions, 'tenant:read')) return;
    let cancelled = false;
    void fetch(MODULE_REQUESTS_URL, { cache: 'no-store' })
      .then(readRequests)
      .then((value) => {
        if (!cancelled) setRequests(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.permissions]);
  const requestModule = async (moduleKey: string) => {
    setRequesting(moduleKey);
    setRequestError(null);
    try {
      const response = await fetch(MODULE_REQUESTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey }),
      });
      setRequests(await readRequests(response));
    } catch (failure) {
      setRequestError(failure instanceof Error ? failure.message : 'The request could not be sent. Try again.');
    } finally {
      setRequesting(null);
    }
  };
  const entitledModules = platformModuleCatalog.filter(
    (module) => module.entitlementEligible && enabledModuleKeys.has(module.key),
  );
  const marketplaceAvailable = canUseTenantModule(
    'module-marketplace',
    enabledModuleKeys,
    session.permissions,
    { uatPreview },
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
              {/* WI-OI-120k (QF1): a fixed locale and time zone; the server's default ("Dec 16, 2026") differed from an
                  Indian browser's ("16 Dec 2026") and React refused the page (error #418). */}
              {trialEndsAt ? TRIAL_DATE.format(new Date(trialEndsAt)) : 'Not provided'}
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

        {requestError ? (
          <p role="alert" className="text-xs text-ui-fg-error">
            {requestError}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platformModuleCatalog.filter((module) => module.entitlementEligible).map((module) => {
            const isEntitled = enabledModuleKeys.has(module.key);
            const canOpen = canUseTenantModule(
              module.key,
              enabledModuleKeys,
              session.permissions,
              { uatPreview },
            );
            return (
              <div
                key={module.key}
                className={`p-4 rounded-xl border transition-all ${
                  isEntitled
                    ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                    : 'border-ui-border-base bg-ui-bg-subtle'
                } space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ui-fg-base">{module.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      isEntitled ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {isEntitled ? (canOpen ? 'In your plan' : 'No access for your role') : 'Not in your plan'}
                  </span>
                </div>
                <MaturityBadge maturity={module.maturity} />
                {!isEntitled && module.readiness !== 'CONTAINED' && (
                  <div className="pt-1">
                    {(() => {
                      const request = requests.find((candidate) => candidate.moduleKey === module.key);
                      if (request) {
                        return (
                          <p className="text-[11px] text-ui-fg-subtle">
                            Requested {TRIAL_DATE.format(new Date(request.requestedAt))}
                            {request.requestedBy ? ` by ${request.requestedBy}` : ''}. A platform operator turns it on.
                          </p>
                        );
                      }
                      return canRequest ? (
                        <button
                          type="button"
                          disabled={requesting !== null}
                          onClick={() => void requestModule(module.key)}
                          className="text-[11px] font-semibold text-ui-fg-interactive hover:text-ui-fg-interactive-hover disabled:opacity-50"
                        >
                          {requesting === module.key ? 'Sending…' : 'Request this module'}
                        </button>
                      ) : null;
                    })()}
                  </div>
                )}
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
