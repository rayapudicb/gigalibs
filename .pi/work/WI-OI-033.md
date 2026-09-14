# WI-OI-033: Out-of-the-Box (OOTB) Day-1 Client Experience & Inbound Document Action Workbench

**Owner**: Solution Architect & Full-Stack Engineer  
**Status**: Review  
**Gate**: G4 (Execution & Verification)  
**Requirements**: FR-01, FR-02, FR-04, FR-06, FR-09, FR-10, FR-12, FR-14, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-REL-001–003  

---

## 1. Context & Business Problem
Clients do not buy empty integration developer toolkits; they buy immediate financial and operational relief. When an enterprise signs up for GigaLibs, they must not be asked to write code or configure custom pipelines. On Day 1, GigaLibs delivers an automated Procure-to-Pay & Freight Defense experience that intercepts billing variances, dock shortages, price creep, and unapproved freight fees before cash leaves their bank.

---

## 2. Deliverables Produced

### 2.1 Pre-Configured Operational Guardrails & Rules
File: `apps/workflow-platform/lib/ootb-client-workbench-store.ts`
- `RULE-DUP-24M`: 24-Month cryptographic invoice deduplication.
- `RULE-PRICE-CREEP`: Zero-tolerance line-item unit price creep guard against contracted PO rates.
- `RULE-DOCK-SHORTAGE`: Dock receiving shortage guard comparing billed units against physical warehouse goods receipts.
- `RULE-FREIGHT-CAP`: 5% merchandise value ceiling on freight and ancillary handling surcharges.
- `RULE-TAX-NEXUS`: Automated state and municipal sales tax nexus rate validation.
- All rules toggleable via zero-code switches and configurable threshold sliders.

### 2.2 Live 3-Way Match & Discrepancy Engine
- Ingests incoming vendor bills (PDF, scans, EDIFACT/X12).
- Extracts line-item SKUs, descriptions, billed quantities, unit prices, and freight surcharges.
- Evaluates line items against ERP Purchase Orders and Warehouse Goods Receipts in real time.
- Categorizes discrepancies: `PRICE_CREEP`, `SHORT_DELIVERY`, `UNAUTHORIZED_SURCHARGE`, `CLEAN_MATCH`.

### 2.3 Autonomous ERP Post-Action Execution & Dispute Memos
- Automatically executes payment blocks in connected ERPs (`NetSuite`, `SAP S/4HANA`, `QuickBooks Online`).
- Formats formal Dispute & Withholding Notices citing specific line numbers, PO contract numbers, and variance values.
- Emits real-time Kafka audit log entries stamped with FIPS SHA-256 integrity receipts.

### 2.4 1-Click AP Manager Override
- Endpoint: `/api/ootb/override`
- Allows authorized controllers and managers to override holds with mandatory audit justifications.
- Records manager identity, timestamp, and generates a new immutable cryptographic seal.

### 2.5 CFO Proof-of-Value Ledger
- Quantifies Cumulative Cash Defended ($38,500+), Invoices Scanned, Discrepancies Intercepted, AP Forensic Hours Saved, and Measurable ROI Multiple (e.g. 14.2x).

### 2.6 User Interface
Route: `/solutions/day-one`
- Tab 1: Inbound Document & 3-Way Match Workbench (interactive comparator and ERP action panel).
- Tab 2: Zero-Code Guardrails & Rules (toggle switches and threshold sliders).
- Tab 3: CFO Forensic Audit & Savings Ledger (chronological transaction history with SHA-256 receipts).
- Direct breadcrumb link added from `/solutions` hub.

---

## 3. Verification & Evidence
- **Automated Vitest Tests**: 7/7 unit tests pass in `apps/workflow-platform/__tests__/ootb-client-workbench.test.ts`.
- **Full Suite**: 89/89 tests pass across 19 test files repo-wide.
- **Static Page Generation**: 72 pages compiled cleanly in Next.js 15.5.24 (`/solutions/day-one` size: 10.4 kB).
- **Live HTTP Verification**:
  - `GET /api/ootb/rules` -> HTTP 200 (5 rules returned).
  - `GET /api/ootb/evaluations` -> HTTP 200 (live evaluations & CFO metrics returned).
  - `POST /api/ootb/override` -> HTTP 200 (hold overridden with audit seal).
  - `GET /solutions/day-one` -> HTTP 200 OK (rendered 63,038 bytes HTML).
- **Mandatory Audits**:
  - `audit:production-data`: PASSED (0 hardcoded defaults).
  - `audit:all-runtime-data`: PASSED.
  - `audit:package-dependencies`: PASSED.
  - `audit:api-boundary`: PASSED.
  - `audit:navigation`: PASSED (53 page routes, 132 static links).
  - `audit:sdlc`: PASSED (19 agents, 33 work items, 16 FRs).
