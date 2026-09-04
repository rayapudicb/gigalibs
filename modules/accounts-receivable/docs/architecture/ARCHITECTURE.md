# Accounts Receivable architecture — draft decision packet

Status: G2 draft; independent approval required

## Runtime boundary

```text
Browser
  → standalone AR web/BFF
  → AR API
  → module-owned PostgreSQL schema
                    └→ transactional outbox → AR worker → broker/webhook consumers
                                              ├→ object storage (invoice documents)
                                              ├→ email provider
                                              └→ hosted payment provider
```

OIDC supplies identity. The API derives tenant from verified issuer/subject claims and applies module RBAC
plus object authorization. Provider credentials are secret-manager references. Redis/queues may improve
transport and rate control but are never the financial system of record.

## Independence rules

- Required business modules: none.
- One module-owned database or dedicated PostgreSQL role/schema; cross-schema access is denied.
- Public OpenAPI commands/queries, versioned committed events, and signed webhooks are the only business
  integration boundaries.
- Suite navigation links/routes to the standalone web product; it does not iframe or copy it.
- Optional ledger consumes invoice/payment events. Optional subscription metering consumes the committed
  invoice-issued event. Failure of either consumer cannot roll back or fabricate AR state.

## Transaction boundaries

| Command | Atomic records | Concurrency/idempotency | Side effect after commit |
| --- | --- | --- | --- |
| Create draft | draft, lines, audit, idempotent result | payload hash + tenant/key; version 1 | none |
| Update draft | draft, replacement/change-set lines, audit | expected version; 412 on stale write | none |
| Issue invoice | series number, immutable invoice/lines, audit, idempotent result, outbox | row lock + uniqueness + expected version | document generation and event publication |
| Deliver invoice | delivery attempt, audit, outbox/job | stable delivery command key | provider request with receipt/retry |
| Apply payment | receipt/allocation/balances, audit, outbox | provider/event ID + allocation constraints + locks | balance event/reconciliation |
| Issue credit | credit/lines/allocation/balances, audit, outbox | approval + command key + locks | document/event/delivery |

No external call occurs inside a database transaction. Workers persist attempt, timeout, provider receipt,
retry schedule, terminal exception, and reconciliation result.

## Scale starting point

The commercial allowance of 10,000 issued invoices per tenant per billing period is not the database
capacity target. G3 load profiles must cover burst issuance, invoice lines, list/report queries, concurrent
number allocation, noisy tenants, worker backlog, provider outage, and at least the retained multi-year
data volume. Exact SLO, capacity, retention, partitioning, and autoscaling values require measured tests and
human approval.

## Unresolved G2 decisions

- Supported seller/customer countries, tax rounding, fiscalization, and document retention.
- Dedicated database versus dedicated schema support tiers and restore granularity.
- OIDC issuer/claim profiles and standalone bootstrap/recovery administration.
- PDF renderer, object storage, email, and first payment provider.
- Broker/event delivery profile and customer webhook signing/rotation.
- Usage-meter overage/hard-cap policy and degraded behavior if entitlement service is unavailable.
- Data residency, encryption key ownership, legal hold, export, erasure, RPO, and RTO.
