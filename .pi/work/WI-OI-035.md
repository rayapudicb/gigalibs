# WI-OI-035: Production-Grade Invoicing & AR Subsystem: Multi-Tier Tax Engine, Ledger Cryptographic Hash-Chained Integrity Seals, Installment Billing, and Triple-Broker Concurrency

**Owner**: Solution Architect & Financial Systems Engineer  
**Status**: Blocked (frozen by the owner 2026-09-28; matches the registry). Corrected by the WI-OI-119 audit (2026-10-05).  
**Gate**: G4 (Execution & Verification)  
**Requirements**: FR-02, FR-04, FR-06, FR-12, FR-14, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-REL-001–003  

---

## 1. Context & Architecture Overview

Enterprise accounts receivable requires mathematical immutability, multi-jurisdiction tax precision, and audit compliance that standard monoliths (such as Invoice Ninja's PHP/Laravel architecture) cannot provide under strict regulatory frameworks (Sarbanes-Oxley, French NF525, German GoBD).

`WI-OI-035` elevates GigaLibs' Accounts Receivable & Invoicing subsystem into a production-grade enterprise engine:
- **Zero IEEE 754 Floating-Point Drift**: All currency calculations are executed in scaled integers and BigInt rational arithmetic (`numerator / denominator`) in `@gigalibs/ar-domain`.
- **Multi-Tier Compound Taxation**: Multi-jurisdiction tax stacking (state, county, special transit districts, and VAT) calculated with integer basis points (`1 bp = 0.01%`).
- **Milestone Installment Engine with Remainder Balancing**: Splits contracts across 2 to 6 delivery gates with automated remainder penny balancing, guaranteeing $\sum \text{installments} \equiv \text{totalMinor}$.
- **Cryptographic Tamper-Evident Ledger Seals (FIPS 180-4 SHA-256)**: Every issued invoice computes a cryptographic hash seal linked to the tenant's prior invoice, creating an unbroken tamper-evident audit chain.
- **International E-Invoicing**: Standard-compliant export for European EN 16931, Peppol BIS Billing 3.0 (UBL 2.1), and ZUGFeRD / Factur-X PDF/A-3 metadata.

---

## 2. Deliverables Produced

### 2.1 Domain Mathematical & Cryptographic Kernel (`@gigalibs/ar-domain`)
Files:
- `modules/accounts-receivable/domain/src/invoice.ts`
- `modules/accounts-receivable/domain/src/index.ts`
- `modules/accounts-receivable/domain/src/invoice.test.ts` (20/20 unit tests)

Capabilities:
1. `calculateInvoiceLedger(options: InvoiceLedgerOptions): CalculatedInvoiceLedger`:
   - Exact line-level and header discount deductions.
   - Additive and compounding multi-tier taxes using basis-point math with explicit half-up rounding.
   - Dynamic installment milestone calculation with remainder cent absorption.
2. `createLedgerSeal(params)`:
   - Computes canonical `SHA-256(previousSealHash : tenantId : invoiceNumber : sequenceNumber : totalMinor : currency : issuedAt : linesHash)`.
3. `verifyLedgerSealChain(invoices)`:
   - Traverses the ledger chain, recalculating seals and verifying hash pointers, detecting any illicit modifications to amounts or line items.
4. Backwards-Compatibility:
   - Preserves `calculateInvoiceDraft` for existing consumers with zero breaking changes.

### 2.2 PostgreSQL 16 Schema Migration & Tenancy
File: `modules/accounts-receivable/db/migrations/000003_ar_ledger_seals_and_installments.up.sql`
- Adds `seal_hash VARCHAR(64) NULL`, `previous_seal_hash VARCHAR(64) NULL`, `seal_sequence BIGINT NULL`.
- Adds `applied_taxes JSONB NOT NULL DEFAULT '[]'::jsonb`, `installments JSONB NOT NULL DEFAULT '[]'::jsonb`.
- Adds `discount_minor BIGINT NOT NULL DEFAULT 0`.
- Creates unique index on `(tenant_id, seal_sequence) WHERE seal_sequence IS NOT NULL` enforcing monotonic ledger sequence under Row-Level Security (RLS).

### 2.3 Presentation Layer & AR Studio (`apps/workflow-platform`)
Routes:
- `/ar/invoices/new`:
  - Interactive multi-tier tax jurisdiction selector (CA, NY, TX, WA, VA, MD, DE) with compound surcharge toggles and FAR 52.229-3 Federal Defense exemption.
  - Header prompt-payment discount input.
  - Milestone Installment Schedule builder: 100% lump sum, 50/50 split, 40/30/30 tri-stage, or custom milestones with live penny-balanced preview.
- `/ar/invoices/[invoiceId]`:
  - Cryptographic Ledger Seal inspection panel with SHA-256 authoritative record hash, sequence position, and 1-click **Audit Hash Chain Integrity** tool.
  - Interactive Milestone Payment Schedule tracker with single-click settlement toggles.
  - International E-Invoicing preview modal supporting both **Peppol BIS 3.0 (UBL 2.1 XML)** and **ZUGFeRD / Factur-X (Cross-Industry Invoice)**.
- `/ar`:
  - Updated dashboard header with `FIPS 180-4 Chained Seals` and `WI-OI-035` production badges.

---

## 3. Verification & Quality Gates

### 3.1 Automated Test Execution
```bash
./node_modules/.bin/vitest run
```
**Results**:
- **105 / 105 passed (100%)** across 21 test files repository-wide.
- `apps/workflow-platform/__tests__/ar-ledger-engine.test.ts`: 4/4 integration tests passed in 3ms.
- `modules/accounts-receivable/domain/src/invoice.test.ts`: 20/20 domain tests passed in 9ms.

### 3.2 Next.js Production Build
```bash
apps/workflow-platform/node_modules/.bin/next build apps/workflow-platform
```
**Results**:
- **77 / 77 static pages** and all dynamic API routes compiled cleanly with zero TypeScript or build errors.

### 3.3 Mandatory SDLC Audits
All 6 audit gates passed with 0 violations:
1. `audit:production-data`: PASSED (0 violations across 13 scanned roots)
2. `audit:all-runtime-data`: PASSED (0 violations across runtime and package boundaries)
3. `audit:package-dependencies`: PASSED (80 active manifests verified)
4. `audit:api-boundary`: PASSED (8 controllers, 27 providers verified)
5. `audit:navigation`: PASSED (54 routes, 134 internal links verified)
6. `audit:sdlc`: PASSED (19 agents, 35 work items, WIP limit = 1 enforced)

### 3.4 Runtime Daemon Verification
Next.js production server running as a background daemon on **Port 5180** (`http://localhost:5180/ar/invoices/new` and `http://localhost:5180/ar`).
