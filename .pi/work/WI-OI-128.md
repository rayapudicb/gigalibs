# WI-OI-128 Returns / RMA — evidence

**Status:** Built (2026-10-29); commits through **`442fd2f8`**.

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

## Open (non-blocking)

- Full `pnpm verify` may still fail on pre-existing **product-catalogue** lock test; returns-specific gates fixed in working tree (Docker workspace, compose relay codegen, platform-context worst-case slack).
- `--live` conformance on owner batch deploy with relay credentials
