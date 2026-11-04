# Prompt for the next agent (Codex or Cursor), 2026-11-04

Paste this as the first message.

---

You are continuing GigaLibs work that Claude stopped on 2026-11-04. Work only in `~/dev/gigalibs-rounds` (branch
`feat/frontline-suite`) and, for app code, `~/dev/gigalibs_mobile` (branch `main`). Never edit `~/dev/gigalibs` (other
sessions' uncommitted work) and never deploy or write to UAT (`http://127.0.0.1:5180` is production; the owner deploys).

1. Read, in order: `AGENTS.md`; `.pi/handoff/ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md` ("Start here" first, then
   "Mistakes that earlier assessments made"); `.pi/NOW.md`; §6a of
   `docs/plans/master-data-foundation-execution-plan.md`; `.pi/tasks/WI-OI-164.md` and `.pi/work/WI-OI-164.md`.
2. The active slot (`config/sdlc-governance.json` → `activeImplementationWorkItems`) holds WI-OI-164; its owner
   stopped. Put your name in its row in `.pi/WORK_ITEMS.md` and continue its "Remaining" list in order. Item 1 (server
   form manifests for task capture) is a proposal for the owner before you build it.
3. One card at a time. Finish each with `pnpm verify` green, the compiled app modules loading under Node, `next build`
   for web changes, the mobile repository's `pnpm lint`, `pnpm typecheck`, `pnpm test` and
   `pnpm validate:architecture` for app changes, evidence in `.pi/work/WI-OI-NNN.md`, the row and `.pi/NOW.md`
   updated, and the id out of the slot before claiming the next item.
4. Commit only when the owner says "commit". End every report with one clear next step for the owner.
