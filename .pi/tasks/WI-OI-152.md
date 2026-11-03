# WI-OI-152: Master data hub and the `spec.masters` registry

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Phase 0; can start now.
- **Work item:** WI-OI-152 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-152.md`.
- **Size:** M. **Decisions:** ADR-0037 §3. **Plan:** `docs/plans/master-data-foundation-execution-plan.md` §6.

## Goal

One "Master data" area in the sidebar where an administrator sees every master they may read — with counts and state —
and opens, imports or loads it, generated from the module manifests so a new module's masters appear on their own.

## Scope

- **May change:** `spec.masters` in `modules/*/module.yaml`; the manifest schema and `scripts/module-manifests.mjs`
  and its generated outputs; new `packages/contracts/src/master-data/`; a counts helper in `packages/module-sdk`;
  a new kernel aggregation endpoint under `apps/playground-api/src/master-data/`; `apps/workflow-platform/lib/module-navigation.ts`
  (+ generated), `components/AppSidebar.tsx`, new route `app/(app)/master-data/`; permission catalogue and roles; tests.
- **Must not change:** module record contracts. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0037; analysis §3.1, §3.8, §6.1 (M1); `scripts/module-manifests.mjs`; `modules/product-catalogue/module.yaml`;
`apps/workflow-platform/lib/module-navigation.ts`; the WI-OI-145 screen design (shell tab bar, no page headings).

## Steps

1. Manifest schema: `spec.masters[]` with `key`, `entity`, `label`, `route` (or window), `readPermission`,
   `level` (`PLATFORM_REFERENCE` | `PACK` | `MODULE`), `importable`, `packSection` (optional), `referenceSet` (optional).
2. Declare the masters of analysis §3.1 in every owning manifest; organization units and parties in the kernel registry.
3. `pnpm modules:catalog` generates `packages/contracts/src/master-data/registry.generated.ts`; the manifest audit fails
   when a declared route or window does not exist.
4. Counts: a module SDK helper answers counts per declared entity (tenant- and organization-scoped, read permission
   enforced); the kernel aggregates with a 2 s budget per module — a module that does not answer shows "Unavailable".
5. Sidebar area "Master data" for tenant administrators, platform operators and operations supervisors, grouped
   (Organization and people, Products and stock, Partners, Finance, Assets and places, Reference data); each row shows
   name, owning module, count, state (Empty, In use, Unavailable) and Open; Import and Pack columns stay hidden until
   WI-OI-155 and WI-OI-154 fill them. Each master stays reachable from its module.

## Done when

- [ ] The hub lists every declared master; counts equal a direct read on the test stack
- [ ] A person without a master's read permission does not see it; a stopped module shows Unavailable, not an error
- [ ] Journey "find and open a master" ≤ 10 s (WI-OI-151 harness, dry mode)
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-152.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- the persona list or the sidebar placement needs to change.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
