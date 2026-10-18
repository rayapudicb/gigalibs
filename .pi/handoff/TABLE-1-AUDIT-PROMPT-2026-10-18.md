<!--
Owner's prompt, pasted on 2026-10-18 and saved verbatim. The owner's order (2026-10-18): finish the pending CMMS work
first, then work on this prompt in detail. Before you start it, read section 7 of HANDOFF-2026-10-18-CURSOR.md: what
was checked on 2026-10-18 and the cautions that apply.
-->

# GigaLibs — Table 1 audit & implementation plan (iDempiere business areas)

You are working in the **gigalibs** monorepo. Follow **AGENTS.md** exactly: read `.pi/NOW.md` first, respect owner-approved order in `docs/plans/gigalibs-execution-plan-v3.md` and `docs/plans/phase-1-sizing.md`, route behavior changes through WI-OI task cards (`.pi/tasks/TEMPLATE.md`), never claim Done without evidence, never use production-reachable mocks/fake provider results, and run `pnpm verify` when you change product code.

## Owner constraints (2026-10-18)

1. **Table 2 (ADR-0033 F0–F2) is the active engine track** — see `.pi/TABLE-2-ENGINES.md` and `.pi/TABLE-2-UAT-CLOSURE.md`. Do **not** re-implement or duplicate Table 2 engine work in Table 1 analysis. Table 1 rows 5, 6 (receipt leg), 9, 12, 15, 18 only **reference** Table 2 for receipt→GL, period lock, posting, close guards.
2. **UAT is production.** You must **not** run `deploy-uat.sh --deploy` or change running UAT services/DB unless the owner explicitly asks.
3. **Current UAT tip:** release `3bc0c1f`. **Table 2 product deploy tip:** `0a0e787`+ on `feat/gigaops-convergence-core`.
4. Do **not** change CMMS import/export files, secrets, or port 5180 web without an approved card.
5. **Commit only when the owner says "commit".** For this task, default to **audit + plan + proposed task cards** unless a single scoped slice is already Approved.

## Canonical Table 1 source

Read and treat as the baseline (reconcile your findings to this file; propose edits if repo evidence differs):

- `.pi/TABLE-1-IDEMPIERE-MAP.md` (29 rows)
- Module inventory: `docs/plans/gigalibs-execution-plan-v3.md` §7 (A platform, B business modules, C future)
- Outcome honesty: `docs/architecture/MODULE_ACTION_OUTCOMES.md` (where present)
- Work item status: `.pi/WORK_ITEMS.md` (grep relevant WI-OI rows only)

## Reference table (iDempiere → GigaLibs) — verify each row in code

For every row below, produce evidence from the repo (paths, APIs, metadata window counts, compose/UAT profile, tests, journeys). Classify **Exists**, **Enhance**, **Implement**, or **Net-new**. Separate **“service on UAT”** from **“E2E business outcome on UAT”**.

| # | iDempiere business module | Main iDempiere pieces | GigaLibs module / folder | What owner believes exists | What owner believes is still needed |
|---|---------------------------|------------------------|--------------------------|------------------------------|-------------------------------------|
| 1 | Platform & tenant | Client, org, role, user | Control plane, Organization | Partial / On UAT — sign-in, workspaces, roles | Org tree publish, scope on all modules, enterprise admin |
| 2 | Application dictionary & UI | AD_Window, fields, menus | Application Dictionary, configuration packages | Partial / On UAT — dictionary compiler subset | F0 on every ERP screen; no hard-coded workspaces |
| 3 | Master data — partners | C_BPartner, locations, contacts | core-parties (kernel: contracts + `/parties`) | Code + partial UAT | Parties everywhere; merge, roles |
| 4 | Master data — products & pricing | M_Product, UOM, price lists | product-catalogue | On UAT (metadata) | Entitlements; price resolution in Orders/Procurement |
| 5 | Warehouse & inventory | WH, locator, stock, movement, lot | universal-inventory | APIs + metadata; Table 2 code at 0a0e787 | Table 2 UAT; U2 signed-in API; CMMS parts = one stock authority |
| 6 | Procure-to-pay | Req, PO, receipt, vendor invoice, match | universal-procurement, spend-management | Code; 3-way match APIs; hard-coded UI | Inventory receipts; metadata UI; budget/approval; F2 AP; Finance relay |
| 7 | Order-to-cash | Quote, SO, shipment, customer invoice | universal-orders, accounts-receivable | Orders on UAT; AR not on stack | Deploy AR; ATP; shipment from Inventory; metadata UI; journeys |
| 8 | AR / billing | Customer invoice, credit, dunning | accounts-receivable | Code only | SDK + compose; metadata; payments/allocation |
| 9 | AP / vendor payables | Vendor invoice, payments | Procurement + Spend → Finance | Partial in procurement | Vendor bill on metadata; 3-way match; posting |
| 10 | Payments & cash application | MPayment, allocation | AR + Treasury (financial-operations) | Code only | Payments, allocation, cash docs, F2 posting |
| 11 | Treasury & bank rec | Bank, statement, reconciliation | Treasury in financial-operations | Code only | Real ingest (CAMT/MT940/OFX); metadata rec UI |
| 12 | General ledger | COA, journal, Fact_Acct, periods | financial-operations | UAT + GL metadata; Table 2 posting in git | F2 all events; F1 period lock all docs; F2.9 sign-off |
| 13 | Tax | Tax category, line tax | tax-configuration | Not deployed | Deploy; tax on lines |
| 14 | Multi-currency | Currency, rates | multi-currency | Not on UAT | Real rates; wire GL/O2C/P2P |
| 15 | Costing & COGS | Cost layers, landed cost | Costing in financial-operations | Code only | Receipt/issue cost; F2 COGS/PPV; metadata UI |
| 16 | Budget & commitment | Budget, encumbrance | Budgeting sub-domain | Code only | Hard/warn req/PO; release on invoice |
| 17 | Fixed assets | Asset register, depreciation | Fixed assets sub-domain | Code only | Cap/dispose/dep; T6 CMMS equipment link |
| 18 | Period close | Close checklist, locks | Close sub-domain | F2.8 coded | Checklist UI; F1 guard all financial docs; UAT proof |
| 19 | Consolidation | Group, elimination, CTA | Consolidation sub-domain | Code only | Multi-entity close; intercompany |
| 20 | Manufacturing / MRP | BOM, production | — (U24) | Not built | New module |
| 21 | Project accounting | Project, phase, task | — (U25) | Not built | New module |
| 22 | Returns (RMA) | MRMA | — (U26) | Not built | New module |
| 23 | Field service / maintenance | Asset, request, work | physical-operations-cmms | On UAT — partial E2E | Sign-off/close (WI-OI-120bi); Phase 1 exit |
| 24 | Helpdesk / CRM | MRequest, pipeline | CMMS requests; parties | Partial | CS/SLA/pipeline — plan §7D extension |
| 25 | Workflow & approvals | AD_Workflow | workflow-studio | Partial | F1 approvals; Approval Queue on UAT |
| 26 | POS | POS terminal | — | Not built | Extension if needed |
| 27 | Commission | Sales rep commission | — | Not built | Extension |
| 28 | Reporting | Jasper, financial reports | analytics-studio | Partial | S8 dictionary reports; post-F2 finance reports |
| 29 | Integrations | Import/export, EDI, bank | universal-connector-hub, communications | Partial | Certified connectors; S14; no fake connector pages |

## Your deliverables (in order)

### Phase A — Evidence audit (no product code unless fixing doc errors)

1. **Reconciliation matrix** (29 rows): columns  
   `# | Area | GigaLibs folder | Repo evidence (files/APIs) | UAT in compose? | Metadata windows? | Table 2 dependency? | E2E on UAT? | Verdict: Exists / Enhance / Implement / Net-new | Gap summary (1 line) | Suggested plan phase (1–6 from execution plan v3) | Existing WI-OI if any`.

2. **Corrections** to `.pi/TABLE-1-IDEMPIERE-MAP.md` only where repo proof contradicts the doc (propose a minimal diff).

3. **End-to-end outcomes table** — for each *business outcome* (not module):  
   - Maintenance: request → assign → execute → **close/sign-off**  
   - P2P, O2C, Inventory receipt → subledger → GL, first CMMS customer go-live  
   State: **Met / Partial / Not met** with evidence (journey id, test path, or explicit gap).

4. **Duplication check** — list any Table 1 work that would duplicate Table 2 rows; mark **defer to Table 2 closure** vs **independent Table 1 work**.

### Phase B — Implementation backlog (plan only unless Approved card exists)

5. **Prioritized backlog** aligned to owner order:  
   - First: finish Table 2 UAT closure (owner deploy) — do not schedule competing ERP builds.  
   - Then: Phase 1 exit (CMMS row 23, platform rows 1–2, GU track if in scope).  
   - Then: Phase 5B/5C (rows 6–10) in dependency order (parties → catalogue pricing → inventory shipment/receipt → proc/orders metadata → AR/AP → payments).

6. For the **top 5 Enhance/Implement items** that are **not** Table 2, draft **one-page task cards** from `.pi/tasks/TEMPLATE.md` (Status: Proposed), with FR links, scope paths, Done when checks, and Stop-and-ask triggers.

7. **Out of scope for this prompt** unless owner approves: Manufacturing, Projects, RMA, POS, Commission, full CRM/helpdesk (rows 20–22, 24, 26–27).

## Search hints (use ripgrep, do not read whole monorepo)

- Module manifests: `modules/*/package.json` or module manifest patterns in repo  
- UAT compose profile / deployment profile audits  
- `MetadataWindow`, `module-sdk`, dictionary publish  
- `physical-operations-cmms`, `universal-inventory`, `financial-operations`, `universal-procurement`, `universal-orders`  
- Parties: `packages/contracts/src/parties`, `apps/workflow-platform/app/(app)/parties`  
- Journeys: `.pi/work/WI-OI-120.md`, task WI-OI-120bi, 120bh  

## Verification

- If you change product code: `pnpm verify` and report one line per step + log path.  
- If docs-only: `pnpm verify --audits`.

## Report format

At most **8 bullets** plus the two tables (reconciliation matrix can be abbreviated to rows that **changed** from TABLE-1-IDEMPIERE-MAP.md). End with **what the owner must decide** (priority among Table 1 rows after Table 2 UAT).
