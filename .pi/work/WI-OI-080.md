# WI-OI-080 — ADR-0013 layering, ownership and layer-boundary audit (Wave 0, C1)

Status: Review (matches the registry; independent review pending). Corrected by the WI-OI-119 audit (2026-10-05).  
Owner: SDLC Orchestrator / Solution Architecture / Developer Platform  
Execution: owner-approved plan of action (2026-09-28): core first, freeze outside the manufacturing package  
Requirements: FR-01, FR-02, FR-12, FR-14, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003,
NFR-OBS-001–004  
Independent reviewers: Solution Architecture (independent of the producer), Product, Backend/Data, QA/SDET

## G0 — intake

The owner's business model is one shared core plus the modules each client chooses (WI-OI-079). The core must be
industry-agnostic and must not depend on any business module, so that per-client builds can leave modules out.
Plan: `docs/plans/manufacturing-package-solution-plan.md` §3–4 (C1).

## G1 — acceptance

1. An ADR records the three layers, one owner per concept, the extension-point rule and enforcement.
2. Every pnpm workspace unit has exactly one layer. New units fail the audit until they are classified.
3. Every core-database (Prisma) model is classified as core or module-owned. New models fail the audit until they
   are classified.
4. The audit fails on:
   - core importing module code;
   - a module importing another module;
   - anything importing the shell or tooling.

   Existing violations are baselined, and the baseline may only shrink.
5. No runtime behaviour changes. No module or web refactor happens in this item.

## G2 — design

`docs/architecture/ADR-0013-core-modules-and-solutions.md` (Proposed).

## G4 — implementation (2026-09-28)

**Files:**
- `config/package-layers.json`: layers for 113 workspace units and all 116 core-database models (85 core, 31
  module-owned).
- `scripts/verify-layer-boundaries.mjs`: the audit.
- `config/layer-boundary-baseline.json`: 4 baseline violations. Tests in `packages/chat-core` and
  `packages/form-engine-core` read AR and multi-currency manifests.
- `pnpm audit:layers` in the root `package.json`.

**Measurements:**
- 1,586 files and 2,857 workspace imports scanned.
- 4 violations, all in the baseline.
- The shell imports module code in 2 places (AR).

**Layers:**
- 80 packages plus the control plane are core.
- 8 packages are module-owned: `invoices-core` and `gigalibs-controls` (AR), `spend-core`, `multi-currency`,
  `cart-react` and `orders-nest` (commerce), `ledger-nest`, `knowledge-base-react`.
- 30 `modules/**` units are module-owned.
- `apps/workflow-platform` is the shell; `e2e` is tooling.

**Finding recorded in ADR-0013:** package-import coupling is already low. The real coupling is:
- module code inside the shell (WI-OI-083);
- business tables in the core database (WI-OI-092);
- copied module plumbing (WI-OI-082).

## Remaining

- Independent G2 review of ADR-0013.
- Add `audit:layers` to the certification chain and CI.
- WI-OI-081 to WI-OI-085 follow.
- WI-OI-082 and WI-OI-083 refactor committed-state code and wait for the owner's "commit" (D1).
