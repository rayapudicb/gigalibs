# UAT readiness plan (deliverable L)

Source: the WI-OI-119 audit (`README.md` in this folder). Programme: **WI-OI-120**. Each card is a bounded slice,
shown to the owner and started only after approval; one implementation card at a time. Finding IDs (P0-xx, P1-xx)
refer to `README.md` §3–4.

## Owner decisions, 2026-10-05

| Decision | Owner's answer | Effect on the plan |
| --- | --- | --- |
| Hide or contain unfinished modules | **No.** Nothing is removed or hidden; every module is visible and fixed for UAT | The earlier containment card (R1) is withdrawn; U1 is first |
| Sample numbers in screens | Replace them with data that Playwright business-flow tests enter through the application, and leave that data in place for testers | Each module card wires its screens to real APIs and ships a Playwright flow that creates the module's UAT data |
| AR (WI-OI-019, frozen 2026-09-28) | In UAT scope, with data entered by Playwright business flows | AR is unfrozen for UAT work; recorded on its card |
| Uncommitted control-migration runner and two migrations | Commit | Committed on 2026-10-05 after review and a passing policy test |
| UAT environment | The existing local instance (web on 5180, `gigalibs-postgres`) is the UAT instance; no other environment | Every deploy, migration or data change on it still needs the owner's explicit go at the time, and is recorded |
| Spec items never built (manufacturing BOM/production, projects, returns/RMA, mobile WI-OI-084) | Wanted, with data entered by Playwright business flows | Stage 4: they must be designed and built before any data can be entered |

## Rules for every card

- **Visible, honest, never fake.** Every module stays visible on the UAT instance. A screen that is not connected yet
  carries a visible "Not connected yet" or "Sample figures, not real data" label until its card connects it.
- **Real data only through the application.** Playwright flows sign in as a real role (buyer, approver,
  warehouse, sales, accountant and so on) and create records through the screens and APIs. They never write SQL.
  The records stay in the UAT instance for manual testers.
- **Attributable UAT data.** Flows use clearly named UAT tenants (for example "UAT Manufacturing Ltd") and tag
  every record with the flow and run, so UAT data is never mistaken for customer value. Flows can be re-run
  without creating duplicates.
- **Every visible button works or says why it does not.** Loading, empty, error, permission-denied and conflict
  states are shown.
- Proof scripts never write to the UAT database unless a card says so and the owner has agreed.

## Stage 1: buildable, running and visible

| Card | Title | Findings | Owner role | Needs |
| --- | --- | --- | --- | --- |
| **U1** (WI-OI-120a) | Reproducible build, a working UAT instance and every module visible | P0-12, P1-01, P1-13, P1-14, P1-15, P1-16 | Developer Platform / Release Operations | Owner's go for the backup, migrations and deploy |
| **U1b** (WI-OI-120b) | Design standard: a check for hard-coded colours; Catalogue, Parties, Application Dictionary and the form renderer restyled with Medusa UI and `ui-*` tokens; Tailwind scans module packages | Owner finding 2026-10-05 (see WI-OI-119 evidence) | Web Experience | Approved 2026-10-05 |
| U2 (120c) | ERP modules answer requests correctly | P0-09, P1-02, P1-03, P1-09, P1-18, P1-23 | Backend Domain | Forward migrations; owner's go to apply |
| U3 (120d) | Security fixes that would spoil UAT results | P0-04 to P0-08, P1-10, P1-11, P1-20, P1-24, P1-25 | Security & Privacy with Backend Domain | Independent Security reviewer (named human) |

## Stage 1b: every module's backend running on this instance

| Card | Title | Findings | Owner role | Needs |
| --- | --- | --- | --- | --- |
| U29 | The 13 modules with no running backend (AR, Spend, Tax, Multi-Currency, Data Studio, Rules, Workflow Studio, Recovery, E-Signature, Document Scanner, Ontology, Saga, master data) run as services in this instance's compose stack, with signed platform context; nothing listens on their host ports today | `uat-module-status.md` | Release Operations with Backend Domain | U3 first for the modules with caller-chosen tenants; owner decision on Spend vs Procurement and on the prototypes |

## Stage 2: every screen on real data, each with a Playwright business flow

One card per module, in dependency order. Each card:

1. connects the screens to the BFF and module APIs and replaces the sample figures, restyled to the design standard
   (Medusa UI and `ui-*` tokens);
2. wires or explains every button;
3. adds API tests through HTTP;
4. adds a Playwright flow that enters the module's UAT data through the screens;
5. adds a short manual test script for testers.

| Card | Module | What the Playwright flow enters (and testers then use) |
| --- | --- | --- |
| U4 | Organization (109) | Legal, operational and reporting units; scope grants; place links |
| U5 | Application Dictionary and configuration (110, 039) | Custom fields and layouts: draft, preview, approve, publish, roll back |
| U6 | Core Parties (111) | Customers, suppliers, contacts, addresses, roles, a duplicate merge |
| U7 | Product Catalogue (112) | Products, services, units and conversions, categories, price lists |
| U8 | Inventory (091) | Warehouses, locations, receipts, put-away, transfers, reservations, issues, counts, barcodes |
| U9 | Procurement (092) | Requisition, approval, purchase order, receipt, three-way match, bill, debit memo |
| U10 | Orders (093) | Quote, order, allocation, fulfilment, dispatch, return |
| U11 | AR invoicing (019/035/040) | Invoices, delivery, payments, allocations, credit notes, aging |
| U12 | Finance GL (094) | Books, chart of accounts, periods, journals, reversals, statements |
| U13 | Treasury (095) | Bank accounts, statement import, matching, reconciliation |
| U14 | Fixed assets (114) | Capitalisation, depreciation runs, transfer, impairment, disposal |
| U15 | Consolidation (115) | Group, entities, FX rates, intercompany, eliminations |
| U16 | Costing (116) | Cost layers, landed cost, COGS, PPV |
| U17 | Budgeting (117) | Budget, revision, approval, commitments, variance |
| U18 | Close and forecast (118) | Checklist, subledger locks, accruals, deferrals, year-end, forecast |
| U19 | CMMS and its enhancements (038, WI-EAM-001–005) | Assets, work orders, PM, meters, parts; all 37 unrouted calls working |
| U20 | Workforce/GigaOps and its enhancements (WI-WFO-001–006) | Workers, engagements, staffing, time and attendance, expenses |
| U21 | Communications, Connectors, Rule Studio | Messages through a real or clearly labelled test provider; saved credentials; tenant-stored rules |

## Stage 3: modules working together (journey flows)

| Card | Title | Findings |
| --- | --- | --- |
| U22 | Event relays and consumers for every declared event; one invoice owner (AR); budget check and commitments in Procurement; period locks on every posting path; costing from receipts and issues; CMMS–Finance asset link; one inventory owner | P1-04 to P1-08 |
| U23 | Playwright journey flows: tenant to first value, master data to operation, procure-to-pay, order-to-cash, inventory-to-margin, asset lifecycle, budget-to-close, group close | J matrix |

## Stage 4: spec capabilities never built

Each needs a design (ADR), then a build, then a Playwright flow. No data can be entered before the feature exists.

| Card | Capability (iDempiere spec) |
| --- | --- |
| U24 | Manufacturing: bill of materials, production orders and production lines |
| U25 | Projects: phases, tasks, lines, issues |
| U26 | Returns (RMA) |
| U27 | Mobile/offline shell (WI-OI-084) |

## Stage 5: UAT

| Card | Title |
| --- | --- |
| U28 | Tester accounts per role, manual test scripts, a defect list the team fixes from, a module status board ("Ready for UAT", "Partly ready", "Not yet"), entry/exit criteria, re-test after fixes |

Production go-live is separate: it still needs named human reviewers, recovery evidence (P0-13), release
authorization (G6) and production observation (G7).
