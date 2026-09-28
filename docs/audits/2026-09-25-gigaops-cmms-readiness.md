# GigaOps and CMMS convergence readiness audit

Date: 2026-09-25  
Decision scope: bounded Local Development  
Disposition: **No-Go for enabling either module as currently implemented**

## Executive finding

GigaOps and CMMS contain useful implementation work, but they cannot be enabled safely as two
independent workforce owners.

- CMMS has the stronger resource-allocation implementation: tenant-scoped transactions, capability
  validation, overlap protection, optimistic versions, status history and a dispatch board.
- GigaOps contains useful payroll-calculation experiments and industry terminology ideas, but its active
  page is a production-reachable demo, its authentication and database tenancy boundaries fail closed-loop
  review, and its migrations do not replay successfully.
- The two modules create competing workforce identities, capabilities, assignments and scheduling records.
  This conflicts with ADR-0003, which assigns workforce resources and allocations to one universal
  workforce owner and leaves CMMS responsible for assets, maintenance work and maintenance requirements.

The correct outcome is not to delete the useful CMMS allocation code or to turn on both daemons. The
correct outcome is to converge the reusable allocation behavior into one GigaOps Workforce domain, then
connect CMMS to that domain through versioned APIs/events.

## Evidence captured

### Governance and ownership

1. `WI-OI-059` is the sole active bounded Local Development G4 Build item.
2. `WI-OI-038` is only Proposed at G0 for CMMS scope and ownership correction.
3. No canonical GigaOps work item existed before this audit.
4. `modules/physical-operations-cmms/module.yaml` incorrectly names `WI-OI-031`, which belongs to the
   solution-packs work, and declares an implementation lifecycle that the runtime evidence does not support.
5. The module catalogue labels GigaOps `AVAILABLE`, and `canOpenPlatformModule()` grants unconditional
   access to the GigaOps entry. This is not evidence-backed.

### Live Local Development database

Read-only inspection of the running `gigalibs-postgres` container found:

- `gigalibs_cmms` exists; `gigalibs_gigaops` and `gigalibs_workforce` do not exist.
- CMMS migration ledger contains only migrations `000001` and `000002`.
- CMMS has zero module tenants, locations, assets and work orders.
- GigaOps has no installed schema or migration ledger.
- Neither a CMMS API container nor a GigaOps API container is running.

No live application data needs to be copied before the corrected ownership design is established.

### Clean migration replay

The migration checks used isolated temporary databases and did not modify the live application database.
Both temporary databases were removed after the checks.

| Module | Result | First blocking error |
| --- | --- | --- |
| GigaOps migrations 000001-000009 | **FAIL** | `000008_gigaops_payroll.up.sql` uses expressions inside a table `UNIQUE` constraint for `holiday_calendar`, which PostgreSQL rejects. |
| CMMS migrations 000001-000009 | **FAIL** | `000008_custom_attributes.up.sql` alters `gigalibs_cmms.departments`, but that relation is not created by the CMMS migration chain. |

CMMS therefore cannot satisfy its own current startup expectation, and GigaOps cannot install its schema.

### Build and test verification

| Check | Result |
| --- | --- |
| GigaOps TypeScript typecheck | PASS |
| Six explicitly targeted GigaOps test files | 37 tests PASS |
| GigaOps package `test` command from its package directory | FAIL: zero tests discovered because repository include paths are evaluated from the wrong root |
| CMMS TypeScript typecheck | FAIL |

The CMMS typecheck failures include the wrong `departmentIds` shape instead of canonical
`department_ids`, missing auth-core Nest exports, a missing database module, incompatible Redis
construction and ExcelJS worksheet typing errors. These are release blockers, not review-only findings.

## P0 findings

### P0-01 - Split-brain workforce ownership

CMMS migrations 000003-000004 create `workforce_resources`, `resource_capabilities`,
`resource_allocations`, histories and usage events inside `gigalibs_cmms`. GigaOps separately creates
`workers`, skills, positions, agreements, time and payroll inside `gigalibs_gigaops`.

If both are enabled, a worker can have two identities, two capability sets and conflicting assignments.
There is no authoritative synchronization, conflict rule or recovery path.

### P0-02 - GigaOps accepts an unverified token path

When a JWKS is absent but a platform public key exists, the GigaOps guard base64-decodes a non-EdDSA JWT
payload without verifying its signature. The corresponding test asserts that a token with `mockSig` is
accepted. An attacker could forge tenant, role and permission claims on that path.

### P0-03 - GigaOps does not bind PostgreSQL RLS tenant context

GigaOps services receive a raw `pg.Pool` and execute statements directly. They do not begin a transaction
and set `SET LOCAL app.tenant_id` before tenant-table access. With a least-privileged FORCE-RLS role, normal
requests cannot operate; with a privileged role, application predicates become the only boundary.

### P0-04 - Production-reachable fabricated workforce and payroll facts

The GigaOps page renders hard-coded people, shifts, time entries and a `19370` payroll total, and updates
them only in browser state. Other GigaOps components create random worker IDs, random signature hashes and
fake signed agreements. This violates NFR-DATA-004 and the module-completeness standard.

### P0-05 - Untruthful global compliance and payroll claims

Static JSON files present a few numbers as country payroll rules and expose export names such as HMRC RTI,
STP and ADP without implementing the official schemas, submission, acknowledgement or reconciliation
flows. Examples of current factual drift include an Australian superannuation value of 11.5% after the
[rate became 12%](https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee),
a fixed UK overtime premium although [UK overtime pay is generally contractual](https://www.gov.uk/overtime-your-rights),
and one `EU` pack treating a directive whose application depends on national legislation and collective
agreements as a single payroll jurisdiction
([European Commission](https://employment-social-affairs.ec.europa.eu/policies-and-activities/rights-work/labour-law/working-conditions/working-time-directive_en)).

These packs can be research inputs only. They are not executable legal or payroll authority.

## P1 findings

1. GigaOps runtime configuration embeds a `postgres/postgres` database fallback and default issuer/audience.
2. GigaOps enables wildcard CORS with credentials.
3. Its BFF forwards the browser bearer token if module-token minting fails and forwards `X-Tenant-Id`.
4. GigaOps uses role strings and persona fallbacks for authorization instead of canonical scopes.
5. GigaOps BFF allows any HTTPS origin rather than an exact deployment-profile allowlist.
6. Missing active pack configuration silently defaults a tenant to manufacturing/United States.
7. Tenant-specific `skill_tags` and `holiday_calendar` rows do not have an adequate tenant-isolation model.
8. Foreign keys are not tenant-composite, allowing inconsistent cross-tenant relationships through
   privileged or defective write paths.
9. Payroll recalculation deletes and rebuilds financial results without one transaction, idempotency key,
   immutable input version or calculation seal.
10. Clock-out, pack activation and several other multi-statement mutations are not atomic.
11. The GigaOps audit table is never written by the application and is incorrectly labelled compliant by
    the migration comment.
12. CMMS reads `org_scope.departmentIds`; the signed platform contract uses `department_ids`. It also maps
    unrecognized scope modes to tenant-wide access instead of denying them.
13. CMMS readiness accepts four migrations even though current application code imports features from
    later migrations, and its health endpoint returns HTTP 200 when degraded.
14. CMMS contains direct `assigned_to` and team fields in work orders in addition to the later allocation
    model, creating a second assignment truth.

## Valuable implementation to preserve

- CMMS assets, locations, work orders, meters, PM schedules, parts and maintenance history.
- CMMS allocation state machine, capability validity checks, overlap locking, version conflicts and
  append-only status history, moved behind the Workforce owner.
- CMMS authenticated BFF pattern using a short-lived signed `PlatformContextV1`.
- CMMS tenant transaction wrapper after its startup and least-privilege controls are corrected.
- GigaOps pure calculation tests as non-authoritative rule-engine fixtures.
- GigaOps terminology/industry-pack concept after it becomes versioned tenant configuration rather than
  hard-coded business truth.
- GigaOps workforce, time and payroll UI components after all fabricated data and browser-only mutations
  are replaced by real APIs and complete failure states.

## Enablement decision

Do not run `enable-cmms-feature.mjs`, do not add the GigaOps entitlement, and do not apply either current
migration chain to the live database.

CMMS core can be enabled only after `WI-OI-038` passes clean migration, typecheck, signed-context,
least-privilege RLS, real persistence, audit/telemetry and exact-image Local Development verification.
CMMS People/Dispatch stays contained until the Workforce domain is authoritative.

GigaOps can be enabled only after `WI-OI-060` replaces the prototype runtime boundary, establishes the
single workforce data owner, removes fabricated data and proves a real tenant-scoped vertical slice.
