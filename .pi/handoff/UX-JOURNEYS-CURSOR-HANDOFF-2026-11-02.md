# Hand-over to Cursor — UX journeys: every screen to a 10–30 second business outcome

**From:** Claude (WI-OI-145 session), 2026-11-02. **Owner request:** review every business and persona flow on every
screen, measure each journey, fix the gaps so anyone can use the product without training, and test each module with
Playwright; no business-logic change unless the business need is not met.

## Read first (in this order)

1. `AGENTS.md` (mandatory reading order, Definition of Done, verification commands) and `CLAUDE.md`.
2. `docs/plans/ux-journeys-benchmark-plan.md` — the benchmark, the measured baseline, all findings and the work items.
3. `docs/plans/ux-journeys-screen-inventory.md` — every screen (128) and metadata window (61) with its measurement and
   plan items; each item names its work item.
4. `.pi/tasks/WI-OI-146.md` … `WI-OI-151.md` — the cards, in the order of section "Order" below.
5. `.pi/work/WI-OI-145.md` — the design system you must keep (below).

## Where things are

- Worktree: `/Users/rayapudi/dev/gigalibs-rounds`, branch `feat/frontline-suite` (head includes WI-OI-145 `59c0fe7f`).
- Live UAT: `http://127.0.0.1:5180`, served from the release worktree `/Users/rayapudi/dev/gigalibs-release-5180b`
  (`release/uat-5180-wi131-wi133`). **Agents never deploy, restart services or write to the UAT database.** The owner
  runs the release-worktree deploy; you hand the command (see `.pi/work/WI-OI-145.md` "Deploy hand-over").
- Benchmark tools: `e2e/ux-benchmark/` (README). Baseline data: `docs/plans/ux-benchmark-2026-11-02/`.
- Existing journey tooling to build on: `e2e/specs/journey-recorder.ts` (findings board, calls, axe) and
  `e2e/specs/journey-tenant-to-value.spec.ts` (five personas, sign-up to maintenance work).
- Isolated test stack for journeys that create data: `e2e/test.env` with `GIGALIBS_E2E_ENV_FILE=test.env`
  (`infra/compose/scripts/up-test-stack.sh`). Writing business data on UAT needs the owner's approval
  (`GIGALIBS_ALLOW_UAT_WRITE_E2E=1`); read-only runs against 5180 are fine.

## Design rules you must keep (WI-OI-145, owner 2026-11-02)

- The shell draws everything around a screen: small breadcrumb; the module tab bar of the module's screens (from the
  manifest `menu`, one line, scrolls sideways); the expanding sidebar. Screens have **no heading or description**.
- Wrap every module screen in `@gigalibs/web-sdk` `ModulePage` (title for assistive technology, `actions` go beside
  the list's search or to the tab bar's end). Views inside a screen use `PageTabs` (underline). Never rounded tab
  buttons, never page padding, never a hand-made tab bar. Empty and error states: `EmptyState`, `ErrorState`,
  `plainRequestError`; codes through `codeLabel`.
- A new screen is a manifest `menu` entry plus a generated page (`spec.ui.pages` in `module.yaml`, then
  `pnpm modules:catalog`); record it in `apps/workflow-platform/__tests__/module-navigation-equivalence.test.ts`.
- Plain words: no codes, ids, "minor units", API paths or work-item numbers on screen. `pnpm audit:ui-shell` holds the
  menu rule and only lets tab bars, emoji and developer text go down (`config/ui-shell-baseline.json`, lower it with
  `--write-baseline` when you remove some).

## Order

1. **WI-OI-151** (journey harness skeleton) and **WI-OI-146** (blockers) together — nothing can be timed until the
   screens load.
2. **WI-OI-149** party and product pickers, money in normal units (business blockers on every document).
3. **WI-OI-148** masters and prerequisites; **WI-OI-147** onboarding and module enabling.
4. **WI-OI-149** remaining defaults, create-from and one-click approvals; **WI-OI-150** words and help.
5. Re-run `e2e/ux-benchmark` and the journey specs; update the journey table in the plan.

## Where to start on each blocker (WI-OI-146)

| Blocker | Start here |
|---|---|
| Procurement and Orders records → 404 | The module host maps `/<module>/v1/records/:entity` (see module-host log at start); find why `procurement.requisitions` and `orders.sales-quotes` are not found for the workspace: the module's record dispatcher registration and `MODULE_WINDOW_ENTITLEMENT_KEYS` (`packages/contracts/src/configuration/window-baselines.generated.ts`) |
| Inventory records → 500, warehouses lookup 404, locations 500 | `modules/universal-inventory/apps/api`; the start-up error `InventoryReceiptPostingReconciliationJob: Cannot read properties of undefined (reading 'getPool')` |
| Business partners → 400 "cannot be sorted by display-name" | The window's default sort (`modules/business-partners/dictionary/*.window.json`) against the API's allowed sort fields |
| Inspection rounds → 503 "organization version is still being delivered" | `packages/module-sdk/src/organization-access.ts` (`OrganizationVersionPendingError`) and the organization delivery relay; add the delivery state and "Send to modules" to Settings › Organization |
| `/api/maps/*` → 502 | No Geospatial service in the UAT stack; place pickers (`workspace-sites` platform lookup) must say so instead of failing |
| `/api/workflow-studio/*` → 502 | No Workflow Studio service; hide its Settings entries when absent |
| Settings › Security "Unexpected end of JSON input" | `apps/workflow-platform/components/settings/TenantAccessManager.tsx` (security section): empty body parsed as JSON |
| Settings › General manifest 404 | `ConfiguredTenantFields` (`tenant-profile-extension` manifest) |
| Analytics 403 for the workspace admin | Built-in role grants (`cmms.analytics.read`, `workforce.positions.read`) or hide sources the person cannot read |
| Screens that never settle (warehouse map, replenishment, availability, Connections) | Stop retrying after a failure; show Try again |
| Customer / vendor typed as a party UUID | `modules/universal-orders/dictionary/*.window.json`, `modules/universal-procurement/dictionary/*.window.json`: make `Customer party` / `Vendor party` a reference with a parties lookup (add one to `PLATFORM_LOOKUPS` if the parties live in the control plane) and fill the name from the choice |

## Definition of Done for every card

- The card's journeys in WI-OI-151 pass their budgets on the test stack; screenshots before and after in
  `.pi/work/WI-OI-NNN.md`.
- `pnpm verify` green (build, tests, every audit including `audit:ui-shell`); the web app builds
  (`pnpm --filter @gigalibs/workflow-platform run build`); generated files regenerated (`pnpm modules:catalog`) and
  `packages/contracts` / `packages/configuration-react` rebuilt when you change them (the app reads their `dist`).
- No business-logic change unless the card says why; no secrets printed; commits only with the owner's approval;
  the owner deploys.
- Re-run `node e2e/ux-benchmark/bench.mjs` read-only against 5180 after the owner's deploy and update the inventory.
