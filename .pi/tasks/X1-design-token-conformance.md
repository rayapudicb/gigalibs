# X1 — UX standard v2: design-token conformance (this session's contribution)

- **Status:** This session's new UI conforms (2026-10-26, local). Plan item 3.9. The broader X1 umbrella stays open
  under WI-OI-120b.

## Context

X1 ("UX standard v2", WI-OI-120b) is a large umbrella: internal codes hidden from users, 37 layout + 17 accessibility
findings, and — the enforced, measurable part — the **design-token standard**: web screens use `@medusajs/ui` and the
`ui-*` tokens with **no hard-coded colours** (`audit:design-tokens`, owner rule; ratcheted per file against
`config/design-token-baseline.json`).

## What this session did

The S17 people console and the T11b set-up wizard were first written with hard-coded Tailwind palette colours
(`emerald-*`, `amber-*`, `rose-*`, `zinc-*`, `white`), which **fail `audit:design-tokens`** (allowed 0 for a new file).
Both are now converted to semantic tokens, so they conform to the X1 standard:
- status badges → `ui-tag-{green,orange,red}-{bg,text,border}`; neutral → `ui-bg-subtle` / `ui-fg-subtle` /
  `ui-border-base`;
- success/error containers and text → `ui-tag-green-*` / `ui-tag-red-*` and `ui-fg-error`;
- the "complete" accents (progress fill, done marker, selected chip) → `ui-fg-base` / `ui-fg-on-inverted`;
- focus rings → `ui-border-interactive`.

`PeopleAdministration.tsx` and `SetupWizard.tsx` now report **0** hard-coded colours; their render tests still pass.

## Not done (stays with WI-OI-120b)

- `audit:design-tokens` still fails on three files **this session did not create** and that were already dirty/untracked
  at session start — `app/(app)/maps/page.tsx`, `components/auth/AuthAtmosphere.tsx`,
  `components/geospatial/PlantSpatial3DViewer.tsx` — owned by whoever is editing them.
- The 37 layout and 17 accessibility findings, and hiding internal codes (e.g. `TENANT_ADMIN`) from users, are the
  substance of X1 and remain catalogued across the WI-OI-120b sub-cards (120ba–120bz); they are product/design-owned
  and out of scope for an autonomous pass.
