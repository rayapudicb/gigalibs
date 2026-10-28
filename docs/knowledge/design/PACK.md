# Design (UX, UI and ergonomics): knowledge pack

- **Kept by:** `design_lead`; sections by `ergonomics_human_factors` and `design_system`
- **Status:** Seed (2026-10-19, WI-OI-120bl). Sections 1–4 are not yet researched. Section 5 is verified against the
  repo.
- **Last reviewed:** 2026-10-19, card WI-OI-120bl

## 1. Principles

The platform's engineering and interaction principles are formally specified in the developer-facing
[Enterprise UI/UX Design Rulebook](../../ux/ENTERPRISE_UI_UX_RULEBOOK.md):
- **Outcome & Benchmark-Driven:** Every screen is measured against hard completion benchmarks (lookups $\le 5$s, approvals $\le 10$s, quick-creates $\le 30$s, standard entry $\le 60$s).
- **Zero-Training Mandate:** Plain-language affordance (no ERP T-codes), progressive disclosure (2-field quick create drawers), inline guardrails, and contextual next-best actions.
- **Minimal Data Entry (80/20 Rule):** Zero re-keying. Everything derivable is derived, everything shared is inherited from the organization context, and computed metrics (credit exposure, ATP, tax) are strictly read-only and live.

## 2. Ergonomics and human factors (`ergonomics_human_factors`)

Design standards follow the [Enterprise UI/UX Design Rulebook](../../ux/ENTERPRISE_UI_UX_RULEBOOK.md) (§5):
- **The Desk Clerk (Keyboard-First):** Full `Tab` focus order, `Cmd/Ctrl+Enter` submit, `Esc` dismiss, `/` search, fuzzy typeaheads. Mouse-optional for high-volume data entry.
- **The Plant Floor Technician (Mobile/Tablet):**
  - **Thumb-Zone Layout:** Primary actions anchored in the bottom 30% of the viewport.
  - **Touch Targets:** Minimum $48 \times 48\text{px}$ touch targets with $8\text{px}$ gutters for gloved operation.
  - **High-Contrast Glare Mode:** WCAG 2.2 AAA ($7:1$) outdoor legibility.
- **Standards:** ISO 9241 (parts 11, 110, 210), ISO 6385, and ISO 11064 for control rooms.

## 3. Design system (`design_system`)

- **Spatial Architecture:** Master-Detail Split-Screen standard (60% DataTable left / 40% Focus Drawer right) to prevent context loss and eliminate full-page redirect cycles.
- **3-Tier Visual Hierarchy:** Glanceable Anchor Header (status + live gauge) $\rightarrow$ Operational Canvas (line items/forms) $\rightarrow$ Context/Audit tab.
- **Tokens & Library:** `@medusajs/ui` ^4.2.3 with `@medusajs/ui-preset`. Zero hardcoded hex colors.
- **Shimmer Skeletons:** Standardized dimension-matched skeletons for loading states (no blocking center spinners).

## 4. Accessibility

- **Baseline Floor:** WCAG 2.2 AA floor across all desktop screens (EN 301 549 compliance).
- **Outdoor / Plant Mode:** WCAG 2.2 AAA ($7:1$ contrast) for rugged field and mobile CMMS screens.

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
