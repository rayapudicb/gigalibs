# Cursor: after WI-OI-120bp, implement WI-OI-120bq (2026-10-20)

You stay the only implementation writer. Finish WI-OI-120bp first and report it. Then do WI-OI-120bq, which makes
Table 2 releasable. Claude Code re-reviews both before anything is released.

## Two items to fold into WI-OI-120bp now

1. Finance migration 12 must `REVOKE EXECUTE ON FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(...)
   FROM PUBLIC` and `GRANT EXECUTE` on it to `gigalibs_finance_runtime` only, in the same migration, with a test.
2. Your posting-outcome event must be written in the same transaction as the journal, so `ingestReceiptLayer` must run
   on the inbox transaction's client. Test: a failure on line 2 leaves no journal and no cost layer from line 1.

## Then WI-OI-120bq

1. Read `.pi/work/TABLE-2-SECURITY-REVIEW-2026-10-20.md` and `.pi/tasks/WI-OI-120bq.md` in full. The card's Fixes
   table is the specification: H1, H2, H3, M1, M2, M3, L1, L2, L3, each with a test that fails before and passes after.
2. **Every hard rule in `.pi/handoff/PROMPT-2026-10-20-CURSOR-120bp.md` still applies.** In short:
   - nothing against UAT;
   - only the `gigalibs-test` stack, reset by explicit names;
   - no manual SQL;
   - no literal secrets, and no opening `.env*` or `e2e/*.env`;
   - forward-only migrations (Finance 1 and Inventory 2 are on UAT);
   - no layer-baseline growth;
   - no edits while a build runs;
   - other sessions' files untouched;
   - no commit, push or deploy.
3. **No hard-coding.** No `'USD'`, no exchange-rate literal, no fallback cost. A missing standard cost rejects the
   posting with `FINANCE_STANDARD_COST_MISSING`, and the retry endpoint fixes it once the cost exists.
4. **M3 must not become a new cross-module read.** If the cut-off event cannot be built cleanly, stop and write the
   question on the card.
5. **Stop and ask** at any decision the card does not settle. Write the question on the card.

## Report back

Report the same way as for 120bp: files changed; `pnpm verify` summary lines; each finding's test (name, red before,
green after); the stack proof on a fresh database (two products at different costs, rejected then retried then period
closed, P2P/O2C and F2.7 green); the container list; `docker inspect gigalibs-postgres` unchanged. Card status
**Built**, never Done.
