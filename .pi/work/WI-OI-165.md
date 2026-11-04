# WI-OI-165 evidence — frontline journeys on a signed device (WI-OI-133–143)

## Owner (2026-11-04)

Complete **after WI-OI-164** implementation; task capture (WI-OI-177) is out of scope here.

## 2026-11-04 — implementation step 1 (Cursor, `gigalibs_mobile`)

**Contractor reachability (card step 1):**
- `contractor` added to `CompiledFeatureKeySchema` (`packages/mobile-config/src/index.ts`).
- Release containment allows `contractor` and contractor capabilities.
- Both app profiles (`gigalibs-universal.json`, `gigalibs-universal-lan.json`) compile `contractor` with
  `safety-operations.contractors.worker|gate|roster` capabilities (routes and `@gigalibs/mobile-feature-contractor`
  were already in the operations app).

**Evidence commands:**
- `pnpm exec vitest run apps/operations/src/home/destinations.test.ts`
- `pnpm exec vitest run packages/mobile-config/src/index.test.ts`
- `pnpm validate:architecture`
- `pnpm --filter @gigalibs/operations-mobile typecheck`

## Remaining (owner + device)

| Journey | Module | Persona | Pass / failure | Screenshots |
| --- | --- | --- | --- | --- |
| Operator rounds | WI-OI-133 | | | |
| Calibration | WI-OI-134 | | | |
| Commissioning | WI-OI-135 | | | |
| Visual spares | WI-OI-136 | | | |
| Shift logbook | WI-OI-137 | | | |
| Work instructions | WI-OI-138 | | | |
| Fleet DVIR | WI-OI-139 | | | |
| Problem report | WI-OI-140 | | | |
| Hazard / incident | WI-OI-141 | | | |
| Permits / LOTO | WI-OI-142 | | | |
| Contractor pass | WI-OI-143 | | | |

Record each run on UAT after deploy; fix small consumer faults in `gigalibs_mobile` only unless the card names a platform bug.
