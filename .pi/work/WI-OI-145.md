# WI-OI-145 evidence — one Medusa-standard console

## 2026-11-02 — review of every screen (owner request)

Read-only walk of the 5180 instance (image `f9091627`) as the walkthrough tenant administrator: every catalogue route,
every sidebar sub-page and every tab-like control (95 screens, 158 screenshots). Findings, in the report
`ux-report.html` (scratchpad): only 6 of the 28 sidebar modules declare a manifest `menu`, so only they expand; four
modules have a sidebar menu and an in-page bar for the same screens; the sidebar label, breadcrumb (`area / name`) and
page title disagree; `<main>` has no frame, so each module picks its own edges and the persona dropdown spilled over the
first letter of page titles; seven in-page menu styles; developer text and claim badges on screens. Separately, 17
screens hit a failing call (Procurement and Orders 404, Inventory 500, Business Partner 400, Operator Rounds 503,
Workflow Studio and Geospatial not running, Analytics 403).

## S1 — daily sidebar and a Settings area

The owner's 8-item proposal (move Executive Control Tower, All Modules, Execution Telemetry, Exceptions & Quarantine,
Approval Queues, Business Value Ledger, Solution Packs and 1-Click OAuth Studio out of the daily sidebar) was checked
against the code and kept where the code supports it, with these corrections:

- **All Modules** is not only a sidebar entry: `/modules` is where everyone lands after sign-in and MFA and where every
  "no access" redirect goes, and it listed all 43 entries with locks, maturity and readiness notes. It becomes **Home**:
  only the modules this person can open, grouped like the sidebar. Administrators get Modules & plan; platform
  operators keep the full catalogue at `/modules?view=catalogue`.
- **Approval Queues** reads only `/api/control/ap/actions`. A top-bar approvals bell that shows AP items only would
  mislead, so it becomes **Invoice approvals** in Finance next to 3-Way Match, without the frontline lens; a
  cross-module inbox is a separate card once modules publish approval tasks.
- **Business Value Ledger** is already C-level only; a manifest menu can only hold its own module's routes, so
  nesting it under Analytics needs its page under `/analytics` (deferred to S3).
- **Solution Packs** was meant to be hidden (WI-OI-013) but the hide list named `solutions`, not `solution-packs`.
- The proposal missed **Connections & Adapters** (same purpose as the OAuth studio), **Workflow Studio**,
  **Configuration Studio**, **Organization & Hierarchy** and **Platform Control Tower**, which all belong in Settings.

Changes:

- `PlatformModuleArea` gains `Settings`. Ten entries move there and leave the daily sidebar: Workspace settings,
  My profile & security, Modules & plan, Platform Control Tower, Connections, Connected apps, Workflows, Forms & apps,
  Run history, Processing exceptions. One plain name each (name = label). Approval queue → Finance as Invoice approvals.
- `AppSidebar`: the Settings sidebar replaces the daily one under `/settings` and on any Settings entry's route,
  sectioned by `area` (Workspace, Integrations, Automation, Platform, Account) with a link back to Home; a Settings link
  at the foot of the daily sidebar (Workspace settings, else My profile); Home and Executive Control Tower (C-level,
  Tenant Admin, Platform Operator) at the top; group labels Operations and Finance; Organization & hierarchy moves into
  Settings; someone who can switch persona sees one full-width switcher (no badge beside it), so nothing overflows.
- Shared constants (`dailyGroupOrder`, `groupLabels`, `hiddenModuleKeys`, `dailyHiddenModuleKeys`) in
  `lib/module-navigation.ts`, used by the sidebar and Home.
- `/dashboard` admits C-level, Tenant Admin and Platform Operator (supervisors no longer).
- Lens changes: Run history, Processing exceptions, Workflows lose the C-level and supervisor lenses; Invoice approvals
  loses the frontline lens; My profile & security gains every lens.
- No route, permission or entitlement changed.

Tests: `module-navigation-equivalence.test.ts` records each group change (`INTENDED_GROUP_CHANGES`) and lens change
(`INTENDED_LENS_REMOVALS`, `INTENDED_LENS_ADDITIONS`) with this work item (88 tests pass); new
`app-sidebar-settings.test.tsx` (5 tests: administrator daily sidebar, Settings sidebar sections and order, supervisor,
technician, platform operator switcher). Audits: design tokens, navigation (143 page routes), layers, module manifests
pass. `next build` compiles (`/modules` and `/dashboard` dynamic). Rendered sidebar (operator daily, operator Settings,
technician) checked against the live stylesheet.

**S1 gate (2026-11-02)**: `pnpm verify` build passed; test step 581 files passed, 78 skipped (4,237 tests passed, none
failed); every audit passed except `audit:sdlc`, which refused the register status spelling `In progress`; corrected to
`In Progress` and the audit rerun passed. 14 optional database proofs not run without `PROOF_DATABASE_URL`. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T10-23-32-675Z.log`. Not committed
(owner's "commit") and not deployed. Deploy scope when released: web image only; the contracts catalogue change is
names and groups, with no API behaviour change.

## S2–S6 (owner "go", 2026-11-02)

**S2 Shell frame.** `app/(app)/layout.tsx` gives every screen one frame (`max-w-[1600px] px-6 py-6`); outer paddings
removed from every converted page and workspace, so every page title now starts at the same edge (measured 261 px on
26 screens). Top bar: the breadcrumb Group › Module › Screen from the catalogue and manifest menus only
(`lib/breadcrumb.ts`, replacing `area / name`), Knowledge Hub as an icon, the pulsing Platform Control Tower pill
removed (it stays in the user menu and the Settings sidebar). Settings screens are routes (`/settings`,
`/settings/people|organization|plan|general|security`; `/settings?tab=…` redirects) listed in the Settings sidebar,
replacing three rows of emoji tabs. Icons `users` and `globe` added.

**S3 Menus.** Manifest `menu` and generated pages per screen for Inventory (10 screens from 15 tabs), Products (8),
Procurement (5), Orders (5), General ledger (5), Safety (5 plus the Report a hazard route), Inspection rounds (4),
Workspace settings (6), Workflows (3), Connections (2), Platform Control Tower (2). In-page module bars removed from
CMMS (17 pills), IoT, Workforce and Manufacturing; Overview added to the CMMS, IoT and Manufacturing menus; CMMS and
Workforce screens renamed to one sentence-case name (sidebar = page title); Floor Kiosk (not connected) off the CMMS
menu. Sidebar labels are the plain module names (Asset maintenance, Workforce, Analytics, Products, Inventory,
Procurement, Orders, General ledger, Business partners, Process safety (SPEED), Inspection rounds, Invoice matching,
Manufacturing, Returns, Places & maps, Business value, Projects, Safety); catalogue `name` (the entitlement name the
module APIs use) is unchanged. The sidebar's per-key label overrides are gone.

**S4 Templates.** `@gigalibs/web-sdk` `ModulePage` (title, description, actions), `PageTabs` (Medusa Tabs),
`EmptyState`, `ErrorState`, `plainRequestError`, `codeLabel`. Applied to Inventory, Products, Procurement, Orders,
General ledger, CMMS (and its Calibration, Commissioning, Fleet, Permits views), IoT, Manufacturing, Workforce (app
workbench and module workspace), SPEED, Safety, Inspection rounds, Projects, Returns, Analytics overview, Home, Settings,
My profile, Connected apps, Run history, Processing exceptions, Invoice approvals, Business value, Invoice matching,
Connections, Workflows; `ModuleWindowWorkspace` (Business partners) matches it. Lists inside the metadata windows keep
the shared window renderer (no per-module DataTable rewrite in this card).

**S5 Wording.** Removed: REGISTRY_GOVERNED and the API path on Analytics, "WI-OI-129" on Projects, "Create one through
the API or integration tests" on Returns, "CM-04" on the kiosk, the claim badges and invented figures on Workflows
(100% / 18 ms / 3 ACTIVE / 7/7 CONNECTED) and Business value (AUDITOR PROOF, IMMUTABLE, 100% cryptographic…), the
emoji persona badges, links to unreleased modules from Invoice matching and Business value. Codes shown as words
(`codeLabel`): IoT adapters, Connected-apps auth types, SPEED audit actions, Analytics source kinds, status filters,
profile roles. A failed request without a server message reads as a sentence (records client, Rounds, Safety).

**S6 Guard.** `pnpm audit:ui-shell` (`scripts/verify-ui-shell.mjs`, in `pnpm verify`): a catalogue entry with more
than one screen must declare a `menu` (hard rule; create flows, callbacks and unavailable placeholders excepted);
hand-made `role="tablist"` bars, emoji and developer text may only go down per file against
`config/ui-shell-baseline.json` (today 9, 81 and 12 across 31 files, mostly unreleased modules and admin canvases).

**Checks.** Navigation equivalence test records every menu change (88 tests); sidebar test (5); all web and module-web
tests (105 files, 975 tests) pass; app typecheck clean except the two existing SPEED/Analytics test-file errors;
`next build` compiles; audits design tokens, ui-shell, navigation, layers, package dependencies, API boundary, SDLC
pass. Local production build (port 5190, control plane only, read-only sign-in) screenshots of 26 screens: one frame,
one header, breadcrumb names match the sidebar. e2e specs updated for the new headings and ledger routes.

**Not in this card.** Per-module DataTable/detail-page rewrites inside the metadata windows; money in minor units and
user IDs in General ledger lists (dictionary data); the remaining emoji in the workflow canvas and platform admin
screens (held by the baseline); the 17 functional faults (separate card).

**Gate (2026-11-02, S1–S6)**: `pnpm verify` PASS for every step that ran: build; test 581 files passed, 78 skipped
(4,237 tests passed, none failed); audits production-data, all-runtime-data, package-dependencies, api-boundary,
navigation, sdlc, layers, design-tokens, **ui-shell**; module manifests; migration pins; module windows and conversions;
deployment profile; inventory-finance relay and reconciliation. 14 optional database proofs not run without
`PROOF_DATABASE_URL`. Log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T11-00-33-300Z.log`.
Deploy scope: the **web** image (shell, module web packages, configuration-react, web-sdk). No migration, no API,
module-host or mobile change; the catalogue's labels, groups and menus are read by the web only.

**Deploy hand-over (2026-11-02)**: committed `268384f8` on `feat/frontline-suite` (one commit, owner "go"). Live UAT
5180 runs `f909162775d2-90ed1ca00bee` from the release worktree `gigalibs-release-5180b`
(`release/uat-5180-wi131-wi133` at `f9091627`, the parent of `268384f8`). Read-only backup of the running release:
`infra/compose/backups/gigalibs_backup_20261102_110653Z.dump` (release worktree). Owner command: the session script
`deploy-wi145.sh` (fast-forward to `268384f8`, refresh source identity, build chain, `up-convergence-full-uat.sh`, health
check). After the deploy the session verifies read-only (`docker ps` tags, web logs, a screen walk).

## Owner correction (2026-11-02, after the 268384f8 deploy)

Owner: every module gets the horizontal underline screen tabs (like the former Inventory bar) and keeps the expanding
sidebar; no page heading or description ("consuming real estate and duplicate wording"); the breadcrumb small; no
rounded buttons anywhere. Changes:

- Shell `ModuleTabBar` under the top bar on every page: the module's manifest menu filtered by permission
  (`lib/module-tabs.ts`), underline style, wraps like the former Inventory bar; one tab for one-screen modules and shell
  pages; the screen's buttons in the bar's right end (slot `module-page-actions`).
- `ModulePage`: title screen-reader-only, no description, actions portalled into the bar. `PageTabs`: the same
  underline style (no Medusa pill tabs). Window list titles and `ModuleWindowWorkspace` headings screen-reader-only.
- Breadcrumb in `text-xs`.
- Views I had merged become their own tabs again: Inventory 15 (Warehouses … Barcode lookup), Products 10 (with
  Catalogue versions, Price-list versions), General ledger 7 (with Posted journals, Set up a book gated on
  `finance:books:manage`); `/inventory/stock` removed by the generator.
- Tests: navigation equivalence (flattened menus), new `module-tabs.test.ts` (4); e2e ledger routes and P2P tab links.
- Gate: `pnpm verify` PASS (582 test files, 4,241 tests; every audit incl. ui-shell), `next build`; local production
  build screenshots: Products › Attributes, Inventory, Calibration (module tabs + view tabs, one style), Safety (action in
  the bar), Settings, Home. Log `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T12-04-42-394Z.log`.
