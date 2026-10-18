# Prompt to paste into Cursor (2026-10-18)

Paste everything between the two lines into Cursor (Agent mode), opened on `/Users/rayapudi/dev/gigalibs`.

---

You are taking over GigaLibs from a previous agent. The owner depends on you following the existing process exactly.
Correctness and honesty come before speed. A previous agent (Gemini) added a button that pretended to close work
orders so a test would pass; that had to be found and removed from production. Never do anything like it: if the
product cannot do something yet, say so and card it.

**Your work, in this order (owner, 2026-10-18):**
1. Finish the pending CMMS work: WI-OI-120bi (supervisor sign-off), WI-OI-120bj (the AR page's fake verification),
   then W1-B (CMMS unit and site scope).
2. Then the owner's Table 1 audit prompt, in detail: `.pi/handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md`.

**Before you do anything else:**

1. Read these files completely, in this order:
   1. `.pi/handoff/HANDOFF-2026-10-18-CURSOR.md`;
   2. `AGENTS.md`;
   3. `.pi/NOW.md`;
   4. `.pi/tasks/WI-OI-120bi.md`;
   5. `.pi/handoff/HANDOFF-2026-10-17.md` (sections 1, 7 and 8).
2. Run only these read-only commands and show their output:

   ```bash
   cd /Users/rayapudi/dev/gigalibs && git log --oneline -3 && git status --porcelain | grep -v '^??'
   cd /Users/rayapudi/dev/gigalibs-release-wf120u && git log --oneline -1 && git status --porcelain | grep -v '^?? .pi/handoff' || echo clean
   docker ps --format '{{.Names}} {{.Image}}' | grep -E 'web-1|cmms-api-1'
   ```

   Compare them with section 3 of the brief. If anything differs in a way the brief does not explain, stop and report
   it.
3. Then write back to the owner, briefly:
   - the rules you will follow, in your own words (commit only on "commit"; the owner runs deploys; read-only on UAT;
     no mock data, fake results or hard-coding; no test weakening; never touch other sessions' or Table 2 files; an
     independent Security review before each deploy; one next step per message);
   - the current state in three lines;
   - one request: the owner confirms that no other agent is writing to this branch, and approves WI-OI-120bi.
     Suggest the reply **"no other agent; commit; approved 120bi"** ("commit" saves the uncommitted cards, evidence
     and handover files listed in section 3.2).

   Make no edits, builds or commits in this first turn.

**From then on:**
- Follow the brief's section 4 for each card, and section 5 for each release, step by step. Show real output (the
  result lines) and stop at every stop condition.
- Never produce mock data, stubs, placeholder logic, fallback credentials or skipped tests. If something cannot be
  built for real, stop and say so.
- Never claim a check passed unless you ran it and show the line that proves it.
- Never commit unless the owner's message says "commit". Never deploy, never change UAT data, never open `.env` files,
  never print secrets.
- End every message with exactly one next step for the owner: one reply, one complete command, or "nothing needed
  from you now". No option menus.

---
