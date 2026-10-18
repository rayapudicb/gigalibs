# Table 1 — iDempiere business areas vs GigaLibs

**Purpose:** Business-module parity map (iDempiere reference → GigaLibs folder → status).  
**Not duplicated here:** architectural engines F0–F2 — see [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md) and [TABLE-2-UAT-CLOSURE.md](TABLE-2-UAT-CLOSURE.md).

**Canonical module inventory:** [gigalibs-execution-plan-v3.md](../docs/plans/gigalibs-execution-plan-v3.md) §7.

**Status legend**

- **UAT** — service in UAT compose profile (plan v3 §7B).
- **Meta** — metadata windows shipped for that module.
- **E2E** — evidenced business journey on UAT (not “API exists”).

**UAT tips (2026-10-19):** running release **`1d8d2634`** (CMMS mig **22**); Table 2 code tip **`0a0e787`**+ on `feat/gigaops-convergence-core`. Full audit: [work/TABLE-1-AUDIT-2026-10-19.md](work/TABLE-1-AUDIT-2026-10-19.md).

| # | iDempiere area | Main iDempiere pieces (reference) | GigaLibs module / folder | What exists in GigaLibs | E2E on UAT today | What still needs (enhance vs net-new) |
|---|----------------|-----------------------------------|--------------------------|-------------------------|------------------|----------------------------------------|
| 1 | Platform & tenant | Client, org, role, user | Control plane, auth, tenancy, settings org | Partial / UAT — sign-in, workspaces, roles, trials (T8a in progress) | Tenant lifecycle incomplete | **Enhance:** org tree publish, R5 scope on all modules, enterprise admin (Phase 1–3); org submit (WI-OI-120ax) |
| 2 | Application dictionary & UI | AD_Window, fields, menus | AD packages, `@gigalibs/module-sdk`, workflow UI | Partial / UAT — compiler, dispatcher, renderer; CMMS/Catalogue/Inventory/Finance GL windows in git | CMMS partial; Inventory/Finance Table 2 not on current UAT tip | **Enhance:** F0 on every ERP screen; no hard-coded workspaces; Table 2 F0.5 UAT |
| 3 | Master data — partners | C_BPartner, locations, contacts | Contracts + `/parties` (kernel / workflow-platform) | Partial — party model + UI; not universal on transactional docs | No P2P/O2C journey | **Enhance:** mandatory party on PO/SO/invoice; merge, vendor/customer roles (T4 / 5B) |
| 4 | Master data — products & pricing | M_Product, UOM, price lists | `product-catalogue` | UAT + Meta (8) — template module | Isolated use, not full commercial flow | **Enhance:** entitlements all envs; price resolution into Orders/Procurement |
| 5 | Warehouse & inventory (WMS) | Warehouse, locator, stock, movement, count, lot | `universal-inventory` | UAT + Meta (6); WH/locator/lot/receipt APIs; Table 2 code complete at `0a0e787` | No receipt→posting journey on UAT tip | **Enhance:** Table 2 UAT closure; U2 signed-in proofs; CMMS parts = one stock authority |
| 6 | Procure-to-pay (P2P) | Requisition, PO, receipt, vendor invoice, match | `universal-procurement`, `spend-management` (not on UAT) | UAT: procurement service, hard-coded UI, 3-way match APIs; spend off stack | No P2P | **Enhance:** receipts from Inventory; metadata UI; budget/approval; F2 AP posting; relay Finance. **Implement:** deploy spend when AP track starts |
| 7 | Order-to-cash (O2C) | Quote, sales order, shipment, customer invoice | `universal-orders`, `accounts-receivable` | UAT: orders hard-coded UI; AR not on UAT | No O2C | **Implement/enhance:** U29 AR compose; ATP/reservations; shipment from Inventory; single invoice owner; metadata UI; journeys |
| 8 | AR / billing | Customer invoice, credit, dunning | `accounts-receivable` | Code only — not in UAT profile | None | **Implement:** module SDK + compose; metadata windows; payments/allocation; event billing if in scope |
| 9 | AP / vendor payables | Vendor invoice, payments | Procurement + spend → Finance | Partial — match APIs; thin bill lifecycle | None | **Enhance:** vendor bill on metadata; tie 3-way match; F2 posting |
| 10 | Payments & cash application | MPayment, allocation | AR + treasury sub-domain in `financial-operations` | Code only (treasury inside finance module) | None | **Enhance:** customer/vendor payments, allocation, cash docs, F2 posting after AR/AP exist |
| 11 | Treasury & bank rec | Bank account, statement, reconciliation | Treasury sub-domain (`financial-operations`) | Finance on UAT; bank-rec product not complete | None | **Implement:** real statement ingest (CAMT/MT940/OFX); rec UI on metadata; no fabricated balances |
| 12 | General ledger (GL) | Chart of accounts, journal, Fact_Acct, periods | `financial-operations` | UAT + Meta (5 GL); inbox/relay/posting coded (Table 2) | No Inventory→GL on UAT tip | **Enhance:** F2 consume all module events; F1 period lock on all financial docs; F2.9 accountant sign-off |
| 13 | Tax | Tax category, line tax | `tax-configuration` | Not deployed | None | **Implement:** module SDK + compose; tax on order/invoice lines |
| 14 | Multi-currency | Currency, conversion rate | `multi-currency` | Code only / not on UAT | None | **Implement:** real rates; remove fake figures; wire GL/O2C/P2P |
| 15 | Costing & COGS | Cost layers, landed cost, COGS | Costing sub-domain (`financial-operations`) | Code only | None | **Enhance:** receipt/issue drives cost; F2 COGS/PPV; metadata UI |
| 16 | Budget & commitment | Budget, encumbrance | Budgeting sub-domain | Code only | None | **Implement:** hard/warn on req/PO; commitment release on invoice |
| 17 | Fixed assets (financial) | Asset register, depreciation | Fixed assets sub-domain | Code only | None | **Implement:** cap/dispose/depreciation; T6 link CMMS equipment; posting |
| 18 | Period close & forecast | Close checklist, locks | Close sub-domain | Code only; F2.8 guard coded | Not proven on UAT | **Enhance:** close checklist UI; F1 period guard on all financial docs; Table 2 F2.8 UAT |
| 19 | Consolidation | Group, elimination, CTA | Consolidation sub-domain | Code only | None | **Implement:** multi-entity close; intercompany; consolidated statements |
| 20 | Manufacturing / MRP | BOM, production order | — | Not built (U24 in plan) | None | **Net-new:** BOM, production, issue/receipt, Doc_Production outcomes |
| 21 | Project accounting | Project, phase, task, issue | — | Not built (U25) | None | **Net-new** module |
| 22 | Returns (RMA) | MRMA, return receipt | — | Not built (U26; credit notes in AR code only) | None | **Net-new** U26 |
| 23 | Field service / maintenance | Asset, request, work | `physical-operations-cmms` | UAT + Meta (8) — WO, assets, **sign-off mig 22** on UAT | Partial — journey must prove sign-off + North≠South (`f56ae886` journey fix) | **Enhance:** Phase 1 exit (0-blocker journey); not full iDempiere MRequest/CS desk |
| 24 | Helpdesk / CRM pipeline | MRequest, lead/opportunity | CMMS requests; parties fragmented | Partial | None as CRM | **Net-new** product extension (plan §7D) unless customer-scoped |
| 25 | Workflow & approvals | AD_Workflow | `workflow-studio` (no own service on UAT) | Partial — definitions exist; not fully deployed | None | **Enhance:** hook approvals into F1; Approval Queue on UAT (Phase 4) |
| 26 | POS (retail) | POS terminal, cash drawer | — | Not built | None | **Net-new** if retail parity wanted |
| 27 | Commission | Sales rep commission | — | Not built | None | **Net-new** |
| 28 | Reporting | Jasper, financial reports | `analytics-studio` | Partial / UAT | No finance-grade close reports | **Enhance:** S8 dictionary reports; finance reports after F2 evidenced |
| 29 | Integrations | Import/export, EDI, bank | `universal-connector-hub`, communications | Partial / UAT (connector); comms not on UAT | No certified E2E | **Enhance:** certified connectors; S14 import/export; N1 email (deferred per owner) |

## Summary counts (business breadth)

| Metric | Count | Notes |
|--------|------:|-------|
| iDempiere-style rows | 29 | ERP + ops + gaps |
| Rows with meaningful GigaLibs code (module or kernel) | ~22 | Includes platform, CMMS, UAT ERP modules, analytics, connector |
| Services “Runs on UAT” (plan §7B) | ~12 | CMMS, GigaOps, Geo, Inventory, Catalogue, Proc, Orders, Finance, Analytics, Connector (+ platform app) |
| ERP modules with metadata windows | 5 | CMMS, Catalogue, Inventory, Finance GL; Proc/Orders hard-coded |
| E2E business outcome on current UAT | 1 partial | CMMS technician path only |
| Net-new ERP extensions (plan card, not product) | 6+ | Mfg, projects, RMA, POS, commission, full CRM/helpdesk |

## End-to-end business outcomes

| Outcome | Status |
|---------|--------|
| Maintenance: request → assign → execute → close/sign-off | **Partial** (sign-off on UAT mig 22; journey evidence pending — WI-OI-120gd) |
| Procure-to-pay | **Not E2E** |
| Order-to-cash | **Not E2E** (AR off UAT) |
| Inventory receipt → subledger → GL | **Built in git; not E2E on UAT** until Table 2 closure deploy |
| First CMMS customer go-live (plan v3 Phase 1 exit) | **Not met** |

## Table 2 cross-reference (no engine duplicate)

Table 2 unlocks rows **5, 6 (receipt leg), 9, 12, 15, 18**. Engine checklist: [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md).

*Last updated: 2026-10-19 (Table 1 audit pass).*
