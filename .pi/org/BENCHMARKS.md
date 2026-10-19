# Benchmarks: the bar for each area

The product office keeps this file; each module lead turns its row into cited sections of the module's knowledge
pack.

**Read this first:**
- This is a starting list from general knowledge (2026-10).
- Before a claim shapes a design, the module lead verifies it against the product's published documentation or the
  standard itself, and cites it in the pack.
- We learn patterns and rules. We never copy code, text, screens or proprietary content.
- iDempiere is one reference among these, not the target.

## 1. What "better" means for GigaLibs

GigaLibs should beat the classic ERPs (iDempiere and its peers) on these points. Every module brief says how its
module meets each one.

| # | Goal | The bar |
| --- | --- | --- |
| 1 | **Configurable without code** | A business change is metadata, not a release: windows, fields, rules, workflows and roles. That is what iDempiere's Application Dictionary did for desktops, and what Salesforce, ServiceNow and Odoo Studio do for the web. |
| 2 | **Built for the person doing the work** | Task-first screens, keyboard and mobile, offline for field work. Mobile-first CMMS products (MaintainX, UpKeep, Limble) set the bar for technicians. |
| 3 | **Correct by construction** | Every calculation (tax, rounding, costing, depreciation, availability) has invariants proven by property tests. Every document follows a state machine with locks. |
| 4 | **Real-time and open** | Events through an outbox, relays and documented APIs; integrations without database coupling. |
| 5 | **Isolated and scoped** | Tenancy enforced by the database (RLS); access by role, unit and site; every change audited. |
| 6 | **Local by design** | Country packs for tax, e-invoicing, formats and languages, added as configuration. |
| 7 | **Industry-ready** | Solution blueprints per sector: modules, configuration, data and integrations, ready on day one. |
| 8 | **Assisted** | An Assistant that answers from the system's own data with citations, and confirms before it changes anything (the GU rules). |
| 9 | **Fast to adopt** | Set-up wizard, data import from the old system, guided onboarding. |
| 10 | **Proven** | Journeys on UAT, evidence on every card, a value ledger; nothing that pretends. |

## 2. Per area: who to learn from

| Area | Leading products to study (known strengths) | Standards and rules | Open references |
| --- | --- | --- | --- |
| **Maintenance and assets (EAM/CMMS)** | IBM Maximo (enterprise asset management, reliability); SAP PM/EAM (plant maintenance integrated with finance); IFS (asset-intensive industries); MaintainX, UpKeep, Limble, Fiix (mobile-first, fast adoption) | ISO 55000/55001 (asset management); ISO 14224 (reliability and maintenance data); EN 13306 (maintenance terms); SAE JA1011 (RCM); ISO 45001 (safety) | iDempiere requests and assets (`MRequest`, `MAsset`); openMAINT |
| **Field service and workforce** | ServiceNow Field Service, Salesforce Field Service, IFS FSM (dispatch, scheduling); UKG, Deputy (shifts and time) | Local working-time rules (per country) | — |
| **General ledger and close** | SAP S/4HANA (a single ledger for financial and management accounting); Oracle NetSuite (multi-subsidiary); Microsoft Dynamics 365 (dimensions); Sage Intacct (dimensional ledger, multi-entity); Xero, QuickBooks (simplicity for small businesses) | IFRS, US GAAP, Ind AS; SAF-T (tax audit files); XBRL (filing) | iDempiere accounting (`MFactAcct`, `MJournal`, `MPeriod`, `MAcctSchema`, `org.idempiere.acct/doc/*`); ERPNext |
| **Payables and spend** | Coupa, SAP Ariba (procurement and invoice processing); Basware (invoice automation); Tipalti (payment runs) | Three-way match practice; local payment formats | iDempiere `MMatchPO`, `MMatchInv` |
| **Receivables and billing** | HighRadius (cash application, collections); Chargebee, Zuora (subscription billing) | IFRS 15 / ASC 606 (revenue) | iDempiere allocation and dunning |
| **Treasury and bank** | Kyriba (treasury); Xero (bank feeds and reconciliation experience) | ISO 20022 (camt.053, pain.001), MT940, BAI2 | iDempiere bank statements |
| **Tax and e-invoicing** | Avalara, Vertex (tax engines and content); national portals (India IRP, Saudi ZATCA, Peppol) | Each country's law and e-invoicing mandate (the tax specialist's packs) | iDempiere `MTax`, `MTaxCategory` |
| **Costing and valuation** | SAP (material ledger), Dynamics 365 (costing methods) | IAS 2 (inventories), local GAAP | iDempiere `MCostDetail`, landed cost |
| **Fixed assets** | SAP Asset Accounting, Sage Intacct, NetSuite | IAS 16, local tax depreciation rules | iDempiere `MAsset`, `MDepreciation` |
| **Inventory and warehouse** | Manhattan, Blue Yonder, SAP EWM (warehouse execution); Odoo (simple, usable inventory) | GS1 (GTIN, SSCC, GS1-128 labels) | iDempiere storage and movements |
| **Procurement** | Coupa, SAP Ariba (sourcing, supplier portals) | Public procurement rules (for the public sector) | iDempiere requisitions and purchase orders |
| **Order-to-cash and commerce** | Salesforce (CPQ), Shopify (commerce), NetSuite (order management) | Consumer and distance-selling rules per country | iDempiere orders and shipments |
| **Manufacturing** | SAP PP, Siemens Opcenter (MES), Plex, Epicor | ISA-95 (levels and integration) | iDempiere production and BOM |
| **Projects** | Oracle Primavera (scheduling), Kantata (professional services), Microsoft Project | — | iDempiere projects |
| **Quality, health and safety** | Veeva, MasterControl (life-sciences quality); Intelex, Cority (HSE) | ISO 9001, GMP, 21 CFR Part 11, EU Annex 11; ISO 45001, ISO 14001 | — |
| **CRM and service desk** | Salesforce, HubSpot (CRM); Zendesk, ServiceNow ITSM (service) | ITIL 4 | iDempiere requests and campaigns |
| **Platform, metadata and workflow** | Salesforce Platform, ServiceNow (low-code), Odoo Studio | — | iDempiere Application Dictionary |
| **Analytics and reporting** | Power BI, Looker (semantic models) | — | — |
| **Integration** | MuleSoft, Boomi (integration platforms) | OpenAPI, AsyncAPI, HL7 FHIR (healthcare) | — |
| **Design, UX and ergonomics** | Published design systems: Google Material, Apple Human Interface Guidelines, IBM Carbon, Atlassian, Salesforce Lightning, SAP Fiori (enterprise task design); MaintainX and UpKeep (field usability) | ISO 9241-11, -110, -210; ISO 6385; ISO 11064; WCAG 2.2; EN 301 549 | `@medusajs/ui` (the library GigaLibs uses) |

## 3. By industry (for the industry leads)

| Sector | Systems customers already use (integrate or replace) | Rules that shape the product |
| --- | --- | --- |
| Manufacturing | ERP, MES, SCADA and historians | ISA-95, ISO 9001, ISO 55000, safety |
| Facilities and real estate | IWMS/CAFM (Planon, Archibus), building management systems | ISO 41001 (facility management), statutory inspections |
| Pharma and life sciences | Veeva, LIMS, MES | GMP, 21 CFR Part 11, EU Annex 11, calibration and validation |
| Healthcare | EHR (Epic, Oracle Health), biomedical equipment systems | HL7 FHIR, HIPAA (US), medical device and equipment maintenance rules |
| Agriculture and food | Farm management, ERP | Traceability (GS1; FSMA 204 in the US), food safety |
| Retail and QSR | POS (Shopify, Lightspeed), e-commerce | Payment security (PCI DSS), consumer rules |
| Hospitality | Hotel PMS (Oracle OPERA, Mews) | Guest data privacy, safety inspections |
| Sports, leisure and events | Venue, membership and ticketing systems | Crowd safety, event permits |
| IT and professional services | PSA, ITSM | ITIL 4, SLAs |
| Construction | Primavera, Procore | Site safety, subcontractor compliance |
| Transport and logistics | TMS, WMS, rail and fleet systems | Driver hours, dangerous goods |
| Utilities and energy | GIS, SCADA, work management | Regulator asset and safety rules |
| Public sector and education | Finance, procurement and estates systems | Public procurement rules, accessibility |
