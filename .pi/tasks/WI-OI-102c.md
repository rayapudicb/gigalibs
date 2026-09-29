# WI-OI-102c: kernel, capability and business classification (ADR-0016 F1, F2)

- **Status:** Approved, as part of WI-OI-102, which the owner started on 2026-09-29.
- **Work item:** WI-OI-102. Evidence goes in `.pi/work/WI-OI-102.md`, under "102c".
- **Size:** M.

## Goal

Every workspace unit and module is known to be kernel, a named capability, business, shell or tooling, and the
layer audit enforces it. The kernel stays the small list in ADR-0016 F1.

## Scope

- **May change:**
  - `config/package-layers.json` and `config/layer-boundary-baseline.json` (baseline entries only for existing
    kernel-to-capability imports, each listed in the evidence);
  - `scripts/verify-layer-boundaries.mjs`;
  - the module manifest schema and validator (`scripts/module-manifests.mjs`);
  - every `modules/*/module.yaml` (one new field);
  - the generator (`scripts/module-new.mjs` and its template);
  - ADR-0013 and ADR-0016 wording;
  - tests for all of the above.
- **Must not change:**
  - runtime behaviour of any service;
  - database schemas;
  - package locations (no moves: F2);
  - the CMMS import/export files.

## Read first

- ADR-0016 F1–F2.
- `config/package-layers.json`.
- `scripts/verify-layer-boundaries.mjs`.
- The manifest validator section of `scripts/module-manifests.mjs`.
- `.pi/handoff/core-package-usage.tsv`.

## Steps

1. **Classify.** Put every package now labelled `core` into one of:
   - `kernel` (the F1 list);
   - `capability:<name>` (forms, rules, workflow, notifications, documents, reports/analytics, places, integration,
     search, ai);
   - `retire`, when 102b or the usage table says so (it is removed later, in 102f).

   Put every module into `capability` or `business`. Record the table in the evidence, and flag ambiguous homes
   (for example parties or master data, and settings) as questions.
2. **Manifests:** add `spec.category: capability | business` to module manifest v1, validate it, set it in all 19
   manifests, and add `module:new --category` (default `business`).
3. **Layer audit.** Add these rules:
   - the kernel must not import capability or business code;
   - a capability may import the kernel;
   - business code may import the kernel and published capability contract packages;
   - nothing imports a shell.

   Baseline today's kernel imports of capability code (for example the core API using the forms engine) as named
   entries that may only be removed.
4. **`platform-rbac`:** compare `modules/platform-rbac` with `rbac-core` and `rbac-nest`. Move its catalogue entry to
   `platform/core.yaml` as kernel, and mark the module for retirement in 102f. Stop and ask if it holds anything
   `rbac-*` lacks.

## Done when

- [ ] The classification table is in the evidence, and the owner has answered any ambiguous homes.
- [ ] `pnpm audit:layers` enforces kernel, capability and business, with 0 new violations and every baseline
      entry named.
- [ ] All 19 manifests carry `spec.category`, and the generator supports it.
- [ ] `pnpm verify` passes (known drift only), and `.pi/NOW.md` is updated.

## Stop and ask if

- a package's home is unclear;
- `platform-rbac` holds behaviour the kernel lacks;
- enforcing a rule would need moving code between services.

## Report

At most five bullets: the classification counts, the rules added, the baseline entries, the questions for the
owner, and what's next (102d).
