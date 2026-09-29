# WI-OI-102d: fencing the core's business code and tables (ADR-0016 F4, F5)

- **Status:** Done (2026-09-29). Evidence is in `.pi/work/WI-OI-102.md` under "102d".
- **Work item:** WI-OI-102. Evidence goes in `.pi/work/WI-OI-102.md`, under "102d".
- **Size:** S.

## Goal

Nothing new gets built on business code or tables that are leaving the core. The catalogue says openly that AP is
hosted temporarily.

## Scope

- **May change:**
  - `platform/core.yaml` (the reasons and `hostedFor` of the AP entries) and the regenerated catalogue;
  - `config/package-layers.json` (`controlPlaneModels`);
  - `scripts/verify-layer-boundaries.mjs` and its baseline;
  - WI-OI-102 evidence and `.pi/NOW.md`.
- **Must not change:** any service behaviour, any database table or data, or any existing AP code path.

## Steps

1. **Label AP.** The `invoice-matching` and `approval-queue` catalogue entries (the latter shows AP actions at
   `/actions`) say "Hosted by the core until the Procurement module exists (ADR-0016 F4)" and carry
   `hostedFor: procurement`. Then regenerate the catalogue.
2. **Classify.** Move `WorkflowPipeline`, `WorkflowVersion` and `WorkflowRun` from core to module-owned ("workflow,
   moving to Workflow Studio", 102b).
3. **Fence.** The layer audit reports `FENCED_MODEL_WRITE` for any non-test source that writes a module-owned core
   model. It checks Prisma `create`, `update`, `upsert` and `delete` calls, and raw `INSERT`, `UPDATE` and `DELETE`
   on the model's table. Today's writes are recorded as named baseline entries, which may only be removed.
4. **Prove it:** a probe write to a fenced model fails the audit; with the probe removed, the audit passes.

## Done when

- [ ] The catalogue shows the hosted label; the manifest check and `pnpm verify` pass (known drift only).
- [ ] The audit fails on a new fenced write, and every existing write is listed in the evidence.
- [ ] `.pi/NOW.md` is updated.

## Stop and ask if

- fencing would block a path the running product needs for a new feature;
- a fenced table turns out to be kernel data.

## Report

At most five bullets.
