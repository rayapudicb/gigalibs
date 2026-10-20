# WI-OI-120bv: SPEED S7a — `actionList` and `stage2Plan` in the engine package

- **Status:** Built, committed `0834520c` on its branch (owner, 2026-10-21: "Keep SPEED moving"; "commit"). Implementer: Claude Code, in the S1 worktree
  `/Users/rayapudi/dev/gigalibs-speed-s1`, branch `feat/speed-s1-engines` (adds to `68be9379`).
- **Work item:** WI-OI-120bn, the engine half of slice S7 (plan v1.4); screen spec §2.4 (dossier) and §4.4.
- **Size:** S.

## Scope

Two pure functions in `packages/process-safety-engines`:

- `actionList(steps, decisions, library, criteria)` — the dossier's "actions before kilo-lab": Critical, Review and
  Data gap actions, each with a code, the BRD rule it enforces and parameters; no text.
- `stage2Plan(steps)` — the Stage 2 test plan: target, test code and reason code per step, de-duplicated.

Ported from the mock's `buildActions` and `stage2Plan`, with three corrections:

1. documented controls and accepted mitigations are inputs (they are records, not engine results);
2. an interaction's Stage 2 test comes from the library rule (`recommendedTest`), replacing the mock's hard-coded
   `R-01`/`R-02` "DMSO with acid or base";
3. an entered TD24 is not a data gap; only a missing, conservative or out-of-range one is.

One alignment with the mock found while testing: an OB "Review" for a tagged energetic group outside the band also
gets DSC in the Stage 2 plan (the mock does this for every "Review"); the action carries `basis` so the text can say
which.

## Done when

- [x] Tests for every rule (gate failing, OB High and in band, Stoessel 3 and 4–5 with and without an accepted
      mitigation, High and Medium interactions with and without a control, ΔHr estimate, TD24 conservative, missing and
      out of range, gases, unreviewed library, criteria gap, de-duplication), on the reference route.
      `test/actions.test.ts`: 10 tests; the package has 50, all passing.
- [x] Coverage stays ≥ 90 %; `tsc` clean; `ENGINE_VERSION` raised. Lines 98.94 %, branches 93.96 %, `actions.ts`
      99.42 %; typecheck and build exit 0; `ENGINE_VERSION` `process-safety-engines 0.2.0`. The package is now
      Biome-clean (formatting and import order only; it was not before).
- [x] Screen spec §4.4 lists the final codes, and new §4.5 the Stage 2 reason, target and test codes (spec v1.1,
      Word file rebuilt; not rendered, as LibreOffice is not installed). §4.5 requires the S6 library import to reject
      a `recommendedTest` outside the catalogue.
- [x] Commit on its branch when the owner says "commit": `0834520c` on `feat/speed-s1-engines`.
