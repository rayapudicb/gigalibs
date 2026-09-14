# GigaLibs Anti-Duplication & "Enhance Existing First" (EEF) Standard

## Mission & Purpose

The **Anti-Duplication & Enhancement Guardian** exists to prevent codebase sprawl, fragmented micro-views, duplicate navigation tiers, and out-of-sync parallel domain implementations.

When a feature or capability request arrives (e.g. Invoicing, 3-Way Match, Rule Management, Tax Calculation), engineers and AI agents must **never** create a parallel, disconnected route, table, or store if an authoritative module already exists for that domain.

---

## The 4 Golden Rules of Anti-Duplication

### 1. Discovery Before Creation (DBC)
Before creating any new file under `apps/workflow-platform/app/(app)` or `components/`:
- Search existing routes (`fd` / `find_by_name`).
- Search existing UI tabs and navigation components.
- Search existing stores (`lib/*store*.ts`).
- If an existing page or component addresses 50%+ of the domain purpose, **extend it in-place** (via tabs, drawers, filters, or sub-routes). Do not create a rival page.

### 2. Single Cohesive Navigation Tier (SCN)
- **Zero Stacked Nav Bars**: A page must never render multiple overlapping navigation bars stacked on top of each other where domain entities (e.g., Invoices, Customers, WIP) are repeated.
- Domain sub-navs (`*Nav.tsx`) must represent distinct, non-overlapping workflows.
- Tab bars inside studio pages must not duplicate links in the global header or domain sub-nav.

### 3. Single Authoritative Domain Store (SAD)
- Domain entities must have exactly **one** authoritative store/fallback definition (e.g., `lib/ar-fallback-data.ts` or `lib/ar-ledger-store.ts`).
- Never define duplicate inline mock arrays (`const FALLBACK_INVOICES = [...]`) in multiple page files.
- All sub-pages and audit detail pages must consume the shared canonical client.

### 4. Cohesive Bidirectional Route Linking (CRL)
- When sub-routes exist (e.g., `/ar/invoices`, `/ar/customers`, `/ar/aging`, `/ar/invoices/[invoiceId]`), they must either:
  1. Embed the authoritative studio component, or
  2. Provide clean, persistent back-links to the canonical studio (`/ar`).
- No sub-route may exist as an isolated "island" with dead-end navigation or contradictory numbers.

---

## Automated Verification

The platform enforces this standard through:
```bash
pnpm audit:anti-duplication
```
Which executes `scripts/verify-anti-duplication.mjs`:
- Scans all App Router pages for duplicate stacked navigation (`<*Nav />` + duplicate internal tabs).
- Scans for duplicate hardcoded mock arrays across the workspace.
- Enforces single source of truth for financial documents and workflows.
