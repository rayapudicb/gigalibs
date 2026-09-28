'use client';

import { type WorkforceApiError, payExportFileUrl, workforceApi } from '@/lib/workforce-api';
import type { PayExportReconciliationV1, PayExportV1, PayPolicyPackV1, PayRateV1, PayRunDetailV1, PayRunStatusV1, PayRunV1, PayRunVerificationV1, WorkforceResourcePageV1 } from '@gigalibs/contracts';
import { Alert, Badge, Button, Container, Heading, Input, Label, StatusBadge, Table, Text } from '@medusajs/ui';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

type Person = WorkforceResourcePageV1['items'][number];

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';
const runColor: Record<PayRunStatusV1, 'orange' | 'green' | 'grey'> = { CALCULATED: 'orange', APPROVED: 'green', VOIDED: 'grey' };
const categoryLabel: Record<string, string> = {
  REGULAR: 'Regular',
  DAILY_OVERTIME: 'Daily overtime',
  DAILY_DOUBLE_TIME: 'Daily double time',
  WEEKLY_OVERTIME: 'Weekly overtime',
  SEVENTH_DAY_OVERTIME: '7th day overtime',
  SEVENTH_DAY_DOUBLE_TIME: '7th day double time',
};

function money(amountMinor: number, currency: string): string {
  const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 10 ** digits);
}

function toMinor(value: string, currency: string): number {
  const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(Number(value) * 10 ** digits);
}

function lastMonday(): string {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) - 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Pay-ready outputs (WI-OI-070): reference policy packs, dated pay rates, and weekly runs over approved timesheets
 * with a rule trace per line, four-eyes approval and reproducibility checks.
 */
export function PayReadiness({ resources }: { resources: readonly Person[] }) {
  const people = useMemo(() => resources.filter((resource) => resource.resourceType === 'HUMAN'), [resources]);
  const [packs, setPacks] = useState<readonly PayPolicyPackV1[]>([]);
  const [referenceEnabled, setReferenceEnabled] = useState(true);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  useEffect(() => {
    workforceApi.payPacks().then((result) => {
      setPacks(result.items);
      setReferenceEnabled(result.referencePacksEnabled);
    }, (reason) => setError(reason as WorkforceApiError));
  }, []);

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error.message}</Alert> : null}
      <Container className="p-5">
        <Heading level="h2">Policy packs</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">Reference packs are not statutory advice until validated for your jurisdiction.</Text>
        {!referenceEnabled ? (
          <Alert variant="warning" className="mt-3">Reference packs are disabled in this deployment, so pay can only use a pack approved for your jurisdiction.</Alert>
        ) : null}
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {packs.map((pack) => (
            <li key={`${pack.code}@${pack.version}`} className="rounded-md border border-ui-border-base p-3">
              <div className="flex items-center justify-between gap-2">
                <Text size="small" weight="plus">{pack.code} v{pack.version}</Text>
                {pack.reference ? <Badge size="2xsmall" color="orange">Reference</Badge> : null}
              </div>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">{pack.name}</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Daily {pack.rules.dailyRegularMinutes === null ? 'none' : `${pack.rules.dailyRegularMinutes / 60} h`}
                {pack.rules.dailyDoubleTimeAfterMinutes ? `, double after ${pack.rules.dailyDoubleTimeAfterMinutes / 60} h` : ''} · weekly {pack.rules.weeklyRegularMinutes / 60} h
                · overtime ×{pack.rules.overtimeMultiplierBp / 10_000}{pack.rules.seventhConsecutiveDay ? ' · 7th day rule' : ''}
              </Text>
            </li>
          ))}
        </ul>
      </Container>
      <div className="grid gap-4 xl:grid-cols-2">
        <Rates people={people} packs={packs} />
        <Runs />
      </div>
    </div>
  );
}

function Rates({ people, packs }: { people: readonly Person[]; packs: readonly PayPolicyPackV1[] }) {
  const [rates, setRates] = useState<readonly PayRateV1[] | null>(null);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRates((await workforceApi.payRates()).items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Container className="p-5">
      <Heading level="h2">Pay rates</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">A new rate starts on a date; the previous one ends the day before. Approved runs keep the rate they used.</Text>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const currency = String(data.get('currency') ?? '').toUpperCase();
          setBusy(true);
          workforceApi
            .setPayRate({
              resourceId: String(data.get('resourceId')),
              packCode: String(data.get('packCode')),
              effectiveFrom: String(data.get('effectiveFrom')),
              hourlyRateMinor: toMinor(String(data.get('rate')), currency),
              currency,
            })
            .then(async () => {
              form.reset();
              await load();
            }, (reason) => setError(reason as WorkforceApiError))
            .finally(() => setBusy(false));
        }}
      >
        <Field id="rate-person" label="Person">
          <select id="rate-person" name="resourceId" required className={selectClass} defaultValue="">
            <option value="" disabled>Choose a person</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
        </Field>
        <Field id="rate-pack" label="Policy pack">
          <select id="rate-pack" name="packCode" required className={selectClass}>
            {[...new Set(packs.map((pack) => pack.code))].map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </Field>
        <Field id="rate-from" label="From"><Input id="rate-from" name="effectiveFrom" type="date" required /></Field>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field id="rate-amount" label="Hourly rate"><Input id="rate-amount" name="rate" type="number" min="0.01" step="0.01" required /></Field>
          <Field id="rate-currency" label="Currency"><Input id="rate-currency" name="currency" required maxLength={3} minLength={3} defaultValue="USD" className="uppercase" /></Field>
        </div>
        <Button type="submit" size="small" isLoading={busy} className="sm:col-span-2">Set rate</Button>
      </form>
      {error ? <Alert variant="error" className="mt-3">{error.message}</Alert> : null}
      <ul className="mt-4 space-y-1">
        {(rates ?? []).map((rate) => (
          <li key={rate.id} className="flex flex-wrap justify-between gap-2 txt-compact-small">
            <span>{rate.resourceName ?? 'Person'} · {rate.packCode}</span>
            <span className="tabular-nums">{money(rate.hourlyRateMinor, rate.currency)}/h · {rate.effectiveFrom} → {rate.effectiveTo ?? 'open'}</span>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function Runs() {
  const [periodStart, setPeriodStart] = useState(lastMonday);
  const [runs, setRuns] = useState<readonly PayRunV1[] | null>(null);
  const [selected, setSelected] = useState<PayRunDetailV1 | null>(null);
  const [verification, setVerification] = useState<PayRunVerificationV1 | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  const load = useCallback(async () => {
    try {
      setRuns((await workforceApi.payRuns()).items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<PayRunDetailV1 | null>) {
    setBusy(true);
    setVerification(null);
    try {
      const result = await action();
      if (result) setSelected(result);
      await load();
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="p-5">
      <Heading level="h2">Pay runs</Heading>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field id="run-week" label="Week starting (Monday)">
          <Input id="run-week" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
        </Field>
        <Button type="button" size="small" isLoading={busy} onClick={() => void act(() => workforceApi.calculatePayRun({ requestKey: crypto.randomUUID(), periodStart }))}>
          Calculate
        </Button>
      </div>
      {error ? <Alert variant="error" className="mt-3">{error.message}</Alert> : null}
      <ul className="mt-4 space-y-2">
        {(runs ?? []).map((run) => (
          <li key={run.id}>
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base p-3 text-left hover:bg-ui-bg-base-hover" onClick={() => void act(() => workforceApi.payRun(run.id))}>
              <span className="txt-compact-small">Week of {run.periodStart} · {run.people} people · {run.lineCount} lines</span>
              <span className="flex items-center gap-2">
                <span className="txt-compact-small tabular-nums">{run.totals.map((total) => money(total.amountMinor, total.currency)).join(' · ')}</span>
                <StatusBadge color={runColor[run.status]}>{run.status.toLowerCase()}</StatusBadge>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="mt-4 rounded-md border border-ui-border-base p-3">
          <Text size="xsmall" className="font-mono text-ui-fg-subtle">Digest {selected.digest.slice(0, 16)}…</Text>
          <Table className="mt-2">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Person</Table.HeaderCell>
                <Table.HeaderCell>Day</Table.HeaderCell>
                <Table.HeaderCell>Category</Table.HeaderCell>
                <Table.HeaderCell>Hours</Table.HeaderCell>
                <Table.HeaderCell>Amount</Table.HeaderCell>
                <Table.HeaderCell>Rule</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {selected.lines.map((line) => (
                <Table.Row key={line.lineNo}>
                  <Table.Cell>{line.resourceName ?? 'Person'}</Table.Cell>
                  <Table.Cell>{line.workDate}</Table.Cell>
                  <Table.Cell>{categoryLabel[line.category] ?? line.category}</Table.Cell>
                  <Table.Cell className="tabular-nums">{(line.minutes / 60).toFixed(2)}</Table.Cell>
                  <Table.Cell className="tabular-nums">{money(line.amountMinor, line.currency)}</Table.Cell>
                  <Table.Cell className="font-mono txt-compact-xsmall">{line.ruleTrace}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="small" variant="secondary" onClick={() => void workforceApi.verifyPayRun(selected.id).then(setVerification, (reason) => setError(reason as WorkforceApiError))}>
              Check reproducibility
            </Button>
            {selected.status === 'CALCULATED' ? (
              <>
                <Button type="button" size="small" isLoading={busy} onClick={() => void act(() => workforceApi.approvePayRun(selected.id, selected.version))}>Approve</Button>
                <Input aria-label="Reason to void" placeholder="Reason to void" value={voidReason} maxLength={500} onChange={(event) => setVoidReason(event.target.value)} className="max-w-[220px]" />
                <Button type="button" size="small" variant="danger" disabled={voidReason.trim().length < 3} onClick={() => void act(() => workforceApi.voidPayRun(selected.id, selected.version, voidReason.trim()))}>Void</Button>
              </>
            ) : null}
          </div>
          {verification ? (
            <Alert variant={verification.identical ? 'success' : 'error'} className="mt-3">
              {verification.identical ? 'Recalculating from the frozen inputs gives identical lines.' : 'The recalculation differs from the stored run.'}
            </Alert>
          ) : null}
          {selected.status === 'APPROVED' ? <Exports run={selected} onError={setError} /> : null}
        </div>
      ) : null}
    </Container>
  );
}

/** Payroll export of an approved run (WI-OI-071): download, reconciliation and the target's confirmation. */
function Exports({ run, onError }: { run: PayRunDetailV1; onError: (error: WorkforceApiError) => void }) {
  const [items, setItems] = useState<readonly PayExportV1[] | null>(null);
  const [check, setCheck] = useState<PayExportReconciliationV1 | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await workforceApi.payExports(run.id)).items);
    } catch (reason) {
      onError(reason as WorkforceApiError);
    }
  }, [run.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items?.[0];
  return (
    <div className="mt-4 border-t border-ui-border-base pt-3">
      <Heading level="h3">Payroll export</Heading>
      {!current ? (
        <Button type="button" size="small" className="mt-2" onClick={() => void workforceApi.createPayExport(run.id).then(load, (reason) => onError(reason as WorkforceApiError))}>
          Create payroll export
        </Button>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge color={current.status === 'ACKNOWLEDGED' ? 'green' : 'orange'}>{current.status.toLowerCase()}</StatusBadge>
            <Text size="xsmall" className="font-mono text-ui-fg-subtle">SHA-256 {current.fileSha256.slice(0, 16)}…</Text>
            <Button asChild size="small" variant="secondary"><a href={payExportFileUrl(current.id)}>Download CSV</a></Button>
            <Button type="button" size="small" variant="secondary" onClick={() => void workforceApi.payExportReconciliation(current.id).then(setCheck, (reason) => onError(reason as WorkforceApiError))}>
              Reconcile
            </Button>
          </div>
          {check ? (
            <Alert variant={check.reconciled ? 'success' : 'error'}>
              {check.reconciled ? `The file matches the run: ${check.lineCount} lines, ${check.totals.map((total) => money(total.amountMinor, total.currency)).join(' · ')}.` : 'The file does not match the run.'}
            </Alert>
          ) : null}
          {current.status === 'READY' ? (
            <form
              className="grid gap-2 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                workforceApi
                  .acknowledgePayExport(current.id, {
                    expectedVersion: current.version,
                    targetReference: String(data.get('targetReference') ?? '').trim(),
                    reportedLineCount: Number(data.get('lineCount')),
                    reportedTotals: current.totals.map((total) => ({ currency: total.currency, amountMinor: toMinor(String(data.get(`total-${total.currency}`)), total.currency) })),
                  })
                  .then(load, (reason) => onError(reason as WorkforceApiError));
              }}
            >
              <Input name="targetReference" aria-label="Payroll batch reference" placeholder="Payroll batch reference" required maxLength={128} />
              <Input name="lineCount" aria-label="Lines imported" type="number" min="0" placeholder="Lines imported" required />
              {current.totals.map((total) => (
                <Input key={total.currency} name={`total-${total.currency}`} aria-label={`Imported total ${total.currency}`} type="number" step="0.01" min="0" placeholder={`Total ${total.currency}`} required />
              ))}
              <Button type="submit" size="small" className="sm:col-span-3">Confirm import</Button>
            </form>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">Imported as {current.targetReference}.</Text>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">{label}</Label>
      {children}
    </div>
  );
}
