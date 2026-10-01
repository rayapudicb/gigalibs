'use client';

import type { OrgPage, OrgUnitV1 } from '@gigalibs/contracts';
import { Alert, Button, Input, Label, Text } from '@medusajs/ui';
import { useEffect, useId, useState } from 'react';
import { describeOrgError, orgRequest, type OrgErrorView } from './organization-client';

export const selectClassName =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-1.5 text-sm text-ui-fg-base outline-none focus:border-ui-border-interactive disabled:text-ui-fg-disabled';

/** A refusal or outage with the server's explanation, validation problems and the step that fixes it. */
export function OrgErrorAlert({ error, onReload, onRetry, unitNames }: {
  error: OrgErrorView | null;
  onReload?: () => void;
  onRetry?: () => void;
  unitNames?: Record<string, string>;
}) {
  if (!error) return null;
  return (
    <Alert variant={error.kind === 'invalid' || error.kind === 'conflict' ? 'warning' : 'error'} dismissible={false}>
      <div className="flex flex-col gap-2" role="alert">
        <Text size="small" weight="plus">{error.title}</Text>
        <Text size="small">{error.message}</Text>
        {error.issues.length > 0 && (
          <ul className="list-disc pl-5">
            {error.issues.map((issue) => (
              <li key={issue}><Text size="small">{issue}</Text></li>
            ))}
          </ul>
        )}
        {error.problems.length > 0 && <OrgProblemList problems={error.problems} unitNames={unitNames ?? {}} />}
        <div className="flex gap-2">
          {error.action === 'reload' && onReload && <Button size="small" variant="secondary" onClick={onReload}>Reload</Button>}
          {error.action === 'retry' && onRetry && <Button size="small" variant="secondary" onClick={onRetry}>Try again</Button>}
          {error.action === 'sign-in' && <Button size="small" variant="secondary" onClick={() => window.location.assign('/login')}>Sign in</Button>}
        </div>
      </div>
    </Alert>
  );
}

const PROBLEM_LABELS: Record<string, string> = {
  CYCLE: 'Loop',
  TOO_DEEP: 'Too deep',
  ROOT_NOT_ALLOWED: 'Not allowed at the top',
  PARENT_NOT_ALLOWED: 'Wrong parent level',
  UNIT_NOT_ACTIVE: 'Archived unit',
};

export function OrgProblemList({ problems, unitNames }: { problems: Array<{ code: string; unitId: string; detail: string }>; unitNames: Record<string, string> }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Validation problems">
      {problems.map((problem) => (
        <li key={`${problem.code}-${problem.unitId}`} className="flex flex-wrap items-baseline gap-2">
          <Text size="small" weight="plus">{PROBLEM_LABELS[problem.code] ?? problem.code}</Text>
          <Text size="small">{unitNames[problem.unitId] ?? problem.unitId}</Text>
          <Text size="small" className="text-ui-fg-subtle">{problem.detail}</Text>
        </li>
      ))}
    </ul>
  );
}

export function OrgSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="success" dismissible={false}>
      <span role="status">{message}</span>
    </Alert>
  );
}

/** Resolves unit ids to "CODE · Name" labels in one request (up to 200 ids). */
export function useUnitNames(ids: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const wanted = key.split(',').slice(0, 200);
    let cancelled = false;
    void orgRequest<OrgPage<OrgUnitV1>>(`/units?ids=${encodeURIComponent(wanted.join(','))}&limit=200`)
      .then((page) => {
        if (!cancelled) setNames(Object.fromEntries(page.items.map((unit) => [unit.id, `${unit.code} · ${unit.name}`])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}

/** Search units by code or name and pick one. */
export function OrgUnitPicker({ label, value, onChange, excludeArchived = true }: {
  label: string;
  value: OrgUnitV1 | null;
  onChange: (unit: OrgUnitV1 | null) => void;
  excludeArchived?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrgUnitV1[]>([]);
  const [error, setError] = useState<OrgErrorView | null>(null);
  useEffect(() => {
    if (value || query.trim().length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: '20' });
      if (excludeArchived) params.set('status', 'ACTIVE');
      orgRequest<OrgPage<OrgUnitV1>>(`/units?${params}`)
        .then((page) => {
          if (!cancelled) {
            setResults(page.items);
            setError(null);
          }
        })
        .catch((caught: unknown) => !cancelled && setError(describeOrgError(caught)));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value, excludeArchived]);

  if (value)
    return (
      <div className="flex flex-col gap-1">
        <Label size="small">{label}</Label>
        <div className="flex items-center gap-2">
          <Text size="small" weight="plus">{value.code} · {value.name}</Text>
          <Button size="small" variant="transparent" onClick={() => onChange(null)}>Change</Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-1">
      <Label size="small" htmlFor={id}>{label}</Label>
      <Input id={id} size="small" placeholder="Search by code or name" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      {error && <Text size="small" className="text-ui-fg-error">{error.message}</Text>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-md border border-ui-border-base bg-ui-bg-base" aria-label={`${label} results`}>
          {results.map((unit) => (
            <li key={unit.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-ui-fg-base hover:bg-ui-bg-base-hover focus:bg-ui-bg-base-hover focus:outline-none"
                onClick={() => {
                  onChange(unit);
                  setQuery('');
                }}
              >
                {unit.code} · {unit.name} <span className="text-ui-fg-subtle">({unit.typeCode})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && results.length === 0 && !error && <Text size="small" className="text-ui-fg-subtle">No matching units.</Text>}
    </div>
  );
}

/** A required reason for a governed step. */
export function ReasonField({ value, onChange, label = 'Reason' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label size="small" htmlFor={id}>{label}</Label>
      <Input id={id} size="small" value={value} onChange={(event) => onChange(event.target.value)} placeholder="At least 3 characters" />
    </div>
  );
}
