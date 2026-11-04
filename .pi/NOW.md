# NOW: where the work stands (2026-11-03)

## Active task

**One ordered queue (owner, 2026-11-03) — no parallel work.** Every agent (Claude, Codex, others) follows §6a of [the execution plan](../docs/plans/master-data-foundation-execution-plan.md), one card at a time, claiming the single active slot (`config/sdlc-governance.json` → `activeImplementationWorkItems`). Work here, in `~/dev/gigalibs-rounds` on `feat/frontline-suite`. Take-over steps: [hand-over](handoff/MASTER-DATA-FOUNDATION-HANDOFF-2026-11-03.md).
- **Done (item 0):** `38aa9017` on UAT; retest 19/19, bench failing screens 8 → 5, journeys 15 meet, 50/50 read-only e2e (evidence `.pi/work/WI-OI-151.md`).
- **Done (item 1):** WI-OI-152 Master data hub — Built, `pnpm verify` PASS (evidence `.pi/work/WI-OI-152.md`); On UAT after the owner's deploy.
- **Done (item 2):** WI-OI-153 Reference data and workspace profile — Built, `pnpm verify` PASS (evidence `.pi/work/WI-OI-153.md`); On UAT after the owner's deploy and the reference load command.
- **Done (item 3):** WI-OI-160 Relay wiring — Built (slice A, 4c3bb597): relay register and `pnpm audit:relays`; generation moved to WI-OI-156 slice B (owner). Six relays not wired on UAT await the owner's decision (`.pi/work/WI-OI-160.md`).
- **Done (item 4):** WI-OI-156 slice A — master facts (`MASTER_FACT_V1`) from Products (products, units, categories), Inventory (warehouses) and General ledger (accounts); parties are the partner facts. `pnpm verify` PASS; evidence `.pi/work/WI-OI-156.md`. Slot freed; the row stays In Progress (slices B–C are item 10). **Milestone A (items 1–4) is built.**
- **Done (item 4a):** milestone A `bd852946` deployed by the owner (reference sets loaded) and retested: 8 of 8 milestone checks, bench (no new failure), 28 journeys (16 meet), 50/50 read-only e2e; WI-OI-152, 153 and 160 On UAT (evidence `.pi/work/WI-OI-151.md`).
- **All modules consolidated (owner, 2026-11-03):** [`docs/plans/all-modules-completion-plan.md`](../docs/plans/all-modules-completion-plan.md) — module register, corrections to the Codex and Cursor assessments, mobile scope per module, completion stages C1–C11; new cards WI-OI-167–175 in the queue; hand-over [`ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md`](handoff/ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md).
- **Done (item 5):** WI-OI-167 Workforce scope completion — Built, `pnpm verify` PASS (evidence `.pi/work/WI-OI-167.md`); deploy and Security review pending.
- **Done (item 6):** WI-OI-168 status truth on UAT — Built (evidence and owner list `.pi/work/WI-OI-168.md`).
- **Done (item 7):** WI-OI-163 Record-level available actions — Built, `pnpm verify` PASS (evidence `.pi/work/WI-OI-163.md`).
- **Done (item 8):** WI-OI-169 A booked technician can execute the work order — Built, `pnpm verify` PASS (evidence `.pi/work/WI-OI-169.md`).
- **Deployed (owner, 2026-11-04):** release `ef8d7dad` on UAT 5180 (WI-OI-167, 163, 169, 164 server side; Workforce migration 30, CMMS 34). Read-only retest and the independent Security review still to do.
- **Done (item 9a):** **WI-OI-176 Reference data viewer** — **Built**, `pnpm verify` PASS (2026-11-04, `.pi/work/WI-OI-176.md`); On UAT after owner deploy + journey checks.
- **Now (item 11):** **WI-OI-154** packs — **In Progress** (format slice started, `.pi/work/WI-OI-154.md`). **WI-OI-165** — agent prep done; **you** run 11 device journeys when testing (matrix in `.pi/work/WI-OI-165.md`). **WI-OI-164** — Built pending deploy + device proof. **Not agent-done:** `ef8d7dad` retest + Security review.
- Cards WI-OI-152–166 (163–166 from the mobile atlas review: record-level actions, mobile CMMS work, frontline device proof, request → several work orders); ADR-0037–0040 (0037 now also makes Inventory the owner of stock).
- **Priority closure (owner, 2026-11-04):** full tier list P0–P4 in [`.pi/PRIORITY_CLOSURE_PLAN_2026-11-04.md`](PRIORITY_CLOSURE_PLAN_2026-11-04.md). Nothing is **Done** without owner acceptance; Wave 0 = Security + retest + decisions on relays, Workflow Studio, WI-OI-131.

## Open decisions (unblocks Wave 0)

1. Six relays on UAT — wire now, defer, or partial? (WI-OI-160)
2. Workflow Studio — start stack or hide four screens? (QA-009)
3. WI-OI-131 Analytics — queue-only, merge, or park?
4. Active slot — stay on WI-OI-164 until device proof, or move to WI-OI-176?

## Status of everything on UAT (WI-OI-168, 2026-11-03)

- **Release on UAT:** `bd852946` (milestone A), deployed by the owner 2026-11-03. All ten app services healthy, no
  errors in their logs; 136 screens load, 5 with failing calls, all known: four Workflows screens (QA-009, Workflow
  Studio not in the stack — owner decision) and Settings › General's configured-field manifest 404 (QA-011).
- **Running and checked read-only, waiting for journeys and the owner's acceptance:** the iDempiere modules
  WI-OI-122–129, IoT WI-OI-130, the frontline suite WI-OI-133–143 (device proof is WI-OI-165), the console WI-OI-145,
  CMMS M-CM1 (journey `jsjmyx` re-run and five owner ticks, `.pi/tasks/PHASE-1-CM1-CHECKLIST.md`). Rows say On UAT with
  the release. **No deploy is waiting** for any of them.
- **Owner list:** `.pi/work/WI-OI-168.md` (what to accept, what to check, the relay-health command to run).
- **Built, not yet deployed:** WI-OI-167 Workforce scope (in the next deploy, with its Security review).
- **Module register and order of everything else:** `docs/plans/all-modules-completion-plan.md`.
- **History:** the sections that were here are in `.pi/archive/NOW-history-before-2026-11-03.md`.
