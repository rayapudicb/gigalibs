# WI-OI-120hn (T1b): one worker record — WFO reconciliation

- **Status:** Done (investigation, 2026-10-24) — reconciliation is moot; no WFO worker records exist to map.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.4). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Prove that no WorkforceOps (WFO) worker is left unmapped as Workforce becomes the one worker record.

## Finding (2026-10-24)

The WFO stack (WI-WFO-001…006) was **retired in WI-OI-120u Slice 3 (2026-10-13)**; its screens are gone and its
capabilities are re-homed (bulk invitations → R14, contracts → eSignature, expenses → M-SPEND, vendors → T4,
forecast/shifts/compliance/pay → M-WF3). The 13 `wfo_*` tables remain in `gigalibs_workforce` but are **empty**:
`wfo_workers` has **0 rows** (plan v3 line 428; `.pi/work/WI-OI-120.md` line 3057). So there is nothing to
reconcile — no WFO worker exists that must map onto a `workforce_resources` person.

The only live concern is schema hygiene: the WFO migrations (000020–000025) are inconsistent across environments
(the `000026_wfo_ledger_repair` note in `.pi/work/WI-OI-120.md`), but that is a migration-ledger matter, not a
data-reconciliation gap, and does not block Phase 2.

## Decision

No reconciliation build is required. `workforce_resources` is already the single worker record; the empty `wfo_*`
tables carry no workers to migrate. Dropping the empty `wfo_*` tables is deferred to the migration-ledger cleanup
(it is not a Phase 2 blocker and must be a careful forward migration, not done here).

## Done when

- [x] Confirmed `wfo_workers` is empty and the WFO screens are retired (no unmapped worker can exist).
- [x] Recorded that reconciliation is moot; no code required for Phase 2.
- [ ] (Later) empty `wfo_*` tables dropped as part of the migration-ledger cleanup.
