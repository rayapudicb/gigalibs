# GigaLibs readiness and outcome audit — initial evidence baseline

Assessment date: 2026-09-09. Work item: [WI-OI-036](../../../.pi/work/WI-OI-036.md).
Source baseline: HEAD `f874df4397ae0f3d6e8db961b307d6d046602e07` plus the pre-existing modified/untracked working tree.

**Recommendation: No-Go for production release of the reviewed candidate. No entire module is certified business ready by this audit.** Confirmed local authentication, unauthorized access and fabricated financial-action responses meet the repository's stop-ship conditions. This does not mean that every function is broken or that an external deployment has been tested.

**Implementation update — 2026-09-12:** the supplied platform owner can now reach the canonical
30-module catalogue and all five finance workbenches in local UAT. The earlier Currency and Recovery
generated-data paths were removed, attributable generated tenant records were cleaned, and both services
now fail closed when an authoritative rate/source/provider receipt is absent. The latest signed-in browser
and no-write checks are [finance-suite-browser-result.json](evidence/uat/finance-suite-browser-result.json)
and [finance-truth-boundary-result.json](evidence/uat/finance-truth-boundary-result.json). This improves
local access and data integrity; it does not change the production No-Go recommendation.

Implementation has started under WI-OI-013. The original three P0 demonstrations are now contained in the
current source and the canonical identity path now has real persistence verification for sessions,
memberships, invitations, custom-role assignment, enforced TOTP, hashed one-time recovery codes,
DNS-backed tenant-domain challenges and tenant-scoped OIDC Authorization Code + PKCE,
but the implementation is not complete.
See [IAM and runtime-containment implementation status](iam-implementation-status.md) for the implemented
behavior, test evidence and current stop-ship findings, including external-IdP/SAML proof, assisted MFA recovery, regional/export work,
remaining migration risk and other production-reachable fallback screens.

See [UAT access and role-flow status](uat-access-and-role-flow-status.md) for the global platform-admin,
tenant-admin, member and seven-day trial flows, the honest module-access boundary, and the remaining
payment, DNS and database-provider work.

See the [module enablement and manual UAT plan](../../plans/manual-uat-module-enablement-plan.md) for the
three access gates, currently testable routes, persona setup, and the exact business outcome required to
unlock every contained or planned catalogue module.

The focused [identity, connector/workflow, asset and dynamic-configuration plan](../../plans/identity-dataflow-assets-dynamic-configuration-plan.md)
maps canonical and legacy authority, IAM/tenant/RBAC gaps, actual data flow, CMMS submodules and the proposed
universal configuration core. WI-OI-039 records the proposal and is not an additional active Build item.
The [governed configuration and module rollout plan](../../plans/zero-code-configuration-and-module-rollout-plan.md)
adds the architecture boundary, major-SaaS pattern evidence, AR dynamic-field journey and dependency-ordered
adoption sequence for all current modules.
The [AR event-billing and supplemental-invoicing plan](../../plans/ar-event-billing-supplemental-invoicing-plan.md)
adds the 2026-09-10 WhooCrew-derived FR-17 gaps, current implementation impact, source/markup/family/rebilling
design, backward-compatible rollout and exact 26-then-4 acceptance scenario under proposed WI-OI-040. It is
planning evidence and does not change the current No-Go decision or active Build item.

The initial discovery, source review and bounded local verification pass is complete. The exhaustive action-by-action audit, real-infrastructure integration matrix, manual browser testing, human UAT, source-data authorization review and production observation remain incomplete. The owner reports that no manual testing has been performed. Existing references to successful UAT/usability must not substitute for attributable execution records.

## What was actually established

Three probes against the already-running local server at `http://127.0.0.1:5180` on 2026-09-09 at 02:33:52 UTC reproduced the following. Requests carried no authenticated session; tokens and returned business records were not saved.

| ID | Probe | Expected outcome | Observed outcome | Evidence and impact |
| --- | --- | --- | --- | --- |
| RT-01 / P0 | POST `/api/auth/login` with a nonexistent `example.invalid` identity and invalid password | Reject invalid credentials; fail unavailable when authentication cannot be performed | HTTP 200, `authenticated: true`, `role: SUPER_ADMIN`; issued token also contained that role | `apps/workflow-platform/app/api/auth/login/route.ts:34` creates an administrator session on configuration/fetch failure. Downstream acceptance of that token was not certified. |
| RT-02 / P0 | GET `/api/ar/v1/invoices` without cookies or Authorization | Reject access before exposing tenant records | HTTP 200 with four invoice entries | `apps/workflow-platform/app/api/ar/[...path]/route.ts:49` has no incoming authentication check and can use a seeded in-memory fallback. Record contents/provenance were not certified. |
| RT-03 / P0 | POST `/api/analytics/action` for `AUDIT-NONEXISTENT-20260909` with `HOLD_PAYMENT_DISPUTE` | Reject unauthenticated/unknown-entity request; no financial effect claimed | HTTP 200, `success: true`, `status: EXECUTED`, held amount USD 45,000,000, vendor/legal notification flags, and an audit digest | The fully inspected handler at `apps/workflow-platform/app/api/analytics/action/route.ts:45` generates these values without database/provider calls. The response is fabricated; no money was held or notification sent by this handler. |

See [local-probes.json](evidence/local-probes.json) for redacted observations and [probe-local.py](evidence/probe-local.py) for the exact bounded probe. These are HTTP tests, not human/browser acceptance tests. The already-running server's deployed artifact digest was not supplied; matching behavior was found in the current source, but full served-artifact/source identity is unverified.

## Fresh command results

Installed tooling: Node v23.11.0, pnpm 11.1.2. Plain pnpm commands initially attempted automatic dependency installation and failed before executing the checks, with dependency-directory confirmation and registry-access errors. Checks were rerun with `pnpm --config.verify-deps-before-run=false <script>` to preserve installed dependencies. The results below describe those reruns, not a clean frozen-lockfile installation.

| Script | Result | Actual scope / limitation |
| --- | --- | --- |
| `build` | **Failed**, exit 2 | First reported failed task: `@gigalibs/rbac-core`; TS18048 at `packages/rbac-core/src/rbac.test.ts:58`, `:59`, `:61`, `:62`. Turbo reported 15 successful / 69 scheduled tasks. Remaining build tasks were not certified. |
| `test` | **Passed** | 21 TS/TSX test files, 105 tests, plus 4 Python observability tests. This excludes separately invoked browser/live-integration and package MJS certification suites. Some tests assert manufactured runtime success; see EV-03. |
| `audit:production-data` | **Failed** | Two detected silent fixture fallbacks in `apps/workflow-platform/app/(app)/ar/page.tsx:381` and `:382`. |
| `audit:all-runtime-data` | **Failed** | Same two detected violations; static regex matches substantially undercount the source findings in this review. CMMS module root is omitted. |
| `audit:package-dependencies` | Passed | Checks 80 manifests under apps/packages; independent workspace inventory includes additional module manifests absent from this audit. |
| `audit:api-boundary` | Passed | Eight mounted controllers / 27 providers in the selected NestJS control-plane registration. Does not verify all Next.js, FastAPI or independent module APIs. |
| `audit:navigation` | Passed | 68 page routes / 147 static links; does not exercise roles, buttons, requests or outcomes. |
| `audit:sdlc` | Passed before report | 35 work items and textual governance checks; does not authenticate historical evidence or human acceptance. A post-report check is recorded separately. |
| `audit:anti-duplication` | Passed | 64 scanned pages; does not establish single authoritative ownership of identity, workflows or data. |

Fresh logs and initial working-tree status are retained in `/private/tmp/gigalibs-readiness-2026-09-09/`. Portable summaries, selected command logs and source hashes are included under [evidence](evidence/). No dependency installation, migration, product behavior fix, provider action, release or deployment was performed. Checks did not add/remove product entries in `git status`; existing source changes were preserved. Builds may update ignored generated artifacts.

## Coverage and module assessments

- [All 11 independent module directories](module-outcomes.md): purpose, API/persistence boundaries, confirmed gaps, test-source inventory and actual versus asserted interconnections.
- [Frontend data truth and authentication](data-truth.md): ten finding groups tracing screens, APIs, fallbacks, provider claims, local stores, identity and financial metrics.
- [Independent evidence review](evidence-review.md): seven finding groups on contradictory readiness statements, omitted tests/migrations, misleading tests, audit exclusions and declared-consumer gaps.
- [Package inventory](inventory.csv), also available as [JSON](inventory.json): 206 rows covering 95 active JS package manifests, 109 quarantined roots, one retired application and the Python execution application. Of 78 active shared packages, 59 lack a declared dependency path from active apps/modules in the inspected manifest graph. This does not exclude undeclared or external consumers. Inventory is not a full source audit of each package.

Post-report `audit:sdlc` passed with 36 registered work items; see [the log](evidence/audit-sdlc-post-report.log). This validates tracker structure, not completion of WI-OI-036 or historical readiness claims.

| Business module | Initial source assessment | Main remaining outcome question |
| --- | --- | --- |
| Accounts receivable | Real standalone invoice/outbox foundation; full lifecycle incomplete; suite BFF has prohibited fallback | Can authorized users issue, deliver, collect, credit and reconcile through one authoritative persistence path? |
| Spend management | Real partial expense/budget APIs; no located outbox consumer or module-local tests | Does an approved expense reach actual disbursement and reconciliation? |
| Tax configuration | Real calculation persistence; unknown jurisdiction silently becomes zero tax; identity gaps | Are the selected rules authorized, effective, correctly applied and rejected when configuration is missing? |
| Multi-currency | Partial conversion persistence; hardcoded revaluation and shared-tenant fallback | Do rates, currency precision, dated valuations and settlement evidence match authoritative sources? |
| Universal data studio | Partial contract/mapping tools; fabricated lineage and normalization claims | Do actual inputs pass complete validation and produce a traceable, correctly transformed result? |
| Universal rule pro | Real comparisons with policy/effective-date/hit-policy/audit gaps | Does the intended policy version govern the actual downstream action? |
| Workflow studio | Persists manufactured approval, ledger, notification and other step results | Are steps executed by real owners and recoverable through restart, retry and compensation? |
| Universal connector hub | Partial webhook journal; fabricated connection readiness and sync counts | Does authorized provider data arrive once and reliably reach its consumer? |
| Autonomous recovery studio | Persists fabricated scan/results; holds and recoveries are local status changes | Is there real evidence of detection, authorized intervention and reconciled recovered funds? |
| Platform RBAC | Some real DDL/CRUD; identity ownership gaps and success after DB failures | Do verified identities, tenant permissions, entitlements and limits actually govern protected operations? |
| Physical operations CMMS | Real partial asset/work-order APIs; omitted audit root, missing automation consumers | Does a real reading trigger the correct governed maintenance work and durable resource changes? |

All rows remain uncertified. All ten non-AR module directories lack conventional module-local source test files in the inventory; tests elsewhere remain separately scoped. Quarantined roots remain source inventory and were not promoted. Packages without an observed declared consumer require purpose review, not automatic deletion.

## How the pieces connect

The approved baseline is Next.js UI → NestJS control plane → FastAPI execution plane, with PostgreSQL ownership and durable outbox delivery. The current tree also contains separate module daemons and direct Next.js business stores/routes. Shared navigation does not establish a business integration.

Source shows a connector-to-workflow HTTP call, but its workflow steps frequently return manufactured module results. Recovery dispatch has a request/response contract mismatch and can claim dispatch after failure. Data-studio lineage is partly static. AR has a real transactional-outbox worker foundation; no corresponding spend/CMMS consumers were located. Several module activation paths create empty tenant schemas while the actual APIs use different fixed schemas. These are specific connection gaps, not evidence that every possible integration is absent.

## Prioritized remediation and verification handoff

The following are audit recommendations under WI-OI-036; implementation must be separately routed through the orchestrator and existing owning work items. No feature priority or risk acceptance is inferred from this list.

| Priority | Findings | Proposed responsible roles | Exit evidence |
| --- | --- | --- | --- |
| P0 | RT-01/02, DT-01/02, MOD-003/009 | Tenant identity, security, backend; independent security/QA | Fail-closed login; verified caller/tenant/object permissions; denied requests; persisted grant/revoke tested against protected actions; two-tenant negative tests. |
| P0 | RT-03, DT-03/08/09, MOD-001/002/004 | Backend/integrations, finance/domain, QA | No fabricated executed/completed/delivered/recovered states; durable intent, actual effect/receipt, retry/idempotency and reconciliation evidence. |
| P0/P1 | DT-04–07/10, MOD-005–08 | Data/backend, finance/domain, QA | Empty/error states are honest; one authoritative store; source provenance; verified calculations; actual provider consent/health/lineage; no unapproved zero-tax or cross-tenant fallback. |
| P1 | MOD-010/011 and ownership gaps | Architecture, integration, infrastructure, QA | Versioned producer/consumer contracts; transactional publication; actual activation; replay/restart and no-duplicate outcome evidence. |
| P1 | EV-01–06 and failed build | QA, orchestrator, developer platform | Tracker claims reconcile with dated executions; root and missing suites have honest coverage; current migrations included; build and meaningful gates pass. |
| P2 | EV-07 / inventory | Product requirements, architecture | Every module has an accepted actor, outcome, ownership, consumer or independent-product rationale; consolidation/retirement decisions are explicit. |

No named human owners, target release commitments or risk acceptance were supplied for these recommendations. Those remain open governance fields; they cannot be filled with invented acceptance. Existing work-item IDs are retained, including FR-01–FR-16 and the separately documented FR-17 AR extension.

## Remaining tests and environment constraints

The [journey acceptance matrix](evidence-review.md#required-acceptance-packet-for-every-journey) covers tenancy/onboarding, source/connector/contracts, AP, AR, spend/tax/currency, data/rules/workflows, recovery/solutions, CMMS and operator handover. Each scenario needs expected/actual results, data provenance, persisted state, role/tenant boundary, failure/recovery evidence and independent review.

This session observed local PostgreSQL, Redis and the web listener. No control-plane/execution/module daemons were observed listening at inspection time. Docker inspection after sandbox escalation reported that the daemon was unavailable. The AR real-PostgreSQL browser harness requires Docker and applies only migrations 000001–000002, omitting the new 000003–000004. PLAN integration suites require explicitly configured endpoints and isolated certification records; they were not executed against the owner's unknown-provenance database. No current external test-account configuration or authorized customer-data provenance was established.

Outstanding: exhaustive sub-action matrices for every package/module; real DB create/read/refresh/restart and current migration verification; concurrency/permissions/provider-failure/reconciliation tests; source authorization and lineage inspection; full browser journeys; accessibility/usability with humans; performance/restore drills; independent finance/security/product acceptance; immutable release evidence and production observation. These are open work, not passing or waived conditions.

Data being stored in PostgreSQL establishes persistence only. A fabricated scan or payment receipt can also be persisted. Legitimate business data additionally needs an authorized origin, correct transformation, tenant ownership and an independently verifiable outcome.
