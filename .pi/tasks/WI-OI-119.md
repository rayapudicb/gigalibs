# WI-OI-119: Production-readiness audit, status truth and remediation backlog

- **Status:** Review (audit delivered 2026-10-05; approved by the owner 2026-10-04)
- **Work item:** WI-OI-119 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in
  `.pi/work/WI-OI-119.md`; deliverables in `docs/audits/2026-10-04-production-readiness/`.
- **Size:** L (read-only audit + governance-document corrections; no product code)

## Goal

Establish, from the code and the running system rather than from claims, what every in-scope work item actually
delivers. Give each WI a verdict, correct status drift in the governance files, and produce a prioritized,
card-sized remediation backlog. The release verdict stays **NO-GO**.

## Scope

- **In scope (audited): the whole production candidate, not one WI.** All 23 committed modules
  (`modules/*/module.yaml`), all 106 web pages and 91 BFF route handlers in `apps/workflow-platform`, all 182
  committed NestJS controllers, all 197 committed migrations, shared packages marked active, generated files with
  their sources, deployment files, and every WI row in `.pi/WORK_ITEMS.md` (114). Deep business review covers the
  foundation/release WIs (003–010, 013, 019/035/040, 039, 079, 103/105/106), Wave 0 (080–085) and all phases
  (109–112, 091–095, 113–118), including every file changed in the 14 phase commits `917141a` … `10bbfba`.
  Frozen WIs get a verdict but no remediation unless D1/D2 bring them into the release.
- **Inventoried only (not certified):** the parked FastAPI plane (ADR-0016 F12), quarantined packages, untracked
  modules, demos, ZIPs and `scratch/`.
- **May change:** `.pi/tasks/WI-OI-119.md`, `.pi/work/WI-OI-119.md`,
  `docs/audits/2026-10-04-production-readiness/**`, `.pi/NOW.md`. Status, gate and evidence text in
  `.pi/WORK_ITEMS.md`, `.pi/tasks/WI-OI-*.md`, `.pi/work/WI-OI-*.md` and `config/sdlc-governance.json` may change,
  but only to downgrade or correct claims the evidence does not support. Nothing may be upgraded.
- **Must not change:** any product source, test, migration, manifest, generated file, deployment file or
  `pnpm-workspace.yaml`; the running services, the local databases, or the web on 5180; untracked/protected material
  (`Claude outputs/`, `modules/communications-textfly/`, `modules/platform-rbac/`, the two untracked migrations
  `20260923590000_*` and `20261002000000_*`, `packages/db-migrations-runtime/*.mjs`,
  `packages/db/src/control-migration-policy.test.ts`, `scratch/`, the invoicing-demo folders/ZIP, the untracked
  docs/spec/plan files). Never, on any card: the CMMS import/export files, another agent's work, secrets.

## Read first

`AGENTS.md`; `.pi/NOW.md`; this card; the relevant rows of `.pi/WORK_ITEMS.md`; `docs/SDLC_DEVELOPMENT_GUIDE.md`
(gates, DoD); `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`; `docs/plans/gigaops-convergence-roadmap.md`
§2; `docs/plans/gigalibs-go-live-plan.md`; `docs/plans/audit-remediation-implementation-plan.md`;
`docs/runtime-quarantine.md`; ADR-0013, ADR-0016, ADR-0024/0026, ADR-0030–0032; each audited module's `module.yaml`.

## Steps

1. Add the WI-OI-119 row (`In Progress`, SDLC Orchestrator, reviewers Product / Architecture / Security / QA).
2. Run four **read-only** auditors in parallel (no edits; findings must cite `file:line`, a command or a query):
   - **P1 Product/WI:** phase/WI matrix, canonical-status drift, dependencies, release ordering, business outcome
     and CEO verdict per WI (deliverables A, B, L-draft).
   - **P2 Frontend/user-flow:** every route/control/state, static/sample/default data, dead controls,
     accessibility states (D, G).
   - **P3 Backend/data/integration:** controllers → services → transactions → tables/RLS → outbox/inbox →
     consumers; event-contract drift; budget, period-lock and costing integration; authority conflicts
     (Orders vs AR invoices, CMMS vs Inventory, CMMS vs Fixed Assets) (C, E, F, H, J).
   - **P4 Security/ops/release:** IAM/tenancy/object-auth, secrets, observability, SLOs, backup/restore, image
     vs commit, SBOM/provenance, G5–G7 evidence (I, K).
3. Primary agent re-verifies every P0/P1 finding before it is recorded. Unverified findings are marked PLAUSIBLE.
4. Read-only runtime checks: running image tags vs commits; whether the untracked migrations are recorded in
   the local migration tables (SELECT only); `pnpm verify` with the untracked workspace members noted.
5. Write deliverables A–L. Correct status drift (downgrades/corrections only) and record every change in the
   evidence file.
6. Draft remediation cards R1…Rn in dependency order (first: status/containment of production-reachable
   static workspaces). Show R1 only. Do not start it.

## Done when

- [ ] Every in-scope WI has a verdict (Ship / Conditional Ship / Return for Remediation / Contain / Stop
  Investment), a truthful gate, and its missing evidence
- [ ] Deliverables A–L exist; every P0/P1 has `file:line` or command evidence, an owner role, a containment and a
  target card
- [ ] Known leads A–P from the owner's brief are each reproduced, refuted, or marked not reproducible, with evidence
- [ ] Status contradictions in `.pi/` and `config/sdlc-governance.json` are corrected (downgrade only) and listed
- [ ] `pnpm verify --audits` passes, or reports only the known `WORKFORCE_API_URL` drift
- [ ] Evidence is recorded in `.pi/work/WI-OI-119.md`, and `.pi/NOW.md` is updated
- [ ] Remediation card R1 is drafted and shown, not started

## Stop and ask if

- a step would write to a running service, a database or owner data, or would restart/redeploy anything;
- the release scope (decision D1 below) changes which WIs can be certified;
- a protected untracked file appears to be part of a committed WI's runtime.

## Owner decisions needed (they do not block the audit; they block certification order)

- **D1 Release scope.** Your 2026-09-28 decision sets Release 1 = core + CMMS + Workforce + Geospatial +
  manufacturing pack (WI-OI-079). Phases 5–14 sit outside that. Are they in the release being certified now, or
  contained until after Release 1?
- **D2 AR authority.** Order-to-cash needs canonical AR, but WI-OI-019 is frozen (2026-09-28). Unfreeze it, or
  exclude order-to-cash from the claimed release.
- **D3 Mobile (WI-OI-084).** Required for this release, or excluded and kept inaccessible?
- **D4 Untracked material.** Ownership/disposition of the protected items above (the two 2026-10-02 migrations
  first).

## Report

At most five bullets: verdict counts, P0/P1 counts, status corrections made, R1 summary, owner decisions.
