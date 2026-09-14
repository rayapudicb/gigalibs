# AR event billing and supplemental invoicing implementation plan

Status: Proposed G0–G3 design; no Build or release authorization  
Work item: WI-OI-040  
Parent outcome: FR-17 Customer Invoicing and Accounts Receivable  
Source: `WhooCrew-Invoicing-BRD 1.docx`, version 1.0, dated 2026-08-10, plus the owner-supplied gap list  
Source SHA-256: `6a4ad6e6306ca7d3321bbdafc3c45a4fcacf04f15d40df84434e09daec9bbb65`  
Required reviewers: Product, Finance/Payroll Domain, Solution Architecture, Security & Privacy, QA/SDET,
Integration Engineering and SRE; client source owners review only the later client-replica adapter

## 1. Intended business outcome

An authorized billing user can open an event or other registered work source, see exactly which source
records are pending, approved, reserved, invoiced or ready to bill, and create an accurate invoice for the
eligible records. Approvals arriving after the original invoice produce the next supplemental draft without
manual tracking. Every issued amount retains its source, cost, markup, template, numbering and approval
snapshot. The system prevents duplicate billing, detects missed billing, and routes corrections through an
explicit reviewable process.

The two business correctness promises are separate and both are required:

1. **No duplicate billing:** one source-record version cannot belong to two active issued invoices.
2. **No missed billing:** every approved eligible record is either invoiced within policy, reserved by a
   visible draft, or represented by an owned exception with a next action.

## 2. Requirement baseline

The local `FR-1` through `FR-21` labels in the source BRD are source-document identifiers. They do not
replace the platform's stable FR identifiers. These requirements are registered as children of FR-17.

| ID | Priority | Required outcome | Testable acceptance boundary |
| --- | --- | --- | --- |
| FR-17-EB-01 | P0 | Event/work-source billing summary | Return total unique workers, total records, approved, pending, rejected, reserved, previously invoiced, ready-to-bill and correction-review counts from persisted source state. UI generation is disabled at zero eligibility and the API independently returns `NO_ELIGIBLE_RECORDS`. |
| FR-17-EB-02 | P0 | Supplemental invoice generation | A repeated generate command after later approvals creates the next supplemental draft containing only newly eligible records. There is no application-defined round limit. Generation never means unattended issuance. |
| FR-17-EB-03 | P0 | Invoice-family relationship | Persist family, original invoice, monotonic supplemental sequence, work-source reference, covered-record count and replacement relationship; return the complete family in one bounded query. |
| FR-17-EB-04 | P0 | Markup policy | Support percentage and flat markup using the exact order line override → customer/category rule → customer default. Missing applicable policy fails visibly; no hard-coded fallback is allowed. |
| FR-17-EB-05 | P0 | Markup transparency | Authorized internal users see raw cost, resolved rule, markup and billed amount. Issued lines retain an immutable calculation snapshot. Customer-document cost visibility is a separately configured and snapshotted choice. |
| FR-17-EB-06 | P0 | Missed-billing control | Create a deduplicated alert/exception when an approved eligible record remains unbilled beyond the configured duration; provide owner, age, source and next action. |
| FR-17-EB-07 | P0 | Void and rebilling | Voiding never unlocks source records. A separately authorized `Release for Rebilling` command records reason and approval, then makes the records eligible and requires the replacement invoice to link to the voided invoice. |
| FR-17-EB-08 | P0 | Source dependency and correction contract | Accept billable quantity and raw cost only from approved versioned module-owned records in the standalone build. A pre-issue correction invalidates stale draft calculations; a post-issue correction creates a reconciliation case and never rewrites an issued invoice. A later client adapter must preserve this contract. |
| FR-17-EB-09 | P1 | Customer-specific templates | Maintain multiple immutable template versions per customer, select one for generation, prefill allowlisted event/customer fields and snapshot the selected version on issue. |
| FR-17-EB-10 | P1 | Configurable invoice numbering | Compile an allowlisted token pattern for customer prefix, work reference, series sequence and supplemental suffix. Persist the pattern version and resolved token values; reject collisions before activation. |
| FR-17-EB-11 | P1 | Accounting-system mapping | Show connection, customer, item/category, invoice and correction mappings plus durable sync attempts, external IDs, receipts and actionable retry errors. |
| FR-17-EB-12 | P1 | Externally paid correction | If the external invoice is paid or its state is uncertain, internal void/rebilling enters review and cannot automatically mutate the provider or release source records. |
| FR-17-EB-13 | P1 | Delivery decision | Tenant/customer policy explicitly selects `READY_TO_SEND` or `AUTO_SEND_ON_ISSUE`; the selected policy is snapshotted. Until Product approves otherwise, the safe default is `READY_TO_SEND`. |
| FR-17-EB-14 | P1 | Acceptance and time target | Automate the 30-record scenario: invoice 26 approved records, approve 4 later, then create supplemental sequence 1 for exactly those 4. Representative first-time users complete event invoice generation within two minutes. |
| FR-17-EB-15 | P2 | Event invoice history | Show original, supplements and replacements with amount, issue date, delivery, accounting-sync and correction state, with pagination for large families. |

## 3. Current implementation assessment

The authoritative target is `modules/accounts-receivable`. It has a real NestJS API, module-owned
PostgreSQL schema, forced RLS, customer/draft/issue transactions, audit/outbox and a standalone Next.js
application. Its current public contract supports manual invoice drafts and atomic issue only.

| Area | Current evidence | Classification | Consequence |
| --- | --- | --- | --- |
| Manual customer/draft/issue | API, migrations 000001/000002 and standalone E2E use real PostgreSQL | Runtime verified for the bounded foundation | Preserve request/response semantics and manual creation throughout rollout. |
| Event/work-source summary | No standalone controller/service/UI/contract | Missing | The requested billing entry point does not exist. |
| Billable shifts | Migration 000004 defines rows and RLS but no standalone API/service consumes them | Present but disconnected | A table is not source integration or business functionality. |
| Supplemental families | No family, sequence, original/replacement relationship or source allocation in the canonical schema/API | Missing | Current invoice generation cannot prove partial-billing completeness. |
| Markup | Disconnected table stores only percentage basis points with a hard-coded 35% default; canonical invoice lines contain no cost/markup snapshot | Implemented but incomplete/disconnected | It cannot satisfy percentage/flat rules, precedence, transparency or historical reconstruction. |
| Void/payment | Migration 000004 creates append-only rows but current standalone API exposes no lifecycle commands and invoice state does not consume them | Present but disconnected | Rebilling and externally paid correction are not implemented. |
| Templates and token numbering | Current series supports prefix, numeric sequence and padding only | Implemented but incomplete | Existing numbers must remain valid while new patterns are opt-in. |
| Accounting integration | QuickBooks source inventory is classified as a stub elsewhere; no AR production adapter or mapping lifecycle exists | Missing/blocked by provider selection | It cannot be presented as connected until provider sandbox and reconciliation evidence pass. |
| Suite AR pages | `/api/ar/*` deliberately returns unavailable; an unused in-memory ledger contains sample invoices/shifts | Contained prototype inventory | Do not connect new business behavior to the in-memory store. Promote only the standalone real API after certification. |
| Migration execution | Standalone E2E and deployment migrator currently apply 000001/000002; later 000003/000004 files are not in that path | Schema/runtime drift | Reconcile and verify these migrations before building on them; never edit a deployed migration in place. |

The BRD is internally inconsistent about QuickBooks: its Phase 1 out-of-scope section excludes QBO while
its functional requirements and success criteria call it mandatory. The owner-supplied gap list classifies
accounting mapping as P1. This plan treats QBO as a separately activatable P1 slice until Product and
Finance record whether it gates the first event-billing release.

### Universal invoice boundary

WhooCrew is the first industry configuration profile and acceptance scenario; it is not the AR data model.
Event, worker, shift, timesheet and WhooTime/payroll names remain outside the kernel. The universal module consumes
`WorkSource` and `BillableSourceRecord` contracts that can also represent projects, cases, orders,
subscription periods or milestones. Client-specific non-financial fields, screen layouts and document
templates follow the hybrid metadata architecture in the
[universal invoice dynamic-fields and templates guide](universal-invoice-dynamic-fields-and-templates-guide.md).
The [crewing event invoicing discovery brief](crewing-event-invoicing-discovery-brief.md) captures the
two-to-three-hour worker-by-worker consolidation problem, the minimum user journey and which later granular
ideas are deliberately outside the first slice.
The [universal invoicing portability and integration plan](universal-invoicing-portability-and-integration-plan.md)
defines the standalone-build, certified-freeze, Java/React replication and later client-adapter sequence.

### Delivery sequencing decision

The first GigaLibs implementation has no WhooCrew API dependency. It creates and approves generic
`WorkSource` and `BillableSourceRecord` data through module-owned configurable screens and APIs, persists
that data in the AR owner and proves the entire invoice outcome independently. Event, shift, per diem,
overtime, bonus, equipment, fuel and travel are configured labels/categories in this reference journey.

After GigaLibs is complete and certified, its versioned specifications and conformance suite are frozen. A
separate Java/React replica is built from that pack. WhooCrew authentication, API/event consumption and
client-specific mappings/fields are implemented only in the replica and must not be backported as a
dependency of the frozen GigaLibs release.

## 4. Target ownership and data flow

```text
Configured work-source form ─┐
Configured charge form ──────┼─ module-owned validation + approval
Optional bounded import ─────┘             │
                                           ▼
AR persistence → work source + billable record snapshots
                                         │
                                         ├─ event billing summary/read model
                                         ├─ missed-billing reconciliation
                                         ▼
generate draft transaction → record reservations → draft lines + markup/template snapshots
                                         │
                                         ▼
issue transaction → immutable invoice + family sequence + issued allocations
                  → audit + outbox ───────┬─ PDF/delivery worker
                                         └─ accounting sync/reconciliation worker
```

AR owns standalone work-source/record entry, approval, eligibility, reservations, invoice calculation,
immutable issued snapshots, family history, delivery state and accounting reconciliation. Browser input is
untrusted: module commands enforce schema, RBAC, object access, money rules and optimistic concurrency,
then persist the record and audit atomically.

Each record carries a module-assigned ID/version, origin kind, optional external reference, work-source ID,
customer ID, participant reference, category, quantity/unit, currency, raw-cost unit and total, approval
state/time/actor, update time and payload hash. The standalone adapter rejects missing lineage, stale
versions and currency mismatch. The later client adapter adds external system/key/version/signature
validation without changing the canonical record or invoice rules.

## 5. Additive data model

Never modify migrations 000001–000004. First qualify their actual deployment state, then add forward
migrations. Names below are proposed and require G2 data review.

| Record | Purpose and critical controls |
| --- | --- |
| `work_sources` | Tenant-scoped work identity, module ID/version, optional origin/reference, customer, status and indexed summary access. External-system uniqueness applies only when a later adapter supplies external keys. |
| `billable_source_records` | Universal module-owned record with work-source/customer relation, origin type, optional external key/version, hash/timestamps, quantity/unit, raw-cost snapshot, category, approval/correction state and actor lineage. It exposes no WhooCrew-specific columns. |
| `billing_record_allocations` | Append-only reservation/issue/release history linking one source-record version to draft and issued invoice. A partial unique constraint permits only one active `RESERVED` or `ISSUED` allocation per record. Tenant-safe FKs reject cross-tenant links. |
| `invoice_families` | One family per customer/work source/billing entity/series with row-locked `next_supplement_sequence`. No fixed round limit; database `bigint` is the practical bound. |
| Enhanced drafts/invoices | Nullable `work_source_id`, `invoice_family_id`, `supplement_sequence`, `original_invoice_id`, `replaces_invoice_id`, `covered_record_count`, template/version, numbering-pattern/version, resolved tokens and delivery-policy snapshot. Legacy manual records remain valid with null event fields. |
| Enhanced draft/issued lines | Source record/allocation ID plus immutable raw-cost, markup type/value/basis/source, markup amount and billed amount. Issued lines cannot be updated. |
| `customer_billing_policies` and `customer_markup_rules` | Versioned default percentage/flat rule, optional category rules, effective range, currency and flat basis. Prevent overlapping active category rules. |
| `invoice_templates` and `invoice_template_versions` | Stable identity plus immutable sanitized layout, allowlisted merge-field schema, cost-visibility setting, checksum and activation state. Published versions are never edited. |
| `invoice_number_patterns` | Versioned allowlisted token AST, reset/sequence scope, maximum output length and collision-test evidence. Existing prefix/padding becomes the legacy version-1 pattern. |
| `billing_exceptions` | Deduplicated open missed-billing, source-correction, stale-draft, mapping and provider-sync cases with owner, SLA, attempts and resolution. |
| `accounting_connections`, `accounting_*_mappings` | Secret-manager credential reference, company/realm, health; customer, item/category, invoice and correction mappings. Never store provider secrets in AR rows. |
| `accounting_sync_attempts` | Idempotency key, request digest, provider operation, timeout/retry state, provider ID/receipt, error class and reconciliation result. |
| Enhanced `void_records` | Workflow state, rebilling-release request/decision actors and times, provider state and review case. A release creates new allocation history; it never deletes the original link. |

Money remains integer minor units and percentage rates use integer basis points. The domain must define
whether flat markup is per line, per source record or per unit before G1 exit. No generic dynamic field may
change quantity, cost, markup, tax, total, eligibility, allocation, family sequence or financial state.
WI-OI-039 may later supply non-financial custom display fields; issued values are snapshotted.

Migration 000004's disconnected `billable_shifts` cannot become the universal public contract. After the
deployment inventory establishes whether it exists in any supported database, a forward migration either
renames/backfills it to `billable_source_records` with a time-bounded read-only compatibility view, or
creates the canonical table and migrates attributable rows before retiring the old table. Unknown-origin
rows remain quarantined. No parallel writable source tables are permitted.

## 6. Domain and transaction rules

### 6.1 Eligibility and summary

`readyToBill` means the current source version is approved, has complete quantity/cost/customer mapping,
is not blocked by a correction and has no active allocation. `previouslyInvoiced` is a lifetime count;
`activelyInvoiced` remains separate so a void does not erase history. Unique-worker count and source-record
count are returned separately because one worker can have multiple shifts.

The summary API reads one committed projection and reports `asOf`, source freshness and stale status. It
must never infer readiness from UI state. Empty generation returns a conflict with the authoritative
summary so stale clients cannot create zero-line invoices.

### 6.2 Draft generation and supplemental selection

Within one tenant transaction:

1. lock the work-source/family row and the eligible source records;
2. reserve all records that match the requested summary version;
3. resolve and snapshot markup policy, template version, numbering pattern and delivery policy;
4. calculate lines and totals on the server;
5. persist the draft, lines, allocations, audit and idempotent result;
6. return original/supplement classification and covered-record count.

Two concurrent generate requests for the same event cannot split or duplicate the same eligibility set.
The winner owns the reservations; the other returns a deterministic conflict and refreshed summary.
Draft cancellation and a reviewed reservation-expiry policy release reservations with audit evidence.

If no issued invoice exists, the draft is sequence 0 (original). Once the original is issued, the next
successful generation obtains the family's next supplemental sequence under a row lock. Supplemental
sequence is allocated at issue, so abandoned drafts do not create unexplained issued-number gaps unless
the approved numbering policy requires reservation earlier.

### 6.3 Markup resolution

Resolution is deterministic:

1. explicit line override authorized by `ar.markup.override`;
2. active customer/category rule;
3. active customer default;
4. visible configuration error.

Percentage markup uses basis points and the approved rounding mode. Flat markup requires an approved basis
and currency. The line snapshot stores raw unit/total cost, rule/version/source, markup amount and billed
unit/total. Internal raw-cost fields require `ar.costs.read`. Customer documents hide raw cost by default;
an authorized template policy can include it, and the issued snapshot records that decision.

### 6.4 Issue, void and correction

Issue extends the current atomic transaction. It validates reservation ownership and source versions,
allocates the legacy series number plus family supplement sequence, writes immutable invoice/line/template/
policy snapshots, changes allocations to `ISSUED`, records audit/idempotency and writes the existing
`ar.invoice.issued.v1` outbox event. The v1 event payload remains unchanged so metering and existing
consumers do not break. A separate versioned family/source event carries new lineage.

Voiding records history and stops collection/delivery as policy permits, but allocations remain locked.
`Release for Rebilling` requires its own permission, reason, expected version and, where configured,
second-person approval. It is denied while provider payment state is paid, disputed or unknown. Approval
releases eligible allocations and the later replacement stores `replaces_invoice_id`; the voided invoice
and family remain immutable.

A source correction before issue invalidates the affected calculation and forces the user to refresh.
After issue it creates a correction case containing old/new source versions and financial delta. Finance
selects a credit, debit/supplement, void/rebill or no-action disposition. The system never silently rewrites
or automatically unlocks issued history.

## 7. API and event additions

All commands require bearer authentication, tenant-derived scope, server RBAC, object authorization,
idempotency key, bounded schema and correlation ID. Mutable resources require ETag/`If-Match`.

| API/event | Purpose |
| --- | --- |
| `POST /v1/work-sources` and `/v1/work-sources/{id}/records` | Create persistent generic work sources and versioned billable records through authenticated module commands; later client adapters invoke equivalent application commands. |
| `GET /v1/work-sources/{id}/billing-summary` | Return counts, amounts, source freshness, eligibility version and generation permission. |
| `POST /v1/work-sources/{id}/invoice-drafts` | Reserve the current eligible set and create original/supplemental draft; rejects zero eligibility or stale summary version. |
| `GET /v1/work-sources/{id}/invoice-family` | Return bounded original/supplement/replacement history and delivery/sync state. |
| `POST /v1/invoices/{id}/cancel-draft` | Audit and release draft reservations under policy. |
| `POST /v1/invoices/{id}/void` | Record authorized void without releasing source records. |
| `POST /v1/invoices/{id}/release-for-rebilling` | Approve explicit rebilling release after financial/provider checks. |
| `/v1/customers/{id}/billing-policy` and `/markup-rules` | Versioned, optimistic-concurrency policy management. |
| `/v1/invoice-templates` and `/versions` | Draft, validate, preview, publish and activate immutable templates. |
| `/v1/invoice-number-patterns` | Validate tokens/collision samples and activate a versioned pattern. |
| `/v1/billing-exceptions` | Search, assign, resolve and audit missed-billing/correction/provider cases. |
| `/v1/accounting/*` | Connection health, mappings, push/retry and reconciliation. Provider effects are asynchronous. |
| `ar.invoice.source-linked.v1` | New committed lineage/family event; does not replace or alter `ar.invoice.issued.v1`. |
| `ar.billing-record.overdue.v1` | Deduplicated missed-billing alert after exception commit. |
| `ar.accounting-sync.state-changed.v1` | Durable provider attempt/result/reconciliation state without credentials or sensitive cost. |

The first contract revision is additive. Existing manual `POST /v1/invoices`, `PATCH`, `GET`, list and
issue requests remain supported. New response fields are optional for legacy records. Breaking semantics
require a reviewed `/v2`, consumer inventory and compatibility window.

## 8. User experience

Enhance the standalone AR navigation; do not build a second financial store in the suite shell.

1. **Work sources:** searchable event/source list with freshness, approval progress, ready amount and missed
   billing badge.
2. **Billing summary:** unique workers and records, mutually explained counts, raw/markup/billed internal
   totals, source freshness and disabled-generate explanation.
3. **Draft review:** original/supplement label, exact covered records, markup origin and overrides, template
   selector, customer-cost visibility warning, stale-source conflict and explicit issue confirmation.
4. **Invoice family:** original, supplements and replacements together with amounts, dates, covered count,
   document delivery, accounting sync and correction/rebilling state.
5. **Exceptions:** missed billing, stale source, post-issue payroll correction, mapping and provider failure
   with owner, SLA, retry/reconcile action and evidence.
6. **Settings:** customer billing policies, markup rules, templates, numbering preview, delivery mode,
   missed-billing duration and accounting mappings.

Every page includes loading, empty, stale/partial source, denied, invalid, concurrent conflict, dependency
unavailable, retryable, terminal and success states. Raw cost is visually and API protected by permission;
hiding a column is insufficient.

## 9. Accounting and delivery adapters

QuickBooks Online is a provider adapter, not a direct database dependency. The adapter requires real OAuth
consent, encrypted/secret-manager credentials, least scopes, connection health, explicit company/realm,
customer and item mapping, stable idempotency, bounded timeout/retry, rate-limit handling, durable external
IDs/receipts, webhook verification, reconciliation and disconnect/rotation behavior. The repository's stub
QuickBooks inventory cannot satisfy this requirement.

Invoice issue commits even when the accounting provider is unavailable. A worker pushes after commit and
records `QUEUED`, `IN_PROGRESS`, `SUCCEEDED`, `RETRYING`, `REVIEW_REQUIRED` or `FAILED_TERMINAL`.
Timeout-after-provider-commit must reconcile before retry. An externally paid invoice blocks automated
void/rebilling and opens review for credit/refund/accounting disposition.

Delivery follows the same separation. `READY_TO_SEND` causes no external send. `AUTO_SEND_ON_ISSUE`
enqueues delivery after commit using the snapshotted policy. Delivery failures do not fabricate success or
change invoice issuance; they create retryable exceptions and observable status.

## 10. Backward-compatible rollout and impact

| Area | Impact | Compatibility/control |
| --- | --- | --- |
| Existing manual invoices | Low | Event/family/source/template fields are nullable. Existing IDs, numbers, snapshots and v1 APIs remain readable and immutable. |
| Invoice issue transaction | High | Extend only when source allocations exist; retain the legacy path and regression-test byte-equivalent totals/numbering/event behavior. Feature flag and tenant cohort activation guard the new branch. |
| Database | High | Reconcile 000003/000004 deployment first; apply additive migrations, provenance backfill, constraints as `NOT VALID` then validate, and roll forward rather than editing history. Backup/restore and mixed-version rehearsal required. |
| Standalone source entry | High | Module-owned commands, approval, lineage and correction behavior must be certified without a WhooCrew dependency. The later client replica separately certifies its external adapter. |
| Existing event consumers/metering | Low | Continue one unchanged `ar.invoice.issued.v1` per issued invoice. Publish separate new events to avoid payload and billing-count drift. |
| UI/navigation | Medium | Extend the standalone product. Suite routes remain explicitly unavailable until they proxy the certified API with real identity and no local fallback. |
| Security/RBAC | High | Add `ar.work-sources.read`, `ar.invoice.generate`, `ar.costs.read`, `ar.markup.manage`, `ar.markup.override`, `ar.templates.manage`, `ar.invoices.void`, `ar.invoices.release-rebilling`, `ar.accounting.manage`, `ar.accounting.retry`, and `ar.billing-exceptions.manage`. Deny by default and test role combinations. |
| Financial reporting | High | Supplemental families, voids and replacements affect aging and revenue views. Reports must use immutable issued/credit/void dispositions and cannot treat a released record as new revenue without relationship context. |
| Privacy/classification | Medium/High | Worker identity and raw payroll cost are confidential. Minimize copied fields, mask logs/events/exports, define retention/legal hold and restrict customer PDFs. |
| Operations | Medium/High | Add source freshness, reservation age, overdue-unbilled, correction backlog, provider queue/retry/DLQ and reconciliation metrics, alerts and runbooks. |
| Performance | Medium | Add tenant/work-source/status and open-exception indexes; avoid count-per-row queries. Test 500-record event generation, large families, burst approvals and noisy tenants. |
| Dynamic configuration | High | GigaLibs freeze requires WI-OI-039-backed category labels, optional fields, layouts and templates. Financial inputs, precedence, state transitions and external actions stay code-governed. |

Rollout sequence: deploy schema and read paths dormant; create/reconcile persisted certification records;
compare counts/costs without creating invoices; enable summaries for an internal tenant; enable draft generation;
enable issue for a canary tenant; then enable delivery/accounting separately. Every activation is reversible
by pinning the prior application and leaving additive data readable. Issued financial snapshots are never
rolled back or rewritten.

## 11. Implementation slices and exit evidence

| Slice | Implementation | Exit evidence |
| --- | --- | --- |
| EB-00 baseline reconciliation | Inventory real consumers; qualify 000003/000004; update migration runner/manifest; quarantine or remove unused suite in-memory paths from production bundles | Clean install and upgrade from 000002/000003/000004, checksum/schema match, legacy E2E unchanged, production-data audit passes |
| EB-01 source contract and summary | Module-owned configured entry, work sources, enhanced records, lineage/version handling, summary API/UI | Real isolated PostgreSQL/API/UI journeys; stale-version, tenant, approval, restart and summary reconciliation tests; no WhooCrew API dependency |
| EB-02 markup and source-backed drafts | Policies/rules, calculation snapshots, reservations, generate command and review UI | Precedence/flat/percentage/rounding/permission tests; concurrent generation has no duplicates; zero eligibility blocked server-side |
| EB-03 invoice families and supplemental issue | Family sequence, original/supplement/replacement relationships, issue extension, lineage event and family UI | Exact 26-then-4 plus later 31st-record test, unlimited-round property test, restart/retry/concurrency/immutable-snapshot evidence |
| EB-04 missed billing and controlled rebilling | Scheduled reconciliation, exceptions, void and separate release workflow, correction cases | Aging threshold/dedup/ownership tests; void does not unlock; authorized release and linked replacement; denied/paid/unknown cases |
| EB-05 templates, numbering and delivery policy | Immutable template versions, token compiler/collision checks, selected snapshots and ready/auto-send states | Legacy numbering unchanged, concurrent uniqueness, injection/XSS/PDF validation, template-version immutability and delivery-state tests |
| EB-06 accounting adapter | OAuth connection, mappings, push attempts, retries, receipts, webhooks and reconciliation | Real provider sandbox; revoked scope/rate limit/timeout-after-commit/duplicate webhook/mapping failure/paid-void tests; no fake success |
| EB-07 G5 verification/UAT | Full migration, RBAC/tenant, security, performance, accessibility, resilience, backup/restore and manual role journeys | No P0/P1 defects; two-minute representative-user result; independent Finance/Security/QA review and named Product acceptance |

WI-OI-013 remains the only active Build item. These slices cannot enter Build until IAM clears the required
gate and the SDLC orchestrator explicitly moves one AR slice to `Ready`/`In Progress`.

## 12. Acceptance and negative test matrix

- Event with 30 records: 26 approved and 4 pending. Summary is `30/26/4/0/26`; original draft reserves
  exactly 26, issue locks them, later approval changes ready count to 4, supplemental 1 contains exactly 4.
- A 31st approved record added later produces supplemental 2; repeated rounds do not reuse a record.
- Two users generate simultaneously from the same summary version: one succeeds, one receives a conflict;
  there is one active allocation per source record and no split-brain family sequence.
- Zero ready records disables the button; a direct API request returns `NO_ELIGIBLE_RECORDS` and writes no
  draft, allocation, number, audit success or issuance event.
- Pending/rejected, incomplete-cost, wrong-currency, stale-version and blocked-correction records never enter
  a draft and explain their exclusion without leaking unauthorized worker/cost details.
- Markup tests cover line override, category rule, customer default, missing rule, percentage, every approved
  flat basis, negative/overflow values, rounding boundaries and raw-cost permission/customer-PDF policy.
- Replayed or stale commands do not duplicate or regress state. A newer pre-issue record correction
  invalidates a stale draft. A post-issue correction creates a review case without mutation.
- Void leaves allocations locked. Unauthorized release is denied. Authorized release records two actors if
  policy requires, and replacement invoice links to the void. Paid/unknown external state blocks release.
- Template update creates a new version; previously issued documents render from the old snapshot. Invalid
  merge fields, unsafe markup and missing assets fail validation.
- Number pattern preview and activation reject invalid tokens, excessive output, tenant collisions and unsafe
  reset policy. Concurrent original/supplement issue remains unique.
- Provider tests cover unavailable connection, missing mapping, invalid/revoked credential, insufficient
  scope, rate limit, timeout before/after provider commit, retry, webhook replay, mismatch and reconciliation.
- Tenant A cannot infer Tenant B work sources, counts, costs, policies, families, exceptions, mappings or
  provider IDs. Every new permission has allowed and denied API tests.
- Persistence survives API/worker restart, backup/restore and supported upgrade; source counts, allocations,
  family links, invoice totals, audit and provider receipts reconcile afterward.

The two-minute target is measured from opening a fresh event summary to a successfully created draft or
issued invoice, as Product chooses. Test setup time, source outage and human approval wait must be defined,
not silently excluded after measurement.

## 13. Observability and business measures

Technical metrics: record-entry/import failures, stale work sources, summary latency, generate latency,
reservation conflicts/age, issue latency, family depth, outbox lag, provider attempts/retries/DLQ,
reconciliation mismatches and permission denials. Logs/traces carry tenant, correlation, work-source,
family and invoice IDs but omit worker names, raw costs, tokens and provider payloads.

Business measures: eligible-to-draft time, approved records unbilled past threshold, duplicate-allocation
constraint violations, source-to-invoice reconciliation rate, original/supplement counts, manual markup
override rate, correction backlog age, delivery success and accounting-sync success. Test data is excluded
from customer value reporting.

Release alerts include any duplicate-allocation attempt, nonzero unreconciled source-to-invoice count,
stale source beyond policy, old active reservation, overdue unbilled record, correction SLA breach,
provider reconciliation mismatch and family/number sequence invariant failure.

## 14. Human decisions required before Ready

| Decision | Recommended safe default | Required owner |
| --- | --- | --- |
| Standalone record ownership, approval and correction semantics | Required before the GigaLibs slice; WhooCrew keys/owners are decided only for the later client adapter | Product + Finance + Architecture |
| Meaning of a billable record and worker count | Treat each approved worker/shift as the allocation unit; display unique workers separately | Product + Payroll/Finance |
| Flat markup basis and currency behavior | Per source-record line in invoice currency; prohibit implicit FX | Finance |
| Customer PDF raw-cost visibility | Hidden by default; explicit template version required to expose | Product + Finance |
| Draft reservation expiry/recovery | Configured expiry with warning and audited release; never expire issued allocations | Product + Finance + SRE |
| Void/rebill approval | Explicit release; two-person approval above a defined amount | Finance + Security |
| Delivery mode | `READY_TO_SEND` by default | Product + Finance |
| QBO scope and trigger | P1, manual push initially; promote auto-sync after reconciliation evidence | Product + Finance + Integration |
| Externally paid correction | Review requiring finance disposition; no automated provider void/rebill | Finance |
| Tax responsibility | Keep event billing tax-neutral until jurisdiction/legal decision; do not activate generic tax previews | Finance + Legal/Product |
| Number reset/gap/legal policy | Preserve current monotonic series until approved per jurisdiction | Finance + Legal/Product |
| Two-minute metric boundary and representative volume | Measure 30 and 500-record events with an uninvolved billing user | Product + QA/SRE |

Until these decisions and independent reviews are recorded, the plan is implementation-ready analysis but
the feature and the full AR module remain `No-Go` for production.
