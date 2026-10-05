# Module action outcomes: production specification

The precise, server-side outcome every user action must produce, for every module. Each module card (WI-OI-120,
cards U4–U29) implements its section exactly. A card is not done until every listed action works through its
metadata-driven window (ADR-0033 D1) and a Playwright business flow proves the outcome in the browser.

> **Accounting review.** The posting rules below are default rules of the tenant's accounting schema, modelled on
> standard accrual accounting and iDempiere's `Doc_*` documents (reference only, GPL v2). A qualified accountant must
> review them before production (WI-OI-119 P1-28). Tenants can map every account; the structure of each entry is fixed.

## 0. Rules for every action in every module

| Rule | Production requirement |
| --- | --- |
| Identity and scope | Tenant, user, roles and organization scope come from the signed platform context, never from the request body, query or headers. Records outside scope return a non-disclosing 404. |
| Permission | Each action has one named permission, checked on the server. Field-level read, write and mask rules are also enforced on the server. |
| Validation | Shared versioned contracts (zod) on input; module invariants in the domain service; database constraints back them up. |
| Concurrency | Updates require `If-Match` (record version). A mismatch returns 412 and the window reloads. |
| Idempotency | Every create and every document action requires `Idempotency-Key`. A replay returns the first result and changes nothing. |
| Transaction | The state change, its effects (stock, balances, matching) and its outbox event commit together or not at all. |
| Lifecycle | Transactional documents use the shared lifecycle (ADR-0033 D2). `prepare` checks the open period, approval rules, budget and credit. Completed documents are immutable; corrections are reversals. |
| Posting | Completing, voiding or reversing a financially relevant document emits an event. Finance posts a balanced journal from it exactly once (ADR-0033 D3). |
| Audit | Actor, tenant, organization, action, document, before and after (or a fact reference), result, correlation id and time, appended to the module's audit chain. |
| Telemetry | A structured log line per action and metrics for count, latency and failure, with no secrets or personal data in logs. |
| Money and quantity | Integer minor units (with the currency exponent) and scaled integers for quantities. Rounding rules are explicit; no floating point. |
| Failure states | The window shows loading, empty, validation, denied, conflict, stale, dependency failure and retry. Nothing reports success without the server's confirmation. |
| Data for UAT | A Playwright business flow creates the module's data through the window, as a named role, in a clearly named UAT tenant. |

Abbreviations: **GRNI** = goods received not invoiced; **AP**/**AR** = accounts payable/receivable; **COGS** = cost of
goods sold; **PPV** = purchase price variance; **IPV** = invoice price variance.

## 1. Platform and configuration

| Module | Action | Outcome on the server | Event |
| --- | --- | --- | --- |
| Tenant and access | Register or join, invite, accept, assign role, suspend or reactivate a member, remove a member (last-owner protected) | Membership and role rows change; sessions of a suspended or removed member are revoked within one request | `platform.membership.*.v1` |
| Tenant and access | Enable or disable a module entitlement (platform administrator) | Entitlement row changes; the next request's signed context reflects it; a disabled module's API refuses | `platform.entitlement.changed.v1` |
| Personal security | Change password, enroll or reset MFA, sign out of other sessions | Credentials or session rows change; failed logins are throttled and locked (P1-20) | `platform.authorization.revoked.v1` |
| Organization (109) | Create unit types and units, draft a tree version, approve (second person), publish, activate, grant and revoke scope | A new immutable tree version; activation is atomic; module replicas update from the event | `platform.organization.version.v1` |
| Application Dictionary (110) | Draft window, field or rule changes, preview, submit, approve, reject, publish, activate, roll back | New immutable published version; activation is atomic per tenant; the previous version can be restored | `configuration.published.v1`, `configuration.activated.v1` |

## 2. Master data (no posting)

| Module | Action | Outcome on the server |
| --- | --- | --- |
| Core Parties (111) | Create, edit or archive a party; add roles (customer, supplier, employee); add contacts and addresses; merge duplicates (second-person approval) | One party record per real organization or person. Roles enable it in Orders, AR, Procurement and AP. A merge re-points references and keeps an audit trail. |
| Product Catalogue (112) | Create, edit or retire a product, service or resource; define units and conversions; define categories and attributes; create a price list and version; set prices; resolve a price | Products are used by Inventory, Procurement and Orders by reference, never by free text. Conversions are dimension-safe. Price resolution returns exactly one price for a date, currency and price list, or a clear error. |

## 3. Inventory (091), iDempiere `MInOut`, `MMovement`, `MInventory`, `MStorage*`

| Document or action | Lifecycle outcome on complete | Stock effect | Default posting (Dr / Cr) |
| --- | --- | --- | --- |
| Warehouse, zone and locator setup | Records created | — | — |
| **Receipt** (from a purchase order or unplanned) | Lines matched to purchase order lines (`MatchPO`); lots and serials recorded | On hand + at locator; ordered − | Dr Inventory asset / Cr GRNI, at purchase order cost (standard costing: PPV to variance) |
| Receipt inspection | Accept or reject quantities | Rejected quantity to quarantine locator | — |
| **Movement** (locator or warehouse transfer) | Both legs in one transaction | On hand moves between locators | Across organizations: Dr Inventory (to) / Cr Inventory (from) |
| **Reservation** (for an order or work order) | Reserved quantity per line | Reserved +; available − | — |
| Release a reservation | — | Reserved − | — |
| **Shipment or issue** (to an order, work order or internal use) | Consumes reservation; picks lots (FIFO, FEFO or chosen) | On hand −; reserved − | Shipment: Dr COGS / Cr Inventory. Work order: Dr Maintenance expense / Cr Inventory. Internal use: Dr chosen expense / Cr Inventory. |
| **Physical count** | Counted versus book; recount if over tolerance; approve | On hand adjusted | Dr or Cr Inventory / Cr or Dr Inventory adjustment (shrinkage) |
| Kit or stage for a CMMS work order | Reservation then issue | As reservation and issue | As issue |
| Barcode scan | Resolves to item, lot and locator through the API | — | — |
| Void or reverse | Counter-document referencing the original | Effects reversed | Reverse entry |

Invariants:

- Double-entry stock ledger: each movement has equal and opposite legs; on-hand equals the sum of the ledger.
- No negative stock unless the warehouse allows it.
- One stock authority: CMMS parts use Inventory (P1-08).

## 4. Procurement and payables (092), iDempiere `MRequisition`, `MOrder` (purchase), `MInvoice` (vendor), `MMatchInv`

| Document or action | Lifecycle outcome | Default posting (Dr / Cr) |
| --- | --- | --- |
| **Requisition** prepare and complete | Approval by delegation of authority (DoA) and segregation of duties; budget check (hard stop or warning, audited) | With commitment accounting: Dr Commitment / Cr Reserve for encumbrance |
| **Purchase order** complete | Supplier must be an active Parties supplier; prices from the price list or entered with a reason; creates an idempotent budget commitment; ordered quantity + in Inventory | Commitment as above, adjusted on amendment and released on cancel |
| Supplier acknowledgement | Order marked confirmed with dates | — |
| Receipt | Done in Inventory (§3) against order lines | (see §3) |
| **Vendor invoice** complete | Three-way match (order, receipt, invoice) within tolerance, otherwise held; overrides need a second person; liquidates the commitment exactly once | Dr GRNI / Cr AP; difference Dr or Cr IPV; Dr Tax credit; release Cr Commitment / Dr Reserve |
| Debit memo | Reverses part or all of an invoice | Reverse of the invoice entry |
| **Payment** (vendor) | Payment instruction, or an explicitly recorded manual payment; allocated to invoices | Dr AP / Cr Bank in transit (or Bank) |

## 5. Orders and AR (093, 019/035/040), iDempiere `MOrder` (sales), `MInOut` (shipment), `MInvoice` (customer), `MPayment`, `MAllocationHdr`, `MRMA`

| Document or action | Lifecycle outcome | Default posting (Dr / Cr) |
| --- | --- | --- |
| **Quotation** | Prices from the catalogue; validity date; converted to an order with one action | — |
| **Sales order** complete | Customer must be an active Parties customer; credit limit check; availability (ATP) check; reservations in Inventory | — |
| Shipment | Done in Inventory (§3) against order lines | (see §3) |
| **Customer invoice** complete (AR is the only invoice authority; Orders requests it) | From shipped or ordered lines per invoice rule; tax from Tax Configuration; immutable delivered PDF snapshot | Dr AR / Cr Revenue / Cr Tax due |
| **Customer payment** and allocation | Payment recorded (or received from a provider, with webhook signature required, P0-07); allocated to invoices; discounts and write-offs need permission | Dr Bank in transit / Cr AR (discount: Dr Discount expense) |
| **Return authorization (RMA)** and credit memo | Return linked to the original shipment; receipt back to stock or scrap; credit memo | Dr Inventory / Cr COGS for restock; Dr Revenue, Dr Tax due / Cr AR for credit |
| Dunning and collections | Aging buckets from open items; reminders through Communications | — |

## 6. Treasury (095), iDempiere `MBankAccount`, `MBankStatement`

| Action | Outcome | Default posting (Dr / Cr) |
| --- | --- | --- |
| Bank account setup | Account under governance (second-person approval to change details) | — |
| Import statement (CAMT.053, MT940, OFX, CSV) | Duplicate statements refused; lines stored immutably | — |
| Match and reconcile | Lines matched to payments; unmatched items listed; fees and interest entered | Dr Bank / Cr Bank in transit; fees Dr Bank charges / Cr Bank |
| Seal reconciliation | Statement closed; balance agrees | — |

## 7. Finance GL (094), iDempiere `MAcctSchema`, `MElementValue`, `MFactAcct`, `MPeriod`, `MJournal`

| Action | Outcome |
| --- | --- |
| Accounting schema, chart of accounts, books | Accounts typed (asset, liability, equity, revenue, expense); default accounts set for every posting rule above |
| Fiscal year and periods | Periods open or closed per subledger (AP, AR, Inventory, Assets, Treasury, GL); every module's `prepare` checks them |
| Manual journal complete | Must balance per currency; posted immutably; reverse-correct creates a counter-journal |
| Posting from documents | Every event above produces its journal exactly once; mismatches appear in the daily reconciliation |
| Reports | Trial balance, balance sheet, income statement, drill-through from any figure to journal, document and line |

## 8. Fixed assets (114), costing (116), budgeting (117), close (118), consolidation (115)

| Module | Action | Default posting (Dr / Cr) |
| --- | --- | --- |
| Fixed assets | Capitalize (from an AP invoice or a CMMS asset, linked by validated ID) | Dr Fixed asset cost / Cr Asset clearing (or AP) |
| Fixed assets | Depreciation run (straight-line or declining balance, idempotent per period) | Dr Depreciation expense / Cr Accumulated depreciation |
| Fixed assets | Transfer, impairment | Between cost centers; impairment Dr Impairment loss / Cr Accumulated impairment |
| Fixed assets | Disposal | Dr Accumulated depreciation, Dr Cash or receivable, Dr or Cr Gain/loss / Cr Asset cost |
| Costing | Cost layer per receipt (FIFO, average or standard) | (in the receipt entry) |
| Costing | Landed cost allocation to receipts | Dr Inventory / Cr Landed cost clearing |
| Costing | Issue at layer cost | (in the shipment or issue entry) |
| Costing | Standard cost change | Dr or Cr Inventory / Cr or Dr Revaluation |
| Budgeting | Budget and revisions (maker-checker); distribution by period | — |
| Budgeting | Availability, commitment, liquidation, release | (see §4) |
| Budgeting | Variance report | Budget versus actual versus committed |
| Close | Checklist per period with dependencies; lock subledgers (soft or hard) | — |
| Close | Accrual with automatic reversal | Dr Expense / Cr Accrued liabilities, reversed next period |
| Close | Deferral | Dr Prepaid / Cr Expense, amortized |
| Close | Year-end close | Dr Revenue / Cr Expense, net to Retained earnings |
| Close | Forecast | Labelled forecast, with source, model, version and as-of date; never shown as actuals |
| Consolidation | Group structure, ownership, FX rates (with source); translation (IAS 21) | Translation difference to CTA |
| Consolidation | Intercompany matching and elimination (all counterparts present, or the run is held) | Dr IC payable / Cr IC receivable; revenue and expense eliminated |
| Consolidation | Non-controlling interest | NCI share of equity and profit |
| Consolidation | Consolidated statements | Drill-through to the entity |

## 9. Operations (Release 1 modules)

| Module | Action | Outcome | Default posting (Dr / Cr) |
| --- | --- | --- | --- |
| CMMS | Asset registry, hierarchy, classification and specs | Assets with location and Place; the link to a financial asset is validated | — |
| CMMS | Maintenance request → work order (approve, schedule, assign, start, complete, close) | Shared lifecycle; parts by reservation and issue from Inventory; labour from Workforce bookings and time | Parts as Inventory issue; labour Dr Maintenance labour / Cr Wages accrual |
| CMMS | Preventive maintenance plans and meter triggers | Work orders generated by schedule or meter threshold, exactly once per trigger | — |
| Workforce / GigaOps | Workers, positions, engagements, availability, staffing demand and bookings (no double booking) | Database guards against overlaps | — |
| Workforce / GigaOps | Time and attendance: punches (offline queue per user), timesheet approval by a second person | Timesheet complete | Dr Labour expense / Cr Wages payable (accrual) |
| Workforce / GigaOps | Pay run export to payroll | Immutable export with control totals | — |
| Geospatial | Places, zones, boundaries, import (CSV, GeoJSON, WKT), scope by place | Place hierarchy used by every module's scope | — |
| Analytics | Sources, datasets, questions, dashboards, reports, export (permission) | Figures computed from real facts with lineage; scoped by place and organization | — |
| Connector Hub | Connections (credentials stored encrypted through the API), pulls, schedules, inbound webhooks (signature required) | Records quarantined, then delivered to Analytics or Geospatial exactly once | — |

## 10. Supporting modules

| Module | Action | Outcome |
| --- | --- | --- |
| Tax Configuration | Tax categories, rates and rules by jurisdiction and date; calculate tax on a line | Deterministic tax lines used by Orders, AR and AP; tax posts in their entries |
| Multi-Currency | Currencies, rate types and dated rates (with source); revaluation of open items | Dr or Cr Unrealized FX gain/loss. The fabricated CTA figure is removed (P0-10). |
| Spend Management | Owner decision: merge into Procurement (one AP authority) or keep for expense claims only | Expenses: Dr Expense / Cr Employee payable |
| Communications | Templates, send email, SMS or WhatsApp through a configured provider; inbox; delivery status from the provider callback | Never "delivered" without the provider's receipt (P0-02) |
| Rule Studio | Rules stored per tenant in the database, versioned, simulated, activated; evaluated by modules through the API | No in-memory rules; tenant-checked (P0-04) |
| Workflow Studio | Workflow definitions, runs, approvals, compensation; document approvals through the shared lifecycle | Runs persisted; approvals audited |
| E-Signature | Envelope, signers, signing, sealed document with verification | Production identity provider tokens only (no development endpoint) |
| Document Scanner | Upload, OCR, extraction to a draft document (for example a vendor invoice) for human review | Never completes a document without review |
| Data Studio, Ontology, Saga, Recovery, master data | Owner decision per module: re-platform on the module SDK (U29), or retire | — |

## 11. How each card proves its section

1. API tests through HTTP with a signed context cover:
   - every action's success;
   - denial for a missing permission, another tenant and another organization;
   - validation, conflict (412) and replay (same `Idempotency-Key`);
   - the period-closed refusal.
2. Posting tests: each document's journal balances and is created exactly once, including after a consumer restart
   and a redelivered event.
3. A Playwright business flow in the metadata-driven window as the named role creates the data, completes the
   documents and shows the outcome on screen: stock, balances, journal drill-through.
4. Reconciliation shows zero mismatches after the flow.
