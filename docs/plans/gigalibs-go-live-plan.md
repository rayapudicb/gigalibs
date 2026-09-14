# GigaLibs uncompromised go-live plan

Date: 2026-09-10  
Planning authority: WI-OI-036/037 audit evidence and the adopted G0-G7 SDLC  
Release status: **No-Go**

## 1. Executive decision

GigaLibs has **zero production-authorized modules today**. The current local UAT surface contains seven
tenant capabilities plus Platform Control Tower and Platform Users & RBAC. “Available for controlled local UAT” is not
production certification. The canonical work registry still places WI-OI-013 in progress and requires
external-provider evidence, PostgreSQL 16 backup/restore rehearsal, security/QA/product review and human
release approval.

The statement “8 modules are active and certified in UAT” must therefore be replaced by:

- 2 platform capabilities are locally available: Tenant & Access Administration and Personal Security.
- 5 tenant business capabilities are in review: Execution Runs, Exceptions & Recovery, Approval Queue,
  Business Value Ledger and 3-Way Match AP.
- 1 global operator capability is in review: Platform Control Tower.
- none has passed G6 release authorization or G7 production observation.
- Personal Security now includes profile update, current-password change and one-time password recovery.
  Email-change verification, WebAuthn and device/session self-management remain incomplete.

The portfolio count must also be normalized. The canonical catalogue contains 30 capability entries.
Broker infrastructure, dead-letter queue and metering are submodules of platform operations; Dynamic Forms
is a submodule of the configuration platform. Counting routes and submodules as independent products causes
the proposed “21 contained modules” list to contain 23 items and produces a misleading total of 31.

## 2. Non-negotiable release policy

A module may be exposed to a paying tenant only when all of the following are true:

1. Its business outcome and supported scope are accepted, with explicit exclusions.
2. UI, API, server authorization, tenant isolation, domain rules, PostgreSQL persistence, jobs/providers,
   audit and telemetry form one tested vertical slice.
3. Every input has attributable source lineage. A database row alone does not prove legitimate data.
4. There is no production-reachable fixture, default tenant, simulated provider result, fabricated success,
   silent fallback or swallowed persistence error.
5. Money, permissions and external actions are transactional or idempotent and have durable receipts,
   retry, uncertain-result handling and reconciliation.
6. Clean install, upgrade, backup, restore and forward-recovery rehearsals pass on the supported PostgreSQL
   version and representative data volume.
7. Positive and negative tests pass for platform owner/admin/auditor, tenant admin, manager, member, viewer,
   suspended user, expired trial and two-tenant object isolation.
8. Loading, empty, validation, denied, conflict, dependency failure, retry, stale and recovery UI states are
   usable and meet WCAG 2.2 AA.
9. Security, supply-chain, performance, resilience, observability, alerting and runbook gates pass with no
   open P0 or P1 defect.
10. Independent Security, QA and Product reviewers approve the evidence, followed by named human release
    authorization.

Passing compilation, unit tests, an HTTP 200 response or a browser screenshot never satisfies these gates.

## 3. Mandatory release order

### Gate A — authority and SaaS control plane

Complete WI-OI-013 before enabling another module:

- personal profile read/update, current-password change and secure password recovery;
- global user directory, user status lifecycle and platform-role grant/revoke with last-owner protection;
- tenant member invite, role/custom-role assignment, suspension and deprovisioning;
- tenant registry, plan selection, time-bounded trial, entitlement enforcement and audited conversion;
- real payment-provider boundary or an explicitly manual conversion workflow with no claimed payment;
- subdomain DNS/TLS activation worker and evidence, rather than a reserved hostname only;
- requested isolation provisioning and verified regional binding, rather than desired-state labels only;
- OIDC provider interoperability, external identity link/unlink/deprovisioning, SAML and WebAuthn scope
  decisions;
- PostgreSQL 16 migration plus backup/restore, secrets/key rotation, support recovery and independent UAT.

Exit: a fresh person can register, choose a valid plan/trial, create or join a tenant, sign in, manage their
profile and security, invite users, exercise the permitted modules, be denied elsewhere, expire/convert or
be suspended, and recover access. Every state must survive refresh and restart and be visible in audit.

### Gate B — universal configuration core

Build WI-OI-039 as a platform dependency, not as an isolated form designer:

- entity, field, type and accessible component registries;
- immutable schema/layout versions, tenant overlays, compatibility checks and staged activation;
- server-side field permissions, classification, masking, export and search policy;
- typed JSONB extension values plus approved index projections;
- module adapter contract, atomic writes, optimistic concurrency, snapshots and transactional outbox;
- preview, diff, publish, rollback/last-good recovery and dev-to-staging-to-production promotion.

Exit: two tenants can publish different safe fields for a low-risk entity; real values persist through the
owning module API, permissions hold, export/masking works and rollback/restore is demonstrated. Arbitrary
DDL, SQL, JavaScript and component imports remain prohibited.

### Gate C — first commercial outcome: universal invoicing and AR

Complete WI-OI-019/035/040 as the first paying-customer vertical:

- customer and billing configuration;
- approved work-source intake and eligibility summary;
- immutable invoice issue, PDF/template snapshot and controlled delivery;
- supplemental invoice families, markup precedence and missed-billing control;
- void/rebill, credit, payment allocation, aging and collections;
- accounting mapping, external paid-invoice correction and reconciliation;
- dynamic non-financial invoice attributes without silently changing money/tax behavior.

Exit: an accepted source record progresses through invoice, delivery, payment/credit and reconciliation,
including the “26 approved now, 4 approved later” scenario, with no duplicate or missed billing.

### Gate D — integration and durable automation foundation

Implement one real provider path through Connections, Data Contracts, Rules, Workflows, Approval,
Exceptions and the external Action Gateway. Do not build broad studios first and hope they connect later.

Exit: a provider record is authenticated, checkpointed, validated, versioned, evaluated and processed by a
pinned durable workflow. Retry/replay cannot duplicate effects; approvals and provider receipts are real;
uncertain outcomes reconcile.

### Gate E — finance expansion

After Gates A-D and AR production observation, release Spend/AP, Tax, Currency/Treasury and Autonomous
Recovery one at a time. Each needs an authoritative domain source and finance reviewer. A narrower AR
release may exclude tax or foreign currency; claiming either moves its bounded certification before AR.

### Gate F — physical operations, documents and intelligence

Release CMMS first as a bounded maintenance lifecycle, then Documents/OCR, E-Signature, Geospatial and
Ontology. Analytics and Reports follow authoritative event and metric lineage. Solution Packs and the
Marketplace are last because they may only compose capabilities already certified at compatible versions.

## 4. Module and submodule completion matrix

| Capability | Current truth | Required business outcome before release | Principal stop-ship work |
| --- | --- | --- | --- |
| Platform Control Tower | Review/local UAT | Govern global users, tenants, plans, entitlements, lifecycle and infrastructure evidence | Real plan lifecycle, provider workers, destructive tenant-lifecycle UAT and independent review |
| Tenant & Access Administration | Available locally | Tenant admin can manage membership and tenant policy safely | Complete deprovisioning, external identity lifecycle, SAML/WebAuthn decisions, independent review |
| Personal Security & Profile | Review/local UAT | User updates profile, changes password, recovers access and reviews/revokes sessions | Email verification/change, WebAuthn, session/device self-management and independent review |
| Execution Runs | Review/local UAT | Durable pinned execution resumes, retries and cancels without duplicate effects | Durable workflow owner, leases, idempotency, compensation and load/failure evidence |
| Exceptions & Recovery inbox | Review/local UAT | Operators triage, assign, resolve and reopen an evidenced exception | Full source/action linkage, concurrency, SLA/escalation and recovery UAT |
| Approval Queue | Review/local UAT | Authorized approval changes the exact pending action once | Separation of duties, stale/duplicate decisions, delegated authority and action linkage |
| Business Value Ledger | Review/local UAT | Accepted value traces to source, decision, action, receipt and finance approval | No self-asserted value, reversal/correction, reconciliation and finance acceptance |
| 3-Way Match AP | Review/local UAT | PO, receipt and invoice produce governed match/exception/action evidence | Representative finance UAT, action/payment boundary, reconciliation and release review |
| Accounts Receivable | Standalone review; suite-disabled | Issue, deliver, collect/reconcile and report a correct invoice | Suite IAM/tenant integration, PDF/email, payments, credits/voids, aging and full event-billing scope |
| Spend Management & AP | Contained | Expense/supplier claim reaches approval and real reimbursement/payment evidence | Cards/provider scope, policy source, outbox consumer, tests and tenant-complete persistence |
| Tax Configuration | Contained | Versioned decision for an explicitly supported jurisdiction | Remove zero-tax fallback, authoritative rates/exemptions, effective dates and domain review |
| Multi-Currency Treasury | Contained | Precise reproducible conversion/revaluation with rate lineage | Remove hardcoded reports/cross-tenant data, real rate adapter, exponents/rounding and settlement receipts |
| Autonomous Recovery | Contained | Evinced leakage leads through approval to reconciled cash/credit/hold | Remove fabricated scanning/results, tenant scope, real action adapter and receipt-based value |
| Workflow Canvas | Contained | Compose only registered versioned steps into durable execution | Remove simulated steps, implement edges/waits/workers/pinning/retry/compensation |
| Data Contracts | Contained | Reject/quarantine drift before corrupting a domain record | Wire suite UI to canonical API, complete validator semantics and real lineage |
| Distributed Saga | Contained | Coordinate real service actions with durable compensations | Stable participant contracts, leases/timeouts, idempotency and chaos/recovery evidence |
| Connections & Adapters | Contained | One approved provider produces attributable fresh records | Real tests/sync, HMAC/OAuth/secret lifecycle, checkpoints, retry/DLQ and reconciliation |
| Dynamic Forms | Planned submodule | Tenant safely changes allowed fields/layouts without code | Complete Gate B and module adapters; a saved JSON form alone is insufficient |
| Broker Infrastructure | Contained platform submodule | Provision and observe real bounded broker resources | Provider integration, credentials/quotas, idempotent desired/effective state and rollback |
| Dead Letter Queue | Contained platform submodule | Diagnose, authorize and safely replay failed messages | Immutable payload lineage, permissions, bounded replay, poison-message and duplicate-effect tests |
| Platform Metering | Contained platform submodule | Usage reconciles to real runs/providers/storage and invoices | Stable meters, aggregation integrity, limits/alerts, billing reconciliation and dispute correction |
| Module Marketplace | Contained | Activate a compatible certified immutable package for a tenant | Package/version/dependency model, entitlement/billing, staged install/rollback and certification filter |
| Analytics Studio | Contained | Every metric drills to authorized, fresh source lineage | Remove static values, semantic metric ownership, aggregation tests and stale/partial states |
| Reports | Contained | Reproducible authorized report/export from versioned data | Lineage, schedules, object storage, masking/retention and large-volume evidence |
| CMMS Asset Maintenance | Planned | Service request progresses through asset/work/parts/evidence/restoration | Correct work item, complete lifecycle, atomic IoT/PM actions, workers and field UAT |
| Universal Rules | Contained | Deterministic versioned decision with reasons and audit | Fix selection/effective dates/hit policy/audit, safe expressions and boundary tests |
| AI Document Scanner | Contained | Authorized document becomes reviewed structured data with OCR lineage | Real OCR adapter, encrypted storage, confidence/review, retry and retention/deletion |
| E-Signature | Contained | Envelope reaches verified signer outcome and reconciles provider state | Real provider, identity/consent evidence, webhook verification, retry/correction and legal review |
| Geospatial Studio | Contained | Tenant-authorized locations/assets produce a useful spatial decision | Real source provenance, spatial authorization/indexing, empty/error/offline behavior |
| Operational Ontology | Contained | Versioned entities/relations resolve to authoritative operational records | Accepted ownership, mapping/versioning, conflict/drift handling and module integration |
| Solution Packs | Planned | Deploy a compatible immutable accepted outcome package without source edits | Only certified dependencies, ALM promotion, parameters/secrets boundary and rollback |

## 5. Release mechanics for every module

Each module follows the same promotion path:

1. **Contained:** hidden or explicitly unavailable; no entitlement can bypass the gate.
2. **Engineering integration:** isolated environment, real PostgreSQL and real/provider-sandbox dependency.
3. **Independent UAT:** every applicable role and negative/failure/recovery scenario, with attributable data.
4. **Internal cohort:** GigaLibs-controlled tenant, alerts and on-call active, no customer value claim.
5. **Design-partner limited availability:** named tenant, bounded scope, documented exclusions and halt criteria.
6. **General availability:** G6 human approval after the cohort meets agreed SLO, security and data-quality
   thresholds.
7. **Production proof:** G7 observation, reconciliation, restore and incident drills; failed thresholds stop
   expansion and trigger forward recovery.

Trials must expose only modules that have reached the approved customer cohort. A platform role, plan row,
feature flag or tenant entitlement must never unlock a contained module.

## 6. Immediate execution backlog

The next implementation sequence is fixed by dependency:

1. Complete the remaining WI-OI-013 external identity lifecycle, destructive tenant-lifecycle UAT and
   provider interoperability. Profile/password, platform-user/RBAC and owner/auditor browser paths now pass locally.
2. Rehearse PostgreSQL 16 migration, backup/restore and regional/isolation operations.
3. Obtain independent Security, QA and Product acceptance for the authority layer.
4. Move WI-OI-039 through G0-G3 and implement the universal configuration core.
5. Resume the universal AR/invoicing vertical and take it alone through G4-G7.
6. Build the integration/automation chain against that real vertical.
7. Admit one further module at a time based on accepted business demand and dependency readiness.

There is no defensible big-bang path to all modules. Shipping the current catalogue as a full SaaS would
expose known fake-success, identity, source-lineage, provider, recovery and operational gaps and is a No-Go.
