# GigaLibs project instructions

## Product boundary

GigaLibs is an operational-intelligence and action platform. The active production candidate is the
Next.js workflow experience, the NestJS control plane, the modules and the explicitly active shared
packages. The FastAPI execution plane is parked (ADR-0016 F12). A package name, compiled artifact, prototype screen, or passing unit test is not production
certification.

Never claim that the full platform, an industry pack, a quarantined package, or an external production
deployment is complete without the evidence required by the SDLC and module-completeness gates.

## Every session: start here

Work in short, focused sessions. The owner starts a fresh session for each task and may just say "next".

1. Read `.pi/NOW.md` first: one page with the state, the next task and the open decisions. Then read the task card
   it points to in `.pi/tasks/`. Read other documents only where the task touches them.
2. If the owner asks for something new, write a task card from `.pi/tasks/TEMPLATE.md`, show it, and wait for
   the owner's OK before changing product code.
3. Stay inside the card's scope. At a decision that the card, the vision or the owner has not settled, stop and ask.
4. Keep context small:
   - search for the lines you need (`rg`, `grep`, `sed -n`) instead of reading whole files;
   - in `.pi/WORK_ITEMS.md`, read only your item's row;
   - show only the tail of long command output;
   - verify with `pnpm verify`, which prints one line per step and the path of the full log.
5. Finish by updating `.pi/NOW.md` and the task card's status. Then report in at most five short bullets: what
   changed, the evidence, what's next, and what the owner must decide. Commit only when the owner says "commit".

"next" (or `/next`) means: run steps 1–5 for the task that `.pi/NOW.md` names.

## Mandatory reading order

Before changing product behavior, consult these where the task touches them. Read the relevant sections, not
every file in every session:

1. `.pi/PLAN.md`
2. `.pi/WORK_ITEMS.md`
3. `docs/REQUIREMENTS_BASELINE.md`
4. `docs/SDLC_DEVELOPMENT_GUIDE.md`
5. `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`
6. the relevant `.pi/agents/<role>/AGENT.md`
7. affected ADRs, contracts, migrations, and runbooks

## Delivery rules

- Route every behavior change through the `sdlc_orchestrator` role and a stable `WI-OI-NNN` work item.
- Preserve the blueprint's `FR-01` through `FR-16` IDs and link every story to functional and
  non-functional requirements.
- Trace outcome → requirement → design/ADR → code/migration → tests → release evidence → production
  metric.
- The canonical status is `.pi/WORK_ITEMS.md`; chat statements do not change it.
- A producer cannot be the only reviewer of tenancy, authentication, permissions, secrets, AI, financial
  value, migrations, retention, external actions, or deployment.
- Agents produce implementation and evidence. Named humans retain product acceptance, risk acceptance,
  legal conclusions, and production-release authority.
- No production-reachable mock data, fake provider result, silent fixture fallback, default tenant,
  embedded credential, or local-only business persistence is permitted.
- Test/certification data must be generated in isolated non-production contexts, visibly attributable to
  the test, and excluded from customer value reporting.
- Quarantined packages are source inventory only. Follow `docs/runtime-quarantine.md` before promotion.
- Schema changes require a forward migration, compatibility analysis, migration verification, and a
  roll-forward or recovery plan.
- Provider and external action work requires explicit timeout, retry, idempotency, credential,
  observability, data-classification, failure, and reconciliation behavior.

## Definition of Done

A work item is not Done because code compiles. It must meet the applicable requirements and the complete
Definition of Done in `docs/SDLC_DEVELOPMENT_GUIDE.md`, including real persistence, server-side security,
failure/recovery states, audit/telemetry, migration safety, tests, documentation, and independent review.

## Mandatory verification

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

`pnpm verify` runs all of the above plus `pnpm audit:layers`, the module-manifest check and the deployment-profile
check. It prints one line per step. `pnpm verify --audits` skips build and test, for documentation-only changes.

Run slice-specific integration certifications listed in `.pi/PLAN.md` when their services are available.
