# WI-OI-120bm: Pharma specification suite, agent investigation and spec-driven implementation plan

- **Status:** Built (2026-10-19): the document is delivered and awaits the owner's review. The owner asked: "each module should be investigated by the agents and give me
  the best implementation plan without deviating the process in the industry of pharma … i need a document that is
  downloadable in docx and for future reference".
- **Work item:** WI-OI-120 (planning). Documentation only: no product code, no plan change.
- **Size:** M (documents)

## Goal

Every module of the owner's pharma specification suite is investigated by the pharma practice of the GigaLibs agent
organisation. The result is a reference plan, delivered as a Word document. For each module it gives:
- GxP classification and validation approach;
- the industry process to follow;
- the domain model;
- the specification set (URS, FR with Given/When/Then, NFR, AI model specification);
- fit with GigaLibs;
- the implementation slices;
- the risks.

It also includes a worked example of SPEED Stage-1 desk screening on the owner's 5-step test route.

## Scope

- **Source:** `~/Downloads/Pharma_Tech_Spec_Suite_v2.docx`. Company and product names from it are not used.
- **Output:**
  - `docs/pharma/Pharma_Spec_Suite_Implementation_Plan_v1.docx`, plus a copy in `~/Downloads`;
  - its markdown source, `docs/pharma/Pharma_Spec_Suite_Implementation_Plan_v1.md`.
- **Roster:** the pharma practice is activated: 2 existing roles, plus 6 new roles with agent files.
- **Must not change:** product code; plan v3's order (the suite would enter the plan only through approved cards).

## Done when

- [x] All 19 modules and SPEED are covered with the template: 5 families, about 57,000 words.
- [x] The worked example shows only computable results, and blocks the thermal engines at Gate 2. The molecular
  weights were cross-checked independently.
- [x] The document builds and passes the docx skill's validation (6,012 paragraphs, 78 tables).
- [x] Regulatory statements carry their status, checked 2026-10-19: FDA CSA is final (September 2025); EU Annex 22
  and the revised Annex 11 are drafts (July 2025); FDA's AI guidance is a draft (January 2025).
- [ ] The owner reviews the document. Named QA, process safety and regulatory reviewers are listed for confirmation.

## Findings about GigaLibs from the investigation (verified 2026-10-19)

- **E-signature** (`modules/esignature`) is a contained prototype with no signature meaning and no re-authentication.
  It needs a Part 11 extension before any GxP use.
- **The document scanner** (`modules/document-scanner`, a contained prototype) breaks the zero-mock rule:
  - it invents an invoice number (`INV-` plus the clock time) when none is found;
  - it defaults the currency to USD;
  - it reports a constant 0.99 confidence;
  - its tables enable row-level security without forcing it.

  It needs a fix card before reuse.
- **No Python scientific-compute runtime** (ADR-0016 F12 parked it), no historian or OPC-UA, no LIMS or ELN
  connectors: each needs an ADR.
- **UAT is production** (plan v3 decision 0.7a). GxP tenants need a validation environment and controlled releases:
  an owner decision.
