# Value-first all-module release program

Date: 2026-09-15  
Program work item: WI-OI-041  
Status: In Progress at program G0-G1; no module acceptance or production release authority  
Current implementation stream: WI-OI-039 only

## Owner directive and outcome

The repository owner directed GigaLibs to move every claimed product module to a genuine `RELEASED`
state and make each released composition deployable both to an approved cloud environment and to a
customer-managed machine or cluster. The program prioritizes modules that return cash, avoid cost or
remove measurable worker time. A module without a named client outcome and measurable value hypothesis is
sequenced last and remains technically contained until its own gates pass.

This directive authorizes the program and its planning/evidence work. It does not waive G0-G7, activate a
second Build item, accept security or financial risk, authorize external provider writes, or permit an
agent to self-approve a release. Named humans retain product, domain, security, risk and release decisions.

## Meaning of 100 percent and RELEASED

A module is 100 percent only for an explicitly accepted release profile. All three dimensions must be
reported separately; they must not be averaged into one favorable percentage:

1. **Product and engineering completeness:** every accepted role/action is connected through UI, API,
   authorization, module-owned persistence, transaction, events/providers, reconciliation, audit and
   operations, with no production-reachable mock or fake success.
2. **Release completeness:** applicable G5 and G6 security, tenancy, migration, recovery, accessibility,
   performance, resilience, supply-chain, UAT and human-approval evidence passes for an immutable artifact.
3. **Observed value completeness:** G7 evidence measures the real client result and excludes test data,
   unverified source data, duplicate attribution and reversals.

Repository inventory does not have to be exposed. A package or screen outside accepted scope is complete
for a release only when it is explicitly quarantined/contained and absent from customer claims. Only a
module with canonical `RELEASED` evidence may appear as usable in that release composition.

## Client-value gate

The default product admission threshold is at least USD 100 net verified benefit per tenant in the first
30-day observation window, or verified worker time removed when the client has not supplied an approved
loaded hourly rate. Product may approve a different currency, observation window or threshold for a named
segment, but the decision and formula must be versioned before Build.

```text
verified net value
  = reconciled cash recovered
  + finance-approved cost avoided
  + verified hours removed * client-approved loaded hourly cost
  + approved working-capital benefit
  - provider and incremental operating cost
  - reversals and duplicate attribution
```

Detected exposure, a queued action, a temporary hold, a generated report, a workflow completion or an
estimate is not realized value. Headcount savings count only when the customer actually removes payroll,
contractor or overtime cost; otherwise GigaLibs reports capacity returned in hours. Supporting platform
modules inherit contribution evidence from the completed business outcome and do not claim the same value
again.

Before a module enters Build it must name the client/pilot, baseline period, worker role, current steps and
time, volume, error/rework rate, authoritative source, intended terminal outcome, formula owner and expected
measurement method. If these cannot be supplied, the module remains in discovery or the last delivery wave.

## Architecture and delivery contract

Every module follows the repository SDLC and completeness standard plus these program rules:

- preserve one active implementation module; discovery, independent review and operations preparation may
  overlap without introducing dependent production behavior;
- preserve ADR-0001 service ownership and ADR-0002 guarded extension boundaries;
- keep the Next.js application as authenticated web/BFF, not a second business system of record;
- give every canonical business concept exactly one API, schema/migration and event owner;
- use server-derived identity, tenant, entitlement, permission and object authority;
- use forward migrations, compatibility windows, restore and forward-fix evidence; never `db push` a
  release schema or edit an applied migration;
- commit canonical state, audit and outbox atomically; require inbox/deduplication, bounded retry, DLQ,
  reconciliation and operator recovery where asynchronous;
- use non-returning secret references and one accepted provider adapter at a time;
- render explicit loading, empty, stale, denied, conflict, unavailable, retry, recovery and success states;
- keep certification records isolated, attributable and excluded from usage/value reporting; and
- release immutable artifacts only after independent evidence and named human authorization.

## Deployment profiles required for each released module

Each module must publish a versioned release manifest identifying its dependencies and supported profile.
Both required profiles use the same source and artifact digest.

### Managed cloud

- immutable OCI images and locked dependency graph;
- reviewed Kubernetes/Helm or accepted equivalent deployment and infrastructure definitions;
- external PostgreSQL/object storage/broker/secret manager bindings where applicable;
- least-privilege workload identity, network policy, TLS, ingress and egress allowlists;
- expand/backfill/switch migration job, readiness/startup probes, autoscaling and disruption behavior;
- centralized logs, metrics, traces, SLOs, alerts, backup/PITR and restore/failover rehearsal; and
- canary/cohort rollout, halt criteria and forward-fix procedure.

### Customer-managed machine or cluster

- pinned Compose and/or supported Kubernetes bundle with offline/air-gap artifact inventory where accepted;
- prerequisite and capacity checker, explicit ports, storage paths and certificate/hostname inputs;
- credential generation/import with no embedded defaults;
- install, upgrade, backup, restore, rollback/forward-fix and uninstall-with-data-retention procedures;
- health diagnostics and a redacted support bundle;
- architecture/OS/database/version compatibility matrix and upgrade window; and
- license, SBOM, signatures, provenance and operator runbook.

An installation script, container start or HTTP 200 proves deployment mechanics only. The complete module
outcome and operational recovery must pass in each claimed profile.

## Value-first release sequence

| Wave | Implementation sequence | Client result and value evidence | Entry/exit rule |
| --- | --- | --- | --- |
| 0 | Finish WI-OI-039 and close the applicable WI-OI-013 release blockers | Safe configuration and authority foundation; no standalone ROI claim | PostgreSQL recovery, multi-instance convergence, AR snapshot boundary, independent reviews; IAM remains No-Go until its external/human evidence passes |
| 1 | Accounts Receivable, WI-OI-019 | Invoice preparation/collection hours, earlier reconciled cash and working-capital benefit | Customer -> immutable invoice -> delivery -> payment/allocation -> credits/voids -> aging/reconciliation; 30-day value observation |
| 2 | One Connector Hub adapter -> Data Contract -> Rule Pro -> Workflow/Action Gateway -> Accounts Payable | AP handling/rework hours and independently verified duplicate/overpayment prevention | Each dependency reaches Review before the next enters Build; final provider effect has receipt/reconciliation |
| 3 | Spend Management | Expense/approval hours, policy leakage and confirmed subscription/vendor cost removed | Budget/expense -> approval -> actual disbursement/accounting receipt -> reconciliation |
| 4 | Autonomous Recovery | Reconciled credit/cash and assurance-analyst hours | Start in shadow mode; only finance-confirmed recovered value counts; no autonomous write before accepted supervised evidence |
| 5 | AR/AP communications, document intake/OCR and e-signature for an accepted journey | Handling/data-entry time and replaced provider cost | One real channel/storage/extraction/signature provider, consent, receipt, correction and recovery |
| 6 | Tax and Multi-Currency for accepted countries/currencies | Preparation/reconciliation hours, verified reclaim or fee/spread reduction | Move earlier only when required by the selected AR/AP release; no global legal/tax claim |
| 7 | CMMS/EAM for a named maintenance pilot | Technician planning time, parts variance and observed downtime reduction | WI-OI-038 G0-G3 acceptance, isolated migration rehearsal and request-to-restoration outcome |
| 8 | Reports, Analytics, Value Ledger and Metering generalized from released facts | Reconciliation/report preparation time and defensible outcome proof | Every number drills into authorized source evidence; no invented financial statements or double-counted value |
| 9 | Marketplace, Solution Packs, Demo Lab and Infrastructure Broker | Installation/support time and time-to-first-verified-outcome | Only packages composed from already certified modules and deployment profiles |
| 10 | Geospatial, Ontology, generalized Saga, broad AI/provider catalogues and other demand-led inventory | Named pilot-specific value | Last unless a named client baseline and accepted outcome moves the item through G0-G3 |

## First execution packet

WI-OI-039 remains the sole Build stream. Its next exit packet is:

1. Preserve AR Customer and Invoice Draft as inspection-only until DC-06 owns validated extension values
   in the AR transaction and immutable issued-invoice snapshots.
2. Run clean/upgrade/restored PostgreSQL 16 certification in explicitly disposable databases.
3. Prove two control-plane replicas converge on publication/activation/rollback, including lost/delayed
   invalidation and authoritative manifest resync.
4. Run the now-aligned portable manifest/OpenAPI and named v1 response suite in the separate Java client,
   repeat the passing local 250-field/concurrent load
   profile in both deployment targets with independently accepted budgets, complete WCAG 2.2 AA, and
   exercise the statically verified metrics/dashboard/alerts with an independent operator in both profiles.
5. Record independent Architecture, Security, Backend/Data, Web/Accessibility, QA, Domain and Product
   decisions. No agent records acceptance for those authorities.
6. After the handoff, the owner explicitly returns WI-OI-019 to Build for AR-01 through AR-06 and the
   cloud/customer-managed release packets.

## Module release packet

Every module maintains one evidence packet containing:

- accepted outcome, roles, exclusions, FR/NFR and value baseline;
- authoritative owner and UI/API/schema/event/provider trace;
- threat, permissions, classification, retention and tenant-isolation design;
- migrations, compatibility, representative data, backup/restore and recovery;
- transactions, idempotency, concurrency, outbox/inbox, retries, DLQ and reconciliation;
- complete UI states, accessibility and supported browser/client matrix;
- logs, metrics, traces, SLOs, alerts, runbooks and support diagnostics;
- unit, contract, real-infrastructure integration, negative RBAC/tenant, E2E, load, resilience and UAT;
- immutable artifacts, SBOM, signatures, provenance and both deployment-profile evidence;
- known limitations and named independent/human decisions; and
- G7 observed value calculation with source drill-through, costs, reversals and no double counting.

The final decision for each exact artifact/profile is `Go`, `Conditional Go` for approved lower-risk
contained gaps only, or `No-Go`. Any P0/P1, fake success, unsafe migration, cross-tenant path, unreconciled
external/financial effect or missing required authority is `No-Go`.

## Verification baseline

### Current verified repository baseline — 2026-09-16

The current working tree passes `pnpm build` (100/100 Turbo tasks), `pnpm test` (58 TypeScript files / 559
tests plus 4 Python execution-plane tests), all six mandatory static audits, both Configuration audits, workflow-platform typecheck,
194 containment regressions, 69 authentication-boundary regressions, 4 privacy-inventory regressions and
`git diff --check`. The audits currently cover 110 quarantined roots, 88 active manifests, 12 controllers,
36 providers, 88 page routes and 80 static internal links. The SDLC audit still reports WI-OI-039 as the
only Build item and retains the 44/100 planning estimate.

This repair pass also restored fail-closed containment around unaccepted Event Fabric, Saga, Governor,
SCIM, locale-mutation and Workflow Studio capabilities; replaced five unsafe Workflow Studio pages with an
explicit unavailable state; quarantined three incomplete Communications/Textfly applications; removed
unclassified upstream exception disclosure; completed the changed Prisma portability inventory; and added
disposable-database guards to the Configuration Studio certification scripts. Prototype and work-in-progress
sources were preserved under `scratch/` and removed from the production runtime graph.

These results establish a safe green repository baseline, not a module release. After Docker became
available, the bounded PostgreSQL 16 drill replayed all 35 migrations, confirmed generated-client
compatibility and zero physical-schema drift, preserved 112 absolute-time columns, created and restored a
420,338-byte same-major custom backup with matching record and migration integrity, and removed both
disposable databases plus the temporary dump. A separate two-replica drill passed activation across
replicas, offline-replica restart/resynchronization, rollback across replicas and outbox publication. WI-OI-039
also passes a 33→35 forward upgrade that preserves representative semantic state and the active manifest
across an application restart. A guarded local PostgreSQL-container restart now preserves active
configuration/value state, returns sanitized retryable 503s during the interruption and recovers reads and
writes through the same API process. A bounded local two-tenant performance run passes at 250 fields, 100
persisted primary records, 16 competing edits and second-tenant write pressure; all provisional read p95
measurements stayed below two seconds. The language-neutral manifest now validates real compiler output and
OpenAPI matches all 32 implemented Configuration controller operations and named v1 responses are strictly
projected before serialization; separate Java-client conformance remains. It still needs representative-volume WAL/PITR and deployment-profile
recovery/replica evidence; deployment-profile performance/failure/accessibility evidence; both deployment-profile
packets; independent reviews; and named human acceptance. No module status moves to `RELEASED` from this
baseline.

Every module runs its slice-specific certifications and the repository gates:

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

Static gates, test counts and screenshots are supporting evidence. They do not independently move a module
to `RELEASED`.
