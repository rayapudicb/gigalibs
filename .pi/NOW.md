# NOW: where the work stands (2026-10-29)

## Active task

**WI-OI-126 Manufacturing & MRP (Module 4) — Built (2026-10-29).** Recovery PG 3/3 (RESERVING/ISSUING/RECEIVING replay); conformance 15/15 static; DB proofs 28/28 with module host boot. Plan S5/S6 graph-BOM differentiators deferred; `--live` at owner batch deploy. [WI-OI-126](work/WI-OI-126.md).

**WI-OI-127 Landed Cost (Module 5) — Built (2026-10-29).** Committed **`dcd2cc5c`**. Verify fixes in working tree (relay test path, catalogue/navigation/gateway for returns/projects). Full `pnpm verify` still hits pre-existing **product-catalogue** lock + **platform-context** header tests; layer audit clean after relay test move. [task card](tasks/WI-OI-127.md).

**WI-OI-128 Returns / RMA (Module 6) — Built (2026-10-29).** Commits through **`442fd2f8`**; PG 3/3; conformance 15/15. Verify hygiene (returns-web Docker workspace, compose relay codegen, platform-context worst-case) in working tree uncommitted. [evidence](work/WI-OI-128.md).

**WI-OI-129 Project Operations (Module 7) — In progress.** S1 **`1c191256`**, S2 **`4dcf6eca`**, S3 **`4d942a9b`**. Next: S4 T&M / milestone → AR. [task card](tasks/WI-OI-129.md) · [evidence](work/WI-OI-129.md).

**WI-OI-130 IoT MaaS — Built; certification automation added (2026-10-29).** Playwright + ingest helper + scenario YAML + [runbook](../docs/runbooks/iot-maas-certification.md). **Done** still needs owner UAT on redeployed **5180** + `iot-api`. [handoff](handoff/WI-OI-130-UAT-JOURNEY.md).

**WI-OI-125 Advanced SCM (Module 3) — Built (2026-10-29).** Owner: relay credentials, module-host rebuild, UAT, verify, **commit** when ready. [WI-OI-125](work/WI-OI-125.md).

**WI-OI-124 Material Ledger (Module 2) — Built (2026-10-29).** Committed. S1–S7 complete: locators + lot/serial, exact never-negative ATP + atomic reserve/release, immutable ledger + cost layers with the org-selected Finance cost-profile handshake, warehouse-map/scanner/reservation/ledger windows, live ATP panel (client-polling). Proven on isolated PostgreSQL 16: full proof verify **28/28, 0 fail**; inventory suite **39/39** (migration v9→v10 upgrade + 12 reservation-concurrency). Bounded verify-baseline role fixes to the U2 / finance-bootstrap / F0.5 harnesses (canonical `gigalibs_<schema>_runtime` role the finance migrations 12–15 grant to) plus F0.5 owning-unit + cost-profile seed. True ATP-over-WebSocket streaming is deferred (the plan's `> iDempiere` differentiator, not a numbered slice). Live on-stack journey is validated in the owner's single batch deploy with Modules 1–7. See [evidence](work/WI-OI-124.md). No `configuration-local`/UAT service or data was changed.

## Current owner-directed build — seven iDempiere-reference modules

On 2026-10-28 the owner directed F0 then Modules 1–7 in order, without UAT pauses; the owner will deploy all seven
in one batch after implementation. The source plan is
[`idempiere-parity-modules-plan.md`](../docs/plans/idempiere-parity-modules-plan.md). The accepted ADR-0018/0033/0007
contracts replace the plan's earlier Org-0 and cross-module ACID shorthand. Work items are WI-OI-122–129. The active
card is [WI-OI-124](tasks/WI-OI-124.md); WI-OI-123 is marked Built in the canonical tracker but its row still lists
live proof and full verification outstanding. Modules 3–7 are queued; none of the seven has been deployed from this directive.
The existing Workforce and release state below remains historical context; its unrelated working-tree edits are
untouched.

`pnpm verify --audits` baseline on this branch (2026-10-28) fails four pre-existing steps: production-data and
all-runtime-data suspicious text matches, undeclared `vitest` in `multi-currency`, and a stale generated permission
catalogue. `audit:sdlc`, layers, API boundary, navigation, windows, migration pins and deployment profile pass.
Full log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-28T03-08-14-135Z.log`.

**Current implementation evidence (2026-10-28):** WI-OI-122 added a transaction-bound document-action coordinator
with authorized idempotent replay, local audit/outbox writes and rollback on failure; its package typecheck and 8
tests pass. The `business-partners` module was generated as a **PLANNED, CONCEPT-only scaffold** for WI-OI-123; no
Business Partner business slice is complete. Generated gateway/navigation equivalence tests were updated and pass
(79/79). Full `pnpm verify` built successfully but is **not clean**: the escalated run found six test failures before
the equivalence test corrections (three from the new scaffold, now corrected, and three unrelated), plus the three
pre-existing audit categories. The Inventory period-replica certification also failed; isolated proof needs
rechecking. Full log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-28T03-22-05-519Z.log`.

**F0 proof update (2026-10-28):** the shared document-action coordinator passed 3 opt-in tests on throwaway
PostgreSQL 16 with a least-privilege role and forced RLS (replay/authorization/tenant isolation, rollback, row-lock
contention). The organization access contract passed 2 opt-in tests on a separate throwaway PostgreSQL 16 (North
versus South, explicit shared rows, other-tenant isolation, grouping-unit refusal, version lag). Both containers were
removed. Package typechecks pass. F0 remains In Progress until a clean full verification and its first module adapter
prove the contract in a business flow; Business Partner remains a PLANNED scaffold.

**Business Partner Build update (2026-10-28):** WI-OI-123 is In Progress. Additive migration 2, forced tenant RLS,
local organization replica, kernel organization job, signed Party/role relay and versioned inbox projection, scoped
customer/vendor account routes with live Finance control-account validation, and exact credit arithmetic are in the
working tree. Four isolated PostgreSQL 16 tests pass, including migration grants, tenant isolation, event replay and
scoped customer account creation; targeted relay, Finance, navigation and module tests pass. Orders now sends its
owning unit through a signed fulfillment outbox relay to AR; AR migration 17 and Orders migration 5 passed isolated
PostgreSQL proof. New AR invoices require immutable organization ownership, an active Party/customer mapping and
configured billing; manual AR writes check the delivered organization version. Historical ownerless invoices remain
unmapped and must fail future BP credit approvals closed. The module remains PLANNED/CONCEPT because complete
credit exposure, holds, metadata screens and the complete business journey are open.
Evidence: `.pi/work/WI-OI-123.md`.

**Business Partner credit-feed sub-slice (2026-10-28):** AR migration 18 queues ordered balance snapshots on
invoice issue, payment/credit-note settlement and void; a signed relay targets the Business Partner credit inbox.
The inbox converts snapshots into immutable exact deltas and rejects gaps or changed-body duplicate messages.
Disposable PostgreSQL 16 proofs passed for AR issue → payment → void (100 → 70 → 0), ordered leasing, and BP
credit deltas (+100/−30), tenant isolation and replay refusal. Source watermarks, Orders exposure, prepayments,
historical reconciliation, holds, screens and the complete journey remain open. WI-OI-123 remains In Progress;
Business Partner remains PLANNED/CONCEPT, with no module-completion commit or deploy.
Targeted AR/BP/contract tests passed 26/26 and migration pins agree. The full `pnpm verify` build stopped making
progress and was interrupted without a result; the subsequent `pnpm verify --audits` passed all gates other than
the existing production/all-runtime data and multi-currency dependency audits. Audit log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-28T05-04-29-855Z.log`.

The latest full `pnpm verify` passed build, navigation, SDLC, layers, module manifests, migration pins, windows and
deployment profile. It failed three unrelated test suites (workflow companion route classification, privacy model
catalogue, RBAC expectation) and the existing production/all-runtime data and multi-currency dependency audits.
Full log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-28T04-25-43-296Z.log`.
No module is Built or Done; no module-completion commit or deploy was made.

---

The order of all work is [execution plan v3](../docs/plans/gigalibs-execution-plan-v3.md) (owner-approved 2026-10-13)
and [the Phase 1 order](../docs/plans/phase-1-sizing.md) (owner-approved 2026-10-16). Statuses are in
[WORK_ITEMS.md](WORK_ITEMS.md); evidence is in [work/WI-OI-120.md](work/WI-OI-120.md).

**Delivery rule change (owner, 2026-10-22):** Three-phase pattern now in force for all agents (Codex, Cursor, Claude).
See `AGENTS.md § Delivery phases`. Summary: BUILD all modules → REVIEW per module → UAT per module group in sequence.
Agents commit once the full module is complete and `pnpm verify` is clean. No mid-module deploys.
Full deploy sequence and module completion gate are in `AGENTS.md`.

**Owner decisions recorded 2026-10-22:**
- GL: build last as lightweight virtual ledger; scope confirmed before Group 11 build starts.
- Security review: post-UAT, not pre-deploy. Does not block any deploy.
- F2.9: owner functional acceptance on UAT is sufficient; formal accountant review deferred, non-blocking.

## Historical step — **Group 5 Workforce BUILD (Phase 1)**

**120gd** journey **`jsjmyx`** (2026-10-22): **0 CMMS blockers** — 5 Workforce blockers deferred to Group 5. Labour form fix committed `9b9945c1`. **Owner: accept CMMS journey as clean → tick PHASE-1-CM1 row 1 → schedule Group 1 deploy day.**

**Group 5 Workforce task cards (2026-10-24 status):**
- [WI-OI-120hj](tasks/WI-OI-120hj.md) (T1a, **Built — uncommitted**): root cause found: stale compiled
  manifest on UAT stored `platform-user-id` as TEXT → admin typed email → UUID mismatch → 403.
  `requireWorker` extracted + 4 tests; `ownWorker` refactored; 343 tests pass, TS clean.
  **Next: owner says "commit" → deploy → republish `wf-resources` and `wf-my-absences` in Config Studio.**
- [WI-OI-120hk](tasks/WI-OI-120hk.md) (M-WF2, **no code needed**): "Submit week" button exists at
  `TimeAndAttendance.tsx:477`; `Approvals` component exists at lines 484–543; all API endpoints exist.
  B2/B4 unblock when B1 (120hj) is fixed.
- [WI-OI-120hl](tasks/WI-OI-120hl.md) (M-WF1 fix, **no code needed**): window JSONs are correct; lookup
  chain works; tests exist in `availability-record-adapters.spec.ts`. B3/B5 unblock when B1 is fixed +
  `wf-my-absences` manifest republished in Config Studio.
- [WI-OI-120hm](tasks/WI-OI-120hm.md) (M-WF1, **Done — investigation; owner decision 2026-10-24**): the held
  Jobs & positions window is **not** built as metadata. Its workbench parity (effective-dated revision chain +
  engagement lifecycle) needs new record adapters (revisions, engagements) + framework features (multi-select,
  as-of, date-conditional actions) — L-sized, overlapping M-WF3. **Decision: `/gigaops/jobs` stays a workbench
  component** (like clock-in and dispatch); metadata build deferred to a future L card; `jobs-window.held.mjs`
  retained. Only the site/dept picker was trivially ready (`wf.positions` already writable).

### Phase 2 — Workforce & departments: development status (2026-10-24)

Owner directed completing Phase 2 development (plan v3 steps 2.1–2.9) autonomously. Outcome after investigation:

| Step | Item | Outcome |
|---|---|---|
| 2.1 | M-WF1 Jobs window | **Done** — kept as workbench component ([WI-OI-120hm](tasks/WI-OI-120hm.md)). |
| 2.2 | T1a auto worker-link | **Deferred** ([WI-OI-120o](tasks/WI-OI-120o.md)) — cross-service identity delivery; B1 already fixed the blocker. |
| 2.3 | M-WF2 time on metadata | **Done — keep component** ([WI-OI-120hk](tasks/WI-OI-120hk.md)); Jobs-class, works via B1. |
| 2.4 | T1b worker reconciliation | **Done — moot** ([WI-OI-120hn](tasks/WI-OI-120hn.md)); 0 rows in `wfo_workers`. |
| 2.6 | T2 departments → org units | **Essentially done** — positions carry org-unit `department_id` with scope enforcement; no free-text department remains. |
| 2.7 | R5 Workforce scope | **Enforcement built, both dimensions ([WI-OI-120ho](tasks/WI-OI-120ho.md)).** Unblocked (WI-OI-119 resolved). Unit+place scope-by-assignment on all four person reads (`listResources`, `lookupResources`, `listAbsences`, `listAllPatterns`) via `peopleScopeClause`; integration-tested North≠South by **place and unit** on a throwaway PG16; gigaops suite 343 green. Open: the allow-list flip (gated — units on bookings/time/pay + reference-data decision), R5 Geospatial (separate module), UAT journey. |
| 2.8 | R3 segregation of duties | **Built ([WI-OI-120hp](tasks/WI-OI-120hp.md))** — catalogue + `dutyConflicts` (contracts, 8 unit tests); control-plane wiring: `assertNoDutyConflict` in `assignMemberRole`, `duty_conflict_acceptances` table/migration, accept/revoke methods (throwaway PG16, 3 tests); **HTTP routes added**. Open: Security review (post-UAT). |
| 2.9 | R4 delegation & revocation | **Built v1 ([WI-OI-120hq](tasks/WI-OI-120hq.md))** — validation core (contracts, 13 unit tests); control-plane wiring: delegation columns/migration, `delegateRole`/`revokeDelegation`, live-only mint filter (throwaway PG16, 5 tests); **HTTP routes added**. v1 = workspace-scope. Open: unit/place scope, `exp` bound + `auth_version` bump; Security review (post-UAT). |

**Net (updated 2026-10-25):** Phase 2 feasible work is complete. R3 (SoD), R4 (delegation v1) and R5 (unit+place
scope) are now **built + integration-tested** (throwaway PG16) with HTTP routes; B1 fixed + hardened. The 15-commit
release is **assembled + parked** on `release/wi120u-workforce` (Dockerfile build-fix + cherry-pick, proven clean);
the only thing blocking the UAT build is **disk** (23 GB free, needs 60 — owner freeing it). See
[DEPLOY handoff](handoff/DEPLOY-2026-10-24-WORKFORCE-RBAC.md). Still gated: R5 allow-list flip (reference-data
decision), T1c (ADR-level), Assistant part (needs GU1–GU7), R5 Geospatial (separate module).

### Phase 3 — Enterprise onboarding & SaaS completion (started 2026-10-25)

Owner approved starting Phase 3 while the Phase 2 deploy waits on disk. [WI-OI-120p](tasks/WI-OI-120p.md) (R13/R14, XL):
- slice 1 (module roles) largely in place; slice 2 (several roles) done.
- **slice 3 (department allowances) built:** `department_role_allowances` table/migration + Tenant-Admin set/remove/list.
- **slice 4 (delegated people-mgmt) complete:** authorization core + `authorizeDelegatedPeopleAdd` + the
  `delegatedInvite` endpoint (`POST current/delegated-invitations`, `people:manage`) — issues a one-time invite
  carrying custom roles + unit (no email), and `acceptInvite` grants them scoped to the unit on acceptance.
  End-to-end integration-tested on a throwaway control DB (invite→accept→scoped role; out-of-unit refused);
  `people:manage`/`people:read` registered; `tenant_invites` gained `customRoleIds`/`unitId`.
- **slice 5 (bulk add, R14) core built (2026-10-25):** `validateBulkPeopleAdd` (pure, 3 unit tests) checks every
  row before anything is created, so a batch is all-or-nothing; `bulkDelegatedInvite` loads the head's scope once,
  validates the batch + per-row duty conflicts, then issues each invite in one transaction via the shared
  `writeDelegatedInvite` (returns one-time links, no email). Route `POST current/delegated-invitations/bulk`
  (`people:manage`). Integration-tested on a throwaway control DB (valid batch creates all + accept grants scoped
  role; out-of-unit + already-member batch creates none). Single-invite path re-verified; tenancy-nest 96 pass.
  **Committed c855779c.**
- **slice 5 tracker + bulk resend/revoke built (2026-10-25):** `inviteStatus` (pure, 4 tests); `listDelegatedInvites`
  (join tracker, `GET current/delegated-invitations`, `people:read`, statuses, no tokens); `bulkRevokeDelegatedInvites`
  and `bulkResendDelegatedInvites` (`people:manage`, pending-only, resend re-authorizes + rotates the link in place).
  Integration suite now 5 tests (add/abort/tracker/resend/revoke); single-invite path re-verified; tenancy-nest 108
  unit pass; audit:layers clean. **Slice 5 (R14) complete. Uncommitted — awaiting "commit".**
- **slice 7 offboarding built (2026-10-25):** plan exit line splits actors (grant = head within allowances, offboard
  = administrator). `bulkOffboardMembers` suspends many members at once (member status has no DEACTIVATED, so offboard
  = SUSPENDED; access gated, roles kept); all-or-nothing under one tenant lock, the sole Tenant Admin protected, self +
  already-suspended skipped. Route `POST current/members/bulk-offboard` (`users:update` + admin check). 5 integration
  tests. **Bulk grant GATED:** a unit-scoped grant needs the module on `SCOPE_ENFORCING_MODULES` (R5 allow-list flip,
  owner/Security) to be enforced — build after that. **Uncommitted — awaiting "commit".**
- **slice 10 (platform-role review) reviewed (2026-10-25):** CONFIRMED + locked with regression tests
  (`auth-nest/session-permissions.spec.ts`). A platform role (`PLATFORM_OWNER|ADMIN|AUDITOR`) gives tenant-wide data
  authority (whole org tree + unbounded places via `hasTenantWideAuthority`), but only inside a workspace the holder
  belongs to — the active-membership gate in `assembleContext` is checked before platform roles are read, so they
  never bypass it (new test). Scope only, not permissions. Finding for Security: `hasTenantWideAuthority` keys off
  `platformRoles.length > 0` (any role); correct for the 3 current enum values but a blanket rule — recommend an
  explicit allow-set. Also repaired a pre-existing stale assertion in that spec (R4 live-window `where`).
  **Uncommitted — awaiting "commit".**
- **slice 9 (scope in every module, R14) — Procurement requisitions built (2026-10-25):** record read/write scoping
  is NOT gated on the R5 allow-list (that gate is only for unit-scoped role *grants*). Added
  `universal-procurement .../organization/organization-scope.ts` and wired it into `listRequisitions`/`getRequisition`/
  submit/approve/reject (one `fetchScopedRequisition` choke point): out-of-read-scope → not-found, out-of-write-scope →
  Forbidden, fail-open when no org tree is in force. 10 pure unit tests + a Docker-gated cross-department integration
  test (3, run green).
- **slice 9 — Orders (quotes + orders) built (2026-10-25):** same pattern, bigger surface (service reads/writes took
  `tenantId` and are called from the controller + 7 window/workbench record-adapter sites → threaded the
  `ModulePrincipal` through). Every quote/order read+write scoped (list/get/create/accept/confirm/convert/allocate/
  cancel): out-of-read → not-found, out-of-write → Forbidden. ~21 call sites; typecheck clean; orders suite 7 pass;
  Docker-gated cross-department integration test (3, run green). **Uncommitted — awaiting "commit".**
- **slice 9 — Finance (fixed assets) built (2026-10-25):** finding — Finance's GL (books/accounts/periods/journals)
  is tenant-level by design; only fixed assets carry a (nullable) `org_unit_id`. Scoped every fixed-asset read+write
  (list/get/schedules/create/capitalize; reads restructured to `withTenantTransaction`); asset classes stay tenant
  level. Typecheck clean; finance suite 71 pass. **DB integration test deferred** (deep book→account→class→asset
  fixture chain + no finance harness; logic identical to Docker-proven proc/orders) — follow-up. **Uncommitted —
  awaiting "commit".**
- **slice 9 — CMMS units already done (verified 2026-10-25):** stale card note corrected — CMMS `auth/scope.ts`
  (WI-OI-120be/bu) filters work orders on `department_id` (units) + `site_ref` (places), reads and writes, unit-tested.
  No new code. **Milestone: every main module's primary record is now org-scoped** (Procurement requisitions, Orders
  quotes+orders [integration-proven], Finance fixed assets [wired], CMMS work orders [done], Analytics/Catalogue/
  Workforce/Geospatial [pre-existing]). **Docs-only change uncommitted — awaiting "commit".**
- **slice 9 — Procurement purchase orders built (2026-10-25):** scoped PO read+write (get/list/issue/acknowledge via a
  `fetchScopedPurchaseOrder` choke point + create-guard); integration test extended to 4 (PO dept-isolation green).
  Vendor bills/debit memos carry no `org_unit_id` → isolated transitively via parent PO (direct scoping needs a join,
  deferred). Procurement suite 16 pass. **Uncommitted — awaiting "commit".**
- **slice 9 — Orders downstream documents built (join pattern, 2026-10-26):** downstream docs have no `org_unit_id`;
  scoped by joining to the parent order's unit (`parentOrderUnit`/`memoOrderUnit` helpers; credit memos COALESCE
  order_id + invoice→order). Done: fulfillments (list/get/create/dispatch), customer invoices (list/get/create),
  credit memos (list/get/create), returns (list), AR projections (get) — ~20 sites across controller + record-adapters.
  Integration test now 5 (fulfillment/invoice/memo dept-isolation green); bumped throwaway-pg connect timeout 60→180
  (container start slow under many-container load). Orders suite 7 pass. **Uncommitted — awaiting "commit"** (one
  logical change with the fulfillment work from the prior turn).
- **slice 9 — Procurement vendor bills / debit memos built (2026-10-26) → SLICE 9 COMPLETE:** both carry no
  `org_unit_id`; scoped by joining to their purchase order (`purchaseOrderUnit`/`vendorBillUnit`/`debitMemoUnit`; a
  memo reaches its PO directly or via its bill). get/list/approve/create for both scoped (no caller churn — already
  took `ModulePrincipal`); integration test now 5 (vendor-bill dept-isolation green); proc throwaway-pg timeout
  60→180. Procurement suite 16 pass. **Uncommitted — awaiting "commit".**
- **Slice 9 COMPLETE:** every unit-bearing record + downstream doc across all modules is org-scoped with
  cross-department tests. Optional leftovers only: Procurement approval-policies list (config); finance fixed-asset DB
  integration test (deferred). The per-module `organization-scope.ts` copy is by-design (nest glue).
- **R5 readiness evidence built (2026-10-26):** `contracts/rbac/erp-r5-context-coverage.spec.ts` proves catalogue
  coverage for `universal-procurement`/`universal-orders`/`financial-operations` (every checked code catalogued +
  owned); paired with the slice-9 cross-department integration tests = both halves of the R5 card.
- **R5 flip APPLIED (owner-authorized 2026-10-26):** the three ERP modules added to `SCOPE_ENFORCING_MODULES` as
  `{units:true, places:false}` — unit-scoped role *grants* now allowed for them (Tenant Admin Settings→Team + delegated
  invite). RBAC suite 106 pass; flagged for the independent Security review.
- **slice-7 delegated GRANT built (2026-10-26) → slice 7 COMPLETE:** `validateBulkPeopleGrant` (3 unit tests;
  requires an existing member) + `bulkDelegatedGrant` (resolve members → delegated-rule + SoD validation, all-or-nothing
  → grant each role unit-scoped via `resolveRoleScope`, reusing assignMemberRole's invariants; already-held skipped).
  Route `POST current/delegated-grants` (`people:manage`). Integration test (3: non-member/out-of-unit/mixed-batch
  refused, grant nothing); happy-path write reuses the tested `resolveRoleScope` path. tenancy-nest 107 pass.
- **Procurement scope coverage hardened (2026-10-26):** closed the handoff's spot-check gaps — `matchReceipt`/
  `matchInvoice`/`approvePriceVariance` write-scoped by the PO's unit, `listApprovalPolicies` read-scoped by
  `org_unit_id` (integration test now 6). `projectInventoryReceipt` left unscoped by design (inbound inventory relay,
  not a user action). Procurement is now fully unit-scope-covered. **Uncommitted — awaiting "commit".**
- WI-OI-120p remaining is otherwise gated: slice 6 (WI-OI-120o, deferred), slice 7-grant + the R5 allow-list flip
  (owner/Security), slice 8 SSO (credentials).

**WI-OI-120bq:** re-review complete (2026-10-22); all H/M findings closed; F2.9 deferred non-blocking per owner. **Ready for Group 4 UAT deploy** (release worktree, after CMMS M-CM1 deploy).

**Not in this track:** reliability, floor kiosk, full EAM (Phase 6 **M-CM2** / roadmap P4b).

**Owner, 2026-10-18:** complete CMMS Phase 1 in order:

| # | Item | Card | Status |
|---|------|------|--------|
| 1 | Supervisor sign-off + journey **0 blockers** | [WI-OI-120bi](tasks/WI-OI-120bi.md) | **On UAT** `1d8d2634`, CMMS mig **22** — run journey → owner **Done** |
| 2 | Zero-mock detour (optional before W1-B) | [WI-OI-120bj](tasks/WI-OI-120bj.md) | **On UAT** (web in `1d8d2634`) |
| 3 | Unit/site scope **on** (North ≠ South) | [WI-OI-120bk](tasks/WI-OI-120bk.md) | **On UAT** — journey North/South step proves scope |
| 4 | CMMS record routes on UAT (if not in same release as W1-B) | [WI-OI-120ag](tasks/WI-OI-120ag.md) | Built; ships with 1.3 releases |
| 5 | R5 slices on UAT (aa/ab/ac + M-CM1 120t) | [WI-OI-120be](tasks/WI-OI-120be.md) W1-A | Partially on UAT via prior releases; W1-B completes scope |

**Table 1 audit (owner 2026-10-19):** done → [work/TABLE-1-AUDIT-2026-10-19.md](work/TABLE-1-AUDIT-2026-10-19.md). **T3 (120ad)** after Table 1 backlog starts. Dev rhythm: [OWNER-DEV-RHYTHM-2026-10-19.md](OWNER-DEV-RHYTHM-2026-10-19.md) (local compose, autonomous Table 1 slices).

**WI-OI-120bo (2026-10-20, Built):** UAT module-host restored (owner) and verified. Prevention built: release-worktree rule on 29 UAT-acting scripts, compose wrapper limited to isolated project `gigalibs-test`, `pnpm test:minimal-p2p-o2c` **2 passed** on a fresh test database with no manual SQL. Card: [WI-OI-120bo](tasks/WI-OI-120bo.md). UAT cleanup done by the owner and verified. Open: commit on "commit".

**WI-OI-120bp (2026-10-21, Built):** Committed **`6ea5a927`** + stack evidence: `gigalibs-test` **`pnpm test:minimal-p2p-o2c` 2/2**, F2.7 **26/26**. **Open:** Security review. Card: [WI-OI-120bp](tasks/WI-OI-120bp.md).

**WI-OI-120bq (2026-10-21, Built):** Committed **`b85a4244`** + **`0116525e`** (S16 product-cost adapter, U2/U19a verify fixes). Finance **13–15**, Inventory **7–9**; Table 2 H2/H3/M3 + **120bp review B2–B7**. **Stack (2026-10-21):** F2.7 **26/26**, U12 **28/28**, U2 **39/39**, U19a **70/70**, S16 Finance **PASS**. **`pnpm verify --audits`:** HTTP/Table-2 slices pass; **8 FAIL** on legacy Finance slice scripts (`verify-financial-operations.mjs` still expects mig **1** on `PROOF_DATABASE_URL`) + **audit:design-tokens** (other session). **`test:minimal-p2p-o2c`:** needs owner **`gigalibs-test`** stack up (no containers running here). **Open:** Claude re-review (deferred), F2.9. Card: [WI-OI-120bq](tasks/WI-OI-120bq.md).

**WI-OI-120br (2026-10-20, Built, committed `68be9379` on its branch):** SPEED S1 engine package `packages/process-safety-engines` in worktree `gigalibs-speed-s1` (branch `feat/speed-s1-engines`): BRD TC-01–TC-12 pass, 40 tests, coverage 98.5 % lines / 93.0 % branches; criteria, library and element data are inputs (no hard-coded thresholds). Card: [WI-OI-120br](tasks/WI-OI-120br.md).

**WI-OI-120bn (2026-10-20, Approved):** SPEED Stage 1 approved with D1–D9 as recommended (owner). S1 done; next S2b (metadata panels, own worktree, no overlap with Cursor); S2 (audit) after 120bp/120bq; S3 (module) after S2 and S2b. Plan v1.3: [SPEED-Stage1-Implementation-Plan.md](../docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md).

**WI-OI-120bs (2026-10-20, Built, committed `ad75a0f1` on its branch):** SPEED S2b metadata panels in worktree `gigalibs-speed-s2b` (branch `feat/speed-s2b-metadata-panels` from `6ea5a927`): modules register panels in `spec.ui.panels`, windows place them with typed props, the compiler refuses anything unregistered, foreign or mistyped, the renderer draws registered components or names a missing one. All 46 shipped windows compile to identical checksums; build and every audit pass. Card: [WI-OI-120bs](tasks/WI-OI-120bs.md).

**WI-OI-120bt (2026-10-21, Built, docs):** SPEED screen specifications for S3–S7: every mock screen as windows, fields and 8 registered panels with typed props, all states, the message catalogue for the engine codes, token mapping, accessibility and acceptance checks. Found: S7 needs engine functions `actionList` and `stage2Plan`, and interaction rules carry their recommended Stage 2 test (plan v1.4). [Screen specifications](../docs/pharma/speed/SPEED-Stage1-Screen-Specifications.md); card [WI-OI-120bt](tasks/WI-OI-120bt.md).

**WI-OI-120bv (2026-10-21, Built, committed `0834520c` on branch `feat/speed-s1-engines`):** SPEED S7a engine functions `actionList` (actions before kilo-lab, with controls and accepted mitigations as inputs) and `stage2Plan` (test plan; an interaction's test comes from its library rule, not code); engines 0.2.0, 50 tests, coverage 98.9 % lines / 94.0 % branches. Screen spec v1.1 §4.4–4.5 lists the final codes. Card: [WI-OI-120bv](tasks/WI-OI-120bv.md).

**WI-OI-120bw (2026-10-21, Built, committed `48fa7aaf` in worktree `gigalibs-speed-s3`, branch `feat/speed-s3-module`, with S1 and S2b merged in at `1cdb47bb`):** SPEED S3, the `process-safety-screening` module (schema `gigalibs_speed`, `/speed`, `/api/speed`, `speed.*` roles) with Projects as real CRUD: site-scoped by the organization replica, idempotent create, versioned change and archive with a reason, audit and outbox in one transaction, the `speed-projects` window (bundle and pack moved to S9). 24 tests pass (12 on a throwaway PostgreSQL 16 as the least-privileged role); static conformance 15/15; window conversion PASS; `pnpm verify` fails only on base-commit failures (Finance window from `b85a4244`, two Playground env tests). Next: S4 ([WI-OI-120bx](tasks/WI-OI-120bx.md), Proposed). Card: [WI-OI-120bw](tasks/WI-OI-120bw.md).

**WI-OI-120bx (2026-10-21, Built, committed `70fe93e0` on `feat/speed-s3-module`):** SPEED S4 substances, routes, steps and the gate workbench: criteria sets (cited, one in force), substances (molar mass on the server), routes with steps, materials and conditions, immutable audited results recomputed on every change; windows Substances and Routes and the Projects Routes tab; panels `speed.route-summary` and `speed.gate-workbench` with a reason on every change. TC-04 and TC-05 through the API; 71 SPEED tests; `pnpm verify` fails only on base-commit failures. Card: [WI-OI-120bx](tasks/WI-OI-120bx.md).

**WI-OI-120by (2026-10-21, Built, committed `79ccb50e` on `feat/speed-s3-module`):** SPEED S5: library sets (cited, one in force; moved from S6), cited thermal data, ΔHr source, energetic tags and mitigations; the server stores OB, thermal and green results for steps that pass the gate; panels for Oxygen balance, Thermal & runaway (with in-browser preview) and Green metrics; the Screening criteria window. The reference route through the API equals the engines (TC-01 to TC-03, TC-06 to TC-10); 97 SPEED tests; `pnpm verify` fails only on base-commit failures; the 1366 × 768 layout is not yet checked in a browser. Card: [WI-OI-120by](tasks/WI-OI-120by.md).

**WI-OI-120bz (2026-10-21, Built, committed `82f3b114` on `feat/speed-s3-module`):** SPEED S6: substances linked to library materials (classes; linking recomputes draft steps), the interaction screen stored with each passing step, documented controls for findings (BRL-04), the Interactions tab (matrix, findings with library text and citation, controls, notes, the "absence of a finding" statement), and the library window with entry tabs. TC-11 through the API; 110 SPEED tests; `pnpm verify` fails only on base-commit failures. Card: [WI-OI-120bz](tasks/WI-OI-120bz.md).

**WI-OI-120ca (2026-10-21, Built, committed `32c010a1` on `feat/speed-s3-module`):** SPEED S7 dossier: one model (domain package, which now holds the catalogue) rendered as DOCX and PDF by a module worker into the object store, watermarked "DRAFT — NOT APPROVED" on every page, each file's SHA-256 checked on every download (409 and audited on a mismatch); JSON and CSV exports; the route's Dossier tab. No `SPEED_STORAGE_*` wiring yet (S9): without it, generation answers 503. 143 SPEED tests; `pnpm verify` fails only on base-commit failures. Card: [WI-OI-120ca](tasks/WI-OI-120ca.md).

**WI-OI-120cb (2026-10-21, Built, committed `02bd35ff` on `feat/speed-s3-module`):** SPEED as its own sidebar section like EAM (owner): the SPEED entry expands into Projects, Routes, Substances, Screening library and Screening criteria, each its own generated page (`/speed/projects` …; `/speed` opens Projects), declared as the catalogue entry's `menu` and pages in `module.yaml`. Readiness stays PLANNED (UAT preview only). `pnpm verify` fails only on base-commit failures. Card: [WI-OI-120cb](tasks/WI-OI-120cb.md).

**WI-OI-120cc (2026-10-21, In progress; S9a built, committed `5b74a503` on `feat/speed-s3-module`):** SPEED S9 targets the `speed-lab` instance, not UAT (plan v1.4 D1/D7). S9a: the kernel now delivers organization versions to SPEED; a `gigalibs-speed-lab` preview instance (own PostgreSQL, MinIO, network, port 5190; scripts refuse any other project) is running with a TEST workspace, the TEST FIXTURE criteria and library and the reference route; every SPEED screen checked at 1366 × 768; Dockerfile Debian pins moved to the served security versions (main's builds fail on the old pins). Found: Finance and Inventory migrations cannot install on a fresh database (they grant to their runtime role before the runner creates it). Card: [WI-OI-120cc](tasks/WI-OI-120cc.md). R1 completion committed `fb21e5c8`: Outcomes page (S9b), write-up parser (S8), audit trail page, Data gaps tile and role labels on the matrix; S9c and S9d move to the deployment phase.

**WI-OI-120ce (2026-10-22, second release deployed):** SPEED as the prototype shows it. Round 1 (`d039b970`, deployed): 7 prototype defects fixed, pack import, starter packs. Round 2, from the owner's failed project on UAT: sites in force only (SPEED's `speed-sites`), typing spaces (every window), no system fields on create forms, one searchable picker, Excel/JSON pack files with templates, and a lab-only browser suite (27/27 passed; report https://claude.ai/artifact/5GjAFyMmCcba35ohiRytMY). SPEED `dc99f1bb`, release `a1eb8242`: deployed on UAT (running since 05:43 UTC, healthy; backup `gigalibs_backup_20261022_053053Z`). Card: [WI-OI-120ce](tasks/WI-OI-120ce.md).

**WI-OI-120cf (2026-10-26, Built: deploy group 2 module complete, `3ee0cdd4`):** the mobile v1 BFF on branch `feat/mobile-v1-bff` (worktree `gigalibs-mobile-bff`): `/mobile/v1` sign-in, TOTP challenge (no token before it), workspaces with an idempotent switch, session v3, one-use refresh with reuse revoking the session, logout, minimum app version, cleanup; one forward migration (`20261026100000_mobile_sessions`); a local-network HTTPS proxy exposing only `/mobile/v1` with a local certificate authority; the mobile team's connection guide. 62 mobile tests; `pnpm verify` no new failures. Next: owner's group 2 UAT deploy from a release worktree (I prepare it), then the Security review on UAT. Card: [WI-OI-120cf](tasks/WI-OI-120cf.md).
**WI-OI-120cd (2026-10-21, In progress: SPEED live on UAT; trial-delivery fix building):** SPEED on UAT (owner, reversing plan v1.4 D1/D7 for UAT; SPEED stays PLANNED, under the UAT preview). Deployed `76780730`, then fix `19048071` (CMMS's regenerated `cmms-work-orders` baseline had stopped window activation for every tenant); SPEED's windows active for "GigaLibs Global Enterprise". Platform defect found: the kernel's subject context refused TRIAL tenants, so organization delivery never worked on UAT (no ACTIVE tenant; 23 deliveries quarantined); fix `a1765ce6` (SPEED branch `c47a5c1e`) building. SPEED ships no data; criteria and library load only through the API (no screen yet). Security review not yet recorded. Card: [WI-OI-120cd](tasks/WI-OI-120cd.md).

**WI-OI-120bp review (2026-10-21):** [WI-OI-120bp-REVIEW-2026-10-21.md](work/WI-OI-120bp-REVIEW-2026-10-21.md) — design sound, coupling gone, one-transaction posting and signed relays correct; **not releasable** until B1 (broken Finance 13 / Inventory 7 in the commit, fixed only in the working tree) is committed and B2 (no RLS on new replica tables), B3 (out-of-order period events), B4 (snapshot only after the first receipt), B5 (sync marked complete too early) are fixed.

**Batch acceptance:** [PHASE-1-CM1-CHECKLIST.md](tasks/PHASE-1-CM1-CHECKLIST.md) — one deploy, one journey, tick all five rows.

**Table 2 engines (another agent, 2026-10-18; tracker [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md)):**
- **Built in git:** WI-OI-120fl to 120gb, Finance migrations 10 and 11, Inventory migration 5. Their tests pass (475,
  2026-10-18).
- **Not on UAT.** 5 of the 6 cards checked record no independent Security review, and the accounting sign-off (F2.9)
  is pending.
- **`pnpm verify --audits` found 3 defects from it (2026-10-18):**
  - the Inventory API depends on `document-lifecycle` and `posting-rules`, which are missing from the Docker
    workspace, so the image would not build;
  - Finance writes Inventory's schema (`inventory-receipt-posting-status-sync.ts`, a new layer violation);
  - the inventory-receipts window is stale (S16).
- **Independent Security review (2026-10-20):** [TABLE-2-SECURITY-REVIEW-2026-10-20.md](work/TABLE-2-SECURITY-REVIEW-2026-10-20.md) — **not releasable yet**: H1 retry doubles cost layers, H2 one rejected posting blocks period close forever, H3 single standard cost and hard-coded USD, H4 = WI-OI-120bp; M1–M3, L1–L3. Relay security itself is sound.
- **Never deploy from the branch.** Table 2 goes to UAT through the release worktree, after its reviews, when the
  owner decides it is its turn.
- **One implementation writer at a time:** the owner confirms which agent writes.

## Running on UAT

- **Release `1d8d2634`** (owner deploy 2026-10-18), tag **`1d8d2634b8f2-c6148e918ff0`**: Phase 1 CMMS batch (mig **22**,
  **120bk**, **120bj**). Predecessor **`38aa3120`**.
- **Deploy smoke:** DEPLOY SMOKE PASSED (all migrations, 11 services healthy, `/api/health/ready` and `/login` 200).
- **CMMS migration:** **22** (read-only verified after deploy).
- **Backup used:** `gigalibs_backup_20261018_112331Z` (predecessor **`38aa3120`**).
- **Rollback:** keep **`38aa3120`** images; backup above; down **`000022`** then **`000021`** if rolling back schema.
- **Journey `e55hku` (2026-10-18, tag `1d8d2634`):** 71 findings, **7 blockers** — org + North CMMS role at units **201** OK;
  technician CMMS **403** because the custom role was saved with **one** permission (`cmms.parts.read`): the journey loop
  called `selectOption` per code on a React multi-select (each call replaced the prior choice). **Fixed in journey spec**
  (one `selectOption([...])` + selected-count assert). Fix pushed **`f56ae886`**. Re-run journey → **WI-OI-120gd**; no redeploy for journey-only fix.
  Prior **`dujc47`**: 8 blockers (org not in force); **`dnnzu9`**: sign-off **500** on mig **21**.

## Next implementation (Table 1 backlog, local compose)

1. **WI-OI-120gd** — **Built** (product); journey proof when **5180** `cmms-api` includes **`9eb14717`** ([CMMS-DEV-THEN-DEPLOY.md](handoff/CMMS-DEV-THEN-DEPLOY.md)).
2. **WI-OI-120ge** — **Done** in git **`0031a2f4`** (pushed); `pnpm audit:configuration-deployment-profile` passes.
3. **WI-OI-120gf** — **In progress** (M-AR0): compose + module SDK; E1 build done in **WI-OI-120gw**.
4. **WI-OI-120gg** — **Built** in git **`cdcbf2c9`** (pushed): vendor party guard mig **4**.
5. **WI-OI-120gh** — **Built** in git **`b9e29301`** (pushed).
6. **WI-OI-120gi** — **Built** in git **`530c2597`** (with 120gj): orders mig **4** customer party guard + SO dictionary **Customer** field.
7. **WI-OI-120gj** — **Built** in git **`530c2597`**: orders first metadata window (`orders-sales-orders`) + record routes + live `/orders` page.
8. **WI-OI-120gk** — **Built** in git **`6e9cb4bd`**: sales quotes metadata window + `/orders` tab with sales orders.
9. **WI-OI-120gl** — **Built** in git **`29d000b5`**: customer invoices metadata window + `/orders` tab.
10. **WI-OI-120gm** — **Built** in git **`8932d626`**: fulfillment window + `/orders` tab.
11. **WI-OI-120gn** — **Built** in git **`8932d626`**: vendor bills window + `/procurement` tab.
12. **WI-OI-120go** — **Built** in git **`3195e0aa`**: customer credit memos window + `/orders` tab.
13. **WI-OI-120gp** — **Built** in git **`76ddb447`**: procurement requisitions window + `/procurement` tab.
14. **WI-OI-120gq** — **Built:** procurement debit memos window + `/procurement` tab (see git log on branch).
15. **WI-OI-120gr** — **Built** in git **`7d78ba84`**: requisition submit/approve + vendor bill approve F0 actions on procurement windows.
16. **WI-OI-120gs** — **Built** in git **`01f66dbd`**: quote accept + SO confirm + PO issue/acknowledge F0 actions.
17. **WI-OI-120gt** — **Built** in git **`8d979683`**: minimal P2P + O2C ([TABLE-1-MINIMAL-FLOWS.md](TABLE-1-MINIMAL-FLOWS.md)); `proof:minimal-p2p` / `proof:minimal-o2c`.
18. **WI-OI-120gu** — **Built** in git **`90336704`:** Playwright minimal P2P/O2C compose flow + BFF `convert-to-po` gateway route.
19. **WI-OI-120gv** — **Built** in git **`85d2b36c`:** SO **allocate** + fulfillment **dispatch** (`issue-id`) F0 metadata actions.
20. **WI-OI-120gw** — **Built** in git **`9f5021df`:** M-AR0 E1 — AR API in root build; nest helper packages fixed.
21. **WI-OI-120gx** — **Built** in git **`1e0f7a38`:** AR `ar-api` image + compose migrations/service; BFF `ar-api` host.
22. **WI-OI-120gy** — **Built** in git **`4d5ce45d`:** M-AR0 platform-context guard + mig **15** + compose keys.
23. **WI-OI-120gz** — **Built** in git **`25b60036`:** manifest `spec.gateway` + signed BFF for `/api/ar/*` (OIDC proxy removed).
24. **WI-OI-120ha** — **Built** in git **`ff5da0a7`:** AR metadata windows (`ar-invoices`, `ar-customers`) + record routes + mig **16**.
25. **WI-OI-120hb** — **Built** in git **`83099e7b`:** AR `DatabaseService` → canonical `ModuleDatabase` (mig **16** contract).
26. **WI-OI-120hc** — **Built** in git **`6c29fe92`:** relay `inboxPath` test fixtures + record `total` + AR migration pin audit + orders quote default.
27. **WI-OI-120hd** — **Built** in git **`492839d7`:** `proof:ar-compose-health` + runtime-manifest pin **16** comment.
28. **WI-OI-120he** — **Built** in git **`afb4eb3d`:** module-local compose loads workforce + geospatial env; `up-ar-api.sh`.
29. **WI-OI-120hf** — **Built** in git **`6a4835a4`:** `AR_IMAGE` refresh + `pnpm proof:ar-compose-rebuild`; health proof blocked on local Postgres (`migrations` exit 1).
30. **WI-OI-120hi** — **Built** in git **`412ae0c7`:** `pnpm audit:compose-database-url` (diagnoses **28P01** credential drift).
31. **WI-OI-120gf / 120hf** — **Built** (2026-10-21): `pnpm audit:compose-database-url` + `pnpm proof:ar-compose-health` on **`gigalibs-test`**; AR DI + compose probe/rebuild scripts fixed on main.
32. **WI-OI-120gd** — **Built** (2026-10-22, `9b9945c1`): journey `jsjmyx` **0 CMMS blockers**; Labour form fix in spec; 5 Workforce blockers → Group 5 cards (120hj/hk/hl). **Next:** owner approves 120hj/hk/hl → start Group 5 BUILD.

## Built, not yet on UAT

- **[WI-OI-120ag](tasks/WI-OI-120ag.md):** ships with the CMMS record routes (step 1.3).

## Waiting for the owner

1. Accept WI-OI-120ax, 120az, 120ba and 120bd (on UAT; journeys `aqyb1q`, `asyz8p` and `b0j8mq` confirm them), with
   the other On UAT items below.
2. MFA on `newuser@gigalibs.io`, the only usable platform owner login.
3. The platform roles of `superadmin@gigalibs.io` and the certification test admin (recommended: remove both).
4. Rotate the passwords that appeared in chat or transcripts: the test accounts' shared password, and the journey and
   approver passwords.
5. Step 0.7 b: named reviewers (Security on every deploy, Accounting for posting).
6. Accept, so they become Done, the On UAT items you are satisfied with (for example 120aw, 120at, 120as, 120ak).
7. Change `ANALYTICS_EXPECTED_MIGRATION_VERSION` from 29 to 30 in `modules/analytics-studio/apps/api/.env.example`.
8. Delete `modules/platform-rbac`; run the expired-session clean-up (306 sessions), if not yet done.
9. The plan for `gigalibs-global`: its trial ends 2026-12-16, and every live workspace on UAT is a trial.

## Known and accepted

- `pnpm verify` reports one known deployment-profile drift, `WORKFORCE_API_URL` (`scripts/verify.mjs`,
  `KNOWN_PROFILE_DRIFT`), until the owner decides it. It also reports 12 isolated-database proofs as not run.

**Full Table 2 list (all rows + statuses):** [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md) — read this when you ask “what’s next?”.

## Table 2 — completion checklist (engines only)

| Engine | Code | UAT / evidence still open |
|--------|------|---------------------------|
| **F0** metadata windows | In git (`bf049e1`, `2104f91`, …) | [WI-OI-120fp](tasks/WI-OI-120fp.md): deploy + `pnpm e2e:uat:inventory` |
| **F1** document lifecycle | `0d29f8f` | Finance draft pilot on UAT when F0/F2 release ships |
| **F2.1** Inventory→Finance relay | `8a5b487` | Relay keys, deploy, live receipt→inbox proof |
| **F2.2** posting / GL handoff | `14845ae` | Deploy with F2.1; live journal proof on UAT |
| **F2.3** inbox reconciliation | `1e54d17` | Deploy |
| **F2.4** journal tie-out | `631c4c7` | Deploy; Finance migration **10** on module-host |
| **F2.5** posting status on receipts | `1fadfa4` | Deploy; Inventory migration **5**; `FINANCE_INVENTORY_POSTING_DATABASE_URL` |
| **F2.6** daily reconciliation | `7c1f4c1` | Deploy with migration **11** |
| **F2.7** relay HTTP cert | `1fadfa4` | Isolated proof only (`PROOF_DATABASE_URL`) |
| **F2.8** period-close gate | `930272f` | Deploy with F2 stack; prove lock fails when reconciliation gaps exist |
| **F1.3** receipt lifecycle | `de671f0` | Ships with Inventory deploy |
| **F1.4** period-lock on complete | `e7eaa3d` | Uses module-host `FINANCIAL_OPERATIONS_DATABASE_URL` |

**Table 2 code:** complete through **`0a0e787`**. **Remaining:** UAT evidence + F2.9 accountant ([TABLE-2-UAT-CLOSURE.md](TABLE-2-UAT-CLOSURE.md), [WI-OI-120gb](tasks/WI-OI-120gb.md)).

**Superseded (owner, 2026-10-18, latest: CMMS first, via Cursor; see Current step):**
- the earlier "Owner next: deploy `0a0e787`+" waits;
- Table 2 is never deployed from the branch. When the owner decides it is its turn, it goes through the release
  worktree, after an independent Security review of WI-OI-120fl to 120gb and the F2.9 accounting sign-off.

**W2 is decided (owner, 2026-10-18):**
- enterprise accounts only: an administrator creates each user and shares the username and password;
- no outside sign-up, OAuth or email provider;
- no outside service may block development or testing.

See [the Phase 1 order](../docs/plans/phase-1-sizing.md).

## CMMS later (roadmap, not Phase 1)

Documented in [gigaops-convergence-roadmap § P4b](../docs/plans/gigaops-convergence-roadmap.md) and plan v3 Phase 6
**M-CM2**: **CM-07** reliability (`/cmms/analytics`), **CM-04** shop-floor kiosk (`/cmms/floor` — operational kiosk,
not the 3D plant view on `/maps`), EAM and permits (**WI-OI-108**).

## Standing rules

- **Commits:** only on the owner's word "commit".
- **Deploys:** the owner runs each one, from the release worktree with its own deploy tool.
- **Releases:** each one is reviewed by an independent Security reviewer, and its full test suite runs before it is
  cut.
- **Data:** zero mock and zero hard-coding. UAT data is changed only by owner-run, backed-up steps.
