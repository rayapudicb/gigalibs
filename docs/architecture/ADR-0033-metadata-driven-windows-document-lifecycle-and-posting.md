# ADR-0033: Metadata-driven windows, one document lifecycle and event-to-ledger posting

- **Status:** Accepted in direction by the owner (2026-10-05: "every screen should be metadata foundation driven …
  go with your recommendation"). Independent Architecture and Security review pending (named humans, D7).
- **Date:** 2026-10-05
- **Work item:** WI-OI-120 (cards F0, F1, F2)
- **Amends:** ADR-0019 (completes its `AD_Window`/`AD_Tab`/`AD_Field` design).
- **Supersedes:** "Option A: Enhanced Enterprise Hybrid Standard" in ADR-0021, ADR-0022, ADR-0023 and ADR-0024: a
  module's business screens are governed by published metadata instead of constants inside the screen.
- **Revised:** 2026-10-05, after the metadata-proposals investigation
  (`docs/audits/2026-10-04-production-readiness/metadata-proposals-investigation-2026-10-05.md`, findings M-04 and
  M-05). The revision keeps ADR-0019's tenets 9, 11 and 13; the first draft conflicted with them.
- **Reference:** `docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md` (iDempiere is GPL v2: concepts only, no code).

## Context

The WI-OI-119 audit and the owner's UAT review found:

- **Hand-written screens.** The Phase 4–14 screens are hand-written with hard-coded figures and dead buttons.
- **Custom fields only.** The Application Dictionary (ADR-0019, WI-OI-110) is used only for custom fields, fed by
  constants inside each screen; Product Catalogue alone loads the published dictionary.
- **No window engine.** The renderer draws one record form. It has no grid, no parent-child tabs bound to records, no
  lookups and no document actions. The window contract `DictionarySurfaceV1` was never built.
- **No shared document lifecycle.** Each module invents its own states.
- **No posting.** No completed document posts to the ledger, because no event is relayed or consumed.

iDempiere delivers business outcomes through exactly the three mechanisms GigaLibs lacks:

- windows rendered from the dictionary (`AD_Window`, `AD_Tab`, `AD_Field`);
- one document lifecycle (`DocAction`: prepare, complete, void, close, reverse-correct, reverse-accrual, re-activate,
  approve, reject);
- accounting documents (`Doc_*`) that post every completed document according to an accounting schema.

## Decision

### D1. Business screens are governed by published metadata (F0)

- **No second model.** The existing dictionary contracts and compiler (`DictionaryEntityV1`, `DictionaryFieldV1`,
  `DictionaryReferenceV1`, `DictionaryViewV1`, actions; ADR-0019) are extended, not replaced. Any new field gets a
  versioned contract change and a compiler mapping. There is no parallel `WindowV1`/`TabV1` model.
- **Capabilities the renderer must execute** before they may be published (unsupported ones are rejected at
  publish time instead of silently ignored):
  - a grid with server paging, search, filter and sort, bound to records;
  - forms with sections;
  - parent-child tabs bound to related records;
  - lookups through registered resolvers;
  - display, read-only and mandatory rules;
  - registered actions.
- **Each screen loads the published manifest version for its tenant and surface.** There are no constant manifests
  inside screens and no silent fallback to a built-in dictionary. A missing manifest is a visible error.
- **Deny by default.** Permissions not granted are not rendered; unknown or unsupported rule leaves fail closed. The
  server remains the authority for every permission and validation (tenet 9). Exact money and quantity fields keep
  exact representations end to end.
- **Record access goes through a typed dispatcher**, not table CRUD (tenet 11). It routes each list, read, create,
  update and action to an allow-listed module adapter or domain command, with:
  - tenant and organization scope from the signed context;
  - object authorization and field permissions;
  - `If-Match` concurrency;
  - `Idempotency-Key` on writes.

  Action buttons bind only to registered, reviewed handlers (tenet 13).
- **Module-owned contributions.** Each module ships its dictionary contribution (entities, fields, views, actions) as
  versioned files in its own folder, published through Configuration Studio. Tenants extend within the existing
  limits.
- **Specialized interactions remain components.** Barcode scanning, maps, chart building, work-order execution and
  offline capture may be hand-built components inside a metadata-governed screen. Their fields, permissions and
  actions still come from the published manifest. Hand-written React is not the defect; invented business data,
  dead controls and bypassed domain rules are.

### D2. Shared lifecycle primitives, document-specific state graphs (F1)

- **The shared package.** `@gigalibs/document-lifecycle` provides the primitives every transactional document uses:
  - a transition runner that checks the document's own guard for the requested transition;
  - the actor's permission for that action;
  - `Idempotency-Key` handling (same key and payload returns the first result; same key with a different payload is
    rejected);
  - version concurrency;
  - the audit record;
  - the outbox event, written in the same local transaction as the state change and its effects.
- **Each document type defines its own transition graph, guards and reversal semantics.** A vendor invoice, a stock
  movement and a work order do not share one state list.
- **Checks belong to the documents that need them.** Period-lock, credit, budget and approval checks are guards on
  the transitions that need them (MODULE_ACTION_OUTCOMES.md). The period-lock guard applies to every
  financially relevant transition in every module (audit P1-07).
- **Immutable completion.** Completed financial documents are immutable; corrections are reversals that reference
  the original.

### D3. Financially relevant documents post asynchronously and idempotently (F2)

- **Explicit posting policy.** Each document type declares a posting policy: posts (with its rule),
  commitment-ledger only, or none. Quotations, sales orders and other operational documents with no ledger effect
  say so explicitly.
- **Delivery.** Posting is asynchronous. The owning module completes its document and writes the event in its local
  transaction. The module SDK's existing signed relay (`outbox-relay.ts`) delivers it. Finance's consumer records
  the inbox receipt (`inbox-receipts.ts`) and creates the journal in one Finance transaction.
- **No cross-module ACID claim.** The local completion and the journal are not one transaction across modules. The
  document shows "awaiting posting", "posted" or "posting rejected". A rejected posting, for example to a closed
  period, is visible, can be retried after correction and is reported by reconciliation.
- **Idempotent effect.** Event delivery may repeat. The business effect must not: one journal per source document,
  version and entry type, enforced by unique constraints (U2 started this with `uq_gl_journals_source_document`).
- **Reconciliation.** A daily job compares documents with journals and reports differences. Period close does not
  complete while events for the period are undelivered or rejected.

## Consequences

- **Module cards change shape.** U7–U18 become:
  - the module's dictionary contribution;
  - adapters and domain commands behind the dispatcher;
  - transition graphs on the shared primitives;
  - posting policies;
  - a Playwright flow.

  The hand-written Phase 4–14 screens are rebuilt on published metadata. Their useful specialized components are
  kept inside the governed screen.
- **Order of work:** U2, then F0 (window engine, proven on Inventory), then F1 and F2, then the module cards.
- **Security.** The record API widens the attack surface. Field-level permissions, tenant scope and object
  authorization are enforced on the server, and each card carries negative tests.
- **Accounting review.** Default posting rules need review by a qualified accountant before any production release
  (WI-OI-119 P1-28).
