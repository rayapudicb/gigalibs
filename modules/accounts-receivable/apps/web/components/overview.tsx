'use client';

import type { Customer, Invoice } from '@/lib/api-types';
import { humanError, requestJson } from '@/lib/browser-api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from './feedback';

export function Overview() {
  const [state, setState] = useState<{ customers: Customer[]; invoices: Invoice[] }>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [customers, invoices] = await Promise.all([
        requestJson<{ items: Customer[] }>('v1/customers?pageSize=100'),
        requestJson<{ items: Invoice[] }>('v1/invoices?pageSize=100'),
      ]);
      setState({ customers: customers.items, invoices: invoices.items });
    } catch (caught) {
      setError(humanError(caught));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="page-heading split">
        <div>
          <p className="eyebrow">Receivables command center</p>
          <h1>Overview</h1>
          <p>Live operational data for the signed-in tenant.</p>
        </div>
        <Link className="button primary" href="/invoices/new">
          Create invoice
        </Link>
      </div>
      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : !state ? (
        <LoadingState />
      ) : (
        <>
          <section className="metric-grid" aria-label="Accounts receivable summary">
            <Metric label="Customers" value={state.customers.length} note="in this loaded page" />
            <Metric
              label="Draft invoices"
              value={state.invoices.filter((item) => item.status === 'DRAFT').length}
              note="ready for review"
            />
            <Metric
              label="Issued invoices"
              value={state.invoices.filter((item) => item.status === 'ISSUED').length}
              note="immutable records"
            />
            <Metric
              label="Open documents"
              value={state.invoices.length}
              note="in this loaded page"
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recent invoices</h2>
                <p>No estimated or fabricated values.</p>
              </div>
              <Link href="/invoices">View all</Link>
            </div>
            {state.invoices.length === 0 ? (
              <p className="muted-block">No invoices have been created.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.invoices.slice(0, 8).map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <Link href={`/invoices/${invoice.id}`}>
                            {invoice.invoiceNumber ?? 'Unnumbered draft'}
                          </Link>
                          <small>{invoice.id}</small>
                        </td>
                        <td>
                          <span className={`status ${invoice.status.toLowerCase()}`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td>{invoice.dueDate}</td>
                        <td>
                          {invoice.currency} {invoice.totalMinor.toLocaleString()} minor units
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{note}</small>
    </article>
  );
}
