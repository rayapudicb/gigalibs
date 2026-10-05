# QA and production handoff readiness

- **Date:** 2026-10-05. Work item: WI-OI-120.
- **Production verdict:** NO-GO.
- **QA handoff verdict:** not ready, except for the narrow items marked Ready below.

The metadata-proposals investigation (`metadata-proposals-investigation-2026-10-05.md`) is the current diagnosis and
design correction. It is not a handoff package: by its own statement it adopts no remediation plan, and its runtime
statements rely on records because that session had no Docker access. This file lists what QA and production need,
and the status of each item today.

## 1. Facts the investigation could not observe (checked 2026-10-05 by the primary session)

| Fact | Evidence |
| --- | --- |
| The UAT instance runs release `5ceba59d0963-b53e290e718f` (U1b, U2 and U3.1), deployed 09:05–09:08Z by the owner; ledgers Inventory 3, Orders 3, Procurement 3, Finance 8 | `infra/compose/evidence/wi-oi-120c-20261005T090556Z/README.md` (local); read-only re-check |
| U2's fixes are proven on an isolated database (39 HTTP checks) but not yet exercised on the UAT instance, because no tenant holds the ERP entitlements | `public.tenant_module_entitlements` (read-only) |
| CMMS is down (old image, ledger 16); the correction of migrations 000017–000019 awaits the owner | `docker ps -a`; `gigalibs_cmms.schema_migrations` |
| No tenant holds the Catalogue, Inventory, Procurement, Orders or Finance entitlement, hence "HTTP 403" | `public.tenant_module_entitlements` (read-only) |
| Thirteen modules have no running backend (nothing listens on their host ports) | `uat-module-status.md` |
| A second agent session committed U2 and wrote U3.1 (SCIM). The owner chose the primary session as the only writer; U3.1 was reviewed and committed as `5ceba59` | `git log`; `.pi/work/WI-OI-120.md` |

## 2. What QA needs before testing starts

| Need | Status | What closes it |
| --- | --- | --- |
| A stable environment running a recorded, immutable release | **Partly.** UAT runs `5ceba59` with recorded migration versions; CMMS down | CMMS after its correction; record image digests at each deploy |
| Tester accounts per role in a clearly named UAT tenant, with entitlements | **Missing.** No ERP entitlements granted; no role accounts listed | U28: UAT tenant, roles (admin, buyer, approver, warehouse, sales, accountant, controller, technician, worker), entitlements, credentials handed over securely |
| Test data entered through the application | **Missing** | Playwright business flows per module card (U4–U21); no SQL seeding |
| Test cases per action with expected outcomes | **Partly.** Expected outcomes exist (`docs/architecture/MODULE_ACTION_OUTCOMES.md`) but no test cases | Each module card ships its manual test script and Playwright flow from its section of the spec |
| Traceability: action → requirement → test → evidence | **Missing** | The investigation's §4.1 evidence fields, filled per action by each card |
| Known-issues list per module | **Ready.** `uat-module-status.md` | Keep it current at every deploy |
| Entry and exit criteria | **Missing** | U28: entry = module card done and deployed, entitlement granted, data flow green; exit = every action in the module's spec section passes and no open P0/P1 |
| Defect process (severity, owner, fix and re-test) | **Missing** | U28: defect list that names the action, the expected outcome from the spec, steps and evidence |
| Automated regression | **Partly.** Unit tests (2,467), U2 module-host HTTP proof (39 checks), Playwright smoke (36 checks, needs a UAT admin login) | Browser-level business flows per card; run on every deploy |
| Accessibility, performance and security test scope | **Missing for the ERP modules** | Per card: WCAG 2.2 AA checks on its screens; U3 negative security tests; volume tests before production |

**Ready for QA now:** Organization administration (Phase 1), as a traced flow. **Not ready:** every ERP module
(Phases 4–14), CMMS, Communications, Rule Studio and the 13 modules without a backend.

## 3. What production needs (moving to the cloud)

| Gate | Status today | What closes it |
| --- | --- | --- |
| Reproducible build from git | **Improved.** U1 and U2 builds pass from a clean checkout | CI runs it on every commit |
| CI quality gates (build, test, secret scan, SAST, dependency, container and IaC scans, SBOM, signing) | **Missing** (P1-21) | Release Operations card: CI pipeline that blocks on failure |
| Cloud target architecture and infrastructure as code | **Missing.** Only local Compose; the Helm chart is incomplete (P1-22) | Owner decision on cloud provider and region; IaC for networks, PostgreSQL 16, Redis, object storage, secrets, ingress and TLS |
| Environments (dev, UAT, production) with promotion of one immutable artifact | **Missing.** UAT is the local instance | Same images promoted by digest; per-environment configuration and secrets |
| Secrets management and rotation | **Missing.** Secrets live in local env files; live credentials found in untracked TextFly files (D6) | Managed secret store; rotation runbook; rotate the exposed credentials |
| Database recovery: PITR, encrypted off-site backups, restore rehearsal of every current schema | **Missing** (P0-13) | SRE card (R6); rehearsal evidence with RPO and RTO met |
| Migrations: forward-only, rehearsed on a production-like copy, with a rollback or roll-forward plan | **Partly.** U2 rehearsed on a restore of the UAT backup | Rehearse on a production-like copy for every release |
| Identity (WI-OI-013): external identity provider, SAML/WebAuthn decisions, DNS/TLS, regional isolation | **Blocked** (external) | Owner provides the providers and DNS; complete WI-OI-013 |
| Security: all P0s and P1s closed, with independent review | **Open.** P0-04 to P0-08 and P0-10 open; P0-06 has an implementation in Review | U3 slices; named Security reviewer |
| Observability: logs, metrics, traces, alerts, SLOs, on-call | **Missing for modules** | SRE card: dashboards and alerts per module; on-call rota |
| Accounting and legal review (Finance phases, GPL v2 reference use, AGPL benchmark) | **Missing** | Named accountant and Legal (D7, D8) |
| Release authority, rollout (canary or cohort), halt and rollback plan | **Missing** | Named release authority (D7); release runbook |
| Production observation window (G7) | Not started | After first release |

## 4. Order of work

1. **One writer.** Done: the owner chose the primary session (2026-10-05).
2. **Deploy U2 and grant entitlements.** Deploy done (09:08Z). Still open: the owner grants the five ERP
   entitlements to the UAT tenant.
3. **CMMS.** Owner approves the correction of migrations 000017–000019 (or runs it); then deploy CMMS.
4. **U3 security slices** (P0-06 in Review, then P0-04, P0-05, P0-07, P0-08, P1-20); independent Security review.
5. **F0, F1 and F2** (revised ADR-0033): metadata-governed screens, lifecycle primitives, asynchronous idempotent
   posting.
6. **Module cards U4–U21**, each with:
   - its spec section implemented;
   - a Playwright flow that enters its data;
   - a manual test script;
   - traceability evidence.

   QA tests each module as its card lands.
7. **U22–U23** journeys; **U24–U27** never-built capabilities; **U29** backends; **U28** UAT run.
8. **Production track in parallel** (section 3), which needs owner decisions on cloud, providers and named
   reviewers.
