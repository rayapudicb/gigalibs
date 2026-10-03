# Deferred Finance Ops and Bigcapital Benchmark Roadmap

- **Status:** Bookmarked and deferred; no Build authorization
- **Recorded:** 2026-10-03
- **Depends on:** WI-OI-110 and the enterprise reference-master phases that follow it
- **Reference only:** `/Users/rayapudi/Downloads/bigcapital-develop`

## Decision

GigaLibs will not start the Finance Ops expansion while WI-OI-110 is active. Bigcapital is retained as a
read-only product-behaviour benchmark for accounting workflows, screen coverage, API journeys and reports.
Its source, assets, migrations and UI must not be copied into GigaLibs. The clone declares AGPL-3.0 at the
repository root while the server package declares `UNLICENSED`; legal and OSS review is required before any
reuse beyond independent behavioural analysis.

The future objective is capability parity through a clean-room GigaLibs implementation, not a Bigcapital
fork and not a second accounting runtime.

## Current conclusion

Bigcapital has broader accounting-product coverage today: customer and supplier records, estimates,
invoices, receipts, credits, payments, expenses, chart of accounts, journals, banking, inventory and
financial statements. GigaLibs has stronger tenant isolation, organization scope, governed configuration,
idempotency, audit and outbox foundations, but its financial capabilities are separate bounded slices and
are not yet one certified accounting product.

The highest-priority future gaps are:

1. canonical Party and Product masters;
2. legal-entity accounting books, chart of accounts and fiscal periods;
3. an immutable balanced posting engine and reversal model;
4. one authoritative order-to-cash path;
5. one authoritative procure-to-pay path;
6. treasury, bank feeds and reconciliation;
7. inventory valuation and cost accounting;
8. ledger-backed financial statements and close operations.

## Future sequence

| Stage | Outcome |
| --- | --- |
| F0 | Clean-room capability matrix, ownership ADR and license disposition |
| F1 | Canonical Parties, Products, UOM, prices and payment terms |
| F2 | Finance Kernel: books, COA, periods, document types, sequences, dimensions and posting |
| F3 | Existing AR advanced into complete order-to-cash |
| F4 | Existing AP matching and Spend converged into complete procure-to-pay |
| F5 | Expenses, cards, advances and reimbursements |
| F6 | Treasury, bank accounts, feeds, rules and reconciliation |
| F7 | Shared inventory ownership, valuation, landed cost and COGS |
| F8 | Period close, financial statements, tax/FX reporting and drill-through |
| F9 | Country packs, providers, migration, resilience and production certification |

## Architectural boundary

- WI-OI-109 supplies tenant-defined legal and operating organization scope.
- WI-OI-110 supplies governed metadata, layouts, views and registered actions.
- Domain modules retain their own state machines and persistence.
- Metadata never defines money arithmetic, accounting treatment, tax results or posting logic.
- Modules communicate through versioned contracts and outbox events; they never read another module's
  schema.
- Posted financial facts are immutable. Corrections use credits, reversals or superseding documents.
- Analytics and Reports consume certified financial read models; they do not calculate the books.

## Resume condition

Resume this roadmap only after:

1. WI-OI-110 exits Build with its certification evidence;
2. the canonical Party/Product ownership phases are accepted;
3. the SDLC Orchestrator allocates stable work items and selects one active Build item;
4. Finance/Domain, Security, Backend/Data, API Contracts, QA and Product reviewers accept the relevant
   G1-G3 decisions.

This bookmark does not claim that Bigcapital parity, Finance Ops or a general ledger is implemented.
