# WI-OI-120bq: ready for independent re-review (2026-10-22)

- **Implementer:** Cursor (uncommitted on `feat/gigaops-convergence-core`).
- **Reviewer:** Claude Code (must not have written this diff). Owner request: re-review **120bq** after Table 2 H1–H3 / M1–M3 fixes.
- **Prior review:** [WI-OI-120bp-REVIEW-2026-10-21.md](WI-OI-120bp-REVIEW-2026-10-21.md) (B1–B7); [TABLE-2-SECURITY-REVIEW-2026-10-20.md](TABLE-2-SECURITY-REVIEW-2026-10-20.md) (original H1–H3).
- **Card:** [.pi/tasks/WI-OI-120bq.md](../tasks/WI-OI-120bq.md).

## Proposed commit scope (exclude unrelated UI)

| Path | Why |
| --- | --- |
| `scripts/verify-inventory-finance-relay-http.mjs` | F2.7 HTTP proof: two product costs, missing cost → FAILED → lock 409 → retry → POSTED → period LOCK |
| `modules/physical-operations-cmms/dictionary/windows.mjs` | `technician-ref` in dictionary references (assigned-to field) |
| `modules/physical-operations-cmms/dictionary/cmms-work-orders.window.json` | Regenerated from `windows.mjs` |
| `packages/contracts/src/configuration/window-baselines.generated.ts` | `pnpm modules:catalog` |
| `apps/workflow-platform/__tests__/universal-rule-kernel.test.ts` | Flaky latency under parallel `pnpm test` |
| `e2e/specs/helpers/ensure-active-org-unit.ts` | Clearer org-delivery probe errors |
| `.pi/NOW.md`, `.pi/tasks/WI-OI-120bq.md`, this file | Status and review handoff |

**Out of scope (do not stage):** `maps/page.tsx`, `AuthAtmosphere.tsx`, `OmnichannelSoftphoneDrawer.tsx`, untracked modules/vendor/scratch.

## Evidence (2026-10-22)

- **`node scripts/verify-inventory-finance-relay-http.mjs`** with `PROOF_DATABASE_URL` → **38/38** checks (H2/H3 scenario).
- **`pnpm test:minimal-p2p-o2c`** on `gigalibs-test` → **2/2** (2026-10-21).
- **`pnpm verify`** with `PROOF_DATABASE_URL` → all steps **PASS** except **`audit:design-tokens`** (unstaged UI).
- **Unit:** `dictionary-capabilities` (shipped windows), F2.3/F2.2 vitest slices, relay migration vitest **27/27** (prior session).
- **Legacy finance proofs** WI-OI-094–118 on `gigalibs_finance_proof` @ **5441** after bootstrap (commits `ad706e76`, `084f2314`).

## Re-review questions (120bp carry-over)

Confirm whether **B2–B5** from the 120bp review are **closed in git** on this branch (Finance **14–15**, Inventory **8–9**, snapshot/replica behaviour), or still open with evidence.

## Done when (card)

- [x] Technical proofs above.
- [ ] This diff **committed** (owner says "commit").
- [ ] Claude re-review: **no open High or Medium** on 120bq scope.
- [ ] **F2.9** accountant sign-off (human).
- [ ] Release worktree + owner deploy (after the above).
