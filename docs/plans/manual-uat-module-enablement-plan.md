# GigaLibs module enablement and manual UAT plan

Date: 2026-09-11  
Authority: WI-OI-013, WI-OI-036, WI-OI-037 and proposed module work items  
Current status: local UAT in progress; production No-Go

## Why every module is visible but cannot be opened

The `/modules` page is a capability catalogue. Visibility discloses intended scope; it is not access.
Opening a tenant module requires all three controls below to pass:

1. **Completion eligibility:** the control-plane catalogue must mark the module `AVAILABLE` or `REVIEW`
   and `entitlementEligible=true`. Contained and planned modules fail here for every user, including a
   platform owner.
2. **Tenant entitlement:** the selected active or unexpired-trial tenant must have an enabled, unexpired
   entitlement for the exact module key.
3. **User permission:** the current active membership/custom role must contain the permission required by
   the module. A global platform role never supplies a tenant permission.

Platform Control Tower and Platform Users & RBAC use global platform roles instead of tenant entitlements.
This is why `SUPER_ADMIN`, `PLATFORM_OWNER`, or enabling a plan cannot unlock an incomplete business module.

The canonical catalogue currently contains 29 entries. Seven tenant capabilities are eligible for local
UAT. Platform Control Tower is a separate global catalogue capability, and Platform Users & RBAC is an
additional global operator screen. The remaining 21 catalogue entries are contained or planned.

## What can be manually tested now

Use `http://localhost:5180`. Create records with a visible `UAT-YYYYMMDD-<purpose>` name so their origin is
clear. Data created through these UI/API flows is real PostgreSQL UAT data; it must never be included in
customer value reporting.

| Surface | Route | Persona | Manual outcome to verify now | Current limit |
| --- | --- | --- | --- | --- |
| Platform Control Tower | `/platform-admin` | Platform owner/admin; auditor read-only | Register a tenant for an existing user, start/extend a trial, activate/suspend it, change eligible entitlements and record an isolation request | DNS/TLS, payment conversion and dedicated database provisioning remain desired state without providers |
| Platform Users & RBAC | `/platform-admin/users` | Platform owner; admin for non-operator users; auditor read-only | Search real identities, inspect memberships, grant/revoke platform roles, suspend/reactivate, issue and consume one-time recovery | External identity link/unlink/deprovisioning is not yet exposed |
| Tenant & Access Administration | `/settings` | Tenant admin | Invite a user, accept the invitation, change base/custom roles, suspend/reactivate membership, change MFA policy and request/export tenant data | External email delivery, customer IdP interoperability and positive public DNS proof remain open |
| Personal Profile & Security | `/settings/profile` | Every active user | Update profile, change password with the current password, verify old password fails, review role context and exercise TOTP/recovery | Email-change verification, passkeys/WebAuthn and device/session self-management remain open |
| Execution Runs | `/runs` | Permitted tenant roles | Inspect persisted run state/evidence and exercise supported cancel/recovery controls | Workflow authoring is contained, so this does not yet prove a new user-built workflow end to end |
| Exceptions & Recovery | `/exceptions` | Operator/manager roles | Inspect, assign and apply supported recovery to a persisted exception; verify audit/status changes | Complete source-to-exception and external corrective-action receipt chain remains under review |
| Approval Queue | `/actions` | Authorized approver | Approve/reject the exact persisted pending action once; verify stale/repeated decisions fail | Provider execution and complete separation-of-duties scenarios still need certification |
| Business Value Ledger | `/value` | Authorized analyst/approver | Inspect source evidence and exercise supported value-definition/approval behavior | A value record is not proof of collected cash; reversal and finance reconciliation remain open |
| Invoice Matching | `/ap` | Finance roles | Exercise the bounded reference PO/receipt/invoice matching path and inspect findings/evidence | Payment posting/provider reconciliation and full finance acceptance remain open |

For persona testing, do not reuse one super-admin account for every role. Register separate identities at
`/register`, invite them from `/settings`, assign one role per identity, and test each in a separate private
browser session. Use the platform owner only to grant global platform roles.

## Exact steps required to unlock a contained module

A module becomes manually testable only after this implementation sequence is complete:

1. Accept one bounded business outcome and explicit exclusions.
2. Remove default tenants, caller-controlled tenant headers, mock records, fixed dashboards, fabricated
   success, silent fallback and swallowed failures from every production-reachable path.
3. Connect the suite route to one canonical API and PostgreSQL owner; apply a forward migration and verify
   clean install plus upgrade.
4. Enforce current session, tenant membership, module entitlement and action permission on the server.
5. Complete create/read/update/action/result flows, including empty, invalid, denied, conflict, dependency
   failure, retry, uncertain-result and reconciliation states.
6. Persist source lineage, immutable or versioned decisions, audit evidence, idempotency state and external
   receipts. Provider-dependent modules must use a real sandbox/local service, never an invented response.
7. Run API/database and browser UAT for platform owner/admin/auditor, tenant admin/manager/member/viewer,
   suspended user, expired trial and two-tenant isolation.
8. Only then change the canonical catalogue to `entitlementEligible=true`, apply an entitlement from
   Platform Control Tower and expose the link to permitted users.

## Module-level implementation and UAT exit matrix

| Module | Route | Work required before enablement | Manual UAT exit outcome |
| --- | --- | --- | --- |
| Workflow Definitions | `/workflows` | Wire the suite editor to canonical workflow/version APIs; persist drafts/publish state; pin versions; implement edges, waits, retries, leases and compensation; remove simulated node success | Create draft → validate → publish → execute pinned version → fail/retry/resume without duplicate effects |
| Data Contracts | `/data-contracts` | Wire canonical contract/version APIs; complete nested validation and supported JSON Schema semantics; persist drift/quarantine and lineage from actual source events | Publish contract → ingest conforming and drifting records → accept one and quarantine the other with traceable evidence |
| Connections | `/connections` | Wire canonical connection/environment/credential APIs; remove default tenant; add secret reference lifecycle, real health check and permission enforcement | Configure a real local/sandbox source → verify credentials → receive attributable source record → rotate/revoke credential |
| Accounts Receivable | `/ar` | Connect standalone AR to suite IAM/tenant/entitlements; finish customer/invoice CRUD, event/source billing, immutable issuance, PDF/template/version, delivery, payment allocation, credits/voids, supplements and aging | Create customer/source records → issue/deliver original invoice → approve later records and issue supplement → allocate payment/credit → reconcile family and aging |
| Spend Management & AP | `/spend` | Enforce canonical tenant identity; complete cost centers, expense lines/receipts, policy/approval, reimbursement/payment evidence and outbox consumer; remove static travel policy | Submit expense → policy decision → approval → verified payment/reimbursement receipt → reconciliation and audit |
| Tax Configuration | `/tax` | Remove unknown-jurisdiction zero-tax fallback; add authoritative versioned rates/exemptions/effective dates, jurisdiction policy and domain review | Configure supported jurisdiction → calculate exact tax → reject unknown/stale configuration → reproduce decision from pinned source version |
| Multi-Currency Treasury | `/currency` | Remove fixed revaluation/cross-tenant reads; add authorized rate import/provider, rate lineage, currency exponents, rounding, stale-rate rules and settlement evidence | Import approved rate → convert USD/JPY and decimal currencies correctly → reject stale/missing rate → reproduce revaluation |
| Autonomous Recovery Studio | `/recovery` | Replace fabricated scans/totals/status-only recovery with tenant-scoped source analysis, approval, real hold/credit/clawback adapter and reconciliation receipt | Detect an evidenced leakage → approve action → receive real sandbox/manual verified receipt → reconcile recovered/failed amount |
| Universal Rule Studio | `/rules` | Consolidate rule ownership; fix effective-date selection, department scope, hit policy and awaited audit; add safe expressions, versioning and module integration | Author/version/publish rule → evaluate matching/nonmatching/boundary payloads → show reasons and immutable decision evidence |
| Dynamic Form Studio | `/workflows/new` initially, then registered module surfaces | Implement WI-OI-039 component registry, versioned schemas, tenant overlays, safe validation/expressions, change sets, immutable record schema binding and module adapters | Add an allowed tenant field without code → render/edit/search/export it → preserve old records on new schema version → reject prohibited invariant override |
| Connector Hub | `/connections/oauth-studio` | Replace invented READY/test/sync results; implement at least one real OAuth/HMAC provider, encrypted token references, checkpoints, retry/DLQ, idempotency and reconciliation | Authorize provider → introspect actual grants → sync real sandbox records → rotate/revoke → recover failed delivery without duplication |
| Module Marketplace | `/marketplace` | Define immutable certified package versions/dependencies, plan/entitlement/metering link, staged install/rollback and compatibility checks | Install certified version for one tenant → verify only declared migrations/routes/jobs → upgrade/rollback without affecting another tenant |
| Analytics Studio | `/analytics` | Remove static metrics; define governed semantic metrics, source freshness/lineage, authorization, aggregation tests and stale/partial states | Open metric → drill to authorized source records → reproduce total → observe explicit stale/partial behavior |
| Asset & Maintenance (CMMS) | `/cmms` | Accept WI-OI-038 domain scope; complete assets/locations, requests, work orders, labor/parts/costs, transactional stock, meter readings, durable PM worker and restoration evidence | Request work → assign technician → consume parts/labor → complete checklist → verify asset restored and costs/audit updated atomically |
| Geospatial Studio | `/maps` | Bind maps to authorized tenant asset/location sources; add spatial persistence/indexes, layer permissions, freshness and offline/error states | Create authorized location/asset → visualize/filter → make a supported spatial decision → prove another tenant cannot see it |
| E-Signature | `/esign` | Integrate a real sandbox signing provider; persist envelope/version/signer consent, verify webhook signatures and reconcile retry/cancel/decline/expiry | Send envelope → sign/decline in sandbox → receive verified webhook → reconcile final document and evidence |
| Document Scanner | `/scanner` | Add encrypted object storage, real OCR sandbox/local engine, file controls, extraction schema, confidence/review, retry and retention/deletion | Upload attributable document → OCR → correct low-confidence fields → approve structured record → trace and delete under policy |
| Operational Ontology | `/ontology` | Accept entity/relation ownership; add versioned mappings to authoritative records, conflict/drift handling and consuming-module APIs | Define version → map real module entities → resolve relationship → detect stale/conflicting mapping → migrate safely |
| Saga Orchestrator | `/saga` | Use stable participant contracts, persisted state, leases/timeouts, idempotent forward/compensation actions and operator recovery | Complete multi-service transaction → inject participant failure → compensate exactly once → resume after restart |
| Reports | `/reports` | Build from governed data/metric definitions; add parameter/version persistence, tenant/field masking, schedules, object storage and retention | Generate same report twice from pinned snapshot → verify totals/permissions → schedule/export → expire artifact correctly |
| Solution Packs | `/solutions` | Compose only certified immutable module versions; define dependency/parameter/secret boundaries, environment promotion and rollback | Install pack into isolated tenant → validate dependencies → run accepted business scenario → upgrade/rollback without source edits |

## Platform submodules that should not be counted as independent business modules

| Submodule | Parent | Work required | Manual UAT exit |
| --- | --- | --- | --- |
| Broker Infrastructure | Platform Control Tower | Real Redis/RabbitMQ/Kafka provisioning, credentials, quotas, desired/effective state, idempotency and rollback | Provision isolated tenant resources, verify connectivity/quota, repeat safely, then remove/restore |
| Dead Letter Queue | Execution/Platform Operations | Immutable payload lineage, replay permission, poison-message isolation, bounded retries and duplicate-effect protection | Fail a real delivery, inspect exact cause, authorize replay, prove one final effect |
| Platform Metering | Commercial platform | Stable usage events tied to runs/providers/storage, aggregation integrity, limits/alerts and invoice/dispute correction | Produce usage from a real module, reconcile raw events to aggregate and billing record, correct disputed usage |

## Implementation order

1. Finish the remaining WI-OI-013 authority operations: external identity lifecycle, destructive tenant
   lifecycle UAT, PostgreSQL backup/restore and local provider-boundary rehearsals.
2. Implement the WI-OI-039 governed dynamic configuration core and adopt it first in a low-risk profile
   extension.
3. Integrate and complete Accounts Receivable as the first full suite business vertical.
4. Complete Data Contracts, Connections, Rules, Workflow and Saga around that real AR flow.
5. Complete Spend, Tax, Currency and Recovery using the certified source/action chain.
6. Complete CMMS, Scanner, E-Signature, Maps and Ontology.
7. Complete Analytics and Reports from authoritative module events.
8. Enable Marketplace, metering, infrastructure operations and Solution Packs only after their dependencies
   are certified.

There is no safe switch that makes all current routes real. Each catalogue entry must cross the same
UI → API → authorization → PostgreSQL → worker/provider → receipt/reconciliation → visible-result boundary
before it becomes eligible for manual UAT.
