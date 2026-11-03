# WI-OI-163: Record-level available actions — one answer for web and mobile

- **Status:** Approved (owner, 2026-11-03: "add this into the existing list"). Order: `docs/plans/master-data-foundation-execution-plan.md` §6 "The one ordered queue". Start only when this card is
  the first unfinished item and the active slot (`config/sdlc-governance.json` `activeImplementationWorkItems`) is free.
- **Work item:** WI-OI-163. Evidence goes in `.pi/work/WI-OI-163.md`.
- **Size:** M. **Decisions:** ADR-0040 (the action half of model-first entities); `gigalibs_mobile`
  `docs/architecture/UNIFIED_ACCESS_STATUS_ACTION_MODEL.md` step 2.

## Goal

For any record, the platform answers "which actions may this person take now, and if not, why" from the same rules the
command uses — permission and its scope, the record's state and version, the assignee, separation of duties and safety
interlocks — so the web screen and the phone show the same buttons and the command still re-checks everything.

## Scope

- **May change:** `packages/module-sdk/src/record-dispatcher.ts` and `record-controller.ts` (an optional
  `availableActions` per adapter action: `offer(principal, record)` returning offered or a blocked reason code);
  contracts for the answer (`packages/contracts`, additive); `MetadataWindow` showing only offered actions and the
  blocked reason; CMMS work orders first (`modules/physical-operations-cmms/apps/api/src/work-orders/`: start, hold,
  resume, complete, cancel, sign-off, using `CMMS_WORK_ORDER_TRANSITIONS` and the existing guards); tests.
- **Must not change:** command authorization (commands keep every check; an offer is never authority). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Steps

1. Contract: `RecordActionOfferV1` (action key, offered, reason code, required inputs) on record detail answers.
2. Dispatcher: computes offers from each action's permission (with scope) plus the adapter's `offer()`; actions
   without `offer()` are offered on permission alone, as today.
3. CMMS work orders: `offer()` mirrors the service guards (transition table, assignee for execute-own, permit
   interlock, completer cannot sign off, version).
4. Web: `MetadataWindow` hides actions that are not offered and shows the reason on the record.
5. Tests prove offer and command agree for each guard, including revoked permission and the maker-checker case.

## Done when

- [ ] For a completed work order, the completer is not offered sign-off and another supervisor is; both web and the
      record API say so with the same reason code
- [ ] Every CMMS work-order command still refuses what it refused before (existing tests unchanged)
- [ ] `pnpm verify` passes; compiled CMMS app module loads under Node
- [ ] Evidence in `.pi/work/WI-OI-163.md`; `.pi/NOW.md` updated

## Stop and ask if

- a guard cannot be computed without side effects, or a module needs offers that differ by channel (web vs mobile).

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
