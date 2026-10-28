# GigaLibs project instructions

## Product boundary

GigaLibs is an operational-intelligence and action platform. The active production candidate is the
Next.js workflow experience, the NestJS control plane, the modules and the explicitly active shared
packages. The FastAPI execution plane is parked (ADR-0016 F12). A package name, compiled artifact, prototype screen, or passing unit test is not production
certification.

Never claim that the full platform, an industry pack, a quarantined package, or an external production
deployment is complete without the evidence required by the SDLC and module-completeness gates.

## Delivery phases (owner decision, 2026-10-22)

All remaining work follows a strict three-phase pattern. **No exceptions. Codex, Cursor, and all agents follow this.**

### Phase 1 — BUILD (current phase for each unbuilt module)

- Build the **entire module** end-to-end before stopping.
- No partial commits, no mid-module reviews, no UAT deploys.
- `pnpm verify` must pass (no new failures) before the module is considered built.
- **Commit rule:** the agent commits once the full module is complete and `pnpm verify` is clean.
  No "commit" command from the owner is needed to trigger a module-completion commit.
  The owner reviews commits asynchronously. The owner still says "commit" for anything that is
  NOT a module-completion commit (docs, fixes mid-session, etc.).
- Report to the owner: what was built, the verify result, and the deploy sequence position of this module.

### Phase 2 — UAT (after a module is fully built)

- Owner runs one deploy per module group, in the sequence order below.
- One journey proof after each deploy. Owner accepts → status becomes Done.
- Agents do not deploy. The release worktree rule applies to every deploy.

### Phase 3 — REVIEW (after UAT deploy — non-blocking for next build)

- Security review happens on UAT after the deploy, not before (owner decision, 2026-10-22).
- Agent fixes any findings found on UAT. Findings do not block the next module's build.
- F2.9 (accountant sign-off on Finance relay): owner functional acceptance on UAT is sufficient.
  Formal accountant review is deferred and non-blocking — it does not gate any deploy.

### Deploy sequence (fixed order — do not reorder)

**Owner override, 2026-10-28, limited to the seven iDempiere-reference modules:** build F0 and Modules 1–7 in
dependency order without UAT pauses. Commit each complete module after clean verification. The owner deploys all
seven together once from a release worktree and accepts each module journey afterward. See WI-OI-122–129 and
`docs/plans/idempiere-parity-modules-plan.md`. This override does not authorize an agent deploy or change the
remaining groups' order.

| # | Group | Modules | Notes |
|---|-------|---------|-------|
| 1 | CMMS M-CM1 | Work orders, parts, assets, unit scope | Current — finish first |
| 2 | Mobile BFF | v1 BFF, mobile app logout, LAN profile | Parallel to CMMS |
| 3 | Orders + Procurement + Inventory | M-ORD, M-PROC, M-INV1 | Build and deploy together |
| 4 | AR + Finance relay | M-AR0, Table 2 (F0–F2.8) | Fix B2–B7 blockers first |
| 5 | Workforce | M-WF1, M-WF2, M-WF3 | |
| 6 | Geospatial | T3, M-GEO | |
| 7 | Analytics | M-ANA, Connector Hub full | |
| 8 | AI Companion | GU1–GU7 | |
| 9 | Communications | M-COMM / Textfly | |
| 10 | SPEED production cert | Process safety module | Already on UAT as prototype |
| 11 | Advanced Finance | M-FIN1, M-TRE, M-FA, M-COST, M-BUD, M-CONS, M-CLOSE | Build last — lightweight virtual ledger; owner to confirm exact scope before build starts |
| 12 | Industry packs | Manufacturing, Pharma, Agriculture, Sports, Healthcare | After all modules certified |

### Module completion gate (what "fully built" means)

A module is complete when ALL of the following are true:
- `pnpm verify` passes with no new failures.
- Every sub-task in the module's card is done.
- All persistence uses real databases — no mocks, no fixtures, no hard-coded data.
- Migrations are present with verification and a roll-forward plan.
- Tests cover all happy paths and key failure paths.
- No embedded credentials, no default tenants, no local-only business state.

---

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
   changed, the evidence, what's next, and what the owner must decide.
6. Commit rule: commit once the **full module** is built and `pnpm verify` is clean (Phase 1 completion).
   For all other commits (fixes, docs), wait for the owner to say "commit".

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
- The canonical status is `.pi/WORK_ITEMS.md`; chat statements do not change it. Statuses follow evidence (plan v3
  rule 8): Built, On UAT, Done (with the owner's recorded acceptance), Replaced; `pnpm audit:sdlc` checks each claim.
- **UAT is production** (owner, 2026-10-15, plan v3 decision 0.7a): plan v3's Done checklist (§2) on UAT replaces the
  separate G5–G7 gates. The owner runs every deploy, and an independent Security review precedes each one.
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
