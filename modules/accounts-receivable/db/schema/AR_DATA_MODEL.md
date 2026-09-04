# AR data ownership and schema design

Status: draft G2 design; this is not a migration

The module owns PostgreSQL schema `gigalibs_ar` through a dedicated database role. No table, view, foreign
key, trigger, or query may cross into a platform, ledger, metering, or customer-owned schema.

## Foundation tables

| Table | Purpose | Critical constraints/indexes |
| --- | --- | --- |
| `module_tenants` | Local mapping of verified external tenant subject to module tenant ID | unique issuer + external subject; no default tenant |
| `billing_entities` | Seller legal identity, locale, time zone, base currency, tax/branding settings | tenant-scoped unique legal identifier; version column |
| `invoice_series` | Prefix, next number, fiscal/reset policy | unique tenant + billing entity + series; row lock on allocation |
| `customers` | Module-owned customer billing profile | tenant + customer ID PK; tenant + external reference unique when present; version/status |
| `customer_contacts` | Billing recipients | tenant-safe FK; normalized address; active flag |
| `invoice_drafts` | Editable header and policy inputs before issue | tenant-safe FK; version for optimistic concurrency; no invoice number |
| `invoice_draft_lines` | Ordered editable draft lines | tenant-safe FK; positive position/quantity; bounded line count |
| `invoices` | Immutable issued header/seller/buyer/terms/totals snapshot | tenant + ID PK; unique tenant + billing entity + series + number |
| `invoice_lines` | Immutable issued line/tax/rounding snapshots | tenant-safe FK; totals checks; stable ordering |
| `idempotency_records` | Request-key, command, payload hash and durable result | unique tenant + command + key; expiry policy cannot remove financial result |
| `audit_events` | Append-only actor/reason/state evidence | tenant + aggregate + occurred-at index; restricted export |
| `outbox_events` | Committed events awaiting publication | unique event ID; unpublished/next-attempt indexes; payload classification |

Later slices add document versions, delivery attempts, payments, allocations, credit notes, reconciliation
runs/items, exceptions, statements, legal holds, export jobs, and retention/erasure evidence.

## Financial invariants

- Store currency as ISO 4217 code and money as signed 64-bit integer minor units. Decimal quantity uses a
  bounded fixed-precision numeric type; floating point is forbidden.
- Server rules calculate line, tax, subtotal, total, paid, credited, and due amounts. Browser totals are
  previews only.
- Issuing acquires the invoice-series lock and writes the issued snapshot, number, audit event, idempotent
  result, and outbox event in one transaction.
- Issued rows cannot be edited. Corrections are new credit/void records with references and reason.
- Every tenant-safe FK includes tenant ID so a database constraint rejects cross-tenant relationships.
- Timestamps are UTC `timestamptz`; legal document dates also retain local date and applicable time zone.

## Migration plan

The first authorized migration will only create the module-owned schema and foundation tables. It will be
forward-only, checksumed, run by a dedicated migrator role, verified on an empty database and a supported
prior version, and paired with restore/roll-forward evidence. Existing legacy `Invoice` and
`PaymentTransaction` tables are not automatically adopted; migration requires counts, tenant mapping,
currency/totals reconciliation, and a separately approved cutover plan.
