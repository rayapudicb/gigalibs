# WI-OI-107: industry packs at the solution layer (ADR-0016 F10)

- **Status:** Done and live (Review), 2026-10-01. Approved by the owner ("go" with D1–D5; this settles the GPT agent's
  Task 2d). Evidence: `.pi/work/WI-OI-107.md`.
- **Work item:** WI-OI-107. Evidence goes in `.pi/work/WI-OI-107.md`.
- **Size:** L. Five pieces, built in one batch with a single deploy (the WI-OI-105 way of working).

## Goal

One industry pack per industry, owned by the solution layer and covering every module, shaped by the seven layers of
WI-OI-074. Installing a pack on a tenant needs no code change and no deploy (agriculture plan phase 5 exit). A new
industry is a new pack file, never a module change.

## What exists (checked 2026-10-01)

- **Three copies of the same packs:**
  - `modules/gigaops/config/industry-packs/*.json` (9 industries) and `country-packs/*.json` (5 countries). Workforce
    reads them at run time (`packs.service.ts`, payroll), and `solutions/*.yaml` is validated against them.
  - `packages/configuration-core/src/governed-catalogues.ts`: `BUNDLED_INDUSTRY_PACKS` and `BUNDLED_COUNTRY_PACKS`,
    hand-converted from the Workforce files ("now superseded"), with place levels, demo profiles and Japan added. A
    tenant installs one through Configuration Studio (draft → approve → publish → activate); only Demo Lab reads it.
  - Workforce's own per-tenant choice: table `gigalibs_gigaops.tenant_packs` and `POST packs/activate`.
- **Content is Workforce-only:** `IndustryPackV1` holds Workforce terms (5 words), role and classification labels,
  certifications, a default pay type and feature switches, plus place types (seeded into Geospatial by Demo Lab) and
  a Demo Lab data profile. No CMMS, Analytics or Connector Hub content; no agriculture pack.
- **Layer engines:** vocabulary in screens (WI-OI-074, paused), custom fields (075), tenant lists (076), personas
  (077) and workflow hooks (078) are not built. Analytics has the governed metric catalogue (layer 6).
- **Delivery machinery that now exists:** kernel jobs and `module.call` (WI-OI-104c) can call a module's API as a
  named member, with retries and audit.

## Pieces (recommended design)

1. **107a One pack format.** `IndustryPackV2` (and `CountryPackV2`): a header (slug, label, version) and one section
   per module, grouped by the seven layers. Each module declares in its `module.yaml` the sections it reads and their
   schema; a pack is valid only if every section matches its module's schema. Layers without an engine yet keep an
   empty slot, so 074–078 plug in later without a format change.
2. **107b One source of truth (D1, D2).** Pack files under `solutions/packs/` (industry and country), converted from
   the three copies with nothing lost. `BUNDLED_*` are generated from them; the Workforce JSON files and the hand
   copies are deleted (owner-approved, git keeps history). `pnpm audit:module-manifests` checks every solution's
   packs and every section.
3. **107c Activation and delivery (D3).** A tenant activates a pack version once, in Configuration Studio (the
   existing governed lifecycle). The kernel then runs a `pack.apply` job per entitled module, as the activating
   admin, with that module's section. Each module stores its section by version (idempotent; roll-back by
   re-activating an older version) and answers what it holds.
4. **107d Modules read their section (D5).** Workforce reads terms, labels, certifications, pay type and features
   from its stored section, and payroll its country rules; `tenant_packs` and `POST packs/activate` retire, with each
   tenant's current choice carried over. Geospatial seeds missing place types from its section. Demo Lab reads the
   same activated pack.
5. **107e Proof.** On a fresh tenant, activating `manufacturing` gives exactly today's Workforce wording, place types
   and pay behaviour (parity tests); a skeleton `agriculture` pack (vocabulary words, place levels Farm › Field ›
   Block, crop and input lists as data, a starter metric list) installs on another tenant with no code change and no
   deploy. Browser proof on 5190.

## Decisions for the owner

- **D1, where packs live:** files in `solutions/packs/`, shipped and certified with each release, installed into
  Configuration Studio and activated per tenant (recommended). Or: authored only in Configuration Studio (the
  database), with no files in the repository.
- **D2, country packs move too:** recommended yes. They hold currency, units and Workforce's pay-rule parameters, and
  the solution selects them already.
- **D3, how a module gets its section:** kernel `pack.apply` jobs (recommended: reuses 104c, retries and audit, the
  module keeps its own copy). Or: outbox facts relayed to each module's inbox. Or: modules call the kernel when they
  need it (couples every module to the kernel at run time; not recommended).
- **D4, scope:** 107 builds the format, the single source, activation and delivery, and moves today's content
  (recommended). Showing pack words in every screen stays WI-OI-074, and fields, lists, personas and workflow hooks
  stay 075–078. Or: fold WI-OI-074 vocabulary into 107 (adds about one size step).
- **D5, Workforce's own pack switch:** retire `tenant_packs` and `POST packs/activate`, carrying each tenant's current
  choice over to the kernel activation (recommended). Changes how Workforce admins pick a pack (now in Configuration
  Studio).

## Stop and ask if

- a pack's conversion would change any tenant's current wording, place types or pay results;
- a module's existing pack behaviour would change for its users beyond D5.
