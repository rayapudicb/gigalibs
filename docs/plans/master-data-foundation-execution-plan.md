# Master Data Foundation and Platform Kit — execution plan

- **Status:** Approved by the owner, 2026-11-03 ("approved", after "I will go with your recommendations"; country order
  set by the owner). Independent Architecture review of ADR-0037–0040 pending.
- **Decisions:** ADR-0037 (ownership, overlaps, hub), ADR-0038 (reference data, baseline, packs), ADR-0039 (reference
  integrity), ADR-0040 (model-first entities). **Analysis:** `docs/plans/master-data-and-platform-architecture-analysis.md`.
- **Cards:** `.pi/tasks/WI-OI-152.md` … `WI-OI-166.md` (163–166 added from the mobile review, 2026-11-03).
  **Order:** the one ordered queue, §6a. **Hand-over brief for agents:**
  `.pi/handoff/MASTER-DATA-FOUNDATION-HANDOFF-2026-11-03.md`.

## 1. Why, and where it sits in the order of work

The owner asked for master data and the platform's developer foundations to be solved **before further modules are built
or enhanced**. This plan is therefore a stage inserted into plan v3 (`docs/plans/gigalibs-execution-plan-v3.md`, "Master
data foundation"): new module cards (the frontline modules M-SOP … M-CHAT, M-NEW) and module enhancement cards wait for
milestone B (§6). Fixes, retests and regression of WI-OI-146–151 continue alongside.

## 2. The three levels of master data (final)

| Level | What it is | Who owns it | When a workspace gets it | Can the workspace change it? |
|---|---|---|---|---|
| **A. Platform reference data** | International standards: countries, currencies, units, languages, time zones … (§3) | The platform (kernel) | Always — loaded once for the whole platform | No (read-only, versioned) |
| **B. Pack-provided data** | Country specifics (tax codes, chart of accounts, fiscal year, holidays, payment terms …) and industry specifics (units, categories, asset classes …) (§4) | The workspace, with the pack and version recorded | When the workspace is created (country, industry) and when each module is enabled | Yes — it becomes the workspace's own; new pack versions are offered, never forced |
| **C. Module masters** | The workspace's own records: customers, vendors, products, warehouses, assets, people, accounts | The workspace, in the owning module | Created on screen or imported (WI-OI-155) | Yes |

**Persistence.** Reference data lives in the kernel database and survives every deployment: each load is a new version,
old versions are kept for audit, nothing is deleted by a deploy. Pack-provided data and module masters live in each
module's schema and also survive deployments. Creating a workspace never touches another workspace's data.

## 3. Platform reference data — the final list

| Set | Standard (source) | Used for | Status |
|---|---|---|---|
| Countries | ISO 3166-1 (CLDR) | Workspace country, addresses, partners, tax registration | Defined (`COUNTRIES`), not loaded |
| Regions / states / provinces | ISO 3166-2 (CLDR) | Addresses, state taxes (India GST, US sales tax), holidays | New set or `TAX_JURISDICTIONS` payload (WI-OI-153 decides) |
| Currencies with minor units | ISO 4217 (CLDR) | Every money field; rounding (JPY 0, INR 2, KWD 3) | Defined (`CURRENCIES`), not loaded |
| Languages and locales | ISO 639 / BCP 47 (CLDR) | Screen language, document language | Defined (`LANGUAGES`), not loaded |
| Locale formats | CLDR | Date, number and address formats, first day of week, 12/24-hour, measurement system | New (payload on locales) |
| Time zones | IANA tz database | Workspace and site time zone, shift times, schedules | Defined (`TIME_ZONES`), not loaded |
| Units of measure and standard conversions | UN/ECE Recommendation 20 (CLDR) | Products, inventory, purchasing, maintenance meters | Defined (`UNITS_OF_MEASURE`); conversions new |
| Tax jurisdictions (structure only) | ISO 3166 + tax authority lists | Where a tax applies; rates come from country packs | Defined (`TAX_JURISDICTIONS`), not loaded |
| Trade terms | ICC Incoterms 2020 | Sales and purchase documents, shipping | New |
| International dialling codes | ITU-T E.164 | Phone fields on parties and people | New (payload on countries) |

**Not reference data** (decided): exchange rates (one owner, ADR-0037), tax rates, holidays, charts of accounts, payment
terms (country packs), banks, customers and products (workspace).

## 4. Any country, and country and industry packs

### 4.1 Baseline for any country (no pack needed)

From the reference data alone, a workspace in any of the 249 countries gets: base currency and its decimals, language,
time zone (the country's, or a choice when it has several), date and number formats, first day of the week, metric or
imperial, a **generic chart of accounts** template, standard units, and a **"Set up your tax"** step in the set-up
guide that opens the tax screens. Every country therefore works on day one; a pack makes it statutory-ready.

### 4.2 What a country pack carries

| Section | Content | Applied to |
|---|---|---|
| Profile | Currency, language, time zones, week start, weekend, measurement system | Workspace profile |
| Calendar | Default fiscal year and periods, public holidays (national; regional where needed) | General ledger, Workforce, scheduling |
| Tax | Tax types, codes and rates with valid-from dates, registration number formats and checks, invoice wording | Tax (when enabled), Orders, Procurement, Accounts receivable |
| Accounting | National chart of accounts template and default account mapping | General ledger |
| Commercial | Payment terms, statutory invoice numbering rules | Orders, Procurement, Accounts receivable |
| Workforce | Working-time and pay rules (already in packs today) | Workforce |

Every tax rate and rule carries its **source and date** (provenance) and is reviewed by someone who knows the country
before a customer goes live there. Packs are configuration, not legal or tax advice.

### 4.3 Order (owner) and first-version scope

| # | Pack | Today | Tax system and registration (structure; rates sourced and reviewed at build) | Fiscal year default |
|---|---|---|---|---|
| 1 | India (`in`) | Workforce rules | GST (CGST, SGST, IGST, cess); GSTIN (15 characters), PAN | April–March |
| 2 | Japan (`jp`) | Workforce rules | Consumption tax with reduced rate; qualified invoice registration number (T + 13 digits) | April–March (common) |
| 3 | USA (`us`) | Workforce rules | Sales and use tax by state and local jurisdiction (structure; rates per jurisdiction); EIN | January–December |
| 4 | Middle East: UAE (`ae`), Saudi Arabia (`sa`) | — | VAT; UAE TRN (15 digits); Saudi VAT number (15 digits) and e-invoicing fields | January–December |
| 5 | Europe: EU (`eu`, one section per member state) and UK (`gb`) | Workforce rules | VAT per member state; VAT number formats with country prefix; UK VAT | January–December (editable) |
| 6 | China (`cn`) | — | VAT; unified social credit code (18 characters); fapiao fields | January–December |
| 7 | Russia (`ru`) | — | VAT; INN (10 or 12 digits), KPP | January–December |
| 8 | Africa: South Africa (`za`), Nigeria (`ng`), Kenya (`ke`) | — | VAT; ZA VAT number, NG TIN, KE PIN | Per country (editable) |

The existing Australia pack (`au`) is kept and extended when time allows.

### 4.4 Industry packs

The ten industry packs (agriculture, construction, event staffing, healthcare, Japan metro industrial, logistics,
manufacturing, QSR, travel crew, warehouse) gain: typical units, product categories, asset classes, work order types,
absence types, certifications, place types and vocabulary. The starter sets now hard-coded in screens
(`FinancialOperationsWorkspace.tsx` starter chart, `CmmsWindow.tsx` and `WorkforceWorkspace.tsx` `STARTERS`) move into
packs; the screen button becomes "Load from pack".

## 5. What happens when a workspace is created

1. **Create:** name, address and **country** (required, searchable), **industry** (optional). Language, time zone and
   base currency are pre-filled from the country and can be changed. (`CreateTenantSchema` gains `countryCode`,
   `industryKey`, `baseCurrency`, `defaultLocale`, `timeZone`; today it has none of these.)
2. **Store the workspace profile** in the kernel (new; Settings › Localization today keeps time zone and currency only
   in the screen and saves the language per user, not per workspace).
3. **Activate the packs:** the country pack and industry pack versions are activated for the workspace through the
   existing governed catalogue (`COUNTRY_PACK`, `INDUSTRY_PACK`), recorded in the audit log. A country without a pack
   gets the baseline (§4.1).
4. **Enable modules:** for each enabled module the existing kernel `pack.apply` job applies that module's section
   (`apps/playground-api/src/kernel-worker/pack-sections.ts`) — idempotent, with the pack and version recorded on what
   it creates.
5. **Set-up guide** shows what was loaded and what is left (tax, opening balances, first customers and products via
   import).
6. **The workspace adds its own masters** on screen or by spreadsheet import.

**Existing workspaces (366 on UAT):** the set-up guide shows a one-time "Confirm your country and industry" step;
nothing is loaded into an existing workspace until its administrator confirms.

**Pack updates:** a new pack version shows in the master data hub as "Update available (3 new tax codes)"; applying it
adds new entries and never overwrites ones the workspace edited.

## 6. Phases, cards and dependencies

| Phase | Cards | Can start | Milestone (done when) |
|---|---|---|---|
| **0 — Decide and switch on** | WI-OI-152 hub (read-only registry), WI-OI-153 reference data and workspace profile, WI-OI-160 generated relay wiring, WI-OI-156 slice A (product events published) | Now | **A:** the hub lists every master with counts; the workspace profile is stored; currency, country, language, time zone and unit pickers read reference data; product events appear in the outbox; relay settings come from manifests |
| **1 — Masters usable on day one** | WI-OI-154 packs (India first, then the order in §4.3), WI-OI-155 import kit, WI-OI-156 slices B–C (replicas and validation) | After A (154 needs 153; 156 B needs 160) | **B:** a new India manufacturing workspace is usable in ten minutes (currency, time zone, units, categories, chart, tax codes, payment terms, absence types, asset classes loaded; partners, items and opening stock imported from a spreadsheet); an archived product cannot be used on a new order. **New module cards may start after B.** |
| **2 — Model layer** | WI-OI-159 model-first entities and service factory, WI-OI-158 classic masters (built with it), WI-OI-157 overlap reconciliation | 159 design during phase 1; build after B | **C:** a new master is one declaration plus its rules; payment terms, partner groups, tax categories, carriers, discount schemes and document types exist; places, assets, rates and people are linked |
| **3 — Experience (later)** | WI-OI-162 simple metadata UI and "Additional details", WI-OI-161 workflow steps | After C | **D:** a tenant administrator adds a field in under a minute, reviewed and live without a deploy; quote → order and PO → receipt → bill run as compensating workflows |

**Dependencies:** 154 → 153 (packs reference currencies, units, countries). 156 B/C → 160 (new relays), 156 A has none.
157 → 156 (links validated through replicas). 158 → 159 and 154 (pack content for payment terms and tax codes). 159 → 156
(`reference()` generates replica consumers). 161 → 156. 162 → 159 and 155. 152 has none; its pack and import columns
fill in as 154 and 155 land.

**Country packs after India** are one slice each in the owner's order (§4.3); each needs its country reviewer named
before it is marked On UAT.

### 6a. The one ordered queue (owner, 2026-11-03)

**No parallel work.** Every agent — Claude, Codex, Cursor or any other — works this list top to bottom, **one card
at a time**, on branch `feat/frontline-suite` in `~/dev/gigalibs-rounds` (not `~/dev/gigalibs`, which is an older
release line with other sessions' work). The mobile app (`~/dev/gigalibs_mobile`) has no queue of its own: its work
belongs to the card that names it. When one agent's session ends, the next agent continues from the same place.

| # | Item | Notes |
|---|---|---|
| 0 | Retest of the deploy `38aa9017` (retest fixes) | Done (2026-11-03): `.pi/work/WI-OI-151.md` |
| 1 | WI-OI-152 Master data hub | Built |
| 2 | WI-OI-153 Reference data and workspace profile (slices A, B, C) | Built |
| 3 | WI-OI-160 Relay wiring from manifests | Built (slice A; generation moved to item 13) |
| 4 | WI-OI-156 slice A — product and master events | Built → **milestone A** (`bd852946`, deployed by the owner 2026-11-03) |
| 4a | Retest of milestone A on UAT | Done (2026-11-03): 8 of 8 checks, bench, journeys and 50 read-only tests pass (`.pi/work/WI-OI-151.md`). Not a card. After the owner's deploy and reference load: hub, reference pickers, workspace profile, standard units, read-only e2e, journeys and bench (commands in `.pi/work/WI-OI-151.md`); workbook updated |
| 5 | WI-OI-167 Workforce scope completion (security) | **Next card** (owner 2026-11-03, `docs/plans/all-modules-completion-plan.md`); finishes WI-OI-120ho |
| 6 | WI-OI-168 Status truth on UAT for modules already running | Read-only; relabels rows by evidence; removes stale deploy instructions |
| 7 | WI-OI-163 Record-level available actions (CMMS first) | From the mobile review; one answer for web and mobile |
| 8 | WI-OI-169 A booked technician can execute the work order | Needs 163; needed by 164 |
| 9 | WI-OI-164 Mobile CMMS work: read, execute and complete, sign-off | Needs 163 and 169; no parts or stock flows |
| 10 | WI-OI-165 Frontline journeys 133–143 proven on a device against UAT | Includes the contractor feature key and profiles |
| 11 | WI-OI-154 Packs: generic baseline, India, manufacturing industry | Phase 1 |
| 12 | WI-OI-155 Import and export kit | Phase 1 |
| 13 | WI-OI-156 slices B–C — reference replicas, validation, Compose relay generation | Phase 1 → **milestone B** (new module cards may start) |
| 14 | WI-OI-170 Mobile Workforce: my shifts, clock in and out, my time; supervisor tablet | Confirm first; needs 167 and 163 |
| 15 | WI-OI-171 Rosters: shift templates, repeating shifts, demand from any module | Confirm first |
| 16 | WI-OI-159 Model-first entities and service factory | Confirm first |
| 17 | WI-OI-158 Classic masters | Confirm first |
| 18 | WI-OI-157 Overlapping masters, including people and stock (slice 5) | Confirm first; mobile parts flows wait for slice 5 |
| 19 | WI-OI-172 Customer and rate on demand; one time path to Projects billing | Confirm first; needs 171, 157, 156 B |
| 20 | WI-OI-166 One service request, several work orders | Confirm first |
| 21 | WI-OI-174 Reporting lines and approval routing | Confirm first |
| 22 | WI-OI-175 Asset ownership and hire; driver and vehicle checks | Confirm first |
| 23 | WI-OI-154 remaining country packs: JP, US, AE and SA, EU and UK, CN, RU, ZA, NG and KE | One slice each, in this order |
| 24 | WI-OI-161 Workflow steps with compensation | Confirm first |
| 25 | WI-OI-173 Pay by worksite and allowances | Confirm first; needs the country packs and 172 |
| 26 | WI-OI-162 Simple metadata UI and Additional details | Confirm first; low priority |
| 27 | Module completion stages C1–C11, one card per module | `docs/plans/all-modules-completion-plan.md` §7; each card written at claim from its §8 template and shown to the owner |

**Not in the queue yet (owner decides where):** WI-OI-131 Analytics is In Progress outside this queue, with
uncommitted work in `~/dev/gigalibs` that only its own session may touch (completion stage C9); WI-OI-144 work-order
chat (stage C10); WI-OI-120cg SPEED Deploy Group 10 (stage C8); WI-OI-120p enterprise onboarding (plan v3 Phase 3).

**How a card is taken, so two agents can never build at once:**
1. Take the first item not yet Built. Read `.pi/NOW.md` and the card; if it says "confirm first", ask the owner.
2. Claim it: set its row in `.pi/WORK_ITEMS.md` to In Progress with your name in the Owner column, and put its id in
   `config/sdlc-governance.json` → `workInProgressLimits.activeImplementationWorkItems`. The list holds one id at most;
   `audit:sdlc` (part of `pnpm verify`) fails when a second is added or the row is not In Progress.
3. If the slot already holds another card, stop: someone else is building it. Do not start anything else.
4. Finish: `pnpm verify` green, evidence in `.pi/work/WI-OI-NNN.md`, row to Built, id removed from the slot,
   `.pi/NOW.md` updated with the next item. Commit only when the owner says "commit"; the owner deploys.

## 7. Rules for every card

- Read `AGENTS.md` (mandatory reading order, Done checklist, verification), the card, its ADRs and the hand-over brief.
- Only an approved card is worked; one agent per card; a slice is a commit with its evidence in `.pi/work/WI-OI-NNN.md`.
- **Additive only:** new tables, columns, events and endpoints; no change to an existing record contract without a
  conversion; row-level security on every new table; new permissions in the permission catalogue and roles; gateway
  allow-lists updated; `audit:layers` classifies every new model; `ui-*` design tokens only; WI-OI-145 screen design.
- **Prove before UAT:** PostgreSQL proofs on throwaway databases (`proof:minimal-p2p`, `proof:minimal-o2c`, the module
  proof harnesses), the journey suite in dry mode; UAT is production and read-only to agents.
- `pnpm verify` green; load compiled modules under Node and run `next build` for web changes before an image build.
- **Agents do not deploy.** The owner deploys from the release worktree; reference set loads on UAT are platform-operator
  actions the owner runs.
- **Never change:** the CMMS import/export files (the import kit copies the design into a new package), another agent's
  work, secrets, the web on port 5180.

## 8. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| Wrong tax or statutory data | Sources and dates recorded per rate; country reviewer before go-live; packs offered, never forced; "configuration, not advice" |
| Generator produces wrong code | `--check` mode in `pnpm verify`; generated code passes the same audits; proven on the proof harnesses; master-style entities first |
| Replica lag or gaps | Backfill first, shadow mode, then enforce per module; replica health shown in the hub |
| Surprise changes to existing workspaces | Nothing is loaded without the administrator confirming country and industry |
| Scope creep into domain logic | Model layer covers master-style entities; posting, costing and allocation stay hand-written |

## 9. Change to plan v3

Plan v3 gains the stage "Master data foundation (owner, 2026-11-03)" pointing here; nothing else in its order changes.
