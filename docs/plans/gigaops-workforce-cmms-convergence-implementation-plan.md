# GigaOps Workforce Operations and CMMS convergence implementation plan

Status: Proposed G0-G3 plan; no G4 Build authority  
Workforce work item: `WI-OI-060`  
CMMS work item: `WI-OI-038`  
Current active Build remains: `WI-OI-059`  
Deployment boundary: Local Development first; cloud/external controls deferred without release credit

## 1. North-star outcome

GigaOps becomes GigaLibs' universal workforce-operations product for a tenant operating in any supported
industry or jurisdiction. It manages the people/work relationships, capabilities, availability, demand,
schedules, assignments, time evidence, approvals and payroll-ready earning results needed to operate work.

CMMS remains the enterprise asset and maintenance product. It manages physical assets, maintenance plans,
meters, parts and work orders. It declares the work, location, time window and capabilities required; it
does not own the worker master or a second schedule.

```text
Control Plane identity / tenant / membership / department / entitlement
                              |
                              v
GigaOps Workforce Operations: resource -> capability -> availability
                              demand -> shift -> booking -> time -> approval
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
CMMS work requirements                 Other demand producers
(asset/work order context)             (retail, warehouse, event,
                                       healthcare, construction, etc.)
             |
             v
Payroll/accounting providers receive approved earning lines through Connector Hub
```

## 2. Non-negotiable product boundary

| Concept | Authoritative owner | Boundary |
| --- | --- | --- |
| Login identity, session, tenant membership, persona, department scope, entitlement | Control Plane | A worker may reference a user, but a worker record is not a password/login authority. |
| Workforce person/resource, employment or engagement relationship, job profile, position, qualification, availability, shift and booking | GigaOps Workforce | One tenant-scoped system of record. |
| Asset, asset hierarchy, meter, maintenance plan, part, maintenance request and work order | CMMS | May reference Workforce requirement/booking IDs; never copies worker truth. |
| Dynamic forms, checklists, tenant fields and tenant terminology | Configuration Studio | Versioned presentation/configuration, not hard-coded SQL jargon. |
| Deterministic scheduling/pay policy evaluation | Universal Rule Engine plus GigaOps-owned policy versions | Rules are effective-dated, explainable and approved. |
| Approval and exception orchestration | Workflow Studio | Durable workflow; no browser-only approval. |
| HRIS, payroll, POS, time-clock and provider connectivity | Connector Hub | Credential references, retry, idempotency, receipt and reconciliation. |
| Data mapping/import | Universal Data Studio | Validates contracts before GigaOps writes domain state. |
| Contract signature | E-Signature module | GigaOps stores the signed-document reference and evidence receipt, not a fabricated hash. |
| Workforce dashboards | Analytics/Reports | Reads published workforce facts; no direct cross-schema query. |
| Notifications | Communications | Shift, approval and exception messages with durable delivery status. |
| Sites, territories, travel/geofence | Geospatial plus GigaOps logical references | Provider-replaceable location intelligence. |
| Statutory payroll calculation, tax filing, payment and remittance | External payroll provider or separately certified future Payroll product | GigaOps produces reviewed payroll-ready earning lines; it does not claim global statutory payroll in the first release. |

## 3. Correct product modules and user journeys

### 3.1 Workforce Setup

- Organization/department linkage from Control Plane.
- Work sites, operating calendars, time zones and cost dimensions.
- Reusable job profiles and positions; never call authorization roles “job roles.”
- Internal employee, agency, contractor, volunteer and vendor-supplied engagement relationships.
- Effective-dated compensation inputs and collective-agreement references.
- Worker import/linking without requiring every worker to have a GigaLibs login.

### 3.2 Skills, Qualifications and Safety

- Capability catalogue, proficiency levels, issuing authority and evidence reference.
- Effective/expiry dates, suspension/revocation and renewal workflow.
- Job/requirement capability rules and hard/soft matching.
- Safety passport and training requirements without industry-specific database names.

### 3.3 Availability and Absence

- Recurring work patterns, availability windows, preferences and blackout periods.
- Leave/absence integration and manager approval.
- Time-zone and daylight-saving-correct calendars.
- Maximum/minimum hours, rest windows and fatigue constraints as versioned policies.

### 3.4 Demand and Scheduling

- A generic `work_requirement` describes what work is needed, where, when, capacity and required
  capabilities. It may originate from CMMS, POS demand, a project, an event or a manual manager action.
- Shift templates create versioned shift instances.
- Booking supports people, crews and deferred pools without treating assets as people.
- Manual schedule board first; deterministic ranked recommendations second; optimization/AI only after
  measured demand and human review controls exist.
- Open shifts, bids, offers, accept/decline, swaps and replacements.
- Conflict prevention for overlap, absence, invalid capability, location/travel and policy limits.

### 3.5 Worker and Manager Self-Service

- My schedule, availability, shift offers, accept/decline, swap requests and time-off requests.
- Mobile-safe clock in/out, breaks, offline queue and server reconciliation.
- Manager coverage view, exceptions, approvals and change history.
- Complete loading, empty, denied, stale, conflict, offline, retry and saved states.

### 3.6 Time and Attendance

- Immutable punch events; derived timecards are projections, not overwritten raw evidence.
- Multiple breaks and overnight/multi-day work; no fixed three-punch limit.
- Device, source, geofence, actor, correlation and attestation metadata.
- Correction request and approval history; no silent edit of approved time.
- Policy exceptions for missed punch, early/late, meal/rest, overtime, no-show and unscheduled work.

### 3.7 Pay Readiness, not false global payroll

- Effective-dated pay agreements, earning codes, premiums, allowances, per diem and cost allocations.
- A versioned calculation run freezes its input set, policy versions and currency precision.
- Explainable earning lines with rule trace and calculation seal.
- Approval/lock/reopen/correction state machine with segregation of duties.
- Provider-specific exports are adapters with official schemas, acknowledgements and reconciliation.
- Tax, deductions, filing, payment and statutory remittance remain external until separately certified.

### 3.8 Workforce Intelligence

- Coverage, open demand, overtime risk, fatigue risk, qualification expiry, absence impact, labor cost,
  utilization and schedule adherence.
- Every metric includes `generatedAt`, `dataThrough`, lineage and an explicit unavailable/stale state.
- No static KPI or fallback value.

## 4. Canonical data model

All operational tables use a non-null `tenant_id`, composite tenant-safe keys, FORCE RLS, created/updated
actor, correlation, status/version and justified retention/classification fields.

### Foundation entities

- `workforce_resources`: schedulable human/crew/pool identity with optional logical `platform_user_id`.
- `work_relationships`: employer/vendor, engagement type, effective dates and legal work location.
- `job_profiles`: reusable definition of work and default capability requirements.
- `positions`: tenant organizational slots linked to job profile and department/site.
- `worker_assignments`: effective-dated link of resource, relationship and position.
- `capability_definitions`, `resource_capabilities`, `capability_evidence`.
- `work_sites`, `operating_calendars`, `resource_availability`, `absence_periods`.

### Scheduling entities

- `work_requirements`: source-neutral demand with source module/type/id and immutable source version.
- `requirement_capabilities` and `requirement_capacity`.
- `shift_templates`, `shift_instances` and `shift_demand`.
- `resource_bookings`: tenant-safe assignment with state/version/idempotency key.
- `booking_status_history`, `booking_conflicts` and `schedule_publications`.
- PostgreSQL exclusion/locking strategy prevents active overlapping bookings.

### Time/pay-readiness entities

- `time_events`: immutable clock/break/correction evidence.
- `timecards`, `timecard_segments`, `time_exceptions`, `timecard_approvals`.
- `pay_policies`, `pay_policy_versions`, `policy_assignments`.
- `calculation_runs`, `calculation_inputs`, `earning_lines`, `calculation_explanations`.
- `payroll_exports`, `export_items`, `provider_receipts` and `reconciliation_exceptions`.

### Compliance/configuration entities

- `jurisdictions`: country/region/local hierarchy with official identifiers.
- `jurisdiction_policy_versions`: effective dates, source/evidence, reviewer and status.
- `tenant_policy_overlays`: contract/union/company rules layered on jurisdiction rules.
- `industry_templates`: optional versioned setup accelerators; never runtime truth by themselves.

## 5. Country and industry strategy

“Any country” does not mean five hard-coded JSON calculators. It means the kernel is jurisdiction-neutral
and only an explicitly installed, reviewed, effective policy version may calculate or block work.

1. No default country, currency, industry or worker classification.
2. Country and region are ISO/master-data references, with subnational/local policy overlays.
3. Industry templates configure terminology, job/capability templates and journeys; they do not alter
   database semantics.
4. A pack has version, effective range, evidence links, author/reviewer, status and compatibility range.
5. Missing or expired policy produces `POLICY_UNAVAILABLE`; it never falls back to US/manufacturing.
6. Legal rules are reviewed content, not agent-generated product truth.
7. Customer agreements and collective bargaining rules layer on top through explicit precedence.

The first certified vertical should be one named jurisdiction and one representative operating model. The
kernel remains global; certification expands pack by pack.

## 6. CMMS handshake

CMMS owns the maintenance work order. GigaOps owns scheduling and booking.

### Commands/events

- `WorkRequirementRequestedV1`: CMMS publishes work order, tenant, location, window, duration, priority,
  capability and headcount requirements after commit.
- `WorkRequirementChangedV1` / `WorkRequirementCancelledV1`: versioned and idempotent.
- `ResourceBookingCreatedV1`, `ResourceBookingChangedV1`, `ResourceBookingCancelledV1`: Workforce facts
  consumed by CMMS.
- `WorkExecutionStartedV1` / `WorkExecutionCompletedV1`: agreed owner and transition rules; no dual write.

All messages carry tenant, event ID, source version, correlation/causation, occurred time and schema
version. Producers use transactional outbox; consumers use durable inbox/deduplication and replay.

CMMS stores logical `work_requirement_id` and `resource_booking_id`. There are no cross-schema foreign
keys or direct Workforce-table reads.

## 7. Security and true SaaS controls

- BFF mints only a signed short-lived `PlatformContextV1`; no raw browser bearer forwarding and no
  caller-controlled tenant header.
- Exact audience, issuer, entitlement, session/auth version and granular scopes are verified.
- Malformed/missing organization scope is `DENIED`; never tenant-wide fallback.
- Example scopes: `workforce.resources.read`, `workforce.resources.manage`,
  `workforce.schedule.manage`, `workforce.time.self`, `workforce.time.approve`,
  `workforce.pay.calculate`, `workforce.pay.approve`, `workforce.exports.manage`.
- Self-service adds object authorization: a worker sees only the resource linked to the authenticated user
  unless an explicit manager scope grants more.
- Every query runs inside a tenant-bound transaction under a non-superuser, non-BYPASSRLS role.
- PII, compensation, health/safety and location data have separate classification and field-level access.
- Export, e-sign and provider calls use credential references, size limits, idempotency, receipts and
  reconciliation.

## 8. Implementation sequence

Only one item enters Build at a time.

### Phase 0 - Truthful containment and governance (`WI-OI-060`, G0-G3)

1. Finish or return `WI-OI-059` from Build before any Workforce/CMMS behavior change.
2. Keep CMMS at `REVIEW`/contained and change GigaOps from false `AVAILABLE` to `CONTAINED` when WI-OI-060
   receives Build authority.
3. Remove unconditional module access and inventory every production-reachable GigaOps mock.
4. Accept the ADR-0003 ownership amendment, permission matrix, data classification and release boundary.
5. Freeze the current uninstalled GigaOps migration chain as prototype evidence; do not apply it.

Exit: one workforce owner, accepted requirements, no ambiguous payroll/compliance claim, approved migration
strategy and named independent reviewers.

### Phase 1 - CMMS core recovery (`WI-OI-038`)

Scope is assets, locations, work orders, PM, meters and parts only.

1. Correct manifest/work-item/lifecycle truth.
2. Create an explicit ordered migration manifest that excludes unapproved workforce/import prototype
   migrations; never edit migrations already installed in a target.
3. Fix TypeScript/auth/import boundaries and separate liveness/readiness.
4. Enforce exact signed context, snake-case org scope, fail-closed scope and least-privilege tenant RLS.
5. Build exact images and verify clean install, supported 1-2 upgrade, two-tenant denial, restart and restore.
6. Connect only real CMMS UI journeys; People/Dispatch remains explicitly unavailable.

Exit: core CMMS can be locally entitled without exposing Workforce screens or fake data.

### Phase 2 - Workforce runtime foundation (`WI-OI-060`)

1. Establish the canonical Workforce schema/module identity and exact Docker runtime.
2. Fail closed on required database, signing, audience, CORS and storage configuration.
3. Add migration job, runtime DB role, RLS binding, live/ready endpoints and schema-version gate.
4. Replace role strings with scopes and add signed-context/session-revocation tests.
5. Add transactional audit/outbox/inbox, structured logs, metrics and traces.

Exit: empty-schema, two-tenant and restart certification passes with no business UI enabled.

### Phase 3 - Worker/job/capability vertical slice

1. Resource directory with optional platform-user link.
2. Work relationships, job profiles, positions and assignments.
3. Capability definitions/evidence/expiry.
4. Real CRUD/search/filter/pagination with conflict versions and audit.
5. Replace GigaOps sample workers and hard-coded classifications with API states.

Exit: Tenant A creates a resource and capability; Tenant B cannot discover it; data survives restart.

### Phase 4 - Availability, demand and scheduling

1. Availability, work patterns, absence and site/territory references.
2. Work requirements and shift instances.
3. Capability/availability/overlap guard using the preserved CMMS allocation logic.
4. Schedule board, open shifts, offers and manager publish action.
5. Conflict, stale-version, dependency-failure and retry UX.

Exit: a manager publishes a real schedule; a qualified worker accepts; conflicting assignment is rejected.

### Phase 5 - CMMS/Workforce integration

1. CMMS creates a versioned Workforce requirement through outbox/inbox.
2. Dispatcher books a qualified resource in GigaOps.
3. CMMS shows the booking without owning/copying the worker.
4. Cancellation, reschedule, retry, duplicate and out-of-order cases reconcile.
5. Deprecate CMMS direct assignment fields through an additive compatibility window.

Exit: asset failure -> work order -> requirement -> booking -> execution status works after service restart
and replay without duplicate assignment.

### Phase 6 - Time and attendance

1. Immutable events, breaks, offline queue and authoritative resync.
2. Timecard projection, exceptions, correction and approval.
3. Device/geofence evidence and privacy controls.
4. Worker self-service and manager approvals with object authorization.

Exit: shift-to-approved-time journey is durable, auditable and recoverable.

### Phase 7 - Policy and pay readiness

1. Versioned policy contract and one reviewed jurisdiction pack.
2. Deterministic rule evaluation with explanation and golden tests.
3. Immutable calculation run and earning lines.
4. Segregated calculate/approve/export/reopen permissions.
5. One sandbox or local file adapter with official contract validation and reconciliation; no tax filing
   claim.

Exit: approved time produces sealed, explainable payroll-ready earning lines and a reconciled export.

### Phase 8 - Industry templates and enterprise scale

1. Retail multi-site demand from POS/forecast connector.
2. Manufacturing shift/line capability template.
3. Warehouse wave/zone template.
4. Construction project/certification template.
5. Healthcare roster template only after domain/legal review.
6. Large-chain hierarchy, regional operations, schedule publication, notification and noisy-neighbor tests.

Exit: the same kernel completes representative retail and one non-retail journey with configuration-only
terminology/template changes and no schema fork.

### Phase 9 - Analytics, optimization and release evidence

1. Publish certified workforce facts to Analytics.
2. Add demand/coverage/cost/qualification-expiry dashboards.
3. Add ranked scheduling recommendations; optimization/AI is advisory and human-reviewed first.
4. Run accessibility, performance, resilience, backup/restore, SBOM/provenance and operator runbooks.
5. Named humans decide Local acceptance; cloud/external release remains a separate gate.

## 9. First business-outcome demonstration

Use a real, isolated Local Development tenant—never hard-coded people or totals:

1. Tenant admin enables GigaOps and selects an explicitly configured jurisdiction/template.
2. Workforce manager creates a site, job profile, worker, capability and availability.
3. Manager creates or receives demand and publishes a shift.
4. Worker accepts the shift and records time.
5. Manager resolves an exception and approves the timecard.
6. GigaOps calculates explainable earning lines using the selected policy version.
7. An export job writes a durable artifact and records a receipt/reconciliation state.
8. A CMMS work order creates another requirement and books the same worker without duplicating the worker
   record.
9. Analytics shows source-backed coverage and cost metrics with lineage/freshness.

## 10. Acceptance checklist

- No GigaOps/CMMS production-reachable sample person, shift, agreement, KPI or payroll result.
- Clean migration and supported upgrade pass for both schemas.
- No module startup under superuser/BYPASSRLS.
- Two-tenant API/database/cache/export/event negative tests pass.
- Browser tenant headers and raw tokens never establish module identity.
- Availability, capabilities, overlap, rest and authorization are enforced server-side.
- Every multi-step write is transactional/idempotent; events publish after commit.
- Worker self-service passes object-level authorization and revocation.
- Time and pay results are immutable/versioned and corrections are linked.
- Jurisdiction policy has effective dates, evidence and named review; missing policy fails closed.
- CMMS never creates a second worker/resource record.
- UI covers loading, empty, denied, stale, conflict, dependency failure, retry and success.
- WCAG 2.2 AA, performance, restart, replay, backup/restore and exact-image evidence pass.

## 11. Explicit non-goals for the first release

- Claiming certified payroll/tax filing for every country.
- Paying workers or moving money.
- Replacing a customer's HRIS as identity authority.
- Autonomous AI schedule publication or payroll approval.
- Cloud/public release, external provider credentials or customer distribution.
- Enabling every industry template before one real vertical slice is complete.

## 12. Benchmark position

The target capability set matches the durable patterns used by enterprise Workforce Management and Field
Service products: worker/HR assignment foundation, availability and absence, skills/certification-aware
scheduling, demand/coverage, time capture, policy exceptions, payroll handoff, manager approval and
mobile execution. Oracle describes this connected scheduling/time/payroll-handoff boundary in its
[Workforce Management overview](https://www.oracle.com/human-capital-management/workforce-management/).
Microsoft's Field Service design similarly separates what work is required from who can do it and when,
then links them with a booking
([Universal Resource Scheduling](https://learn.microsoft.com/en-us/dynamics365/field-service/universal-resource-scheduling-for-field-service)).
GigaLibs' differentiator should be the universal demand contract and native connection between Connector
Hub, Workflow, Rules, Configuration, CMMS and Analytics—not a claim that a few static country JSON files
replace global payroll/legal expertise.
