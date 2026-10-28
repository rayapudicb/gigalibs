# iDempiere-parity modules — end-to-end production development plan

**Goal.** Build the seven listed Enterprise Module outcomes with the stated iDempiere reference flows and GigaLibs
enhancements. The named slices are the acceptance scope; exhaustive iDempiere parity needs a separate feature-by-feature
gap map and cannot be inferred from this plan.
Each module ships real-time transactions, a real DB schema, all screens, and the handshakes that let a business
transaction complete end-to-end. Built the GigaLibs way: versioned business configuration, server-authoritative math,
immutable stamped ledgers, independent review, isolated integration proof, and deployment by the owner.

**Owner delivery direction (2026-10-28).** Build F0 and Modules 1–7 in the order below without waiting for a UAT
deployment between modules. A full module and a clean `pnpm verify` trigger its module-completion commit. The owner
will deploy the seven-module batch once from a release worktree, then run and accept each module journey. This batch
deployment decision supersedes the per-phase deploy cadence below and the earlier group order for these seven modules;
it does not make an unverified module Built or a merely Built module Done.

**Architecture reconciliation.** ADR-0018, ADR-0033 and ADR-0007 govern where the shorthand below differed from
accepted design: no magic Org-0, per-document lifecycle graphs, and asynchronous cross-module posting.

Modules in scope: **Universal Business Partner · WMS/Material Ledger · Manufacturing/BOM/MRP · Advanced SCM &
Transfers · Landed Cost · Returns/RMA · Project Accounting/WBS.**

---

## 0. The shared architecture contract (every module obeys this)

| Concern | The GigaLibs way (all 7 modules follow it) |
| --- | --- |
| **Module shape** | `modules/<name>/` = `apps/api` (NestJS on `@gigalibs/module-sdk`), `web/` (metadata-window React + `@medusajs/ui`), `db/migrations/` (own schema `gigalibs_<name>`, `runtime-manifest.txt`), `dictionary/` (windows + panels), `module.yaml` (catalog entry, gateway routes, roles, `navigationGroup`, readiness). Runs in `module-host`. |
| **Multi-tenancy** | Tenant is the forced PostgreSQL RLS boundary. ADR-0018 supplies explicit `UNIT`, `SHARED`, or `EITHER` ownership, signed organization grants and a versioned organization replica. Financial/stock rows have explicit owning-unit references where their policy requires them. No magic Org-0 or implicit shared owner. Runtime roles remain least-privilege. |
| **Screens** | Metadata windows (`dictionary/*.window.json`) + registered **panels** (S2b) placed by metadata — no bespoke routing. `@medusajs/ui` + `ui-*` tokens (passes `audit:design-tokens`). Customers reorder/relabel/add fields with no code. |
| **Document engine** | `@gigalibs/document-lifecycle` supplies shared transition, idempotency, concurrency, audit and outbox primitives. Each document owns its graph and guards; `prepareIt`/`completeIt`/`reverseCorrectIt` are document actions where applicable, not one imposed state list. The owning module locks and commits its own rows and outbox atomically. Counter-documents reverse immutable effects. |
| **Real-time** | Local writes are ACID. Cross-module facts use the existing signed HTTP outbox/inbox relay (ADR-0007); a future BullMQ transport needs its own decision and proof. Live tiles stream confirmed state and expose pending/rejected downstream work. Gateway calls have bounded timeouts, idempotency and failure states. |
| **Handshake** | Modules communicate through versioned signed gateway commands or published events in `@gigalibs/contracts`, never another module's schema. Finance posting is asynchronous and idempotent per ADR-0033 D3: local completion emits an outbox fact, Finance posts in its transaction, and the source shows awaiting/posted/rejected status with reconciliation. No cross-module ACID claim. |
| **Ledgers & audit** | Money/stock/cost tables are **immutable append-only**; corrections post reversals. Field-level audit (`audit-core`) with actor + reason on every write. Every computed row stamps its engine/criteria/rate versions + inputs hash. |
| **No hard-coding** | No business values in code — tax rates, cost methods, tolerances, replenishment rules are **versioned, cited config**. Pure engines `f(inputs, config) → outputs` in `packages/*`; migrations are structure-only. |
| **Proof** | Tier-1 Vitest (pure math: ATP, BOM rollup, landed-cost allocation); Tier-2 integration on throwaway Postgres (RLS, document actions, relays); Tier-3 Playwright E2E. Record independent Security and Accounting findings against the assembled UAT release; resolve findings without blocking the next module's build. |

---

## F0. Foundations to build first (shared — before module work pays off)

| # | Foundation | Why it blocks everything | Key tasks |
| --- | --- | --- | --- |
| **F0.1 Organization ownership** | ADR-0018 already provides tenant-bound, versioned organizations and a module replica; this foundation closes gaps for the seven modules. Shared master data uses explicit `SHARED` ownership and its permission policy. | 1. Reuse signed organization scope and module replicas; add ownership policy and owning-unit references only where required. 2. Prove sibling-unit and tenant isolation in API and PostgreSQL. 3. Migrate existing financial/stock records with a verified owner mapping or explicit shared classification; refuse ambiguous rows. |
| **F0.2 Document actions** | Extend `document-lifecycle` without imposing one graph. Row locking and period checks live in the owning module transaction; Finance posting follows ADR-0033 D3. | 1. Shared transition/idempotency/audit/outbox helpers. 2. Per-document counter-document and replay proof. 3. Posting status, rejection recovery and reconciliation through the existing Finance relay. |
| **F0.3 Material Ledger core** | The single stock authority every logistics/finance module reads (this is Module 2's engine; build it as the shared ledger). | See **Module 2**. |

> Module **1 (Business Partner)** and **2 (Material Ledger)** are themselves foundations — build them first; the
> other five consume them.

---

## The 7 modules (schema · screens · handshake · tasks · UX-beyond-iDempiere)

### Module 1 — Universal Business Partner (`business-partners`)  ⟶ build 1st
**Build status (2026-10-28): In Progress, not Built.** Completed sub-slices: Party/organization projection and
forced-RLS schema; scoped customer/vendor account create with Finance control-account validation; Orders → AR
owned fulfillment issue; AR issue/payment/void balance snapshots → signed Business Partner inbox → immutable
credit deltas. The remaining slices and verification gate are tracked in [WI-OI-123](../../.pi/tasks/WI-OI-123.md).
The kernel's existing `Party`, roles, addresses, contacts and organization assignments remain the master-data
authority. This module owns only commercial/financial extensions keyed by the canonical party id; it consumes
versioned party facts and never adds a second partner/contact/location master.
**Parity:** one counterparty (`isCustomer/isVendor/isEmployee`) with simultaneous AR and AP control
accounts selected from tenant-approved, versioned account configuration; credit exposure `OpenAR + UninvoicedOrders − Prepayments ≤ CreditLimit`; AR/AP netting.
**Schema (`gigalibs_business_partners`):** `party_references` (versioned projection of kernel `parties`),
`partner_bank`, `partner_customer_acct`, `partner_vendor_acct`, `credit_status` (ledger), `credit_holds`.
Locations and contacts are read through the kernel Party API and composed by the BFF.
**Screens:** Partner **split-screen** window (DataTable left / FocusModal-Drawer right) with tabs Locations · Contacts ·
**Credit Status** (live gauge) · Financials; a Credit-Hold queue window.
**Handshake:** publishes `partner.credit-hold.v1`; **serves** credit checks to Orders/Procurement/AR/AP via the gateway
(`partners.credit.check`); consumes AR-owned invoice and settlement facts to update open balance. AR remains the
customer-invoice authority (platform implementation plan D4/T7); Orders' current invoice path needs convergence.
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
**Parity:** multi-level BOM explosion/where-used; a recoverable production run (discharge raw, stock finished, roll cost);
scrap factor.
**Schema (`gigalibs_manufacturing`):** `boms`, `bom_lines`, `production_orders`, `production_lines`, `production_plans`,
`work_centers`, `routings`.
**Screens:** **hierarchical BOM tree** with shortage badges (green/red); production **execution cockpit** FocusModal;
MRP run preview grid.
**Handshake:** reserves/issues components via `inventory.reserve`; receives finished goods into stock; rolls cost via
`cost_records`; posts WIP + variance to GL.
**Slices:** S1 BOM schema + **explosion/implosion engine** (pure, recursive); S2 production order on document actions
(reserve → issue → receive, with durable pending/compensation across module boundaries); S3 **cost rollup** (incl. scrap %) pure engine; S4 MRP netting (demand vs supply) → planned
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
Orders already owns `customer_returns` and `customer_credit_memos`. The RMA module owns authorization, inspection
and disposition, then requests the existing Orders credit-memo action; Orders remains the financial document owner.
Existing Orders returns need a compatibility/migration plan so the same return cannot be processed twice.
**Parity:** RMA linked to original SO/Invoice; disposition Restock/Quarantine/Scrap; returned qty ≤ invoiced qty;
credit memo.
**Schema (`gigalibs_returns`):** `rma`, `rma_lines`, `rma_types`, `dispositions`.
**Screens:** RMA **processing checklist**; RadioGroup disposition; one-click Credit-Memo modal.
**Handshake:** validates the original sales order with Orders and the invoice with AR (T7); restock → `inventory.receive` to sellable ATP;
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

**Phasing (build every full module, verify and commit it; owner deploys all seven together afterward):**
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

## Completion evidence (per module)
**Built:** all slices and key failure paths work against real persistence; exact arithmetic and negative-stock guards
are tested; tenant and organization isolation, document reversal, relay replay and reconciliation are proven;
`pnpm verify` is green; migration and roll-forward evidence exists; metadata windows and catalogue registration are
present. Commit the complete module once its build gate passes.

**Done:** after the batch release from a release worktree, the owner deploys to UAT and accepts that module's journey.
Independent Security review on UAT and Accounting findings for posting are recorded and resolved under the applicable
release rules. Built, On UAT and Done remain distinct evidence statuses.
