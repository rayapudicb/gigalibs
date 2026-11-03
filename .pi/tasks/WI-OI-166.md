# WI-OI-166: One service request, several work orders

- **Status:** Proposed — approved in the queue (owner, 2026-11-03); confirm this card with the owner before it starts.
  Order: `docs/plans/master-data-foundation-execution-plan.md` §6 "The one ordered queue". Start only when this card is
  the first unfinished item and the active slot (`config/sdlc-governance.json` `activeImplementationWorkItems`) is free.
- **Work item:** WI-OI-166. Evidence goes in `.pi/work/WI-OI-166.md`.
- **Size:** M.

## Goal

A request that needs several trades, assets or phases becomes several linked work orders; the requester sees one
overall status (awaiting triage, planned, active, partly resolved, resolved, rejected) computed by CMMS.

## Scope

- **May change:** CMMS: an additive request → work order link table (link type, created by, idempotent conversion),
  the conversion command accepting several work orders, the computed request status, web and mobile request views;
  tests. The existing one-to-one `converted_wo_id` stays for compatibility.
- **Must not change:** the work-order lifecycle. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Steps

1. Link table and migration (additive, RLS); backfill one link per converted request.
2. Conversion to one or more work orders; idempotent per request and key.
3. Computed request status and the rule for closing a request with open, cancelled or follow-up work.
4. Screens: request shows its work orders; requester sees the overall status.

## Done when

- [ ] A request converted into three work orders shows "partly resolved" until all are done; replaying the conversion
      creates nothing new
- [ ] `pnpm verify` passes; evidence in `.pi/work/WI-OI-166.md`

## Stop and ask if

- the closing rule for a request with cancelled or follow-up work is not settled.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
