# WI-OI-150 evidence — labels, help, errors and empty-state words

## 2026-11-03

- QA-030: technical "ID" labels renamed in CMMS and Business partners.
- QA-031: help on every required field of the eight windows that had none.
- QA-040: `audit:ui-shell` debt — emoji 81 → 0, developer text 12 → 0 (work-item badges, "Request failed (n)"), hand-made
  tab bars 9 → 3 (`PageTabs` with an optional `idPrefix`); baseline lowered.
`pnpm verify` PASS (2026-11-03).

## 2026-11-03 — retest on `02b3353a`

QA-030 verified (labels with internal ids 10 → 0); QA-031 seven of eight windows verified, Accounting books help added in
branch; QA-040 verified (no emoji on Workflows or Platform Control Tower).
