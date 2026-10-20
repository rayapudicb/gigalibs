# WI-OI-120br: SPEED S1 — the process-safety engine package

- **Status:** Built and committed 2026-10-20 as `68be9379` on branch `feat/speed-s1-engines` (owner: "start S1", "commit S1"); not merged, not pushed. Implementer: Claude Code, in its own worktree
  `/Users/rayapudi/dev/gigalibs-speed-s1`, branch `feat/speed-s1-engines` (from `1b2df602`), so it never touches the
  main worktree where Cursor is the writer.
- **Work item:** WI-OI-120bn (SPEED Stage 1), slice S1 of `docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md`.
- **Size:** M.

## Scope

- **Adds:** `packages/process-safety-engines` (pure TypeScript, no I/O) and its classification as module-owned
  (`config/package-layers.json`, `process-safety-screening`).
- **Changes nothing else.** No module, migration, Docker image, compose file or UAT.

## What the package does (BRD §15, BP-01 §4)

Formula parsing (brackets, hydrates), molar mass, Hill formula; the mole-balance gate and the reaction extent; oxygen
balance; ΔHr by manual value, reaction class or Hess's law; Q, q′, ΔTad, MTSR (actual and 100 %); decomposition
rate, TMRad, TD24 by bisection or the conservative onset rule; the Stoessel class; severity and probability; gas
evolution; the interaction screener; AE, RME, yield, PMI, E-factor (with and without water), solvent intensity; the
route roll-up; input-range validation (§15.1).

## Rules

- **Every function is `f(inputs, criteria, library, elements) → outputs`.** Thresholds, input ranges, the OB alert
  band, severity and probability cut-offs, the TD24 search range and conservative offset, and the balance tolerance
  are a versioned, cited **criteria** object. Library entries (material classes, pair rules, reaction-class ΔHr,
  ΔHf°, gases) are a versioned **library** object. A missing criterion gives `DATA_GAP` naming it; there is no default.
- **Atomic weights** are a versioned, cited element table; the only constants are physical (gas constant, molar
  volume, 0 °C in kelvin) and definitional (TD24 = 24 h).
- **No display text.** Results carry codes and parameters (with the BRD requirement ID); the UI translates them.
- **Unreviewed library entries are flagged** on every result that uses one.
- **Test data stays in tests.** The reference route's charges (TC-12) are illustrative and live only under `test/`.

## Done when

- [x] TC-01 to TC-12 pass (test names carry the IDs).
- [x] Property tests: element balance conserved; PMI = E-factor + 1; TMRad strictly decreasing with temperature;
      extent scales linearly with the charge; a missing criterion never yields a number (300 seeded runs each).
- [x] NFR-03: all engines over a 15-step route in under 1 s (measured ≈ 10 ms).
- [x] Coverage ≥ 90 %: lines 98.48 %, branches 93.02 %, functions 100 % (`pnpm test:coverage` in the package).
- [x] `tsc` clean under the repository's strict settings; `audit:layers` reports nothing from this package (no new
      violation, not unclassified, no stale classification); `audit:production-data` passes.
- [x] Committed `68be9379` on its branch (owner: "commit S1").
- [ ] Rebase on the main branch's tip and merge, when the owner decides (after Cursor's 120bp and 120bq).

## Evidence (2026-10-20, worktree `/Users/rayapudi/dev/gigalibs-speed-s1`, branch `feat/speed-s1-engines`)

```text
 ✓ test/reference-cases.test.ts (12 tests)
 ✓ test/engines.test.ts (23 tests)
 ✓ test/properties.test.ts (5 tests)
      Tests  40 passed (40)
Statements   : 98.48% ( 714/725 )
Branches     : 93.02% ( 360/387 )
Functions    : 100% ( 33/33 )
Lines        : 98.48% ( 714/725 )
```

**TC-12 baseline source.** The BRD's route figures (PMI ≈ 104, AE 29.1 %, yield 45.8 %) come from the prototype the
BRD was computed with. Its charge lists are in the owner's `SPEED_Desk_Screening_Dossier.docx`, and the test fixture
uses them, cited. The later HTML mock used different illustrative charges (PMI 65, yield 47.8 %), so the mock is not
the baseline.

**Lockfile.** Besides the new package, pnpm re-keyed Prisma's entries with the optional peer `magicast@0.3.5` brought
in by `@vitest/coverage-v8`. Every version is unchanged (Prisma 6.19.3).

## Review items before release (not blockers for S1)

- `cheminformatics_specialist`: check the element table against the IUPAC 2021 source.
- `process_safety_specialist`: every library entry and criterion value used by the product (the test fixtures are
  not the product library).
