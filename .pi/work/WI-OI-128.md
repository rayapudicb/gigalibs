# WI-OI-128 Returns / RMA — evidence

**Status:** In progress (Module 6 build); S6 PG proof added 2026-10-29.

## Slices

| Slice | Evidence |
|-------|----------|
| S1 | Migration 000002 RMA domain; `assertReturnQuantityWithinInvoiced` in contracts |
| S2 | DocAction submit/authorize; migration 000003 |
| S3 | Disposition + inventory handshake; migration 000004 |
| S4 | Outbox relay migration 000005; Orders + Finance inboxes; commit `b327c343` |
| S5 | `@gigalibs/universal-returns-web` `ReturnsRmaWorkspace` (checklist, disposition, credit modal) |
| S6 | `rma-scrap-credit.integration.test.ts` gated `UNIVERSAL_RETURNS_PG_PROOF=1` |

## Verification (agent, 2026-10-29)

- Returns web checklist unit tests: 2/2
- workflow-platform typecheck: pass
- PG proof: **3/3** on throwaway PostgreSQL 16 (`UNIVERSAL_RETURNS_PG_PROOF=1`, 2026-10-29)

## Open

- Full `pnpm verify` clean (pre-existing repo failures)
- Module-completion commit after owner review
- `--live` conformance on owner batch deploy with relay credentials
