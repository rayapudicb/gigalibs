'use client';

// WI-OI-120 (T11b): the full set-up wizard. It orchestrates the screens a new workspace needs — company, organization,
// people, access, modules, solution packs — and shows what is done and what is next. Progress is derived from the
// workspace's own data (see @gigalibs/contracts deriveSetupProgress), not a stored flag, so it is always truthful and
// resumes itself. The company name and enabled-module count come from the signed session (passed in); the unit, member
// and role counts are fetched here.

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SETUP_STEPS,
  type SetupSignals,
  type SetupStepStatus,
  deriveSetupProgress,
} from '@gigalibs/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface SetupWizardProps {
  companyName: string;
  companyNamed: boolean;
  enabledModuleCount: number;
}

interface WorkspaceCounts {
  units: number;
  members: number;
  roles: number;
}

const STATUS_BADGE: Record<SetupStepStatus, { label: string; className: string }> = {
  done: { label: 'Done', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  todo: { label: 'To do', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  optional: { label: 'Optional', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

async function countFrom(path: string, shape: 'array' | 'items'): Promise<number> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return 0;
    const data = await response.json();
    if (shape === 'array') return Array.isArray(data) ? data.length : 0;
    return Array.isArray(data?.items) ? data.items.length : 0;
  } catch {
    return 0;
  }
}

export function SetupWizard({ companyName, companyNamed, enabledModuleCount }: SetupWizardProps) {
  const [counts, setCounts] = useState<WorkspaceCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      countFrom('/api/control/tenants/current/organization/units?limit=50', 'items'),
      countFrom('/api/control/tenants/current/members', 'array'),
      countFrom('/api/control/tenants/current/roles', 'array'),
    ]).then(([units, members, roles]) => {
      if (!cancelled) setCounts({ units, members, roles });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signals: SetupSignals = {
    companyNamed,
    enabledModuleCount,
    unitCount: counts?.units ?? 0,
    memberCount: counts?.members ?? 0,
    customRoleCount: counts?.roles ?? 0,
    packInstalled: null,
  };
  const progress = deriveSetupProgress(signals);
  const nextStep = SETUP_STEPS.find((step) => step.key === progress.nextStepKey);
  const statusByKey = new Map(progress.steps.map((step) => [step.key, step.status]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-ui-fg-base">Set up {companyName}</h1>
        <p className="text-sm text-ui-fg-subtle">
          A few steps to get your workspace ready. You can leave and come back — this page always
          reflects where you are.
        </p>
        <div
          className="flex items-center gap-3 pt-1"
          aria-label={`Set-up ${progress.percent}% complete`}
        >
          {/* Decorative bar; the adjacent percent text carries the value for assistive tech. */}
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-ui-bg-subtle"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-sm font-medium text-ui-fg-base">{progress.percent}%</span>
        </div>
        {counts === null && <p className="text-xs text-ui-fg-subtle">Checking your workspace…</p>}
      </header>

      {progress.allRequiredDone ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <span className="text-2xl" aria-hidden>
              ✅
            </span>
            <div>
              <p className="font-semibold text-ui-fg-base">You're all set.</p>
              <p className="text-sm text-ui-fg-subtle">
                Every required step is done. The optional steps below are there whenever you want
                them.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : nextStep ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Next step
              </p>
              <p className="font-semibold text-ui-fg-base">{nextStep.title}</p>
              <p className="text-sm text-ui-fg-subtle">{nextStep.description}</p>
            </div>
            <Link href={nextStep.href}>
              <Button variant="primary">Continue</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <ol className="space-y-3">
        {SETUP_STEPS.map((step, index) => {
          const status = statusByKey.get(step.key) ?? 'todo';
          const badge = STATUS_BADGE[status];
          return (
            <li key={step.key}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        status === 'done'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-ui-bg-subtle text-ui-fg-subtle'
                      }`}
                      aria-hidden
                    >
                      {status === 'done' ? '✓' : index + 1}
                    </span>
                    <div>
                      <CardTitle className="text-base">{step.title}</CardTitle>
                      <CardDescription>{step.description}</CardDescription>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </CardHeader>
                <CardContent className="flex justify-end pt-0">
                  <Link href={step.href}>
                    <Button variant={status === 'done' ? 'transparent' : 'secondary'} size="small">
                      {status === 'done' ? 'Review' : 'Set up'}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
