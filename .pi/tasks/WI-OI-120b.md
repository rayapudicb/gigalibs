# WI-OI-120b (U1b): Apply the design standard to the connected Phase 2–4 screens and guard it

- **Status:** Approved (owner, 2026-10-05: "Recommended: a small card now (U1b) go ahead") | In progress
- **Work item:** WI-OI-120 (UAT readiness programme). Evidence goes in `.pi/work/WI-OI-120.md` (section U1b).
- **Size:** M

## Goal

Screens look and behave like the rest of GigaLibs. The owner's rule (`.pi/handoff/HANDOFF-2026-09-29.md:81`): web
screens use `@medusajs/ui` and the `ui-*` design tokens, with no hard-coded colours.

- A check stops new violations.
- The four screens that already load real data are restyled now: Product Catalogue, Parties, Application
  Dictionary and the form renderer.
- Inventory, Procurement, Orders and Finance are restyled in their own cards (U8–U18), because those cards rebuild
  them when they are connected to real data.

## Scope

- **May change:**
  - `modules/product-catalogue/web/src/ProductCatalogueWorkspace.tsx`;
  - `apps/workflow-platform/components/parties/PartyWorkspace.tsx`;
  - `apps/workflow-platform/components/configuration/ApplicationDictionaryWorkbench.tsx`;
  - `packages/configuration-react/src/DictionaryRenderer.tsx`;
  - their `package.json` files (add `@medusajs/ui` at the version CMMS uses) and `pnpm-lock.yaml`;
  - `apps/workflow-platform/tailwind.config.js` (its `content` must include module web packages and
    `packages/*-react`, or their classes are never generated);
  - a new `scripts/verify-design-tokens.mjs` with its baseline, `package.json` (`audit:design-tokens`) and
    `scripts/verify.mjs`;
  - tests, `.pi/work/WI-OI-120.md`, `.pi/NOW.md`, this card.
- **Must not change:** behavior, data, API calls, permissions or business rules of these screens (styling and markup
  only); any other screen; module APIs, migrations or manifests; the running UAT instance (deploying waits for the
  owner).

## Steps

1. **Check.** `audit:design-tokens` scans web source (`apps/workflow-platform/{app,components,lib}`,
   `modules/*/web/src`, `packages/*-react/src`) for hard-coded Tailwind palette colours and inline hex/rgb colours.
   A baseline file records today's counts per file. Counts may only go down, new files must be clean, and the four
   restyled files must be zero. Add it to `pnpm verify`.
2. **Tailwind `content`.** Include `../../modules/*/web/src/**/*.{ts,tsx}` and
   `../../packages/*-react/src/**/*.{ts,tsx}`.
3. **Restyle** the four screens with `@medusajs/ui` components (`Container`, `Heading`, `Text`, `Button`, `Input`,
   `Select`, `Table`, `Badge`, `StatusBadge`, `Alert`, `Drawer`/`FocusModal`) and `ui-*` tokens, following
   `modules/physical-operations-cmms/web`.
   - Light theme, consistent with the shell.
   - Readable headings; error and status messages with sufficient contrast; labels associated with their inputs.
4. **Tests:**
   - existing tests for these screens still pass;
   - a test asserts the four files have no hard-coded colours;
   - `pnpm build`, `pnpm test` and the static audits pass.

## Done when

- [x] `audit:design-tokens` passes, fails on a new hard-coded colour, and reports zero for the four restyled files
- [x] The four screens use `ui-*` tokens only (950 hard-coded colours replaced, mapping in the evidence); behavior
  unchanged (colour classes only, no markup or logic changed)
- [ ] Swapping native buttons, tables and inputs for `@medusajs/ui` components is moved to U5–U7, where these screens are
  reworked (scope change, reported to the owner 2026-10-05). No `@medusajs/ui` dependency was added because nothing
  imports it yet
- [x] `pnpm build`, `pnpm test`, static audits pass (known `WORKFORCE_API_URL` drift only)
- [ ] Evidence in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated; deployment to the UAT instance offered to the owner

## Stop and ask if

- restyling would require changing what a screen does, or a Medusa component cannot express an existing control;
- a screen outside the four needs changing.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
