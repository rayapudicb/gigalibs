# UX journeys benchmark and plan — every screen to a 10–30 second business outcome

- **Owner request (2026-11-02):** review every business and persona flow on every screen; measure each journey; find
  the issues and gaps (missing masters, prerequisites, confusing screens, hard configuration such as workspace creation
  and module enabling); make every journey easy without training; test each module with Playwright; no business-logic
  change unless the business need is not met. Hand the plan to Cursor.
- **Baseline:** measured read-only on UAT 5180, release `c88a88d4`, 2026-11-02, as the walkthrough workspace
  administrator. Data: `docs/plans/ux-benchmark-2026-11-02/`. Every screen: `docs/plans/ux-journeys-screen-inventory.md`.
  Tools: `e2e/ux-benchmark/`. Cursor's brief: `.pi/handoff/UX-JOURNEYS-CURSOR-HANDOFF-2026-11-02.md`.
- **Work items:** WI-OI-146 … WI-OI-151 (section 8).

## 1. The benchmark

| Measure | Target | Why |
|---|---|---|
| Business outcome (one journey, a trained-once person) | **10 s** for a look-up or an approval, **≤ 30 s** for a create | Owner target; Nielsen's 10-second attention limit for a single task |
| Screen ready (navigation start → data shown) | p50 ≤ 1 s, p90 ≤ 2 s, never > 5 s | Nielsen's 1-second flow limit |
| Clicks from anywhere to a screen | ≤ 2 (sidebar module → tab) | Done in WI-OI-145 |
| Required fields on a create form | ≤ 5, everything else defaulted or derived | Each typed field costs 4–5 s (Keystroke-Level Model) |
| Prerequisites | Never a dead end: a missing master is named on screen with a way to create it in place | "Without training" |
| First use | Each module usable within **10 minutes** of being enabled, by the workspace admin alone | Time to first value |
| Words | No codes, IDs, "minor units", API paths or work-item numbers on screen | WI-OI-145 S5, `audit:ui-shell` |

Journey times are estimated with the Keystroke-Level Model (Card, Moran & Newell): think 1.35 s, point 1.1 s, click
0.1 s, 0.28 s per key, plus the measured screen load and save, required fields only. WI-OI-151 replaces the estimates
with measured Playwright times on the isolated test stack and makes them a gate.

## 2. Baseline (2026-11-02)

- **128 screens** reachable by a workspace administrator; **61 metadata windows**; **23 master lookups**.
- Screen ready: **p50 0.9 s, p90 1.2 s** — fast where the screen works. **4 screens never settle** (15 s timeout:
  `/connections`, Inventory warehouse map, replenishment, availability — they keep retrying failed calls).
- **38 screens** make a failing call; **25** show an error to the person; **27** are empty with no guidance.
- **42 create forms**; the order-to-cash and procure-to-pay documents ask for **8–10 required fields** each.
- Masters: warehouses lookup **fails (404)**, locations **fails (500)**, sites **fail (502, Geospatial not running)**;
  Workforce resources, absence types, calendars, capabilities and CMMS classifications have **no records**.

### Journeys (27)

| # | Person | Business outcome | Now | Target | Verdict | First blocker | After the plan (estimate) |
|---|---|---|---:|---:|---|---|---:|
| P1 | Platform operator | Create a customer workspace | 40 s | 30 s | Too slow | 7 fields incl. slug, isolation tier, audit reason | 15 s |
| P2 | Platform operator | Enable a module for a workspace | 28 s | 10 s | Over | search, open, tick, mandatory reason, save | 8 s |
| A1 | Workspace admin | Invite a person with a role | 18 s | 20 s | Meets | — | 15 s |
| A2 | Workspace admin | Add an organization unit or site | 23 s | 30 s | Blocked | Sites come from Geospatial (502) | 20 s |
| A3 | Workspace admin | Turn on a module | — | 10 s | Blocked | Only a platform operator can; no request button | 8 s (request) |
| A4 | Workspace admin | Create a warehouse | 27 s | 30 s | Blocked | Inventory records 500; owning unit is free text | 20 s |
| A5 | Workspace admin | Create a product with its unit | 28 s | 30 s | Meets | — | 22 s |
| A6 | Workspace admin | Register an asset | 19 s | 30 s | Blocked | Place picker (Geospatial 502) | 15 s |
| A7 | Workspace admin | Add a person to Workforce | 23 s | 30 s | Meets | — | 20 s |
| T1 | Technician | Report a maintenance problem | 18 s | 15 s | Over | — | 12 s |
| T2 | Technician | Raise a work order | 22 s | 30 s | Blocked | Place picker (Geospatial 502) | 20 s |
| T3 | Technician | Report a hazard with a photo | 37 s | 30 s | Too slow | 5 fields, long description | 25 s |
| T4 | Technician | Request an absence | 25 s | 20 s | Blocked | No absence types | 15 s |
| T5 | Operator | Start a permit to work | 30 s | 30 s | Meets | — | 25 s |
| S1 | Supervisor | Triage a hazard report | 29 s | 20 s | Over | 4 fields | 15 s |
| S2 | Supervisor | Approve an absence | 16 s | 10 s | Over | Approvals two tabs deep | 8 s |
| S3 | Supervisor | Approve an invoice action | 10 s | 10 s | Meets | — | 8 s |
| B1 | Buyer | Raise a purchase requisition | 41 s | 30 s | Blocked | Procurement records 404 | 21 s |
| B2 | Buyer | Create a purchase order | 56 s | 30 s | Blocked | 404; vendor typed as a UUID | 26 s |
| B3 | Clerk | Receive goods into a warehouse | 14 s | 30 s | Blocked | Inventory records 500; warehouses lookup 404 | 14 s |
| B4 | AP clerk | Record a vendor bill | 47 s | 30 s | Blocked | 404; vendor typed as a UUID | 15 s (from PO) |
| C1 | Sales | Send a quote | 57 s | 30 s | Blocked | Orders records 404; customer typed as a UUID | 27 s |
| C2 | Sales | Create a sales order | 56 s | 30 s | Blocked | 404; customer typed as a UUID | 26 s (from quote: 10 s) |
| F1 | Accountant | Draft a manual journal | 25 s | 30 s | Meets | — | 22 s |
| F2 | Accountant | Read the trial balance | 8 s | 10 s | Meets | — | 6 s |
| E1 | Executive | See today's position | 5 s | 10 s | Meets | — | 5 s |
| X1 | Chemist | Start a screening project | 24 s | 30 s | Meets | — | 20 s |

**9 meet, 6 work but too slowly, 12 are blocked.** The blocked ones are blocked by faults and missing masters, not by
design; once unblocked, the order and purchase documents are still 47–57 s until the form changes of WI-OI-149.

## 3. Findings

### 3.1 Blockers (P0, WI-OI-146) — screens that cannot do their job

| Area | What the person sees | Cause (measured) | Fix |
|---|---|---|---|
| Procurement (4 screens), Orders (5) | "This is not set up for your workspace yet" | `GET …/v1/records/<entity>` → 404 although the module host maps the route | Register the record entities for the workspace (module record dispatcher / window entitlements); a 404 must never be the first experience of an enabled module |
| Inventory (8 list screens) | "The service is unavailable" | `…/v1/records/inventory.*` → 500; start-up log `InventoryReceiptPostingReconciliationJob: Cannot read properties of undefined (reading 'getPool')` | Fix the dispatcher/job wiring; warehouses lookup 404 and locations 500 have the same root |
| Inventory map, replenishment, availability; Connections | Spinner then "Could not load warehouses", never settles | Retry loop on a failing call | Stop after a failure; show Try again |
| Business partners | "cannot be sorted by display-name" | Default sort not allowed by the API (400) | Default sort to an allowed field |
| Inspection rounds (4) | "This organization version is still being delivered here" | Module never received the active organization version (503) | Deliver it (outbox/relay) and show the admin a "Send organization to modules" action with the delivery state |
| Geospatial-backed pickers (CMMS, Workforce, Settings › Organization, Places & maps) | Empty place pickers, "Places could not be loaded" | `/api/maps/*` → 502: Geospatial not in the UAT stack | Deploy Geospatial in the stack, or hide place pickers with a clear note when it is absent |
| Workflows (3) | "Workflow Studio is not available" | `/api/workflow-studio/*` → 502 | Deploy Workflow Studio or hide its Settings entries |
| Settings › Security & SSO | "Unexpected end of JSON input" | Empty response parsed as JSON | Handle 204/empty bodies |
| Settings › General & localization | Configured fields fail | Manifest `tenant-profile-extension` → 404 | Publish the tenant-profile manifest or hide the section |
| Analytics, CMMS › Reliability, Workforce › Analytics | "Missing module permission" | Workspace admin lacks `cmms.analytics.read`, `workforce.positions.read` | Grant them to the admin role, or hide sources the person cannot read |
| Orders, Procurement documents | Customer/vendor asked as "party UUID" (help text "Active workspace party UUID") | `Customer party`, `Vendor party` are TEXT fields; Inventory "Owning organization unit" is TEXT | Pickers over Business partners and organization units (no API change: the picker writes the same id) |

### 3.2 Setting up a workspace and enabling modules (WI-OI-147)

| Journey | Today | Plan |
|---|---|---|
| Create a workspace (platform operator) | 7 fields; slug, region, isolation tier and audit reason typed every time; 40 s | Name and owner email only; slug from the name; region, tier, trial defaulted; audit reason prefilled ("New customer workspace"); 15 s |
| Enable a module | Find tenant, open, tick, type mandatory reason, save; 28 s | One switch per module with a confirm; reason optional with a default; enabling also seeds the module's starter data (WI-OI-148); 8 s |
| Workspace admin wants a module | Impossible; Plan & entitlements is read-only | "Request" button on each module in Plan & entitlements that notifies the platform operator (or enables it on a trial plan) |
| Set-up guide | Links to `?tab=` URLs; "Choose your modules" opens Home | Links to the Settings routes; "Choose your modules" opens Plan & entitlements; the guide shows on Home for admins until done, with each step's done state |
| Organization changes reach modules | Silent; modules answer 503 until delivered | Settings › Organization shows each module's delivery state and "Send to modules" |
| Roles | Custom roles need permission codes typed in a text area | Pick permissions from the module's list with plain names; start from a built-in role |

### 3.3 Masters and prerequisites (WI-OI-148)

Masters each journey needs (from the window pickers) and what the workspace has today:

| Journey | Needs first | Today |
|---|---|---|
| Quote, sales order | Organization unit, customer (Business partner), product, unit, warehouse | units 5, customers: typed UUID, products 9, units 8, warehouses: lookup fails |
| Requisition, purchase order, vendor bill | Organization unit, vendor, product, unit, warehouse | as above |
| Goods receipt, item | Warehouse, product, unit, location | warehouses fail, locations fail |
| Work order, asset, meter, schedule | Asset, space, place, classification | assets 1, spaces 2, places fail, classifications 0 |
| Absence, working week, booking | Workforce resource, absence type, calendar, capability | all 0 |
| Journal | Book, account | books 1, accounts 22 |
| Screening project | SPEED site, library | sites 2, library materials 0 |

Plan:
1. **Never a dead end.** Every empty list says what it is for and, when it needs a master that does not exist, names
   it with a link or an inline "Add new" (the dictionary's `createWith`; today 8 required pickers have none:
   finance books ×2, capabilities, SPEED sites, organization units ×4).
2. **Starter data on enable.** Enabling a module offers its starter masters (units of measure, absence types,
   classifications, work order types, a default warehouse and calendar), reusing the configuration packs
   (`packages/contracts/src/configuration/packs.ts`). Solution packs stay hidden until they work (WI-OI-013).
3. **Import.** CSV/Excel import like Products' Import & export for warehouses, assets, people, customers and vendors.
4. **Prerequisite checklist per module** on its Overview: "To raise a purchase order you need: a vendor ✓, a product
   ✓, a warehouse ✗ Add one".

### 3.4 Forms (WI-OI-149) — to 10–30 seconds without changing business rules

| Change | Where | Saves |
|---|---|---|
| Customer / vendor picker over Business partners; name filled from the partner | Quote, sales order, PO, vendor bill, debit memo | ~10 s and the UUID blocker |
| Product picker fills product code, name and its base unit | Quote, sales order, requisition, PO | ~15 s |
| Organization unit defaults to the person's own unit; warehouse to the unit's default | All documents, warehouses | ~10 s |
| Money typed and shown in normal units with the currency (12.50 USD), stored as today | Every "(minor units)" field (20 windows) | errors and confusion |
| Dates default (valid until +30 days, invoice date today, due date from terms) | Quote, vendor bill, invoice | ~10 s |
| Create from: quote → sales order, PO → receipt → vendor bill | Orders, Procurement, Inventory | 45 s → 10 s per follow-on document |
| Save and new; keyboard order; first field focused | Every window form | ~2 s each |
| Hazard report: category and severity as buttons, photo first | Safety | 37 → 25 s |
| Triage: risk band from two clicks (likelihood × impact) | Safety | 29 → 15 s |
| Approvals one click from a list (approve / reject with reason) | Workforce absences, timesheets, Rounds skips, AP | 16 → 8 s |

### 3.5 Labels and help (WI-OI-150)

- 20 windows label money "(minor units)"; CMMS shows "Asset ID", "Space ID", "Part ID", "Storeroom ID", "Attribute
  key"; Business partners "Party id". Show numbers people use (asset tag, part number) and hide internal ids.
- 8 windows have no help text on any field (AR customers and invoices, finance books, product standard costs, SPEED
  routes, catalogues, categories, lots). Every required field gets one sentence of help.
- Error messages: always what happened and what to do (done for the records client in WI-OI-145; extend to every
  module API client).
- Empty states: purpose + next step + button (27 screens).

### 3.6 Navigation and screens (done in WI-OI-145; remaining here)

Done: one frame, breadcrumb, module tab bar on every module (one line, scrolls), no page headings, underline tabs
everywhere, Settings area, Home. Remaining: the 15-second screens (3.1); `audit:ui-shell` baseline debt (81 emoji,
12 developer-text spots, 9 hand-made tab bars, mostly the workflow canvas and platform admin); CMMS cards that repeat
the screen name in their own heading.

## 4. Per module

Every screen with its measurement and plan items is in `docs/plans/ux-journeys-screen-inventory.md`. Summary:

| Module | Screens | Failing | Main changes |
|---|---:|---:|---|
| Settings | 16 | 6 | Security JSON bug; Workflow Studio (3 screens) not running; general manifest; organization delivery state; module request; permission picker for roles; set-up guide links |
| Products | 10 | 0 | Inline unit creation; import for every master; help on catalogues/categories |
| Inventory | 15 | 12 | Records 500 and warehouses/locations lookups; retry loops; owning unit picker; starter warehouse; receipt from PO |
| Procurement | 5 | 4 | Records 404; vendor picker; product auto-fill; defaults; PO → receipt → bill |
| Orders | 5 | 5 | Records 404; customer picker; product auto-fill; quote → order → fulfillment → invoice |
| General ledger | 7 | 0 | Amounts in normal units; people by name; starter chart of accounts on book set-up |
| Business partners | 1 | 1 | Sort 400; create customers/vendors here (feeds the pickers) |
| Asset maintenance | 17 | 4 | Places (Geospatial); classification starter pack; IDs → tags; reliability permission |
| Workforce | 11 | 4 | Starter absence types/calendar; place pickers; approvals one-click; analytics permission |
| Inspection rounds | 4 | 4 | Organization delivery; then route set-up wizard |
| Safety | 5 | 0 | Faster hazard report and triage; empty-state guidance |
| IoT | 6 | 0 | Device set-up wizard (protocol → credential → test reading) |
| Process safety (SPEED) | 8 | 0 | Library/criteria starter packs; sites picker inline |
| Analytics | 6 | 1 | Hide sources the person cannot read; first-dashboard template |
| Manufacturing, Returns, Projects, Invoice matching, Invoice approvals, Business value, Places & maps | 1–4 each | Places 1 | Empty-state guidance; Places needs Geospatial |
| Platform Control Tower | 2 | — | Workspace creation and module enabling (3.2) |

## 5. Persona flows to test (WI-OI-151)

One Playwright spec per persona journey, each step timed and budgeted, on the isolated test stack with seeded
masters, failing when a step exceeds its budget or a journey its 10/30-second target:

- **Platform operator:** create workspace → enable modules → first admin invited.
- **Workspace admin:** first login → set-up guide → organization and site → invite people with roles → enable starter
  data → product, warehouse, asset, Workforce person.
- **Technician / operator:** report a problem; raise and complete a work order; report a hazard; request an absence;
  start a permit; (mobile: complete a round — Maestro in `gigalibs_mobile`, phase 2).
- **Supervisor:** triage a hazard; approve absence, timesheet, skip; assign work.
- **Buyer / clerk / AP:** requisition → PO → goods receipt → vendor bill → invoice matching.
- **Sales:** quote → sales order → fulfillment → invoice → credit memo.
- **Accountant:** set up a book → journal → approve → trial balance.
- **Executive:** Executive Control Tower and Analytics overview.
- **Chemist:** screening project → route → screening.

## 6. Rules for the work

- No business-logic change unless the business need is not met; where one is needed (module request, create-from),
  the work item says so and why.
- Every screen keeps the WI-OI-145 design: shell tab bar, no headings, underline tabs, `ModulePage`, plain words
  (`audit:ui-shell`).
- Each change is proven by its Playwright journey getting faster or unblocked; `pnpm verify` green; agents do not
  deploy (the owner runs the release worktree deploy).

## 7. Order of work

1. WI-OI-151 harness skeleton and WI-OI-146 blockers, in parallel (nothing else can be measured until screens load).
2. WI-OI-149 party/product pickers and money in normal units (business blockers on documents).
3. WI-OI-148 masters and prerequisites; WI-OI-147 onboarding and module enabling.
4. WI-OI-149 remaining defaults and create-from; WI-OI-150 words and help.
5. Re-run `e2e/ux-benchmark` and the journey specs; publish the new journey table here.

## 8. Work items

| Card | Priority | Scope | Done when |
|---|---|---|---|
| WI-OI-146 | P0 | Unblock every screen (3.1) | 0 failing calls and 0 error states on the 128 screens of the benchmark (except intentional permission notes) |
| WI-OI-147 | P0/P1 | Workspace creation, module enabling and request, set-up guide, organization delivery, role permissions (3.2) | P1 ≤ 15 s, P2 ≤ 10 s, A3 possible, set-up guide complete from Home |
| WI-OI-148 | P1 | Masters: dead-end-free pickers, starter data, import, prerequisite checklists (3.3) | Every journey's masters creatable in place; each module usable 10 minutes after enabling |
| WI-OI-149 | P0/P1 | Forms to 10–30 s: pickers with auto-fill, defaults, normal money, create-from, one-click approvals (3.4) | Every create journey ≤ 30 s and approval ≤ 10 s in WI-OI-151 |
| WI-OI-150 | P2 | Labels, help, error and empty-state words (3.5) | `audit:ui-shell` baseline lowered; no "(minor units)" or "ID" labels; help on every required field |
| WI-OI-151 | P0 | Playwright journey specs with timings and budgets per persona and module (5) | All 27 journeys automated on the test stack; report published; budgets gate `pnpm e2e:journeys` |
