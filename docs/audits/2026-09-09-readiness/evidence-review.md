# GigaLibs independent evidence and test-scope review

Assessment: 2026-09-09. Reviewer role: QA Spec. Read-only source/document review; no product files changed, no remote calls, no database writes, no tests run by this reviewer. The coordinating agent owns fresh command execution results. Findings concern the current working tree, which contains pre-existing changes; historical pass counts are not a fresh certification.

## Decision

**No-Go for a claim that any entire GigaLibs module is 100% business-ready.** This review found useful, executable foundations and real-infrastructure test harnesses, but no evidence establishing full module acceptance, authorized customer data provenance, manual UAT, or production observation. That is an evidence conclusion, not a statement that every implementation is broken. The owner's current statement that no manual testing has been done must govern manual/UAT status until an attributable execution record establishes otherwise.

## Principal findings

### EV-01 — P1: readiness statements conflict and criteria are presented as passed evidence

- `.pi/WORK_ITEMS.md:17` says WCAG 2.2 AA and first-time usability evidence pass. The referenced `.pi/work/WI-OI-009.md:11`–26 contains only outcome, scope, and acceptance criteria. Its line 16 lists an automated/manual audit scope but supplies no dated execution record, routes exercised, browser/assistive technology, participants, observed issues, result artifact, or independent reviewer acceptance.
- `.pi/WORK_ITEMS.md:18` says representative load, noisy-neighbor, fault, retry, recovery tests pass. `.pi/work/WI-OI-010.md:11`–26 provides a 1,000 RPS target and p95 <250 ms criterion but no run command, environment, load profile, measurements, duration, record reconciliation, or result artifacts.
- `.pi/WORK_ITEMS.md:16` claims CI secret/SAST/dependency/container/IaC/SBOM/provenance gates pass; `.pi/work/WI-OI-008.md:11`–26 again lists scope and acceptance criteria rather than scanner version, results, SBOM digest, vulnerability disposition, or provenance attestation.
- `.pi/work/WI-OI-003.md:11`–13 says Release 1 meets all functional/nonfunctional requirements; line 40 calls evidence fully assembled. `.pi/PLAN.md:24`–28 explicitly says G5 is not passed and identifies these controls as incomplete. `.pi/WORK_ITEMS.md:11` calls evidence independently assembled without identifying independent individuals or review decisions.
- `docs/runbooks/database-disaster-recovery.md:19`–35 documents commands and assertions, not an executed restore drill with elapsed RPO/RTO and verified data integrity. A runbook is necessary but is not proof its procedure succeeded.

Expected correction: reconcile the tracker, plan, and evidence with separate statuses for planned criteria, code present, automated run passed, independent review, human UAT, and release authorization. Attach immutable/datable results before using “pass.” Do not simply mark all work failed; preserve supported bounded results.

### EV-02 — P1: full-suite success excludes major test categories and ten module implementations

- Root `package.json:14` runs root Vitest followed by the execution-plane Python runner; it does not run the separate live integrated certifications or AR Playwright.
- `vitest.config.ts:14`–18 selects TS/TSX tests. All package `*.test.mjs` certification files are outside these globs. The AR Playwright test is outside module `src`, so is also outside the root suite. Its separate command is `modules/accounts-receivable/apps/e2e/package.json:6`–7.
- `scripts/run-workflow-api-tests.mjs:12`–14 compiles Python source and discovers `apps/workflow-api/tests`; the only discovered Python file is `test_observability.py`, whose four tests cover token authentication, correlation IDs, metric formatting, and a mocked database collector error (`:55`–65). They do not run a durable workflow, provider, worker lease, queue, or database transaction.
- Source inventory found zero test/spec files under each of: autonomous-recovery-studio, multi-currency, physical-operations-cmms, platform-rbac, spend-management, tax-configuration, universal-connector-hub, universal-data-studio, universal-rule-pro, workflow-studio. The inventory searched `.test/.spec` TS, TSX, JS, MJS, and PY outside generated/dependency directories. This does not rule out external tests, but no linked external result was established here.
- `.pi/PLAN.md:54`–65 appropriately lists separate integrated scripts with explicitly configured endpoints. A passing root test command cannot stand in for these runs.

Expected correction: publish a suite-to-journey matrix and mark omitted suites “not run.” Integrate appropriate current module contracts and real database tests into repeatable CI profiles; avoid counting unit helper tests as full business coverage.

### EV-03 — P1: tests validate success-looking in-memory results instead of external outcomes

- `apps/workflow-platform/__tests__/ootb-client-workbench.test.ts:86`–94 calls `ootbWorkbenchStore.evaluateDocument` synchronously and considers `PAYMENT_HOLD_APPLIED`, a generated `NS-HOLD-*` string, and a 64-character hash sufficient proof of an automated ERP payment hold.
- The tested runtime implementation has in-memory rule/evaluation maps (`apps/workflow-platform/lib/ootb-client-workbench-store.ts:93`–94), selects success states at line 338, and manufactures a provider-like reference using `randomUUID()` at line 345. Line 351 claims that payment has been placed on hold in the ERP. No ERP outcome is proved by the test.
- The test's clean invoice case (`ootb-client-workbench.test.ts:173`–179) similarly checks `CLEAN_AUTO_POSTED` and `ERP_VOUCHER_POST` without verifying a real provider receipt, database commit, or reconciliation. Its ROI test (`:235`–242) asserts a hardcoded monthly subscription price of $2,500 and positive savings; runtime `ootb-client-workbench-store.ts:437`–440 applies fixed hours-saved assumptions and fixed pricing.
- `universal-rule-kernel.test.ts:133`–136 checks a returned `REROUTE_TOPIC` verdict and destination string, rather than message publication and receipt. Such tests can validate decision selection if labeled that way, but cannot prove an external broker action occurred.

Expected correction: distinguish planned/dry-run verdicts from committed external actions; assert durable intent, provider failure, receipt, timeout/retry/idempotency, reconciliation, restart recovery, and observable customer result against isolated real supported infrastructure. Do not remove legitimate isolated test fixtures merely for containing artificial names: the problem is what execution they claim to establish.

### EV-04 — P1: AR “integration” and compliance evidence is materially narrower than the claim

- `.pi/work/WI-OI-035.md:14` calls the subsystem a production-grade enterprise engine; line 19 claims standard-compliant EN 16931, Peppol BIS 3.0/UBL 2.1, and ZUGFeRD/Factur-X export. Line 73 labels `ar-ledger-engine.test.ts` as four integration tests.
- That file imports only domain arithmetic/hash helpers (`apps/workflow-platform/__tests__/ar-ledger-engine.test.ts:1`–6) and constructs values in process. It does not exercise UI, HTTP, auth, database, migration, provider, or rendering.
- Its alleged Peppol compliance case at `:139`–157 never generates or validates XML/PDF. It asserts only EUR currency, a 30,000 total, SHA-256 algorithm, and a 64-character hexadecimal hash. Those assertions establish no schema/business-rule/document-profile conformance.
- `.pi/work/WI-OI-035.md:61` explicitly describes production badges. A unit-tested hash function cannot establish deployed integrity, authorization, regulatory conformance, or full financial lifecycle correctness.
- In contrast, `modules/accounts-receivable/release/evidence-index.yaml:7` accurately says `not-certified`, with `humanApprovals: []` and `productionObservation: null` at lines 43–44. `.pi/work/WI-OI-019.md:79`–91 accurately identifies G5/G6/UAT gaps.

Expected correction: call these domain tests, verify actual generated artifacts with the selected schema and business-rule validators, and obtain finance/domain acceptance. Any legal/compliance determination remains with the designated human authority.

### EV-05 — P1: AR's real-database E2E harness does not apply the newer financial migrations

- A valuable real PostgreSQL 16/Playwright foundation harness exists: `modules/accounts-receivable/tests/README.md:25`–29 and `apps/e2e/specs/invoice-lifecycle.spec.ts:3`–142. It covers setup, customer, create/edit/issue, signed event receipt, restart, idempotent replay, concurrent numbering, immutable-edit denial, and pagination.
- `modules/accounts-receivable/apps/e2e/support/environment.mjs:175` applies only migration 000001 and 000002. Lines 198–203 run only their verification/integration SQL.
- Migrations `000003_ar_ledger_seals_and_installments.up.sql` and `000004_ar_settlements_and_wip.up.sql` are present but absent from this harness and from the release index's migration list (`release/evidence-index.yaml:23`–26).
- The sole Playwright journey tests the standalone `ar-web` product at `http://127.0.0.1:3401` (`apps/e2e/playwright.config.ts:13`), not the newer `/ar` integration in `apps/workflow-platform` at 5180. Passing one surface cannot certify the other.

Expected correction: inventory every supported schema state and supported UI surface; prove clean install, upgrade compatibility, new settlement/seal invariants, recovery, concurrent payments and WIP, and end-to-end accepted customer outcomes. Keep the existing bounded foundation evidence, explicitly dated and identified.

### EV-06 — P1: green audit names overstate their mechanically checked boundary

- `scripts/verify-runtime-data-integrity.mjs:21`–36 hardcodes app/module roots ending at platform-rbac. `modules/physical-operations-cmms` is an active workspace module (`pnpm-workspace.yaml:5`–6, CMMS package `:7`–10), but is omitted by both runtime-data modes. `--all-runtime` adds only `packages`.
- The scanner is regex-based, not data lineage or persistence analysis. Examples at lines 69 onward look for selected sentinel names and strings. It skips test/e2e/generated directories at lines 39–52 and test filenames at line 194. “0 violations” means zero matching violations in selected roots, not that every returned business value is authorized, persisted, or real.
- `scripts/verify-api-module-boundary.mjs:5` and `:17` checks only immediate TypeScript controller/provider files in `apps/playground-api/src`. It does not reconcile Next.js route handlers, standalone module APIs, nested controllers, FastAPI endpoints, OpenAPI contracts, or client calls.
- `scripts/verify-navigation-boundary.mjs:5`–6 and `:48`–60 checks selected static href strings against page filenames. It never launches a browser, checks role permission, evaluates dynamic navigation, submits forms, or asserts an outcome.
- `scripts/verify-sdlc-governance.mjs:75`–81 checks textual metadata/requirement patterns and the word “human”; it cannot substantiate independent review, named acceptance, business outcomes, or whether linked evidence was executed. It checks presence of FR-01–16 (`:50`–58), not semantic correctness of later/undefined NFR references.

Expected correction: state every audit's actual scope and exclusions, discover workspace modules rather than enumerate stale roots, and add runtime/data lineage evidence. No static gate should be marketed as production certification.

### EV-07 — P2: inventory and architecture no longer reconcile

- `README.md:9`–13 names three active platform apps and calls AR design/intake. `.pi/PLAN.md:33`–37 calls AR the sole implementation module. `.pi/WORK_ITEMS.md:27`–43 lists many additional modules and new “verified live” capabilities. `.pi/work/WI-OI-019.md:3` says In Progress while the canonical row says Review. `docs/REQUIREMENTS_BASELINE.md:11`–27 retains designed/pending states for several capabilities now described as implemented in work items.
- Current workspace-pattern discovery: **95 active JS manifests = 2 app + 15 module package + 78 shared package manifests**. FastAPI is additional, without a JS manifest. **109 roots are quarantined plus one separately retired Vite app**. These are inventory counts, not product or certification counts.
- A conservative manifest dependency graph starting from all active app/module manifests (including their transitive dependency/dev/peer/optional edges) reaches only 19 of 78 shared package manifests. **59 shared manifests have no declared active app/module consumer**. This indicates a large source-library inventory requiring purpose/consumer review; it does not prove every package is useless or rule out undeclared imports/external consumers.
- Examples with no consumer found by a focused source search in active apps/modules include invoices-core, approvals-core, reports-core, workflow-engine, spend-core. Their names must not imply a shipped application feature.
- CMMS README says `rule-engine-universal` consumes IoT events at `:15`, despite that package's explicit quarantine, and names `universal-rule-pro` at `:92`. Searching CMMS/universal-rule-pro sources found only outbox INSERTs (`meters.service.ts:138`–139 and parts service), no corresponding consumer for `cmms.meter.reading.ingested`. This is a disconnected-event claim pending broader runtime confirmation.

Expected correction: a module map derived from navigation, workspace manifests, deployed processes, API callers, schemas, and event producers/consumers must replace conflicting lists. Classify each as active with a verified consumer, active but disconnected, independent product under construction, quarantined, or retired.

## Existing evidence worth retaining

1. AP/control/execution/connector/BFF/retention/observability integration scripts are executable source, not merely test names. For example, `apps/playground-api/scripts/verify-ap-outcome.mjs:3` uses Prisma, requires explicit API/source URLs at lines 5–8, and creates generated certification identities (`:29`–62). They require a fresh isolated run to establish current results; they do not prove real customer input legitimacy.
2. AR has an isolated real PostgreSQL, OIDC test issuer, signed event receiver, and browser lifecycle harness, with useful concurrency/restart checks. This is stronger than mocked unit evidence, still not human UAT or full AR lifecycle certification.
3. The quarantine registry and workspace exclusions clearly identify 109 uncertified roots. Quarantine protects active runtime boundaries; it does not complete those packages or satisfy the user's request to evaluate their future usefulness.
4. `docs/zero-mock-data-lineage-remediation-audit.md:170`–188 records a historical 2026-09-03 integrated run and explicitly separates local from production certification. The executive “zero-mock” statement at line 9 cannot be carried forward across changed source without fresh evidence, and the historical scope predates many current modules.

## Required acceptance packet for every journey

Each journey needs the same concrete evidence columns: business actor and intended benefit; FR/NFR and work item; authoritative input source and permission to use it; source version/hash and test-data attribution; UI control and role; HTTP route/auth/object/tenant checks; domain operation; transaction/tables/constraints; event producer and actual consumer; provider receipt/reconciliation if any; result displayed; independent expected-versus-actual observations; immutable logs/screenshots/traces; outcome metric; defects/owner/disposition; human UAT and release decision separately.

Minimum repeatable scenario set:

| Journey family | Expected business outcome | Essential cases beyond happy path |
|---|---|---|
| Tenant/onboarding/RBAC | An authorized tenant administrator establishes the correct operational workspace | New/empty tenant, invitation/revocation, wrong tenant/object/role, expired credentials, two concurrent sessions, plan/region constraints, audit and restart |
| Connector/source/contract | Authorized source data arrives exactly once with traceable accepted/rejected evidence | Missing/revoked secret, scope denial, timeout/rate limit, malformed data, schema break, duplicate/out-of-order records, no-data, checkpoint restart, poison record, isolation |
| AP/control-plane | A real invoice/PO/receipt discrepancy produces a defensible decision and permitted durable action | Rounding/quantity tolerances, missing/out-of-order evidence, duplicates, policy version, approval/rejection, read-only actor, action retry, failed receipt/reconciliation, independently approved benefit |
| AR | A customer invoice is issued, delivered, paid/credited, aged and reconciled correctly | Empty setup, draft edit/version conflict, concurrent numbering, zero/negative/large quantities, rounding/currency/tax scope, partial/overpayment, duplicate webhook, credit/void policy, failed delivery, immutable issue, settlement restart, current migration restore |
| Spend/tax/currency | Approved spending and financial calculations produce valid persisted obligations and balances | Budget overspend/concurrent spend, partial approvals, stale FX/source date, unsupported currency, rounding/precision, reversals, reconciled settlement, jurisdiction/effective-date/tax policy, provenance |
| Data/rules/workflow | Published versions drive a durable workflow to a verified result | Invalid mapping/unit, tenant-scoped publication, boundary rules, version replay, actual broker publish/receipt, idempotency, worker loss, wait/cancel/retry, duplicate/out-of-order event, partial failure, compensation |
| Recovery/OOTB/solution packs | A real exception results in controlled remediation and an honestly measured benefit | No false completed status; approved input, actual provider effect, permissions, replay, cost/baseline approval, rejected benefit, correction, no synthetic/customer metric mixing |
| CMMS/physical operations | A real asset reading leads to the correct governed maintenance result | Asset/meter ownership, time/units/out-of-order telemetry, duplicate IoT message, rule consumer, work-order status, signature policy, parts availability/concurrency, scheduling, cost, offline/retry and audit |
| UI/operator handover | A first-time user and an uninvolved operator complete their tasks | Loading/empty/stale/partial/error/denied states, keyboard/screen reader, focus, mobile layout, recovery without DB access, observed completion rate/time and documented failed attempts |

For each scenario, verify read-after-write in a new request, refresh, service restart, concurrent replay and relevant database/provider state. Mark `Pass`, `Fail`, `Not run`, or `Blocked by named dependency` and keep source inspection distinct from observed execution. Do not call data legitimate merely because it is in PostgreSQL: retain upstream authorization, provenance, and transformation lineage.

## Read-only inventory details

Active shared manifests lacking a declared path from an active app/module dependency graph (59): admin-kit, ai-chat-core, ai-chat-nest, analytics-core, approvals-core, approvals-nest, approvals-react, archival-core, audit-core, auth-react, billing-react, cache, cart-react, chat-core, config, crypto, data-retention, email-templates, embed-sdk, errors, event-bus, form-engine-core, fraud-detection, geofence-engine, health, host-kit, i18n, icons, integrations/aws-s3, integrations/minio, integrations/openai, invoices-core, jwt-universal, knowledge-base-react, kpi-widgets-react, ledger-nest, multi-currency, notifications-core, notifications-react, oauth-universal, orders-nest, orgs-core, pagination, pricing-calculator, privacy-gdpr, queue, rbac-react, realtime, redis, reports-core, reports-nest, reports-react, sla-engine, spend-core, storage-core, ui, ui-preset, users-core, workflow-engine.

Inventory method: expand `packages/*/package.json`, `packages/integrations/*/package.json`, `apps/*/package.json`, `modules/*/domain/package.json`, `modules/*/apps/*/package.json`; exclude quarantine registry roots and retired Vite; traverse declared workspace identities from active app/module roots. No package was promoted, removed, or changed.
