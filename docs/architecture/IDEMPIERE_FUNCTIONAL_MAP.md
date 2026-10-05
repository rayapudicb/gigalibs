# iDempiere to GigaLibs functional map

- **Reference:** the iDempiere source at `/Users/rayapudi/idem` (commit `9a80664`, 500 model classes in
  `org.adempiere.base/src/org/compiere/model`, 20 accounting documents `Doc_*`) and the owner's spec
  `docs/iDempiere_to_Gigalibs_Enterprise_Architecture_Spec.docx`.
- **Status of GigaLibs:** checked against the code and the UAT instance on 2026-10-05 (see
  `docs/audits/2026-10-04-production-readiness/uat-module-status.md`).

> **Licence.** iDempiere is GPL v2 (`/Users/rayapudi/idem/LICENSE.md`). Use it as a functional reference only:
> business flows, document lifecycles, data concepts, accounting rules. Do not copy its code into GigaLibs without a
> legal decision (owner decision D8, with Legal).

## 1. What makes iDempiere deliver business outcomes, and what GigaLibs lacks

| iDempiere mechanism | What it does | GigaLibs today | Consequence | Fix |
| --- | --- | --- | --- | --- |
| **Document lifecycle** (`process/DocAction`, `DocumentEngine`): `prepareIt`, `completeIt`, `voidIt`, `closeIt`, `reverseCorrectIt`, `reverseAccrualIt`, `reActivateIt`, `approveIt`, `rejectIt` | Every business document follows the same states, period checks and approval, and its effects (stock, reservations, matching) happen when it completes | Each module has its own state machine; no shared engine; period lock checked only inside Finance | Effects are inconsistent; locks and approvals can be bypassed | **F1: shared document-lifecycle engine** used by every transactional document |
| **Accounting posting** (`org.idempiere.acct`: `Doc_Order`, `Doc_InOut`, `Doc_Invoice`, `Doc_Payment`, `Doc_AllocationHdr`, `Doc_MatchPO`, `Doc_MatchInv`, `Doc_Movement`, `Doc_Inventory`, `Doc_Production`, `Doc_BankStatement`, `Doc_GLJournal`, `Doc_Asset*`, `Doc_DepreciationEntry`, `Doc_ProjectIssue`, `Doc_Requisition`, `Doc_Cash`) with `MAcctSchema` | A completed document creates balanced accounting facts (`MFactAcct`) according to the accounting schema | No module event is relayed or consumed; `ingestSubledgerEvent` has no caller | Operations never reach the ledger; no business outcome is visible in Finance | **F2: event relay and posting engine** (WI-OI-113 completion, U22) |
| **Matching** (`MMatchPO`, `MMatchInv`) | Links order, receipt and invoice lines; drives invoice-price variance and receipt accruals | Procurement has a match service, but receipts are not relayed from Inventory and nothing posts | Three-way match cannot run on real receipts | U9 and U22 |
| **Storage and reservations** (`MStorageOnHand`, `MStorageReservation`, `MTransaction`) | On-hand, reserved and ordered quantities per locator and lot, updated by documents | Inventory has a ledger API, but the screen is hard-coded and the API rejects signed-in calls | No stock outcome is visible | U2, U8 |
| **Application Dictionary** (`AD_Table`, `AD_Column`, `AD_Window`, `AD_Tab`, `AD_Field`, `AD_Reference`, `AD_Val_Rule`) | Windows and fields defined as metadata | Implemented as WI-OI-110 (a governed subset); the renderer allows every field by default | Partly comparable | U3, U5 |

## 2. Functional areas

| iDempiere area (main classes) | GigaLibs module (WI) | Today on the UAT instance | Gap to production | Card |
| --- | --- | --- | --- | --- |
| Tenant, organization, roles (`MClient`, `MOrg`, `MOrgInfo`, `MRole`) | Control plane and Organization (013, 109) | Working | WI-OI-013 external identity; per-organization data access across modules | U4, WI-OI-013 |
| Business partners (`MBPartner`, `MBPartnerLocation`, `MUser`) | Core Parties (111) | Partly working | Edit, roles, use by Orders/Procurement (they keep free-text names today) | U6 |
| Products, UOM, pricing (`MProduct`, `MUOM`, `MUOMConversion`, `MPriceList`, `MPriceListVersion`, `MProductPrice`, `MProductCategory`) | Product Catalogue (112) | Not working (no entitlement granted; create fails at the proxy) | Grant; forward `Idempotency-Key`; price lookups used by Orders/Procurement | U2, U7 |
| Warehouses, locators, stock, movements, physical inventory, lots (`MWarehouse`, `MLocator`, `MStorageOnHand`, `MStorageReservation`, `MMovement`, `MInventory`, `MTransaction`, `MAttributeSetInstance`) | Universal Inventory (091) | Not working (hard-coded screen) | Real screens and flows; one stock authority with CMMS parts | U2, U8 |
| Requisition to purchase (`MRequisition`, `MOrder` purchase side, `MInOut` receipt, `MInvoice` vendor side, `MMatchPO`, `MMatchInv`) | Universal Procurement (092) | Not working (hard-coded screen, `default-tenant`) | Real screens; approval rules; budget check; receipts from Inventory; AP posting | U2, U9, U22 |
| Quote to cash, sales side (`MOrder` with quotation/standard subtypes, `MInOut` shipment, `MInvoice` customer side, `MRMA`) | Universal Orders (093), Accounts Receivable (019/035/040) | Not working (Orders hard-coded; AR not deployed) | Real screens; ATP and reservations; one invoice authority (AR); returns | U2, U10, U11, U29 |
| Payments and allocation (`MPayment`, `MAllocationHdr`, `MCash`) | AR and Treasury (095) | Not working / not deployed | Payment entry and allocation; posting | U11, U13 |
| Banking (`MBankAccount`, `MBankStatement`) | Treasury (095) | Not working (hard-coded Finance screen) | Real screens; statement import; reconciliation; posting | U13 |
| General ledger (`MAcctSchema`, `MElementValue`, `MFactAcct`, `MPeriod`, `MJournal`, `Doc_GLJournal`) | Finance GL (094) | Not working (hard-coded screen; API rejects signed-in calls) | Real screens; F2 posting from every document; period control everywhere | U2, U12, U22 |
| Fixed assets (`MAsset`, `MDepreciationWorkfile`, `Doc_AssetAddition`, `Doc_AssetDisposed`, `Doc_DepreciationEntry`) | Fixed assets (114) | Not working | Real screens; link to CMMS assets; depreciation posting | U14 |
| Costing (`MCost`, `MCostDetail`, `MLandedCost`, `MLandedCostAllocation`) | Costing (116) | Not working (event writes fail) | Cost layers from receipts and issues; landed cost; COGS posting | U2, U16, U22 |
| Budgets (`GL_Budget`, budget control) | Budgeting (117) | Not working | Budget check on requisitions and orders; commitments | U17, U9 |
| Period close | Close and forecast (118) | Not working | Period locks enforced by F1 for every document | U18, F1 |
| Multi-company consolidation | Consolidation (115) | Not working | Translation, eliminations, minority interest | U15 |
| Tax (`MTax`, `MTaxCategory`) | Tax Configuration | Not deployed | Deploy; tax on order and invoice lines | U29 |
| Currency (`MCurrency`, `MConversionRate`) | Multi-Currency | Not deployed; fabricated CTA figure | Deploy; real rates; remove the fabricated figure | U29, U3 |
| Requests and service (`MRequest`) | CMMS maintenance requests | Not working (CMMS down) | CMMS correction; requests flow | U1, U19 |
| Manufacturing (`MProduction`, `MProductionLine`, `MProductBOM`, `Doc_Production`) | — | Not built | Bills of materials, production orders, posting | U24 |
| Projects (`MProject`, `MProjectPhase`, `MProjectTask`, `Doc_ProjectIssue`) | — | Not built | Projects, tasks, issues to projects, posting | U25 |
| Returns (`MRMA`, `MRMALine`) | — | Not built (Orders has credit memos only) | Return authorizations linked to shipments and credits | U26 |
| Workflow (`AD_Workflow`, `MWFProcess`) | Workflow Studio | Partly working | Document approvals through F1 | U21, F1 |

## 3. Recommended build order to production readiness

1. **U2.** Make the ERP APIs accept signed-in calls (revocation schema, event writes, journal transactions, proxy headers).
2. **F1 and F2.** Shared document lifecycle and event-to-ledger posting. Without them no flow produces a business
   outcome.
3. **Master data** in iDempiere order: Organization (U4), Parties (U6), Products and prices (U7).
4. **Transactions:**
   - Inventory (U8);
   - procure-to-pay (U9, AP);
   - quote-to-cash (U10, U11 AR);
   - payments and banking (U13).
5. **Accounting outcomes:** GL (U12), costing (U16), budgets (U17), assets (U14), close (U18), consolidation (U15).
6. **New capabilities:** manufacturing (U24), projects (U25), returns (U26), mobile (U27).
7. Each card ends with a Playwright business flow through the browser that creates its data, so every outcome is
   visible to users. Then the production gates in `uat-module-status.md` §3 before the move to the cloud.
