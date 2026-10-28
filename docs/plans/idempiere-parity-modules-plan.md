# iDempiere-parity modules — end-to-end production development plan

**Goal.** Build the 7 missing/partial Enterprise Modules to **100% functional parity with iDempiere, enhanced beyond
it**, on the GigaLibs architecture (multi-tenant RLS, metadata-driven screens, the document engine, module relays).
Each module ships real-time transactions, a real DB schema, all screens, and the handshakes that let a business
transaction complete end-to-end. Built the GigaLibs way: zero hard-coding, server-authoritative math, immutable
stamped ledgers, independent review, tested on `gigalibs-test`, deployed by the owner.

Modules in scope: **Universal Business Partner · WMS/Material Ledger · Manufacturing/BOM/MRP · Advanced SCM &
Transfers · Landed Cost · Returns/RMA · Project Accounting/WBS.**

---

## 0. The shared architecture contract (every module obeys this)

| Concern | The GigaLibs way (all 7 modules follow it) |
| --- | --- |
| **Module shape** | `modules/<name>/` = `apps/api` (NestJS on `@gigalibs/module-sdk`), `web/` (metadata-window React + `@medusajs/ui`), `db/migrations/` (own schema `gigalibs_<name>`, `runtime-manifest.txt`), `dictionary/` (windows + panels), `module.yaml` (catalog entry, gateway routes, roles, `navigationGroup`, readiness). Runs in `module-host`. |
| **Multi-tenancy** | Forced PostgreSQL RLS; **two-tier `tenantId` + `orgId`** on every row (see F0 — the two-tier upgrade). Writes through `withTenantTransaction`; runtime role is least-privilege (SELECT/INSERT on append-only ledgers). |
| **Screens** | Metadata windows (`dictionary/*.window.json`) + registered **panels** (S2b) placed by metadata — no bespoke routing. `@medusajs/ui` + `ui-*` tokens (passes `audit:design-tokens`). Customers reorder/relabel/add fields with no code. |
| **Document engine** | **`@gigalibs/document-lifecycle`** = iDempiere's DocAction. Every business document is a state machine: `DRAFT → PREPARED → APPROVED → COMPLETED → CLOSED/VOIDED/REVERSED`. `prepareIt` (validate period, credit, reserve stock, explode BOM, compute tax) and `completeIt` (generate downstream docs, move stock, **auto-post GL**) run in one transaction with row locks; `reverseCorrectIt` writes an inverted counter-document (never deletes). |
| **Real-time** | Writes are synchronous + ACID; cross-module effects go through the **outbox → inbox relay** (`module-sdk`, ADR-0007) drained by BullMQ jobs; live tiles (ATP, stock, match status) stream over the existing WS channel. No external calls at runtime. |
| **Handshake** | Modules talk **only** through the **signed module gateway** (`callSignedModule`) and **published events** in `@gigalibs/contracts`; never another module's schema. GL posting goes through `@gigalibs/posting-rules` into `financial-operations`' subledger inbox (the proven inventory→finance pattern). |
| **Ledgers & audit** | Money/stock/cost tables are **immutable append-only**; corrections post reversals. Field-level audit (`audit-core`) with actor + reason on every write. Every computed row stamps its engine/criteria/rate versions + inputs hash. |
| **No hard-coding** | No business values in code — tax rates, cost methods, tolerances, replenishment rules are **versioned, cited config**. Pure engines `f(inputs, config) → outputs` in `packages/*`; migrations are structure-only. |
| **Proof** | Tier-1 Vitest (pure math: ATP, 3-way, depreciation, BOM rollup, landed-cost allocation); Tier-2 integration on throwaway Postgres (RLS, DocAction, relays — the `proof:minimal-*` + `verify-*-relay` harnesses); Tier-3 Playwright E2E. `security_reviewer` every slice; `gxp`/`accounting` for posting. |

---

## F0. Foundations to build first (shared — before module work pays off)

| # | Foundation | Why it blocks everything | Key tasks |
| --- | --- | --- | --- |
| **F0.1 Two-tier Tenant→Org** | iDempiere's AD_Client→AD_Org; GigaLibs is Tenant+Department today. Orgs = legal entities/branches/cost centres; Org-0 holds shared master data (products, price lists, CoA, tax). | 1. Add `orgId` to the RLS context + a Prisma `$extends` that splices `tenantId`+`orgId` into every query AST. 2. `organizations` replica + the Org-0 inheritance rule. 3. Scope all existing money modules to Org. |
| **F0.2 Universal Document Engine** | Generalise `document-lifecycle` into the DocAction two-phase (`prepareIt`/`completeIt`/`reverseCorrectIt`) with pessimistic `SELECT FOR UPDATE NOWAIT`, period-open check, and a pluggable "downstream-doc + GL-post" callback. | 1. The generic runner + lock + period guard. 2. The reversal (counter-document) helper. 3. The GL-post hook into `posting-rules`. |
| **F0.3 Material Ledger core** | The single stock authority every logistics/finance module reads (this is Module 2's engine; build it as the shared ledger). | See **Module 2**. |

> Module **1 (Business Partner)** and **2 (Material Ledger)** are themselves foundations — build them first; the
> other five consume them.

---

## The 7 modules (schema · screens · handshake · tasks · UX-beyond-iDempiere)

### Module 1 — Universal Business Partner (`business-partners`)  ⟶ build 1st
**Parity:** one counterparty (`isCustomer/isVendor/isEmployee`) with simultaneous AR (11200) & AP (21100) control
accounts; credit exposure `OpenAR + UninvoicedOrders − Prepayments ≤ CreditLimit`; AR/AP netting.
**Schema (`gigalibs_partners`):** `partners` (extends kernel `parties`), `partner_locations`, `partner_contacts`,
`partner_bank`, `partner_customer_acct`, `partner_vendor_acct`, `credit_status` (ledger), `credit_holds`.
**Screens:** Partner **split-screen** window (DataTable left / FocusModal-Drawer right) with tabs Locations · Contacts ·
**Credit Status** (live gauge) · Financials; a Credit-Hold queue window.
**Handshake:** publishes `partner.credit-hold.v1`; **serves** credit checks to Orders/Procurement/AR/AP via the gateway
(`partners.credit.check`); consumes `invoice.completed.v1` to update open balance.
**Slices:** S1 schema+RLS+Org; S2 partner CRUD + locations/contacts windows; S3 customer/vendor acct + CoA link;
S4 **credit-exposure engine** (pure) + live gauge panel; S5 credit-hold state machine + gateway check + block flow;
S6 AR/AP netting view; S7 relays + Playwright (clerk blocked on CREDIT_HOLD).
**> iDempiere:** real-time credit gauge (WS) instead of batch; AI "why on hold" explainer; metadata-extendable partner
fields (JSONB + GIN) with zero DDL.

### Module 2 — Material & Warehouse / Material Ledger (extend `universal-inventory`)  ⟶ build 2nd
**Parity:** Warehouse→Aisle→Bay→Shelf **locators**; lot/serial; `ATP = QtyOnHand − QtyReserved`; immutable
`M_Transaction` ledger; `M_Cost` by method.
**Schema (`gigalibs_inventory`, additive migs):** `locators`, `storage_on_hand` (by locator+lot/serial),
`storage_reservations`, `inventory_transactions` (append-only), `cost_records` (FIFO/Avg/Std), `lot_serial`.
**Screens:** interactive **Warehouse Map** (CSS grid) with hover lot/expiry popovers; **mobile barcode-scanner Drawer**
for putaway/pick; reservations + transaction-ledger windows.
**Handshake:** **serves** `inventory.atp.check` + `inventory.reserve/release` to Orders/Manufacturing/Projects; posts
stock-move + cost facts to finance via the existing inventory→finance relay (E2/E3 — already proven).
**Slices:** S1 locators + migrate on-hand to locator grain; S2 **ATP engine** (pure, never-negative) + reserve/release
gateway; S3 lot/serial + expiry; S4 transaction ledger + cost records (method config); S5 Warehouse-Map panel;
S6 barcode scanner Drawer (mobile); S7 relays + concurrency proof (atomic reservations).
**> iDempiere:** live ATP over WS; mobile-first scanner; costing method as per-Org config, not code.

### Module 3 — Advanced SCM & Inter-Warehouse Transfers (extend `universal-inventory`)  ⟶ build 3rd
**Parity:** Source→**In-Transit virtual locator**→Dest with GL in-transit clearance on arrival; Min-Max replenishment
auto-generating POs.
**Schema:** `movements`, `movement_lines`, `in_transit_locator`, `replenish_rules` (min/max/pack per product+warehouse).
**Screens:** **Kanban transfer board** (Outbound · In-Transit · Receiving); **Replenishment Radar** with bulk
"Generate POs".
**Handshake:** on dispatch → in-transit GL (via posting-rules); on receipt → release to sellable ATP; replenishment →
`procurement.po.draft` via gateway.
**Slices:** S1 movement doc on DocAction (dispatch/receive); S2 in-transit locator + GL clearance; S3 min-max engine
(pure, respects pack size) + Radar; S4 Kanban board; S5 bulk PO generation handshake; S6 E2E (receipt releases ATP).
**> iDempiere:** Kanban + drag transfer; predictive replenishment (demand signal) vs static min-max.

### Module 4 — Manufacturing, BOM & MRP (new `universal-manufacturing`)  ⟶ build 4th
**Parity:** multi-level BOM explosion/where-used; atomic production run (discharge raw, stock finished, roll cost);
scrap factor.
**Schema (`gigalibs_manufacturing`):** `boms`, `bom_lines`, `production_orders`, `production_lines`, `production_plans`,
`work_centers`, `routings`.
**Screens:** **hierarchical BOM tree** with shortage badges (green/red); production **execution cockpit** FocusModal;
MRP run preview grid.
**Handshake:** reserves/issues components via `inventory.reserve`; receives finished goods into stock; rolls cost via
`cost_records`; posts WIP + variance to GL.
**Slices:** S1 BOM schema + **explosion/implosion engine** (pure, recursive); S2 production order on DocAction (reserve
→ issue → receive, atomic); S3 **cost rollup** (incl. scrap %) pure engine; S4 MRP netting (demand vs supply) → planned
orders; S5 BOM tree + shortage panel; S6 execution cockpit; S7 GL WIP/variance relay + E2E (run deducts raw, adds
finished).
**> iDempiere:** graph-based BOM editor; real-time shortage radar; what-if MRP simulation (reuse SPEED-style scenario
pattern).

### Module 5 — Landed Cost Allocation (extend `universal-procurement` + `financial-operations/costing`)  ⟶ build 5th
**Parity:** allocate freight/duty by Qty/Value/Weight/Volume into unit cost; true-up inventory asset; sold-goods
variance → COGS.
**Schema:** `landed_costs`, `landed_cost_allocations`; writes `cost_records` adjustments + GL.
**Screens:** 3-step **allocation wizard** FocusModal; side-by-side Original→Landed→Adjusted cost impact table.
**Handshake:** consumes receipt (`inventory.receipt.v1`) + vendor-bill lines; adjusts `cost_records` via gateway; posts
true-up / COGS variance to GL.
**Slices:** S1 schema; S2 **allocation engine** (4 bases, pure, rounding-exact); S3 inventory cost true-up handshake;
S4 sold-goods → COGS variance posting; S5 wizard + impact panel; S6 E2E ($3k freight / 500 units = +$6.00/unit).
**> iDempiere:** multi-shipment container allocation UI; auto-suggest basis from commodity type.

### Module 6 — Returns / RMA (new `universal-returns`)  ⟶ build 6th
**Parity:** RMA linked to original SO/Invoice; disposition Restock/Quarantine/Scrap; returned qty ≤ invoiced qty;
credit memo.
**Schema (`gigalibs_returns`):** `rma`, `rma_lines`, `rma_types`, `dispositions`.
**Screens:** RMA **processing checklist**; RadioGroup disposition; one-click Credit-Memo modal.
**Handshake:** validates against Orders (`orders.invoice.lookup`); restock → `inventory.receive` to sellable ATP;
scrap → expense GL; credit memo → AR.
**Slices:** S1 schema + anti-fraud qty guard (pure); S2 RMA on DocAction linked to SO/Invoice; S3 disposition routing
(restock/quarantine/scrap) + stock/GL effects; S4 credit-memo → AR handshake; S5 checklist UI; S6 E2E (damaged return →
scrap + partial credit).
**> iDempiere:** photo-evidence capture + AI defect triage (reuse document-scanner); customer self-service RMA portal.

### Module 7 — Project Accounting & WBS (new `project-operations`)  ⟶ build 7th (most cross-cutting)
**Parity:** Project→Phase→Task WBS; real-time cost accrual (material issues + labor rates); milestone or T&M billing;
WIP.
**Schema (`gigalibs_projects`):** `projects`, `project_phases`, `project_tasks`, `project_lines`, `project_issues`,
`timesheets`, `labor_rates`.
**Screens:** **Gantt timeline**; Budget-vs-Actual burn matrix; timesheet approval queue Drawer.
**Handshake:** material issue → `inventory.issue` charges WIP; timesheets → labor cost; milestone/T&M → `ar.invoice.draft`;
WIP → GL.
**Slices:** S1 WBS schema; S2 cost accrual engine (material + labor, pure); S3 WIP GL posting; S4 **T&M billing engine**
(unbilled timesheets × rate) + milestone trigger → AR; S5 Gantt + burn panel; S6 timesheet approval; S7 E2E (Phase-1
complete → drafts milestone invoice).
**> iDempiere:** live burn-rate + overrun prediction; drag Gantt; mobile timesheet with geofenced punch (reuse
GigaOps punch).

---

## Build order & dependency graph (correct sequencing)

```
F0.1 Two-tier Org ─┐
F0.2 DocAction  ───┤
                   ├─► 1 Business Partner ─┐
                   └─► 2 Material Ledger ──┼─► 3 Advanced SCM/Transfers
                                           ├─► 4 Manufacturing/MRP
                                           ├─► 5 Landed Cost   (also needs Procurement)
                                           ├─► 6 RMA           (also needs Orders)
                                           └─► 7 Project Acct  (needs BP + Stock + GL + AR)
```

**Phasing (each phase = one business-use-case batch: finish all slices → one review → one commit → one deploy):**
- **Phase A (foundations):** F0.1, F0.2, then **Module 1** and **Module 2** (they unblock everything).
- **Phase B (logistics):** **Module 3** then **Module 4** (both extend the Material Ledger).
- **Phase C (cost & returns):** **Module 5** then **Module 6**.
- **Phase D (services):** **Module 7**.

Rationale: 1 & 2 are referenced by every other module; 3/4 extend stock; 5 needs cost+procurement; 6 needs orders+stock;
7 is the most cross-cutting (needs BP, stock, GL, AR) so it lands last.

## Enhancements beyond iDempiere (apply across all 7)
Real-time WS tiles (ATP, credit, match, burn) · metadata-driven no-code screens + JSONB custom fields (no DDL) · DB-level
RLS + two-tier Org · isomorphic Zod validation (one schema, client+server) · AI assists where they earn their place
(credit-hold explainer, defect triage, MRP what-if, bank-match confidence) · mobile-first drawers (scanner, timesheet) ·
immutable stamped ledgers with one-click reversal.

## Definition of Done (per module)
All slices committed; Tier-1/2/3 tests green (100% on money/stock/cost math, no float errors); RLS + two-tier isolation
proven; DocAction reversal proven (no orphan GL/stock); `pnpm verify` green (`audit:layers`, `audit:design-tokens`,
`audit:production-data`); independent Security review (+ Accounting for any posting); metadata windows published;
catalogue entry + `navigationGroup` + readiness; deployed by the owner to UAT; journey rerun.
