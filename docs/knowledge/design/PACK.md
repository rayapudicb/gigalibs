# Design (UX, UI and ergonomics): knowledge pack

- **Kept by:** `design_lead`; sections by `ergonomics_human_factors` and `design_system`
- **Status:** Seed (2026-10-19, WI-OI-120bl). Sections 1–4 are not yet researched. Section 5 is verified against the
  repo.
- **Last reviewed:** 2026-10-19, card WI-OI-120bl

## 1. Principles

Not yet researched. To be written from ISO 9241-110 (the interaction principles), ISO 9241-210 (human-centred
design), plan v3's GU design rules, and research with real users. Each principle gets a GigaLibs example and a check a
journey can run.

## 2. Ergonomics and human factors (`ergonomics_human_factors`)

Not yet researched. Personas and environments to cover first (CMMS):
- the technician on a plant floor (gloves, glare, noise, one hand, a phone, weak signal);
- the supervisor at a desk and on the move;
- the requester who uses the product once a month.

Standards: ISO 9241 (parts 11, 110, 210), ISO 6385, ISO 11064 where control rooms apply.

## 3. Design system (`design_system`)

Not yet researched:
- tokens (colour, type, spacing, elevation, light and dark);
- components and when to use each;
- patterns (list and detail, forms, dialogs, wizards, empty, error, offline and no-permission states);
- density rules.

Base: `@medusajs/ui` with its preset.

## 4. Accessibility

Not yet researched. WCAG 2.2 AA as the floor (EN 301 549 for public-sector buyers in Europe).

## 5. GigaLibs today (verified 2026-10-19)

- **UI library:** `@medusajs/ui` ^4.2.3 and `@medusajs/ui-preset` (`apps/workflow-platform/package.json`). Business
  screens are metadata windows wherever a module has them (ADR-0033).
- **`audit:design-tokens`** (no hard-coded colours) fails only in three files owned by other sessions:
  `app/(app)/maps/page.tsx`, `components/auth/AuthAtmosphere.tsx` and `components/geospatial/PlantSpatial3DViewer.tsx`.
- **Journey `dg84u3`** (2026-10-18): 33 layout findings (mostly "a control is covered by another element"), 17
  accessibility findings (contrast), 5 UX findings (including "a reload loses the tab you were on" on the
  work-order screen). These are the design department's first backlog.
- **Plan v3's GU design rules** for the Assistant (owner, 2026-10-16) are in
  `docs/plans/gigalibs-execution-plan-v3.md` ("Design rules for GU1–GU7").

## 6. Open questions

- Who are the first real users the design team can observe or interview: a facilities team, a plant?
- Does the brand (logo, colours, name style) have an owner decision to follow?

## Sources

- [1] The repository at 2026-10-19; journey `dg84u3` findings (`e2e/test-results/journey/findings.json`).
