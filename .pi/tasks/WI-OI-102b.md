# WI-OI-102b: engine evaluation (forms, rules, workflow, execution plane)

- **Status:** Done (2026-09-29). The owner chose Workflow Studio, parked the execution plane, and had the 17 pipelines
  inspected (all test data).
- **Work item:** WI-OI-102. Evidence goes in `.pi/work/WI-OI-102.md`, under "102b".
- **Size:** S (analysis only; no code changes).

## Goal

For each job (forms, rules, workflow), show every implementation, what really uses it, and what it would take to
keep one. For forms and rules, confirm the ADR-0016 decision. For workflow and the Python execution plane,
recommend one engine for the owner to choose.

## Scope

- **May change:** `.pi/work/WI-OI-102.md` and this card.
- **Must not change:** any code, package, manifest, database or running service.

## Read first

- ADR-0016 F3 and F12.
- `.pi/handoff/core-package-usage.tsv`.
- `config/package-layers.json` and `pnpm-workspace.yaml` (exclusions).

## Steps

1. **List each implementation:**
   - **Forms:** `packages/configuration-core` and `configuration-react` (Configuration Studio),
     `packages/form-engine-core` and `form-engine-react`, `packages/forms-engine`, `forms-engine-nest` and
     `forms-engine-react`.
   - **Rules:** `packages/rule-engine-universal`, `modules/universal-rule-pro`, and the `gigalibs_rules` schema and
     its API.
   - **Workflow:** `packages/workflow-engine`, `workflow-nest`, `workflow-react`, `workflow-sdk` and `workflow-mcp`;
     `modules/workflow-studio`; `modules/saga-orchestrator`; `apps/workflow-api` (Python); and the core API's
     workflow and execution evidence (`gigalibs_workflow`).
2. **For each implementation, record:**
   - where it lives;
   - whether it is in the workspace or excluded;
   - what imports or calls it (use `rg`);
   - whether it runs today;
   - whether it has persisted data (row counts only);
   - how many tests it has;
   - its size in lines.
3. **Check against the module contract (vision §4)** for the likely keeper: persistence, tenancy, audit,
   idempotency, tests.
4. **Recommend** the workflow engine and what happens to the execution plane, with the reasons and the migration
   effort. List the retirements this implies for the package inventory (102f).

## Done when

- [ ] A table per job, with evidence, is in `.pi/work/WI-OI-102.md` under "102b".
- [ ] Forms and rules: ADR-0016 is confirmed, or a divergence is raised with the owner.
- [ ] Workflow and the execution plane: a recommendation is put to the owner as a question.
- [ ] `pnpm verify --audits` passes (known drift only), and `.pi/NOW.md` is updated.

## Stop and ask if

- the evidence contradicts ADR-0016's forms or rules decision;
- keeping any engine would need a database migration or a change to a running service.

## Report

At most five bullets: the findings per job, the recommendation, and the owner's decision needed.
