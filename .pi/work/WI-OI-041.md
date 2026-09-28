# WI-OI-041 — Value-first all-module release program

Status: In Progress  
Owner: SDLC Orchestrator / Product Requirements  
Requirements: FR-01–FR-17; NFR-GOV-001–003, NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Product, Solution Architecture, Security & Privacy, Finance/Domain, QA/SDET, SRE, Release  
Gate: G0–G1 program; no additional Build stream, product acceptance or release authorization

## Outcome

Move every explicitly claimed GigaLibs module to an evidence-backed `RELEASED` state, one authorized
implementation stream at a time, for both managed-cloud and customer-managed deployment profiles. The
program prioritizes modules that recover cash, avoid real cost or remove verified worker time. A module
without an accepted outcome and measurable value hypothesis remains contained and is sequenced last.

The canonical execution plan is the
[value-first all-module release program](../../docs/plans/value-first-all-module-release-program.md). It
defines the meaning of 100 percent, client-value admission, architecture constraints, deployment profiles,
release packets and delivery waves.

## Authority and WIP boundary

The owner's 2026-09-15 directive authorizes this program record and its planning, containment and evidence
work. It does not waive G0–G7, authorize external provider effects, accept financial/security risk or allow
an agent to self-approve a release. Named human authorities retain product, domain, security, risk and
release decisions.

WI-OI-039 remains the only active Build work item. WI-OI-041 is a G0–G1 program/control item and does not
create a second implementation stream. After WI-OI-039 reaches its independently accepted handoff, the
owner must explicitly return the Accounts Receivable value stream to Build. Other modules remain in
discovery, review, containment or quarantine until their own entry criteria are met.

## Verified repository baseline — 2026-09-15

The following commands passed on the current working tree:

| Evidence | Result |
| --- | --- |
| `pnpm build` | Pass — 100/100 Turbo tasks; both Next.js applications built |
| `pnpm test` | Pass — 64 TypeScript files / 598 tests and 4 Python execution-plane tests; report coverage uses explicit tenant-local test fixtures rather than a default production tenant seed |
| `pnpm audit:production-data` | Pass — 110 quarantined roots checked |
| `pnpm audit:all-runtime-data` | Pass |
| `pnpm audit:package-dependencies` | Pass — 88 active manifests checked |
| `pnpm audit:api-boundary` | Pass — 12 controllers / 36 providers checked |
| `pnpm audit:navigation` | Pass — 88 page routes / 80 links checked |
| `pnpm audit:sdlc` | Pass — WI-OI-039 remains the sole Build item; planning estimate remains 44/100 |
| `pnpm --dir apps/workflow-platform typecheck` | Pass |
| Focused containment regression | Pass — 194/194 tests |
| Authentication boundary regression | Pass — 69/69 tests |
| Privacy inventory regression | Pass — 4/4 tests |
| `git diff --check` | Pass |

These are repository-health and supporting implementation results. They do not prove a complete business
outcome, either deployment profile, G5/G6 acceptance, G7 observed client value or `RELEASED` status.

## Containment and boundary corrections — 2026-09-15

- Restored fail-closed runtime containment for unaccepted Event Fabric queue/replay, Saga, Governor,
  SCIM, locale mutation and Workflow Studio run-stream/webhook routes.
- Replaced the five customer-reachable Workflow Studio pages with explicit unavailable-capability states;
  prototypes and work-in-progress sources were preserved under `scratch/wi-oi-013-originals` and
  `scratch/wi-oi-041-wip`, outside the production runtime graph.
- Quarantined the three incomplete Communications/Textfly applications with exact workspace and runtime
  registry exclusions; they are source inventory, not released applications.
- Closed infrastructure-exception disclosure in the authenticated upstream boundary so only validated
  request-body errors are returned to callers and unclassified upstream failures produce a fixed 503.
- Completed privacy portability classification for Configuration Studio, Saga and tenant rate-bucket
  models, including the indirect tenant filter for saga steps.
- Added disposable-database guards to the Configuration Studio certification scripts so they reject
  production and non-certification database names.

Containment is an acceptable safe repository state but is not module completeness. A contained module must
later return through its own stable work item, architecture review, implementation and G0–G7 evidence before
it can be exposed or described as released.

## Current release decision

**No-Go for an all-module release.** No evidence in this packet changes an existing module to `RELEASED`.
The immediate release candidate remains WI-OI-039, and its open evidence includes:

1. Representative-volume WAL/PITR and target-profile RPO/RTO evidence. Clean replay/logical restore now
   passes all 35 migrations, generated-client/physical-schema checks and restored integrity. A separate
   33→35 forward upgrade preserves representative semantic state and the active manifest across application
   restart. A guarded local PostgreSQL restart preserves manifest/value state, recovers the same API process,
   sanitizes transient failures as retryable 503s and accepts a post-restart write. Every generated database,
   dump and temporary migration directory was verified removed.
2. Deployment-profile performance acceptance, database/outbox failure injection and WCAG 2.2 AA evidence.
   A bounded local profile now passes at 250 fields with concurrent reads/edits, a 100-record projection and
   second-tenant write pressure against the provisional NFR-PERF-002 read budget. Local two-replica
   activation, missed-notification restart/resynchronization, cross-replica rollback and outbox publication
   also pass; cloud/customer-managed performance and replica rehearsal remain open.
3. Architecture, Security, Backend/Data, Web/Accessibility, QA, affected Domain and Product reviews.
4. Managed-cloud and customer-managed artifact, deployment, backup/restore and operator-runbook evidence.
5. Explicit owner handoff before Accounts Receivable becomes the next Build item.

IAM remains No-Go until its external identity interoperability, operator-controlled DNS/TLS, regional
infrastructure, production-scale recovery and named independent review evidence passes.

## Next execution sequence

1. Schedule and run the WI-OI-039 representative-volume WAL/PITR, host-loss and RPO/RTO rehearsal in each
   target deployment profile; the bounded local database-process restart now passes.
2. Complete WI-OI-039 deployment-profile replica/failure and performance evidence, accessibility,
   dashboard/alert-routing/operator rehearsal and independent review evidence; static wiring and a guarded
   local live scrape now pass their executable observability certifications.
3. Produce the identical-digest managed-cloud and customer-managed deployment packets and obtain the named
   human release decision for that exact composition.
4. Record the explicit WIP handoff and return Accounts Receivable to Build.
5. Complete the AR terminal outcome from customer/invoice preparation through delivery, payment allocation,
   credits/voids, aging and reconciliation; observe its first accepted 30-day client-value window.
6. Admit subsequent modules only in the dependency/value order recorded in the program plan.

## Exit criteria

WI-OI-041 can close only when every explicitly claimed module is either:

- `RELEASED` for a named immutable artifact and supported deployment profile with complete G0–G7 evidence;
  or
- removed from the product claim and demonstrably contained/quarantined from customer use.

There must be no second active Build stream, production-reachable fake success, unowned canonical data,
unreconciled external/financial effect or status inferred from compilation alone.
