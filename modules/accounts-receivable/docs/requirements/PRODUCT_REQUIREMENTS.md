# Customer Invoicing and AR product requirements

Status: draft for Product, Finance, Security, Architecture, and QA review  
Work item: WI-OI-019  
Primary requirement: FR-17

## Business use cases

1. A tenant administrator configures an empty standalone module with company identity, invoice numbering,
   OIDC, permissions, storage, email, and optional payment provider.
2. An AR clerk creates/imports customers and billing contacts without deleting financial history.
3. An AR clerk creates and previews a server-calculated invoice draft.
4. An AR manager approves policy-controlled invoices and issues an immutable numbered document exactly once.
5. Finance sends/resends the same issued invoice and sees queued, accepted, delivered, bounced, complained,
   failed, and retrying states backed by real provider receipts.
6. Finance records approved manual receipts or accepts signed hosted-payment-provider webhooks, then applies
   partial/full payments without duplicates.
7. Finance corrects an invoice through a credit note or governed void; issued history is never silently edited.
8. Collections users see aging, statements, overdue work, reminders, and owned exceptions.
9. Controllers/auditors trace actor, reason, policy, totals, document version, delivery, payment, credit,
   reconciliation, and export evidence.
10. A customer billing contact securely views/downloads an invoice and follows approved payment instructions.

## Roles and deny-by-default permissions

| Role | Main permissions | Explicitly denied by default |
| --- | --- | --- |
| Module administrator | Configure module, connections, roles, retention | Issue/credit/pay unless separately granted |
| AR clerk | Customers, drafts, delivery, approved manual receipt request | Provider secrets, role changes, high-value approval |
| AR manager | Approve, issue, credit, void, reconcile, manage exceptions | Identity-provider secrets, release controls |
| Controller/auditor | Read reports/evidence and governed exports | Mutating financial state |
| Collections agent | Statements, reminders, exception work | Invoice issue, credits, payment mutation |
| Customer billing contact | Own authorized portal documents and payment session | Tenant staff UI, other customers/invoices |
| Support operator | Redacted diagnostics and retry where granted | Secrets, financial correction, cross-tenant search |

Every API enforces permission, object scope, and tenant boundary server-side. One person may hold multiple
roles only through an explicit grant; UI visibility is not authorization.

## UI scope

```text
/                         AR dashboard
/customers                Customer list and import
/customers/:id            Customer, contacts, invoices, and statement
/items                    Reusable product/service items
/invoices                 Search/filter/page/export invoice list
/invoices/new             Draft editor and exact preview
/invoices/:id             Document, balance, delivery, payments, credits, audit
/approvals                Policy-controlled invoice approvals
/credit-notes             Credit creation and allocation
/payments                 Receipts and allocations
/reconciliation           Provider/manual reconciliation workbench
/aging                    Current, 1–30, 31–60, 61–90, and 90+ aging
/exceptions               Delivery/payment/processing failures
/audit                    Authorized evidence search and export
/settings/*               Company, numbering, providers, roles, retention
/portal/invoices/:token   Controlled customer entry
```

Each route must implement loading, real empty, validation, forbidden, not-found-without-disclosure,
concurrency conflict, stale/partial, provider unavailable, retrying, terminal failure, and success states as
applicable. Refresh and process restart must preserve confirmed business state.

## API and event scope

The first vertical slice is drafted in `../../contracts/openapi.yaml` and
`../../contracts/asyncapi.yaml`. Later reviewed contract versions cover delivery, payments, credit notes,
reconciliation, aging, exports, exceptions, audit, and authorized server-sent updates.

All create/effect commands are idempotent. Updates use expected version/ETag. Lists are tenant-scoped,
cursor-paginated, bounded, filterable, and deterministic. Errors use a versioned problem-details contract
with correlation ID and no secret/foreign-object disclosure.

## Subscription plan and 10,000-invoice meter

This is a commercial entitlement/usage feature, not an invoice-table counter:

- Meter only committed `ar.invoice.issued.v1` events and unique `invoiceId` values.
- Aggregate by tenant and contractual billing period; preserve an immutable usage ledger.
- Do not count drafts, draft edits, previews, delivery attempts, resends, event retries, or webhook retries.
- Voiding later does not erase already consumed issuance usage unless the approved contract says otherwise.
- Warn tenant admins at 80% (8,000), 90% (9,000), 99% (9,900), and 100% (10,000).
- Recommended default is an included 10,000 plus explicit overage. Blocking invoice issue can prevent a
  customer from collecting money and therefore requires a deliberate contract/risk decision.
- Reconcile event counts, usage ledger, entitlement, and customer billing statement before charging.

If “99%” means service availability, it is an SLO/SLA instead: 99% over a 30-day month permits about 7
hours 18 minutes of unavailability. The current platform target is 99.9%, subject to an approved SLI and
exclusions.

## Business outcomes and measures

| Outcome | Example measure (target requires human approval) |
| --- | --- |
| Faster invoice issue | Median draft-to-issued time and first-time completion rate |
| Correct balances | Zero unreconciled duplicate allocations; balance invariant failures |
| Faster collection | Days sales outstanding, overdue amount, and collection by aging bucket |
| Reliable delivery | Delivery success/failure/retry latency and unresolved exception age |
| Controlled correction | Credits/voids with required reason, approval, and evidence |
| Safe multi-tenancy | Zero cross-tenant positive/negative test or production violations |
| Operable standalone product | Clean install, upgrade, restart, backup/restore, and no-platform startup evidence |

Measures cannot be claimed from demo/test data and need a baseline, formula owner, attribution rule, and
production observation window.

## Non-goals for the first module release

- Supplier invoices, purchase orders, goods receipt, and Accounts Payable.
- General-ledger posting or statutory accounting books.
- Full country-by-country tax/fiscalization/e-invoicing without named jurisdictions and legal review.
- Storing or processing raw card data.
- Copying Invoice Ninja implementation code or protected assets.
- Depending on the GigaLibs platform database or another module to perform core AR work.
