# Owner development rhythm (2026-10-19)

Recorded from owner instruction in Cursor session (same date).

## Decisions

1. **Table 1 audit before T3 (WI-OI-120ad).** Execute [TABLE-1-AUDIT-PROMPT-2026-10-18.md](handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md) Phase A–B; backlog drives next implementation slices.
2. **Local compose is the day-to-day runtime.** Use `configuration-local-development-v1` (`infra/compose`, web on `http://127.0.0.1:5180` per `.env.example`) for build/run/journey checks. Re-run when needed; no standing requirement for owner-timed UAT deploy before every slice.
3. **Autonomous execution on Table 1 backlog** after Phase B cards exist: agents may implement without asking again on each card, unless Stop-and-ask triggers in the card fire (tenancy, migrations, secrets, CMMS import/export, financial posting).
4. **Batch delivery (owner, 2026-10-19):** finish a **phase or wave chunk** of implementation first; **commit and `pnpm verify` are optional until that chunk is done**, not after every card. Update `.pi/NOW.md` at chunk boundaries. Owner says **commit** when they want git; agents do not pause for commit/verify between every WI unless a card’s Stop-and-ask fires.
5. **What this does not waive:** `AGENTS.md` zero-mock and real-persistence rules; `pnpm verify` on product changes; independent Security review before **production** release; `.pi/WORK_ITEMS.md` **Done** only with recorded acceptance evidence (local journey + tests count as evidence for iteration, not as owner **Done** unless the owner ticks the checklist).

## What agents should do instead of UAT deploy gates

| Old habit | New habit |
|-----------|-----------|
| Wait for owner UAT deploy to start next slice | `docker compose` local profile up; fix profile audit violations when they block the image |
| Block on owner journey password session | Owner sets `E2E_JOURNEY_PASSWORD` in `e2e/uat.env` once; agents run journey against local origin when env present |
| Ask owner to choose every next card | Follow Table 1 backlog order in [work/TABLE-1-AUDIT-2026-10-19.md](work/TABLE-1-AUDIT-2026-10-19.md) §5 |

## Still owner-only

Production UAT deploy (`deploy-uat.sh --deploy`), backup/rollback, MFA/password rotation, and marking work items **Done** on the Phase 1 checklist.
