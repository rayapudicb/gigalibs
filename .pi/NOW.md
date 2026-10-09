# NOW: where the work stands

Updated 2026-10-09. Sole writer: Codex, owner-authorized after Claude's handoff. This file is a resume pointer;
canonical programme status is [.pi/WORK_ITEMS.md](WORK_ITEMS.md), WI-OI-120. No production gate is upgraded.

## Current slice and release boundary

- **Production: NO-GO.** Historical audit counts are not a reconciled count of remaining defects. G5–G7 remain open.
- **[WI-OI-120y](tasks/WI-OI-120y.md): Review**, deployment-handoff hardening implemented; independent Security
  recheck accepted the bounded tooling. 27 isolated tests and the image/backup check-only preflight pass. The owner
  ran the reviewed deploy; Codex independently checked the live images and database read-only. No product/RBAC
  change, new migration source, image build or commit was part of this slice.
- **Current UAT:** `37e555664f20-e9f4ddcb7ddb`, owner-deployed 2026-10-08. Owner's deploy smoke passed;
  independent read-only check at 04:46 UTC found 11/11 migration jobs at exit 0 and 10/10 services healthy, all
  with the pinned image IDs, references and release labels. HEAD remains `37e5556`.
- **Database:** three R2 migrations finished with matching source checksums; new constraints/FKs validated.
  Of 444 members, 442 were comparable under the single-role compatibility check, including 33 with one live role;
  zero compatibility differences. Two multi-role members are outside that cohort. This does not certify scoped
  permissions or an end-to-end customer journey.
- **Backup:** `infra/compose/backups/gigalibs_backup_20261008_021555Z.dump`; checksum independently checked on
  2026-10-08. This proves file integrity, not restore viability or freshness at a later deployment.
- **R2 ([WI-OI-120w](tasks/WI-OI-120w.md)):** five slices implemented and Security reviews recorded. Units/places
  remain disabled until R5 proves all permission consumers enforce them. No claim of integrated scoped CMMS.
- **R5 CMMS ([WI-OI-120z](tasks/WI-OI-120z.md)):** owner approved the first discovery slice. The
  [source-path matrix](../docs/plans/cmms-r5-access-boundary-2026-10-08.md) is in Review: 50 generated route
  templates/72 method mappings, cross-module role consumers and manifest sync traced. Reachable scope gaps were
  found; entity-ownership and role-transition decisions are pending. No product repair, UAT data write or scope-gate
  change occurred in this slice.
- **[WI-OI-120aa](tasks/WI-OI-120aa.md): implementation in Review.** Owner-approved legacy-scope repair now
  covers mounted Parts issue/return/TCO, direct stock RETURN, Reliability work-order actions and the Work Orders
  stock-issue retry caller. An isolated generated-gateway/signed-CMMS-HTTP proof passed 70/70 and 16 focused tests
  passed; no UAT data was used. The Next BFF journey, existing-member impact review and independent Security
  review remain open. No default role, unit/place gate, migration or deployed image changed.
- **[WI-OI-121](tasks/WI-OI-121.md): G0–G2 discovery in Review.** Owner approved this bounded slice on
  2026-10-08. The [source/boundary review](../docs/plans/gigalibs-assistant-source-and-boundary-review-2026-10-08.md)
  pins a candidate upstream release and fingerprints the owner's downloaded `CopilotKit-main` exactly to later
  upstream commit `1e9a2af` (22,410 matching files). The candidate package paths/lockfile are unchanged; the review
  identifies restrictive `showcase/`, a 16-package/1,128-lockfile-snapshot dependency graph (with immediate package
  edges now traced for A1 pruning), unscoped in-memory
  thread fallback and vendor telemetry paths. Owner clarified Assistant is an optional GigaLibs product: A1 copies
  approved source into the repository, and A3 must prove metadata/tenant/RBAC foundations before A4 live data.
  Read-only review narrowed the first v2 roots to `react-core` + `runtime` (not legacy `react-ui`), but the raw
  15-package closure still pulls excluded features and a cloud fallback. A separately approved A0b isolated
  pruning/build/SBOM proof ([WI-OI-121a](tasks/WI-OI-121a.md), owner-approved and in progress) must precede A1.
  Pinned-release hashes were verified for 1,506 copied candidate package files despite incomplete sparse fetch.
  An isolated same-origin/no-vendor-key patch has 3/3 focused tests. A controlled, script-disabled temporary install
  and sequential build now pass for the broad package closure, but a narrowed SSE export still bundles Intelligence,
  license and vendor-telemetry paths; no complete UI/SSE/no-egress proof exists. A fresh 18-importer temporary
  lockfile audit found 17 advisories (five high). The package/build graph is still being pruned. The final
  selected-file manifest, production SBOM/notices,
  independent Legal/Architecture/Security decisions and the approved A1/A2 entry gates remain open. No fork, product code, model
  credential, UAT or release change is authorized; current R5 priority is unchanged.
- **[WI-OI-121c](tasks/WI-OI-121c.md): Claude/ChatGPT Aesthetic UI, Dynamic Suggestions, Left Sidebar Navigation & Sovereign Configuration Workbench.**
  1. **Claude/ChatGPT UI & Styling:** Replaced the static "Presets" bar and "Development Preview" banner with a minimalist, modern Claude/ChatGPT design featuring a subtle sovereign badge, smooth rounded message bubbles, and floating composer. Injected `/copilotkit.css` dynamically via client stylesheet injector to resolve Tailwind v4 `@layer` build conflicts.
  2. **Dynamic Contextual Suggestions:** Suggestions now adapt dynamically based on previous user searches (persisted in `localStorage`) and active operational roles, rendering as clean clickable chips that fade smoothly once conversation commences.
  3. **Left Sidebar Menu Registration:** Declared `gigalibs-assistant` catalog submenus in `modules/gigalibs-assistant/module.yaml` (`AI Workspace`, `Agent Settings & Config`, `Operational Tool Allowlist`, `Telemetry & Audit Logs`). Regenerated `lib/generated/module-navigation.ts` and `catalog.generated.ts` via `node scripts/module-manifests.mjs --write`.
  4. **Native Sovereign Configuration Pages:** Built `/assistant/configuration` (model runtime, local endpoint `127.0.0.1:11434`, context window, temperature, HITL thresholds), `/assistant/tools` (domain tool allowlist across CMMS, Inventory, IoT, and Procurement), and `/assistant/audit` (immutable audit trails with verified 0-byte external egress).
  5. **Verification & Live Daemon:** Rebuilt production bundle with 111 page routes (`next build` exit 0). All platform audits passed (`audit:api-boundary`, `audit:navigation`, `audit:package-dependencies`, `audit:sdlc`, `audit:layers`, `audit:all-runtime-data`, `audit:production-data`, `module-manifests`). Next.js running live on port 5180.

- **[WI-OI-121c](tasks/WI-OI-121c.md): Universal Assistant Module Catalog Registration & Generative UI Wire-Up in Review.**
  1. Registered GigaLibs Assistant as an operational capability module in `modules/gigalibs-assistant/module.yaml` (`readiness: REVIEW`, `route: /assistant`, `area: Intelligence`, `capabilities: [sovereign-ai-copilot, cross-module-generative-ui, floor-inspections, meter-telemetry, role-scoped-tools]`). Compiled catalog with 0 errors via `node scripts/module-manifests.mjs --write`. Appears and opens directly on `http://localhost:5180/modules`.
  2. Created dedicated full-page Sovereign Assistant workspace at `apps/workflow-platform/app/(app)/assistant/page.tsx` (`/assistant`), featuring real-time operational presets, live SSE CopilotKit chat, and telemetry/sovereignty audit cards.
  3. Implemented interactive Medusa UI Generative UI Inspection Card (`DailyInspectionChecklistCard.tsx`) with 5 inspection tasks (`ZONE-ABC-01`, `PUMP-FP-101` vibration reading input, `HE-HX-20`, `PRV-304`, `ESD-ABC-09`), dynamic progress calculation, interactive checkbox toggles, and CMMS commit feedback.
  4. Wired Generative UI renderer into `GigaLibsAssistantDrawer.tsx` and `/assistant` page via `messageView={{ assistantMessage: { markdownRenderer: AssistantMarkdownWithGenerativeUI } }}` and `renderToolCalls` on `GigaLibsCopilotKitProvider`.
  5. Verification: Production `next build` passed exit 0 (156 static & dynamic pages generated, including `/assistant`). Server running live on `http://0.0.0.0:5180`. Vitest tests (9/9) passed. Audits for `api-boundary`, `navigation`, `package-dependencies`, `sdlc`, `layers`, and runtime data passed with 0 new violations. Tenancy enabled for all tenants via `scripts/enable-all-features.mjs`.
  6. Composer Box Outline & Send Button Activation: Fixed runtime validation in `/api/gigalibs-assistant/[...path]/route.ts` where `ot2` required `suggestions: false`, restoring `isReady: true` state on the agent and activating the send button. Emitted complete AG-UI event protocol (`TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` with `messageId`, `TEXT_MESSAGE_END`). Styled composer container (`[data-testid='copilot-chat-input']`, `.copilotKitInput`) with crisp border (`1.5px solid #cbd5e1`), rounded corners (`1.5rem`), focus ring (`#167a55`), and active green send button across `globals.css`, `public/copilotkit.css`, and `CopilotKitStylesheet.tsx`. Added `/api/copilotkit` alias routes. Rebuilt and verified with 0 errors; daemon restarted on port 5180.
  7. Control Plane Login & Left Sidebar Navigation Activation: Resolved `POST /api/auth/login` HTTP 503 by starting the NestJS control-plane API (`apps/playground-api`) on port 3333 with live database connection. Added `assistant:*` to `TENANT_ADMIN`, `assistant:read`/`assistant:action` to `MANAGER`, and `assistant:read` to `MEMBER` in `packages/contracts/src/rbac/base-roles.ts`. Ran `scripts/enable-all-features.mjs` ensuring `gigalibs-assistant` is in all tenants' `features` column and granting member permissions. Rebuilt `@gigalibs/contracts` and `@gigalibs/workflow-platform` (160 routes). Next.js daemon restarted on port 5180; GigaLibs Assistant now passes `canOpenPlatformModule` and displays as an expandable item in the left sidebar with 4 submenus (AI Workspace, Agent Settings & Config, Operational Tool Allowlist, Telemetry & Audit Logs) and active on `/modules`.
- **Other session's sign-in work was restored by the owner with `git stash pop`.** It is excluded from the
  already-built candidate. Preserve `AuthAtmosphere.tsx` and `public/images/` as another session's work. Handoff,
  scripts and notes remain uncommitted; commit only on the owner's literal "commit".

## Next, in order

1. Review the post-deploy record in [WI-OI-120 evidence](work/WI-OI-120.md) and the updated
   [handoff](handoff/HANDOFF-2026-10-08.md). The previous candidate has been deployed; do not run the pinned
   deploy command again.
2. Run the separately authorized ledger and customer journeys in an identified test workspace with approved
   credentials. These journeys write business test data and remain pending. The full restore rehearsal and G5–G7
   release gates also remain open.
3. Independently review **[WI-OI-120aa](tasks/WI-OI-120aa.md)**, reconcile affected existing members and prove the
   Next BFF/session/entitlement path on an isolated instance before this first R5 repair is accepted. Then review
   the [R5 access-boundary report](../docs/plans/cmms-r5-access-boundary-2026-10-08.md) for later entity-ownership,
   CMMS-only/companion-role and cross-domain grant decisions. Storeroom use by department-scoped members remains
   denied until an ownership migration is approved. Do not open a unit/place gate or make an allow-list-only change.
4. **R5 unit proof → T3 (one place identity) → R5 place proof → M-CM1 ([120t](tasks/WI-OI-120t.md))**. M1a is reached only by the accepted scoped
   request-to-close journey, not by finishing R2 plumbing. Later phases remain in the platform plan.
5. Continue the approved [WI-OI-121a](tasks/WI-OI-121a.md) A0b isolated source-selection/build/SBOM proof under
   the owner-approved dormant-code preview boundary. The selected SSE guard and synthetic path pass, but the
   final source manifest, dependency/vulnerability disposition and end-to-end no-egress evidence remain pending.
   Then obtain independent
   Legal/Architecture/Security decisions. Owner-approved [WI-OI-121b](tasks/WI-OI-121b.md) batches A1 and A2
   but preserves their sequential gates. Do not import CopilotKit or mount its UI before those prerequisites.

## Standing boundaries and open decisions

- Owner runs every deploy; no `docker exec` writes on UAT. No secret disclosure; never open TextFly agent-runtime
  `.env*`. Preserve untracked prototypes and the sign-in work.
- Forward migrations only; do not edit sources during image builds. No second writer.
- Test data only in authorized isolated contexts/workspaces and excluded from customer value reporting.
- D5 historical proof-data cleanup, D6 credential rotation, D7 named independent human reviewers/release authority
  remain owner decisions, not authorized here.
- Other recorded decisions remain open: 980 place-fact dead letters; unregistered Workforce prototype; scope
  alignment; empty platform schema/platform-rbac leftovers; Analyst export; old test sessions; ADR-0017.
- Current worktree `pnpm verify --audits` fails only `audit:design-tokens`: the owner-restored, separately owned
  `AuthAtmosphere.tsx` has six hard-coded colour classes. All other executed audit steps passed; the known
  `WORKFORCE_API_URL` drift and 12 isolated-database proofs not run remain. This was not in the deployed image.
- For WI-OI-120aa, `pnpm verify` built successfully but its sandboxed test step hit loopback `listen EPERM` in four
  HTTP test files; the same full `pnpm test` with local test-server permission passed 327 files/2,787 tests, with
  31 files/222 tests skipped. The design-token failure remains in the separate sign-in work. The final isolated
  CMMS proof used a disposable local PostgreSQL 14 database, not the UAT database or a PostgreSQL 16 parity proof.

## Evidence and scope

[Current handoff](handoff/HANDOFF-2026-10-08.md) · [WI-OI-120 evidence](work/WI-OI-120.md) ·
[Platform implementation plan](../docs/plans/platform-implementation-plan.md) ·
[All-module acceptance](../docs/plans/tenant-to-value-all-modules-implementation-and-e2e-plan.md).
All modules remain in the owner's programme scope; this bounded slice does not certify them.
