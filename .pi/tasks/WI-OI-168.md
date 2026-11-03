# WI-OI-168: Status truth on UAT — check every module already running there

- **Status:** Approved (owner, 2026-11-03: "add into the next item to work"). Order: queue item 6 in
  `docs/plans/master-data-foundation-execution-plan.md` §6a.
- **Work item:** WI-OI-168. Evidence goes in `.pi/work/WI-OI-168.md`.
- **Size:** M. Read-only: agents never write to UAT (UAT is production).

## Why (evidence, 2026-11-03)

The code of WI-OI-122–130, 134–143, 145 and CMMS M-CM1 (`9eb14717`) is in the release UAT runs (`38aa9017`), yet
their rows say Built and `NOW.md` and two hand-overs still say they wait for a deploy
(`docs/plans/all-modules-completion-plan.md` §2, rows 8–10). Nobody has checked them on UAT, so nobody knows which
work and which fail.

## Goal

Every module running on UAT has a recorded read-only check; each row says what is true (On UAT with its release, or
Built with the named failure); the owner gets one list of what to accept and what to fix.

## Scope

- **May change:** `.pi/WORK_ITEMS.md` statuses and evidence (by evidence only), `.pi/NOW.md` (remove the stale
  deploy instructions), `.pi/work/WI-OI-168.md`, read-only e2e specs under `e2e/specs/` and the bench inventory
  (`e2e/ux-benchmark/`), `docs/plans/all-modules-completion-plan.md` §3 (results).
- **Must not change:** application code (a failure becomes a fix in the module's completion card, or a new card shown
  to the owner); UAT data; the CMMS import/export files; another agent's work; secrets.

## Steps

1. Per module (CMMS and its extensions, Workforce, Places, Products, Inventory with Material ledger, Advanced SCM and
   Landed cost, Procurement, Orders, General ledger, Business partners, Manufacturing, Projects, Returns, Rounds,
   Safety, SPEED, IoT, Analytics, Connections): its screens load (bench), its read APIs answer through the web proxy,
   and `v1/health/relays` answers where the module has relays. Record each result with the release.
2. Run the existing read-only journeys (`.pi/work/WI-OI-151.md` commands) and the CMMS journey `jsjmyx` read-only
   steps; note what needs the owner's write approval.
3. Relabel rows by evidence: On UAT (release `bd852946` or `38aa9017`) where the check passes; keep Built with the
   failure named where it does not. WI-OI-147–149 and 151: move what is verified, list the owner-click items
   (starter loads, "Send to modules again", records for dialogs) as one owner checklist.
4. Remove the stale lines in `NOW.md` (deploy instructions for code already running; the failing-verify notes).
5. Write the owner list: modules ready for acceptance, modules with failures (each with a proposed fix and the
   completion stage it joins).

## Done when

- [ ] Every module in step 1 has a recorded check with the release named
- [ ] Rows relabelled by evidence; `audit:sdlc` green (On UAT rows name a release)
- [ ] `NOW.md` holds no instruction to deploy code that already runs
- [ ] Owner list written in `.pi/work/WI-OI-168.md`; `pnpm verify` green

## Stop and ask if

- a check needs a write on UAT, or a screen exposes another workspace's data (stop; report it as a security finding).

## Report

At most five bullets: how many modules pass, which fail, the owner's acceptance list, and what is next.
